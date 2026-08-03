import * as io from 'socket.io-client';
import axios from 'axios';
import { BotManager } from './BotManager';
import { BotAccount } from '../types';
import { sendAlert } from '../utils/AlertManager';

export class SocketManager {
    private socket: any;
    private botManager: BotManager;
    private dashboardUrl: string;
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 10;
    private reconnectDelay: number = 5000;
    // Latence vers l'API Epic, rafraîchie à chaque cycle d'update. Tous les
    // bots tournent dans ce process : leur ping réseau est le même — une
    // seule mesure partagée est donc exacte (l'ancien client.xmpp.ping
    // n'existe plus dans fnbr 4 et renvoyait toujours null).
    private lastEpicPingMs: number | null = null;
    private heartbeatInterval: any;

    constructor(botManager: BotManager, dashboardUrl: string) {
        this.botManager = botManager;
        this.dashboardUrl = dashboardUrl;

        const socketOptions: any = {
            autoConnect: false,
            reconnection: true,
            reconnectionDelay: 2000,
            reconnectionDelayMax: 10000,
            reconnectionAttempts: Infinity
        };

        // Ajouter authentification si MANAGER_SECRET est défini
        if (process.env.MANAGER_SECRET) {
            socketOptions.auth = {
                token: process.env.MANAGER_SECRET
            };
            console.log('🔒 Socket.io authentication enabled');
        } else {
            console.warn('⚠️  MANAGER_SECRET not set - Socket.io connection is not authenticated!');
        }

        this.socket = io.connect(this.dashboardUrl, socketOptions);
    }

    public connect(): void {
        console.log('🔌 Connecting to Dashboard at', this.dashboardUrl);
        if (!this.socket.connected) {
            this.socket.connect();
        }

        this.socket.on('connect', () => {
            console.log('✅ Manager Connected to Dashboard!');
            this.reconnectAttempts = 0;
            this.measureEpicPing().then(() => this.sendLogin());
            this.startHeartbeat();
        });

        this.socket.on('disconnect', (reason: string) => {
            console.log('❌ Disconnected from Dashboard:', reason);
            this.stopHeartbeat();

            if (reason === 'io server disconnect') {
                // Server fermé la connexion, reconnecter manuellement
                setTimeout(() => {
                    console.log('🔄 Attempting manual reconnect...');
                    this.socket.connect();
                }, this.reconnectDelay);
            }
        });

        this.socket.on('connect_error', (error: Error) => {
            this.reconnectAttempts++;
            if (this.reconnectAttempts <= 3) {
                console.error(`❌ Connection error (attempt ${this.reconnectAttempts}):`, error.message);
            } else if (this.reconnectAttempts === this.maxReconnectAttempts) {
                console.error('❌ Max reconnection attempts reached. Dashboard may be down.');
                sendAlert('dashboard-unreachable', '🔴 Dashboard injoignable', `Le manager n'arrive plus à joindre le dashboard après ${this.maxReconnectAttempts} tentatives (${this.dashboardUrl}).`, 'critical');
            }
        });

        this.socket.on('reconnect', (attemptNumber: number) => {
            console.log(`✅ Reconnected to Dashboard after ${attemptNumber} attempts`);
            this.sendLogin();
        });

        // Add friend on best available bot
        this.socket.on('cmd:manager:add', async (data: { target: string, requester?: string }) => {
            console.log(`📥 Dashboard requested add friend: ${data.target}`);
            const success = await this.botManager.addFriendOnAvailableBot(data.target);
            this.socket.emit('action:result', {
                action: 'add',
                target: data.target,
                result: success === 'SUCCESS' ? `✅ Demande envoyée à ${data.target}` : `❌ Impossible d'ajouter ${data.target} (${success})`,
                success: success === 'SUCCESS'
            });
        });

        // Targeted action on a specific bot
        this.socket.on('cmd:manager:action', async (data: { target: string, action: string, data?: any }) => {
            console.log(`📥 Action received: ${data.action} on ${data.target}`);
            const result = await this.botManager.executeAction(data.target, data.action, data.data);
            this.socket.emit('action:result', {
                action: data.action,
                target: data.target,
                result,
                success: !result.startsWith('❌')
            });
        });

        // Add a new bot from admin dashboard
        this.socket.on('cmd:manager:addBot', async (data: {
            pseudo: string;
            email: string;
            password: string;
            accountId: string;
            deviceId: string;
            secret: string;
            ownerDiscordId?: string; // posé par le website : l'admin qui ajoute
        }) => {
            console.log(`📥 Admin requested new bot: ${data.pseudo}`);
            try {
                const account: BotAccount = {
                    pseudo: data.pseudo,
                    email: data.email,
                    password: data.password,
                    ownerDiscordId: data.ownerDiscordId,
                    deviceAuth: {
                        accountId: data.accountId,
                        deviceId: data.deviceId,
                        secret: data.secret,
                    }
                };
                await this.botManager.addNewBot(account);
                this.sendLogin(); // Refresh bot list on dashboard
                this.socket.emit('admin:addBotResult', { success: true, pseudo: data.pseudo });
            } catch (e: any) {
                console.error('❌ Failed to add bot:', e.message);
                this.socket.emit('admin:addBotResult', { success: false, error: e.message });
            }
        });

        // Apply global config from admin dashboard
        this.socket.on('globalConfig:current', (config: { status?: string; joinMsg?: string; addMsg?: string }) => {
            console.log('📥 Global config received from dashboard');
            this.botManager.applyGlobalConfig(config);
        });

        this.socket.on('config:globalUpdate', (config: { status?: string; joinMsg?: string; addMsg?: string }) => {
            console.log('📥 Global config update from admin:', config);
            this.botManager.applyGlobalConfig(config);
        });

        // Un admin a modifié SES owner_settings sur le dashboard : recharger
        // depuis la base et réappliquer les statuts des bots concernés.
        this.socket.on('ownerSettings:changed', (info: { ownerId?: string }) => {
            console.log(`📥 owner_settings modifiés (owner ${info?.ownerId || '?'}) — rechargement`);
            this.botManager.refreshOwnerSettings();
        });
    }

