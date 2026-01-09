import {Client, SendMessageError} from 'fnbr';
import { BotAccount, DeviceAuth } from '../types';
import { CSVManager } from './CSVManager';
import { CosmeticManager } from '../cosmetics/CosmeticManager';
import { AdminManager } from './AdminManager';

export class BotManager {
    private bots: Map<string, any> = new Map();
    private csvManager: CSVManager;
    private cosmeticManagers: Map<string, CosmeticManager> = new Map();
    private sentMessageIds: Map<string, Set<string>> = new Map(); // Map<botEmail, Set<messageId>>
    private adminManager: AdminManager;

    constructor(csvManager: CSVManager, adminManager?: AdminManager) {
        this.csvManager = csvManager;
        this.adminManager = adminManager || new AdminManager();
    }

    async launchBot(account: BotAccount): Promise<void> {
        const identifier = account.pseudo || account.email;

        if (this.bots.has(account.email)) {
            console.log(`[${identifier}] ⚠️  Bot déjà lancé`);
            return;
        }

        if (!account.deviceAuth) {
            console.error(`[${identifier}] ❌ Pas de device auth trouvé`);
            console.error(`[${identifier}] 💡 Ajoutez les colonnes device_id, account_id et secret dans le CSV`);
            return;
        }

        try {
            console.log(`[${identifier}] 🚀 Lancement du bot...`);

            const bot = new Client({
                auth: {
                    deviceAuth: account.deviceAuth,
                    authClient: 'fortniteAndroidGameClient'
                },
                connectToSTOMP: true,
                connectToXMPP: true,
                debug: (msg) => {
                    if (msg.includes('STOMP') || msg.includes('chat') || msg.includes('XMPP')) {
                        // console.log(`[${identifier}] 🔍`, msg);
                    }
                }
            });

            this.setupBotEvents(bot, account);

            const instance = {
                account,
                client: bot,
                isConnected: false,
                connectionAttempts: 0,
            };

            this.bots.set(account.email, instance);

            await bot.login();
            instance.isConnected = true;
            console.log(`[${identifier}] ✅ Connecté!\n`);

        } catch (error: any) {
            console.error(`[${identifier}] ❌ Erreur: ${error.message}`);
            this.bots.delete(account.email);
        }
    }

    private setupBotEvents(bot: Client, account: BotAccount) {
        const identifier = account.pseudo || account.email;

         (bot as any).on('friend:request', async (pendingFriend: any) => {
            try {
                // AUTO ACCEPT FRIEND REQUEST
                await pendingFriend.accept();
                console.log(`[${identifier}] 🤝 Demande d'ami acceptée de: ${pendingFriend.displayName}`);
            } catch (error: any) {
                console.error(`[${identifier}] ❌ Erreur acceptation ami:`, error.message);
            }
        });
        
        (bot as any).on('party:member:joined', async (member: any) => {
             // AUTO ADD FRIEND ON JOIN
            if (member.id === bot.user?.self?.id) return;
            try {
                // Check if already friend, if not add
                // Note: fnbr might not expose friends list immediately or fully sync.
                // Safest to just try add or check if possible.
                await member.addFriend();
                 console.log(`[${identifier}] ➕ Demande d'ami envoyée à ${member.displayName}`);
            } catch (e) {
                // Ignore "already friends" errors
            }
        });
    }

    async stopBot(email: string): Promise<void> {
        const instance = this.bots.get(email);
        if (!instance) {
            throw new Error(`Bot ${email} non trouvé`);
        }

        const identifier = instance.account.pseudo || email;
        console.log(`[${identifier}] 🛑 Arrêt du bot...`);

        await instance.client.logout();
        this.bots.delete(email);
        this.cosmeticManagers.delete(email);
        this.sentMessageIds.delete(email);

        console.log(`[${identifier}] ✅ Bot arrêté`);
    }

    async launchAllBots(delayBetweenBots: number = 3000): Promise<void> {
        const accounts = await this.csvManager.readAccounts();
        console.log(`📋 ${accounts.length} compte(s) trouvé(s)\n`);

        for (let i = 0; i < accounts.length; i++) {
            await this.launchBot(accounts[i]);

            if (i < accounts.length - 1) {
                console.log(`⏳ Attente de ${delayBetweenBots / 1000}s...\n`);
                await new Promise(resolve => setTimeout(resolve, delayBetweenBots));
            }
        }
        console.log(`\n✅ Tous les bots sont lancés! (${this.bots.size} bot(s) actifs)`);
    }
    
    async stopAllBots(): Promise<void> {
        console.log('🛑 Arrêt de tous les bots...');
        for (const [email] of this.bots) {
            await this.stopBot(email);
        }
        console.log('✅ Tous les bots ont été arrêtés');
    }

    getActiveBots(): any[] {
        return Array.from(this.bots.values());
    }

    getBot(email: string): any {
        return this.bots.get(email);
    }
    
    /**
     * Tries to add a friend on the first available connected bot with < 900 friends.
     * @param targetUsername The Epic username to add
     * @returns 'SUCCESS', 'ERROR', or 'FULL'
     */
    async addFriendOnAvailableBot(targetUsername: string): Promise<'SUCCESS' | 'ERROR' | 'FULL'> {
        console.log(`[BotManager] Trying to add friend: ${targetUsername}`);
        
        // Find connected bots
        const connectedBots = this.getActiveBots().filter(b => b.isConnected && b.client);

        if (connectedBots.length === 0) {
            console.error('[BotManager] No connected bots available');
            return 'ERROR';
        }

        // Filter bots with < 900 friends
        const availableBots = connectedBots.filter(b => {
            const friendCount = b.client.friends ? b.client.friends.size : 0;
            return friendCount < 900; 
        });
        
        if (availableBots.length === 0) {
            console.warn('[BotManager] All bots are full (>900 friends)');
            return 'FULL';
        }

        // Pick the first one
        const botInstance = availableBots[0];
        const identifier = botInstance.account.pseudo;

        try {
            console.log(`[${identifier}] Sending friend request to ${targetUsername}...`);
            await botInstance.client.friend.add(targetUsername);
            console.log(`[${identifier}] ✅ Friend request sent!`);
            return 'SUCCESS';
        } catch (error: any) {
            console.error(`[${identifier}] ❌ Failed to add friend:`, error.message);
            return 'ERROR';
        }
    }
}
