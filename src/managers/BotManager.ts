import { Client, SendMessageError } from 'fnbr';
import { BotAccount, DeviceAuth } from '../types';
import { DatabaseManager } from './DatabaseManager';
import { CosmeticManager } from '../cosmetics/CosmeticManager';
import { AdminManager } from './AdminManager';
import { CommandManager } from './CommandManager';
import { PartyActions } from '../actions/PartyActions';
import { SocialActions } from '../actions/SocialActions';
import { CosmeticsActions } from '../actions/CosmeticsActions';
import { sendAlert } from '../utils/AlertManager';

export class BotManager {
    private bots: Map<string, any> = new Map();
    private failedBots: Set<string> = new Set(); // bots avec credentials invalides, pas de retry
    private dbManager: DatabaseManager;
    private cosmeticManagers: Map<string, CosmeticManager> = new Map();
    private sentMessageIds: Map<string, Set<string>> = new Map();
    private adminManager: AdminManager;
    private commandManager: CommandManager;

    // Global config (managed from admin dashboard)
    public globalStatus: string = 'Utilisez le code créateur : aeroz';
    public joinMsg: string = '';
    public addMsg: string = '';

    // Actions
    private partyActions: PartyActions;
    private socialActions: SocialActions;
    private cosmeticsActions: CosmeticsActions;

    constructor(dbManager: DatabaseManager, adminManager?: AdminManager) {
        this.dbManager = dbManager;
        this.adminManager = adminManager || new AdminManager();
        this.commandManager = new CommandManager();

        // Instantiate Actions
        this.partyActions = new PartyActions();
        this.socialActions = new SocialActions();
        this.cosmeticsActions = new CosmeticsActions();
    }

    async launchBot(account: BotAccount): Promise<boolean> {
        const identifier = account.pseudo || account.email;

        if (this.bots.has(account.email)) {
            // console.log(`[${identifier}] ⚠️  Bot déjà lancé`);
            return true;
        }

        if (!account.deviceAuth) {
            console.error(`[${identifier}] ❌ Pas de device auth trouvé`);
            return false;
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
            return true;

        } catch (error: any) {
            console.error(`[${identifier}] ❌ Erreur: ${error.message}`);
            this.bots.delete(account.email);
            this.failedBots.add(account.email); // ne pas retenter ce bot
            return false;
        }
    }

