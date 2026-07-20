import * as io from 'socket.io-client';
import { BotManager } from './BotManager';
import { DatabaseManager } from './DatabaseManager';
import { BotAccount } from '../types';
import { sendAlert } from '../utils/AlertManager';
import { FortniteAPIService } from '../services/FortniteAPIService';

const api = new FortniteAPIService();

export class SocketManager {
    private socket: any;
    private botManager: BotManager;
    private dbManager: DatabaseManager;
    private dashboardUrl: string;
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 10;
    private reconnectDelay: number = 5000;
    private heartbeatInterval: any;

    constructor(botManager: BotManager, dbManager: DatabaseManager, dashboardUrl: string) {
        this.botManager = botManager;
        this.dbManager = dbManager;
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
            this.sendLogin();
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
        }) => {
            console.log(`📥 Admin requested new bot: ${data.pseudo}`);
            try {
                const account: BotAccount = {
                    pseudo: data.pseudo,
                    email: data.email,
                    password: data.password,
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

        // ── Panel premium web (Phase 5) ──────────────────────────────────
        // Répondent via callback d'acquittement (jamais de broadcast : ce sont
        // des actions privées d'un utilisateur premium précis). Réutilisent
        // exactement la même logique que /squad et /emote-all côté Discord.
        this.socket.on('premium:squad', async (
            data: { discordId: string },
            callback: (result: { success: boolean; message: string }) => void,
        ) => {
            console.log(`📥 [Premium web] Squad demandé par ${data.discordId}`);
            try {
                const user = await this.dbManager.getUser(data.discordId);
                if (!user?.deviceAuth?.accountId) {
                    return callback({ success: false, message: "Connecte d'abord ton compte Epic avec /login sur Discord." });
                }
                const ownedBots = this.dbManager.getBotsByOwner(data.discordId);
                if (ownedBots.length === 0) {
                    return callback({ success: false, message: "Tu n'as pas encore de bot perso. Crée-en un avec /createbot." });
                }
                const activePseudos = new Set(
                    this.botManager.getActiveBots().filter((b: any) => b.isConnected).map((b: any) => b.account.pseudo)
                );
                const online = ownedBots.filter((b: any) => b.pseudo && activePseudos.has(b.pseudo));
                if (online.length === 0) {
                    return callback({ success: false, message: 'Aucun de tes bots n\'est en ligne pour le moment. Réessaie dans un instant.' });
                }

                const results: string[] = [];
                for (const bot of online) {
                    const res = await this.botManager.inviteToParty(bot.pseudo as string, user.deviceAuth.accountId);
                    results.push(`${bot.pseudo} → ${res.startsWith('✅') ? 'invité' : res}`);
                    await new Promise((r) => setTimeout(r, 600));
                }

                const activePreset = this.dbManager.getActivePreset(data.discordId);
                if (activePreset) {
                    await this.botManager.applyLoadoutToOwned(data.discordId, activePreset);
                }

                callback({ success: true, message: `${online.length} bot(s) invité(s) : ${results.join(', ')}. Accepte dans Fortnite !` });
            } catch (e: any) {
                console.error('❌ [Premium web] Erreur squad:', e.message);
                callback({ success: false, message: 'Erreur serveur : ' + e.message });
            }
        });

        this.socket.on('premium:emoteAll', async (
            data: { discordId: string; query: string },
            callback: (result: { success: boolean; message: string }) => void,
        ) => {
            console.log(`📥 [Premium web] Emote-all demandé par ${data.discordId}: ${data.query}`);
            try {
                const item = await api.searchCosmetic(data.query, 'emote');
                if (!item) return callback({ success: false, message: `Emote "${data.query}" introuvable.` });
                const count = await this.botManager.emoteAllOwned(data.discordId, item.id);
                callback(
                    count > 0
                        ? { success: true, message: `${item.name} jouée sur ${count} de tes bots !` }
                        : { success: false, message: "Aucun de tes bots n'est en ligne. Fais d'abord /squad." }
                );
            } catch (e: any) {
                console.error('❌ [Premium web] Erreur emote-all:', e.message);
                callback({ success: false, message: 'Erreur serveur : ' + e.message });
            }
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
                ping: b.client && b.client.xmpp && b.client.xmpp.ping ? b.client.xmpp.ping : null
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
        setInterval(() => {
            if (this.socket.connected) {
                this.sendLogin();
            }
        }, intervalMs);
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
