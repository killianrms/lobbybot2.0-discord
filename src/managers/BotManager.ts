import { Client, SendMessageError } from 'fnbr';
import { BotAccount, DeviceAuth } from '../types';
import { DatabaseManager } from './DatabaseManager';
import { CosmeticManager } from '../cosmetics/CosmeticManager';
import { AdminManager } from './AdminManager';
import { CommandManager } from './CommandManager';
import { PartyActions } from '../actions/PartyActions';
import { SocialActions } from '../actions/SocialActions';

export class BotManager {
    private bots: Map<string, any> = new Map();
    private dbManager: DatabaseManager;
    private cosmeticManagers: Map<string, CosmeticManager> = new Map();
    private sentMessageIds: Map<string, Set<string>> = new Map();
    private adminManager: AdminManager;
    private commandManager: CommandManager;

    // Actions
    private partyActions: PartyActions;
    private socialActions: SocialActions;

    constructor(dbManager: DatabaseManager, adminManager?: AdminManager) {
        this.dbManager = dbManager;
        this.adminManager = adminManager || new AdminManager();
        this.commandManager = new CommandManager();

        // Instantiate Actions
        this.partyActions = new PartyActions();
        this.socialActions = new SocialActions();
    }

    async launchBot(account: BotAccount): Promise<void> {
        const identifier = account.pseudo || account.email;

        if (this.bots.has(account.email)) {
            // console.log(`[${identifier}] ⚠️  Bot déjà lancé`);
            return;
        }

        if (!account.deviceAuth) {
            console.error(`[${identifier}] ❌ Pas de device auth trouvé`);
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
                    // console.log(msg);
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
                await pendingFriend.accept();
                console.log(`[${identifier}] 🤝 Demande d'ami acceptée de: ${pendingFriend.displayName}`);
            } catch (error: any) {
                console.error(`[${identifier}] ❌ Erreur acceptation ami:`, error.message);
            }
        });

        (bot as any).on('party:member:joined', async (member: any) => {
            if (member.id === bot.user?.self?.id) return;
            try {
                await member.addFriend();
                console.log(`[${identifier}] ➕ Demande d'ami envoyée à ${member.displayName}`);
            } catch (e) {
            }
        });

        // HANDLE CHAT COMMANDS
        (bot as any).on('message:chat', async (message: any) => {
            await this.commandManager.handleMessage(bot, message);
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
        // READ FROM DB (Async)
        const accounts = await this.dbManager.getAllBots();
        console.log(`📋 ${accounts.length} compte(s) trouvé(s) en Base de Données\n`);

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

    async addNewBot(account: BotAccount): Promise<void> {
        console.log(`[BotManager] Adding new bot: ${account.pseudo}`);
        await this.dbManager.addBot(account);
        await this.launchBot(account);
    }

    getActiveBots(): any[] {
        return Array.from(this.bots.values());
    }

    getBot(email: string): any {
        return this.bots.get(email);
    }

    /**
     * Gets the best available bot for adding a friend.
     * Criteria: Connected, Friend count < 900, Fewest friends first.
     */
    getBestBot(): any | null {
        const bots = this.getActiveBots().filter(b => b.isConnected && b.client);

        const availableBots = bots.filter(b => {
            const friendCount = b.client.friends ? b.client.friends.size : 0;
            return friendCount < 900;
        });

        if (availableBots.length === 0) return null;

        // Sort by friend count ascending
        availableBots.sort((a, b) => {
            const sizeA = a.client.friends ? a.client.friends.size : 0;
            const sizeB = b.client.friends ? b.client.friends.size : 0;
            return sizeA - sizeB;
        });

        return availableBots[0];
    }

    async addFriendOnAvailableBot(targetUsername: string): Promise<'SUCCESS' | 'ERROR' | 'FULL'> {
        console.log(`[BotManager] Trying to add friend: ${targetUsername}`);

        const botInstance = this.getBestBot();

        if (!botInstance) {
            // Check if it's because full or no bots
            const connected = this.getActiveBots().filter(b => b.isConnected);
            if (connected.length === 0) return 'ERROR';
            // If we have bots but getBestBot returned null, it means all are full
            console.warn('[BotManager] All bots are full (>900 friends)');
            return 'FULL';
        }

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

    async removeFriend(targetUsername: string): Promise<boolean> {
        console.log(`[BotManager] Trying to remove friend: ${targetUsername}`);

        let removed = false;
        const connectedBots = this.getActiveBots().filter(b => b.isConnected && b.client);

        for (const botInstance of connectedBots) {
            const friend = botInstance.client.friends.find((f: any) => f.displayName === targetUsername);
            if (friend) {
                try {
                    await friend.remove();
                    console.log(`[${botInstance.account.pseudo}] Removed friend ${targetUsername}`);
                    removed = true;
                    // Don't break, remove from all bots if present? usually one, but safely check all
                } catch (e: any) {
                    console.error(`[${botInstance.account.pseudo}] Failed to remove friend: ${e.message}`);
                }
            }
        }
        return removed;
    }

    async executeAction(targetName: string, action: string, data: any): Promise<void> {
        console.log(`[BotManager] Executing ${action} on ${targetName}`);

        const botInstance = this.getActiveBots().find(b => b.account.pseudo === targetName);

        if (!botInstance || !botInstance.isConnected) {
            console.error(`[BotManager] Bot ${targetName} not found or offline.`);
            return;
        }

        const client = botInstance.client;
        let result = '';

        try {
            // REFACTORED: Use shared Actions classes
            switch (action) {
                case 'leave':
                    result = await this.partyActions.leaveParty(client);
                    break;
                case 'kick':
                    result = await this.partyActions.kickMember(client, data);
                    break;
                case 'promote':
                    result = await this.partyActions.promoteMember(client, data);
                    break;
                case 'privacy':
                    result = await this.partyActions.setPrivacy(client, data);
                    break;
                case 'add':
                    result = await this.socialActions.addFriend(client, data);
                    break;
            }
            console.log(`[${targetName}] ${result}`);
        } catch (e: any) {
            console.error(`[${targetName}] ❌ Action ${action} failed:`, e.message);
        }
    }
}