    private setupBotEvents(bot: Client, account: BotAccount) {
        const identifier = account.pseudo || account.email;

        // Gestion de la déconnexion et reconnexion automatique
        bot.on('disconnected', async () => {
            console.log(`[${identifier}] ⚠️ Déconnecté`);
            const instance = this.bots.get(account.email);
            if (instance) {
                instance.isConnected = false;
            }
        });

        // Reconnexion automatique sur session close
        (bot as any).on('session:close', async () => {
            console.log(`[${identifier}] 🔄 Session fermée, tentative de reconnexion...`);
            const instance = this.bots.get(account.email);
            if (instance && !this.failedBots.has(account.email)) {
                instance.isConnected = false;
                setTimeout(async () => {
                    try {
                        await bot.login();
                        instance.isConnected = true;
                        console.log(`[${identifier}] ✅ Reconnecté!`);
                    } catch (e: any) {
                        console.error(`[${identifier}] ❌ Échec de reconnexion: ${e.message}`);
                        // Réessayer dans 30s
                        setTimeout(() => this.reconnectBot(account), 30000);
                    }
                }, 5000);
            }
        });

        // Bot prêt : définir le statut
        bot.on('ready', async () => {
            try {
                await bot.user?.fetchSelf();
                bot.setStatus(this.globalStatus);
                console.log(`[${identifier}] ✅ Bot connecté en tant que ${bot.user?.self?.displayName || 'Unknown'}`);
                console.log(`[${identifier}] 🎮 Status défini : "${this.globalStatus}"`);
            } catch (error: any) {
                console.error(`[${identifier}] ❌ Erreur ready:`, error.message);
            }
        });

        // Accepter les demandes d'ami
        (bot as any).on('friend:request', async (pendingFriend: any) => {
            try {
                await pendingFriend.accept();
                console.log(`[${identifier}] 🤝 Demande d'ami acceptée de: ${pendingFriend.displayName}`);
                // Envoyer le message d'ajout si configuré
                if (this.addMsg) {
                    try {
                        await (pendingFriend as any).sendMessage(this.addMsg);
                        console.log(`[${identifier}] 💬 Message d'ajout envoyé à ${pendingFriend.displayName}`);
                    } catch (e) {}
                }
            } catch (error: any) {
                console.error(`[${identifier}] ❌ Erreur acceptation ami:`, error.message);
            }
        });

        // Membre rejoint le lobby
        (bot as any).on('party:member:joined', async (member: any) => {
            if (member.id === bot.user?.self?.id) {
                // Le bot lui-même vient de rejoindre un lobby
                if (!this.cosmeticManagers.has(account.email)) {
                    const cosmeticManager = new CosmeticManager(bot);
                    this.cosmeticManagers.set(account.email, cosmeticManager);
                    console.log(`[${identifier}] 🎨 CosmeticManager initialisé`);
                }
                return;
            }
            // Un autre joueur rejoint : lui envoyer une demande d'ami
            try {
                await member.addFriend();
                console.log(`[${identifier}] ➕ Demande d'ami envoyée à ${member.displayName}`);
            } catch (e) {}
            // Envoyer le message de lobby si configuré
            if (this.joinMsg) {
                try {
                    await (bot as any).party?.chat?.send(this.joinMsg);
                } catch (e) {}
            }
        });

        // Commandes depuis le chat du LOBBY (messages encodés en base64)
        (bot as any).on('party:member:message', async (message: any) => {
            if (message.author.id === bot.user?.self?.id) return;

            let realMessage = message.content;
            try {
                const decoded = Buffer.from(message.content, 'base64').toString('utf-8');
                const cleaned = decoded.replace(/\0+$/, '');
                const parsed = JSON.parse(cleaned);
                realMessage = parsed.msg || message.content;
                console.log(`[${identifier}] 💬 [LOBBY] ${message.author.displayName}: ${realMessage}`);
            } catch (e) {
                console.log(`[${identifier}] 💬 [LOBBY] ${message.author.displayName}: ${message.content}`);
            }

            const fakeMessage = {
                content: realMessage,
                author: message.author,
                reply: async (text: string) => {
                    try { await message.reply(text); } catch (e) {}
                }
            };

            await this.commandManager.handleMessage(bot, fakeMessage);
        });

        // Commandes depuis les MESSAGES PRIVÉS (DM)
        (bot as any).on('friend:message', async (message: any) => {
            if (message.author.id === bot.user?.self?.id) return;

            // Filtrer les échos de nos propres messages
            const sentIds = this.sentMessageIds.get(account.email);
            if (sentIds && sentIds.has(message.id)) {
                sentIds.delete(message.id);
                return;
            }

            console.log(`[${identifier}] 💬 [DM] ${message.author.displayName}: ${message.content}`);
            await this.commandManager.handleMessage(bot, message);
        });

        // Accepter les invitations de groupe
        (bot as any).on('party:invitation', async (invitation: any) => {
            console.log(`[${identifier}] 📨 Invitation de ${invitation.sender?.displayName}`);
            try {
                await invitation.accept();
                console.log(`[${identifier}] ✅ Invitation acceptée`);
            } catch (error: any) {
                console.error(`[${identifier}] ❌ Erreur invitation:`, error.message);
            }
        });

        // HANDLE CHAT COMMANDS (fallback pour certaines versions de fnbr)
        (bot as any).on('message:chat', async (message: any) => {
            await this.commandManager.handleMessage(bot, message);
        });
    }

    private async reconnectBot(account: BotAccount): Promise<void> {
        const identifier = account.pseudo || account.email;
        const instance = this.bots.get(account.email);

        if (!instance || this.failedBots.has(account.email)) return;

        try {
            console.log(`[${identifier}] 🔄 Tentative de reconnexion...`);
            await instance.client.login();
            instance.isConnected = true;
            console.log(`[${identifier}] ✅ Bot reconnecté!`);
        } catch (e: any) {
            console.error(`[${identifier}] ❌ Reconnexion échouée: ${e.message}`);
            // Réessayer dans 1 minute
            setTimeout(() => this.reconnectBot(account), 60000);
        }
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

    public startDBSync(intervalMs: number = 300_000): void {
        console.log(`[BotManager] 🔁 Synchronisation BD toutes les ${intervalMs / 1000}s`);
        setInterval(async () => {
            try {
                const accounts = await this.dbManager.getAllBots();
                for (const account of accounts) {
                    if (!this.bots.has(account.email) && !this.failedBots.has(account.email)) {
                        console.log(`[BotManager] 🆕 Nouveau bot détecté en BD: ${account.pseudo || account.email}`);
                        await this.launchBot(account);
                    }
                }
            } catch (e: any) {
                console.error('[BotManager] ❌ Erreur sync BD:', e.message);
                sendAlert('db-sync-error', '🔴 Erreur de synchronisation BD', `\`\`\`${e.message}\`\`\``, 'critical');
            }
        }, intervalMs);
    }

    /**
     * Vérifie périodiquement le nombre de bots actifs. Alerte si on tombe sous le seuil
     * MIN_ACTIVE_BOTS_ALERT (déconnexion massive, credentials expirés en masse, etc.).
     */
    public startHealthCheck(intervalMs: number = 60_000): void {
        const minActive = parseInt(process.env.MIN_ACTIVE_BOTS_ALERT || '1', 10);
        console.log(`[BotManager] 🩺 Health check toutes les ${intervalMs / 1000}s (seuil: ${minActive} bot(s) actif(s) min)`);

        setInterval(() => {
            const total = this.bots.size;
            const active = this.getActiveBots().filter(b => b.isConnected).length;

            if (total > 0 && active < minActive) {
                sendAlert(
                    'low-active-bots',
                    '🔴 Nombre de bots actifs trop bas',
                    `**${active}/${total}** bot(s) actif(s) — seuil d'alerte: ${minActive}.\nVérifie les credentials Fortnite ou une éventuelle panne Epic.`,
                    'critical'
                );
            }
        }, intervalMs);
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

        // On vérifie d'abord que le bot se connecte réellement avant de l'enregistrer en BD —
        // pas la peine de garder des credentials invalides en base.
        const connected = await this.launchBot(account);
        if (!connected) {
            this.failedBots.delete(account.email); // pas encore en DB, autoriser un nouvel essai plus tard
            throw new Error('Connexion au compte Fortnite échouée (credentials invalides ou device auth expiré).');
        }

        await this.dbManager.addBot(account);
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
            const friendCount = b.client.friend?.list ? b.client.friend.list.size : 0;
            return friendCount < 900;
        });