    private startHeartbeat(): void {
        // Envoyer un heartbeat toutes les 10 secondes
        this.heartbeatInterval = setInterval(() => {
            if (this.socket.connected) {
                this.socket.emit('heartbeat', {
                    timestamp: Date.now(),
                    botCount: this.botManager.getActiveBots().length
                });
            }
        }, 10000);
    }

    private stopHeartbeat(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    public sendLogin(): void {
        const bots = this.botManager.getActiveBots();
        const botData = bots.map(b => {
            const friends = b.client?.friend?.list?.size || 0;
            return {
                name: b.account.pseudo,
                friends,
                isOnline: b.isConnected,
                ping: b.isConnected ? this.lastEpicPingMs : null
            };
        });

        this.socket.emit('manager:login', {
            id: 'fortnite-manager',
            type: 'manager',
            botCount: bots.length,
            bots: botData
        });
    }

    public startPeriodicUpdates(intervalMs: number = 30_000): void {
        console.log(`🔄 Periodic updates every ${intervalMs / 1000}s`);
        setInterval(async () => {
            if (this.socket.connected) {
                await this.measureEpicPing();
                this.sendLogin();
            }
        }, intervalMs);
    }

    /** Mesure la latence d'un endpoint public Epic (timeout 5 s → null). */
    private async measureEpicPing(): Promise<void> {
        try {
            const t0 = Date.now();
            await axios.get(
                'https://account-public-service-prod.ol.epicgames.com/account/api/epicdomains/ssodomains',
                { timeout: 5000 }
            );
            this.lastEpicPingMs = Date.now() - t0;
        } catch {
            this.lastEpicPingMs = null;
        }
    }

    public sendAddRequest(target: string, discordUser: string): void {
        if (!this.socket.connected) {
            console.warn('[SocketManager] Cannot send add request: not connected to dashboard');
            return;
        }
        this.socket.emit('cmd:discord:add', { target, requester: discordUser });
    }

    public isConnected(): boolean {
        return this.socket && this.socket.connected;
    }

    public disconnect(): void {
        console.log('🔌 Disconnecting from Dashboard...');
        this.stopHeartbeat();
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}