        if (availableBots.length === 0) return null;

        // Sort by friend count ascending
        availableBots.sort((a, b) => {
            const sizeA = a.client.friend?.list ? a.client.friend.list.size : 0;
            const sizeB = b.client.friend?.list ? b.client.friend.list.size : 0;
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
            const friend = botInstance.client.friend.list.find((f: any) => f.displayName === targetUsername);
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

    /**
     * Apply global config to all connected bots immediately.
     */
    applyGlobalConfig(config: { status?: string; joinMsg?: string; addMsg?: string }): void {
        if (config.status !== undefined) {
            this.globalStatus = config.status;
            // Apply status to all currently connected bots
            for (const instance of this.bots.values()) {
                if (instance.isConnected && instance.client) {
                    try {
                        instance.client.setStatus(this.globalStatus);
                        console.log(`[${instance.account.pseudo}] 🎮 Status mis à jour: "${this.globalStatus}"`);
                    } catch (e) {}
                }
            }
        }
        if (config.joinMsg !== undefined) {
            this.joinMsg = config.joinMsg;
            console.log(`[BotManager] 💬 Join message mis à jour`);
        }
        if (config.addMsg !== undefined) {
            this.addMsg = config.addMsg;
            console.log(`[BotManager] 💬 Add message mis à jour`);
        }
    }

    async executeAction(targetName: string, action: string, data: any): Promise<string> {
        console.log(`[BotManager] Executing ${action} on ${targetName}`);

        const botInstance = this.getActiveBots().find(b => b.account.pseudo === targetName);

        if (!botInstance || !botInstance.isConnected) {
            console.error(`[BotManager] Bot ${targetName} not found or offline.`);
            return `❌ Bot ${targetName} introuvable ou hors ligne.`;
        }

        const client = botInstance.client;
        let result = '';

        try {
            switch (action) {
                // Party
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
                case 'ready':
                    result = await this.partyActions.setReady(client, true);
                    break;
                case 'unready':
                    result = await this.partyActions.setReady(client, false);
                    break;
                // Social
                case 'add':
                    result = await this.socialActions.addFriend(client, data);
                    break;
                // Cosmetics
                case 'skin':
                    if (!data) { result = '❌ Usage: skin <nom>'; break; }
                    result = await this.cosmeticsActions.setSkin(client, data);
                    break;
                case 'backpack':
                    if (!data) { result = '❌ Usage: backpack <nom>'; break; }
                    result = await this.cosmeticsActions.setBackpack(client, data);
                    break;
                case 'pickaxe':
                    if (!data) { result = '❌ Usage: pickaxe <nom>'; break; }
                    result = await this.cosmeticsActions.setPickaxe(client, data);
                    break;
                case 'emote':
                    if (!data) { result = '❌ Usage: emote <nom>'; break; }
                    result = await this.cosmeticsActions.setEmote(client, data);
                    break;
                case 'stopdanse':
                    result = await this.cosmeticsActions.clearEmote(client);
                    break;
                case 'level':
                    const lvl = parseInt(data);
                    if (isNaN(lvl) || lvl < 1) { result = '❌ Usage: level <nombre>'; break; }
                    result = await this.cosmeticsActions.setLevel(client, lvl);
                    break;
                default:
                    result = `❌ Action inconnue: ${action}`;
            }
            console.log(`[${targetName}] ${result}`);
        } catch (e: any) {
            result = `❌ Erreur action ${action}: ${e.message}`;
            console.error(`[${targetName}] ${result}`);
        }

        return result;
    }
}
