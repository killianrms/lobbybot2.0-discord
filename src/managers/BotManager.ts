import { Client, Enums, SendMessageError } from 'fnbr';
import { BotAccount, DeviceAuth } from '../types';
import { DatabaseManager } from './DatabaseManager';
import { CosmeticManager } from '../cosmetics/CosmeticManager';
import { AdminManager } from './AdminManager';
import { CommandManager } from './CommandManager';
import { PartyActions } from '../actions/PartyActions';
import { SocialActions } from '../actions/SocialActions';
import { CosmeticsActions } from '../actions/CosmeticsActions';
import { sendAlert } from '../utils/AlertManager';
import { sendEOSPresence } from '../utils/EOSPresence';
import * as ModernParty from '../utils/ModernParty';
import * as SecureChat from '../utils/SecureChat';
import * as FailedBotRegistry from '../utils/FailedBotRegistry';
import * as BotLobby from '../services/BotLobbyService';

export class BotManager {
    private bots: Map<string, any> = new Map();
    private failedBots: Set<string> = new Set(); // bots avec credentials invalides, pas de retry
    private dbManager: DatabaseManager;
    private cosmeticManagers: Map<string, CosmeticManager> = new Map();
    private sentMessageIds: Map<string, Set<string>> = new Map();
    private eosPresenceTimers: Map<string, NodeJS.Timeout> = new Map();
    private adminManager: AdminManager;
    private commandManager: CommandManager;

    // Lobby exclusif : dès qu'un joueur est avec le bot, la party passe en privé
    // et les invitations sont refusées ; le bot redevient dispo quand il est seul.
    // Désactivable via EXCLUSIVE_LOBBY=false.
    private exclusiveLobby: boolean = process.env.EXCLUSIVE_LOBBY !== 'false';

    // Anti-troll/AFK : un joueur qui occupe un bot sans aucune activité (commande,
    // changement de skin/emote…) pendant EXCLUSIVE_IDLE_MINUTES est kick et le
    // lobby rouvre. Toute activité réinitialise le compte à rebours.
    // EXCLUSIVE_IDLE_MINUTES=0 DÉSACTIVE le kick : un joueur peut rester avec le
    // bot indéfiniment. C'est le réglage voulu ici — un bot qui reste 24 h avec
    // quelqu'un affiche le code créateur tout ce temps, c'est de la publicité,
    // pas une nuisance.
    private exclusiveIdleMs: number = Math.max(0, parseInt(process.env.EXCLUSIVE_IDLE_MINUTES || '0', 10)) * 60_000;
    private idleTimers: Map<string, NodeJS.Timeout> = new Map();

    // Danse jouée quand un joueur rejoint le lobby (vide = aucune).
    private joinEmote: string = process.env.JOIN_EMOTE ?? 'Scenario';

    // Global config (managed from admin dashboard) — sert de DÉFAUT pour les
    // owners qui n'ont pas de réglages propres dans owner_settings.
    public globalStatus: string = 'USE CODE CREATOR: aeroz';
    public joinMsg: string = 'Join my Discord: https://discord.gg/SarmtBh3Gu';
    public addMsg: string = 'Thanks for adding me! Use creator code "aeroz" and join our Discord: https://discord.gg/SarmtBh3Gu';

    // Réglages par propriétaire (owner_settings) : chaque bot applique le
    // status/joinMsg/addMsg de SON owner, avec la config globale en fallback.
    private ownerSettings: Map<string, import('./DatabaseManager').OwnerSettings> = new Map();

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
                // Cache de présences des amis. Par défaut fnbr garde un objet
                // FriendPresence par ami, à vie (maxLifetime: Infinity,
                // sweepInterval: 0 → le balayage n'est même pas programmé).
                // Avec ~693 amis par bot, ça fait des dizaines de milliers
                // d'objets retenus pour rien : rien ici ne lit friend.presence
                // ni friend.isJoinable. À 0, STOMP construit toujours la présence
                // et émet 'friend:presence', mais ne la STOCKE plus (STOMP.js:191)
                // — et friend.party continue d'être renseigné, donc les
                // invitations et les rejoins de partie ne changent pas.
                // Mettre un nombre de secondes > 0 pour réactiver le cache.
                cacheSettings: {
                    presences: {
                        maxLifetime: parseInt(process.env.FNBR_PRESENCE_CACHE_SECONDS || '0', 10),
                        sweepInterval: 300_000, // ms — fnbr le passe tel quel à setInterval
                    },
                },
                auth: {
                    deviceAuth: account.deviceAuth,
                    authClient: 'fortniteAndroidGameClient',
                    // Accepte l'EULA + grant_access à chaque login → le compte
                    // obtient l'action « PLAY » nécessaire au matchmaking (bot
                    // lobby /control). Sans ça : "does not possess the action PLAY".
                    checkEULA: true,
                },
                connectToSTOMP: true,
                connectToXMPP: true,
                debug: (msg) => {
                    // On ne veut pas tout le bruit debug de fnbr, juste confirmer
                    // le provisioning EULA/accès jeu (droit PLAY pour le matchmaking).
                    if (typeof msg === 'string' && /EULA/i.test(msg)) {
                        console.log(`[${identifier}] 📜 ${msg}`);
                    }
                }
            });

            this.setupBotEvents(bot, account);

            const instance = {
                account,
                client: bot,
                isConnected: false,
                // Bloque l'auto-reconnexion tant que le login initial est en vol :
                // deux client.login() concurrents sur le même client se marchent
                // dessus (le premier échoue, le second réussit hors registre).
                isLoggingIn: true,
                connectionAttempts: 0,
            };

            this.bots.set(account.email, instance);

            // Le tout premier login d'un compte accepte l'EULA, ce qui invalide la
            // session en cours : fnbr enchaîne sur l'initialisation de partie et
            // Epic répond « User [...] is offline ». Un second login passe. On
            // tente donc deux fois avant de déclarer le compte mort.
            let lastError: any;
            for (let attempt = 1; attempt <= 2; attempt++) {
                try {
                    await bot.login();
                    lastError = undefined;
                    break;
                } catch (e: any) {
                    lastError = e;
                    if (attempt < 2) {
                        console.warn(`[${identifier}] ⚠️ Login refusé (${e.message}) — nouvelle tentative dans 5s`);
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    }
                }
            }
            instance.isLoggingIn = false;
            if (lastError) throw lastError;

            instance.isConnected = true;
            console.log(`[${identifier}] ✅ Connecté!\n`);
            FailedBotRegistry.clearFailure(account.email); // login réussi : oublier les échecs passés
            return true;

        } catch (error: any) {
            // Une reconnexion automatique a pu être déclenchée par un événement
            // 'disconnected' reçu PENDANT le login initial. Si elle a abouti, le
            // compte est réellement connecté : le retirer du registre le rendrait
            // invisible du manager (flotte à 4/5) tout en le laissant logué chez
            // Epic — exactement le bogue vu le 2026-08-07 sur 1.GameBot.
            const current = this.bots.get(account.email);
            if (current?.isConnected) {
                current.isLoggingIn = false;
                console.log(`[${identifier}] ✅ Connecté via la reconnexion automatique (login initial : ${error.message})`);
                FailedBotRegistry.clearFailure(account.email);
                return true;
            }
            if (current?.isReconnecting) {
                current.isLoggingIn = false;
                console.warn(`[${identifier}] ⚠️ Login initial échoué (${error.message}) — une reconnexion est en cours, on la laisse aboutir`);
                return false;
            }

            console.error(`[${identifier}] ❌ Erreur: ${error.message}`);
            this.bots.delete(account.email);
            this.failedBots.add(account.email); // ne pas retenter ce bot cette session
            // Trace persistante : un reset de device auth côté Epic est récupérable,
            // un ban ne l'est pas — on garde le compte pour revue avant suppression
            FailedBotRegistry.recordFailure(account.email, account.pseudo, error.message);
            return false;
        }
    }

    private setupBotEvents(bot: Client, account: BotAccount) {
        const identifier = account.pseudo || account.email;

        // La présence XMPP de fnbr n'est plus lue par le client Fortnite in-game
        // (migration EOS) : sans PATCH de présence EOS, le bot reste affiché
        // "Dans le launcher" et n'est pas rejoignable. On double donc chaque
        // setStatus() — y compris les appels internes de fnbr sur les événements
        // de party — d'un envoi de présence EOS.
        const originalSetStatus = bot.setStatus.bind(bot);
        // fnbr >= 4.2 n'a plus le 3e paramètre "friend" (envoi XMPP ciblé) :
        // la présence par ami passe uniquement par EOS désormais. On tolère
        // encore l'argument pour les appelants historiques, sans le transmettre.
        (bot as any).setStatus = (status?: any, onlineType?: any, friend?: any) => {
            const result = originalSetStatus(status, onlineType);
            if (!friend) this.scheduleEOSPresence(bot, account);
            return result;
        };

        // Gestion de la déconnexion et reconnexion automatique.
        // fnbr peut émettre 'disconnected' sans 'session:close' (ex: coupure
        // réseau/VPN) — on reconnecte donc dans les deux cas, avec un délai
        // pour laisser le réseau revenir.
        bot.on('disconnected', async () => {
            console.log(`[${identifier}] ⚠️ Déconnecté`);
            const instance = this.bots.get(account.email);
            if (instance) {
                instance.isConnected = false;
            }
            setTimeout(() => this.reconnectBot(account), 15000);
        });

        // Reconnexion automatique sur session close
        (bot as any).on('session:close', async () => {
            console.log(`[${identifier}] 🔄 Session fermée, tentative de reconnexion...`);
            const instance = this.bots.get(account.email);
            if (instance) {
                instance.isConnected = false;
            }
            setTimeout(() => this.reconnectBot(account), 5000);
        });

        // Bot prêt : définir le statut
        bot.on('ready', async () => {
            try {
                await bot.user?.fetchSelf();
                const cfg = this.cfgFor(account);
                bot.setStatus(cfg.status);
                console.log(`[${identifier}] ✅ Bot connecté en tant que ${bot.user?.self?.displayName || 'Unknown'}`);
                console.log(`[${identifier}] 🎮 Status défini : "${cfg.status}"`);
            } catch (error: any) {
                console.error(`[${identifier}] ❌ Erreur ready:`, error.message);
            }
        });

        // Accepter les demandes d'ami
        (bot as any).on('friend:request', async (pendingFriend: any) => {
            try {
                await pendingFriend.accept();
                console.log(`[${identifier}] 🤝 Demande d'ami acceptée de: ${pendingFriend.displayName}`);
                // Repousser la présence après l'ajout : le broadcast du "ready" ne
                // couvre que le roster présent à cet instant-là, donc un ami ajouté
                // après verrait "In the launcher". fnbr >= 4.2 n'a plus d'envoi XMPP
                // ciblé par ami — un setStatus global re-déclenche la présence EOS,
                // qui est ce que le client Fortnite lit réellement.
                try {
                    bot.setStatus(this.cfgFor(account).status);
                } catch (e) {}
                // Envoyer le message d'ajout si configuré.
                // PendingFriend n'a PAS de sendMessage() dans fnbr 4 (seul Friend l'a) :
                // on passe par le whisper EOS direct qui n'exige pas que la friend list
                // locale soit déjà rafraîchie après l'accept.
                const addMsg = this.cfgFor(account).addMsg;
                if (addMsg) {
                    try {
                        await SecureChat.whisper(bot, pendingFriend.id, addMsg);
                        console.log(`[${identifier}] 💬 Message d'ajout envoyé à ${pendingFriend.displayName}`);
                    } catch (e: any) {
                        console.error(`[${identifier}] ❌ Échec message d'ajout à ${pendingFriend.displayName}: ${e.message}`);
                    }
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
                // Chaque nouvelle party repart avec un meta vierge : réappliquer le loadout
                await this.applyDefaultLoadout(bot, identifier);
                // Le bot vient de rejoindre le lobby de quelqu'un d'autre : l'event
                // party:member:joined ne se déclenche que pour les arrivées FUTURES,
                // donc on friend-request tout de suite les membres déjà présents.
                await this.friendRequestExistingMembers(bot, account, identifier);
                return;
            }
            // Mode !hide actif : fnbr vient de réécrire les squad assignments avec
            // tous les membres, réappliquer le masquage
            if (ModernParty.isHidden(bot)) {
                try { await ModernParty.reapplyHidden(bot); } catch (e) {}
            }
            // Un autre joueur rejoint : lui envoyer une demande d'ami
            try {
                await member.addFriend();
                console.log(`[${identifier}] ➕ Demande d'ami envoyée à ${member.displayName}`);
            } catch (e: any) {
                // Déjà amis = cas normal, silencieux ; le reste doit se voir
                // (liste d'amis pleine à 1000, confidentialité du joueur…)
                if (e?.name !== 'DuplicateFriendshipError') {
                    console.error(`[${identifier}] ❌ Demande d'ami à ${member.displayName}: ${e.message}`);
                }
            }
            // Envoyer le message de lobby si configuré
            if (this.cfgFor(account).joinMsg) {
                try {
                    await SecureChat.sendPartyMessage(bot, this.cfgFor(account).joinMsg);
                    console.log(`[${identifier}] 💬 Message de lobby envoyé`);
                } catch (e: any) {
                    console.error(`[${identifier}] ❌ Échec message de lobby: ${e.message}`);
                }
            }
            // Danse d'accueil. Après le loadout (qui repart d'un meta vierge et
            // écraserait l'emote) et sans bloquer le reste si elle échoue.
            if (this.joinEmote) {
                try {
                    await this.cosmeticsActions.setEmote(bot, this.joinEmote);
                    console.log(`[${identifier}] 💃 Danse d'accueil : ${this.joinEmote}`);
                } catch (e: any) {
                    console.error(`[${identifier}] ❌ Danse d'accueil (${this.joinEmote}): ${e.message}`);
                }
            }
            // Un joueur est là : verrouiller le lobby (privé)
            await this.updateExclusivity(bot, identifier);
        });

        // Mode mimic (!copy) : rejouer en direct les changements de skin/style/danse
        // du joueur copié. fnbr émet party:member:updated à chaque patch de meta.
        (bot as any).on('party:member:updated', async (member: any) => {
            if (member.id === bot.user?.self?.id) return;
            this.touchActivity(bot); // le joueur change de skin/emote → pas AFK
            try { await ModernParty.syncMimicFromMember(bot, member); } catch (e) {}
            // Bot lobby : le joueur (chef) a-t-il lancé une partie ? → le bot quitte
            this.handleBotLobbyHandoff(bot, identifier);
        });

        // Le chef (joueur promu) entre en matchmaking / en partie : le bot quitte
        (bot as any).on('party:member:matchstate:updated', async () => {
            this.handleBotLobbyHandoff(bot, identifier);
        });

        (bot as any).on('party:updated', async () => {
            this.handleBotLobbyHandoff(bot, identifier);
        });

        // Rappel du message de lobby quand quelqu'un part (utile en gros groupe)
        (bot as any).on('party:member:left', async (member: any) => {
            if (member.id === bot.user?.self?.id) return;
            // Le joueur copié part : arrêter le mode mimic
            if (ModernParty.getMimicTarget(bot) === member.id) {
                ModernParty.clearMimic(bot);
                console.log(`[${identifier}] 🎭 Mimic stoppé (départ de ${member.displayName})`);
            }
            if (this.cfgFor(account).joinMsg) {
                try {
                    await SecureChat.sendPartyMessage(bot, this.cfgFor(account).joinMsg);
                    console.log(`[${identifier}] 💬 Rappel lobby envoyé (départ de ${member.displayName})`);
                } catch (e: any) {
                    console.error(`[${identifier}] ❌ Échec rappel lobby: ${e.message}`);
                }
            }
            // Plus personne avec le bot ? Rouvrir le lobby (public)
            await this.updateExclusivity(bot, identifier);
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

            this.touchActivity(bot); // un message dans le lobby = joueur actif

            const fakeMessage = {
                content: realMessage,
                author: message.author,
                reply: async (text: string) => {
                    try {
                        await SecureChat.sendPartyMessage(bot, text);
                    } catch (e: any) {
                        console.error(`[${identifier}] ❌ Échec réponse lobby: ${e.message}`);
                    }
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
            // Réponse via whisper signé : le reply de fnbr (non signé) n'est plus affiché in-game
            const secureMessage = {
                content: message.content,
                author: message.author,
                reply: async (text: string) => {
                    try {
                        await SecureChat.whisper(bot, message.author.id, text);
                    } catch (e: any) {
                        console.error(`[${identifier}] ❌ Échec réponse DM: ${e.message}`);
                    }
                }
            };
            await this.commandManager.handleMessage(bot, secureMessage);
        });

        // Accepter les invitations de groupe.
        // ATTENTION : l'événement fnbr s'appelle 'party:invite' — avec un autre nom,
        // fnbr voit listenerCount('party:invite') === 0 et jette le PING sans le traiter,
        // donc le bot ne reçoit jamais aucune invitation.
        (bot as any).on('party:invite', async (invitation: any) => {
            console.log(`[${identifier}] 📨 Invitation de ${invitation.sender?.displayName}`);
            // Bot déjà occupé avec un joueur : refuser et prévenir l'invitant,
            // il ne faut pas abandonner le joueur en cours.
            if (this.exclusiveLobby && this.countOtherMembers(bot) >= 1) {
                try { await invitation.decline(); } catch (e) {}
                try {
                    await SecureChat.whisper(bot, invitation.sender?.id, '⏳ I\'m already in a lobby with another player! Try another bot or retry later.');
                } catch (e) {}
                console.log(`[${identifier}] 🚫 Invitation refusée (déjà occupé)`);
                return;
            }
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

    /**
     * Applique le loadout par défaut du bot (skin/sac/pioche/niveau) dans sa party.
     * Surchargeable via .env : DEFAULT_SKIN, DEFAULT_BACKPACK, DEFAULT_PICKAXE, DEFAULT_LEVEL.
     */
    /**
     * Envoie une demande d'ami à tous les membres déjà présents dans la party
     * (utile quand le bot REJOINT le lobby de quelqu'un : il ne verrait sinon que
     * les arrivées suivantes). Espacé légèrement pour ne pas déclencher le rate-limit.
     */
    /** Si un bot lobby est armé et que la partie a démarré, fait quitter le bot. */
    private handleBotLobbyHandoff(bot: Client, identifier: string): void {
        if (!BotLobby.getHandoff(bot)) return;
        BotLobby.maybeLeaveForHandoff(bot).then(left => {
            if (left) console.log(`[${identifier}] 🎮 Bot lobby : partie lancée, bot sorti — joueur laissé seul.`);
        }).catch(() => {});
    }

    /** Nombre de membres de la party autres que le bot lui-même. */
    /** Les comptes Epic de notre propre flotte. */
    private ownBotAccountIds(): Set<string> {
        const ids = new Set<string>();
        for (const instance of this.bots.values()) {
            const id = instance.account.deviceAuth?.accountId;
            if (id) ids.add(id);
        }
        return ids;
    }

    /**
     * Compte les JOUEURS présents avec le bot — nos propres bots ne comptent pas.
     *
     * L'anti-AFK existe pour empêcher un joueur de squatter un lobby. Un bot de
     * la flotte n'est pas un squatteur : tant qu'on le comptait, un groupe de
     * plusieurs bots gardait la minuterie armée, et comme deux bots entre eux ne
     * produisent aucune activité de joueur, le compte à rebours allait au bout et
     * dissolvait le groupe (vécu le 2026-08-08 : 66.RGPLobbyBot expulse 4.GameBot
     * cinq minutes après le départ du joueur).
     */
    private countOtherMembers(bot: Client): number {
        const members: any[] = Array.from((bot as any).party?.members?.values?.() ?? []);
        const nous = this.ownBotAccountIds();
        return members.filter(m => m.id !== bot.user?.self?.id && !nous.has(m.id)).length;
    }

    /**
     * Lobby exclusif : quand au moins un joueur est avec le bot ET que le bot est
     * chef de SA party, on passe en privé (plus personne ne peut rejoindre) ;
     * quand le bot se retrouve seul, on repasse en public. Le flag isPrivatized
     * évite de re-patcher la privacy à chaque événement de party.
     */
    private async updateExclusivity(bot: Client, identifier: string): Promise<void> {
        if (!this.exclusiveLobby) return;
        const instance = this.findInstanceByClient(bot);
        const occupied = this.countOtherMembers(bot) >= 1;

        // Compte à rebours anti-AFK (même si le bot n'est pas chef :
        // squatter un bot dans SA party le bloque aussi)
        if (instance) {
            if (occupied) this.armIdleTimer(bot, instance, identifier);
            else this.clearIdleTimer(instance.account.email);
        }

        const party: any = (bot as any).party;
        if (!party?.me?.isLeader) return; // pas notre lobby → pas notre privacy
        if (instance && instance.isPrivatized === occupied) return;

        try {
            await party.setPrivacy(occupied ? Enums.PartyPrivacy.PRIVATE : Enums.PartyPrivacy.PUBLIC);
            if (instance) instance.isPrivatized = occupied;
            console.log(`[${identifier}] ${occupied ? '🔒 Lobby verrouillé (joueur présent)' : '🔓 Lobby rouvert (bot seul)'}`);
        } catch (e: any) {
            console.error(`[${identifier}] ❌ Privacy exclusivité: ${e.message}`);
        }
    }

    private armIdleTimer(bot: Client, instance: any, identifier: string): void {
        if (this.exclusiveIdleMs <= 0) return; // kick AFK désactivé
        this.clearIdleTimer(instance.account.email);
        this.idleTimers.set(instance.account.email, setTimeout(() => {
            this.idleTimers.delete(instance.account.email);
            this.freeIdleLobby(bot, identifier).catch(() => {});
        }, this.exclusiveIdleMs));
    }

    private clearIdleTimer(email: string): void {
        const t = this.idleTimers.get(email);
        if (t) {
            clearTimeout(t);
            this.idleTimers.delete(email);
        }
    }

    /** Toute activité d'un joueur (commande, changement de meta) repousse le kick AFK. */
    private touchActivity(bot: Client): void {
        const instance = this.findInstanceByClient(bot);
        if (!instance) return;
        if (this.idleTimers.has(instance.account.email)) {
            this.armIdleTimer(bot, instance, instance.account.pseudo || instance.account.email);
        }
    }

    /** Délai AFK dépassé : on prévient, on kick (ou on part) et le lobby rouvre. */
    private async freeIdleLobby(bot: Client, identifier: string): Promise<void> {
        const party: any = (bot as any).party;
        if (!party) return;
        // On ne libère le lobby que des JOUEURS : expulser nos propres bots
        // casserait un groupe monté volontairement.
        const nous = this.ownBotAccountIds();
        const others: any[] = Array.from(party.members?.values?.() ?? [])
            .filter((m: any) => m.id !== bot.user?.self?.id && !nous.has(m.id));
        if (!others.length) return;

        const minutes = Math.round(this.exclusiveIdleMs / 60000);
        try {
            await SecureChat.sendPartyMessage(bot, `⏳ ${minutes} min without activity — I'm freeing the lobby! Invite me again anytime 👋`);
        } catch (e) {}

        if (party.me?.isLeader) {
            for (const m of others) {
                try { await m.kick(); } catch (e) {}
            }
            console.log(`[${identifier}] 🧹 Lobby libéré après ${minutes} min d'inactivité (${others.length} joueur(s) kick)`);
        } else {
            try { await party.leave(); } catch (e) {}
            console.log(`[${identifier}] 🧹 Party quittée après ${minutes} min d'inactivité`);
        }
    }

    private findInstanceByClient(bot: Client): any {
        for (const instance of this.bots.values()) {
            if (instance.client === bot) return instance;
        }
        return null;
    }

    private async friendRequestExistingMembers(bot: Client, account: BotAccount, identifier: string): Promise<void> {
        const members: any[] = Array.from((bot as any).party?.members?.values?.() ?? []);
        for (const member of members) {
            if (member.id === bot.user?.self?.id) continue;
            try {
                await member.addFriend();
                console.log(`[${identifier}] ➕ Demande d'ami (membre présent) à ${member.displayName}`);
            } catch (e: any) {
                if (e?.name !== 'DuplicateFriendshipError') {
                    console.error(`[${identifier}] ❌ Demande d'ami à ${member.displayName}: ${e.message}`);
                }
            }
            await new Promise(r => setTimeout(r, 800));
        }
    }

    private async applyDefaultLoadout(bot: Client, identifier: string): Promise<void> {
        const me: any = (bot as any).party?.me;
        if (!me) return;

        const skin = process.env.DEFAULT_SKIN || 'CID_028_Athena_Commando_F'; // Renegade Raider
        const backpack = process.env.DEFAULT_BACKPACK || '';
        const pickaxe = process.env.DEFAULT_PICKAXE || '';
        const level = parseInt(process.env.DEFAULT_LEVEL || '100', 10);

        try {
            await ModernParty.setLoadout(bot, {
                outfit: skin,
                ...(backpack ? { backpack } : {}),
                ...(pickaxe ? { pickaxe } : {}),
            });
            if (!isNaN(level) && level > 0) await ModernParty.setLevel(bot, level);
            console.log(`[${identifier}] 👗 Loadout par défaut appliqué (${skin}, niveau ${level})`);
        } catch (e: any) {
            console.error(`[${identifier}] ❌ Loadout par défaut: ${e.message}`);
        }
    }

    /**
     * Envoi débouncé de la présence EOS : un join/leave de party déclenche plusieurs
     * setStatus() d'affilée, on ne publie que l'état final (rate-limit Epic).
     */
    private scheduleEOSPresence(bot: Client, account: BotAccount): void {
        const existing = this.eosPresenceTimers.get(account.email);
        if (existing) clearTimeout(existing);
        this.eosPresenceTimers.set(account.email, setTimeout(() => {
            this.eosPresenceTimers.delete(account.email);
            sendEOSPresence(bot).catch((e: any) => {
                console.error(`[${account.pseudo || account.email}] ⚠️ Présence EOS: ${e.message}`);
            });
        }, 1500));
    }

    private async reconnectBot(account: BotAccount): Promise<void> {
        const identifier = account.pseudo || account.email;
        const instance = this.bots.get(account.email);

        // isReconnecting évite les tentatives concurrentes (déclencheurs
        // multiples : 'disconnected', 'session:close', health check).
        // isLoggingIn couvre le cas du login initial : fnbr émet 'disconnected'
        // pendant celui-ci, et un second login() concurrent sur le même client
        // fait échouer le premier.
        if (!instance || instance.isConnected || instance.isReconnecting || instance.isLoggingIn || this.failedBots.has(account.email)) return;

        instance.isReconnecting = true;
        try {
            console.log(`[${identifier}] 🔄 Tentative de reconnexion...`);
            await instance.client.login();
            instance.isConnected = true;
            // Le login initial a pu échouer et retirer l'instance du registre
            // pendant que cette reconnexion était en vol : on la réenregistre,
            // sinon le bot reste connecté chez Epic mais absent de la flotte.
            if (!this.bots.has(account.email)) {
                console.log(`[${identifier}] ↩️ Réintégré à la flotte après reconnexion`);
                this.bots.set(account.email, instance);
            }
            this.failedBots.delete(account.email);
            FailedBotRegistry.clearFailure(account.email);
            console.log(`[${identifier}] ✅ Bot reconnecté!`);
        } catch (e: any) {
            console.error(`[${identifier}] ❌ Reconnexion échouée: ${e.message}`);
            // Réessayer dans 1 minute
            setTimeout(() => this.reconnectBot(account), 60000);
        } finally {
            instance.isReconnecting = false;
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
        this.clearIdleTimer(email);
        const pendingPresence = this.eosPresenceTimers.get(email);
        if (pendingPresence) {
            clearTimeout(pendingPresence);
            this.eosPresenceTimers.delete(email);
        }

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

    /** Lance tous les bots présents en BD mais pas encore démarrés. Retourne le nombre lancé. */
    public async syncFromDB(): Promise<number> {
        let launched = 0;
        const accounts = await this.dbManager.getAllBots();
        for (const account of accounts) {
            if (!this.bots.has(account.email) && !this.failedBots.has(account.email)) {
                console.log(`[BotManager] 🆕 Nouveau bot détecté en BD: ${account.pseudo || account.email}`);
                if (await this.launchBot(account)) launched++;
            }
        }
        // Un import peut amener un propriétaire encore inconnu : on lui donne ses
        // propres réglages tout de suite, sinon ses bots héritent de la config
        // globale (donc du code créateur d'un autre) jusqu'à sa 1re sauvegarde.
        if (launched > 0 && await this.ensureOwnerSettings() > 0) {
            await this.refreshOwnerSettings();
        }
        return launched;
    }

    /**
     * Republie périodiquement la présence EOS de chaque bot connecté.
     *
     * La présence EOS est ce que le client Fortnite lit réellement : sans elle,
     * un bot apparaît HORS LIGNE en jeu même si sa connexion XMPP/STOMP est
     * parfaitement vivante. Or elle n'était publiée qu'au travers du wrapper
     * setStatus() — donc uniquement à la connexion et sur les événements
     * (ami accepté, invitation, changement de config).
     *
     * Conséquence observée le 2026-08-08 : les 5 bots d'Aurélien (1 à 3 amis,
     * 0 événement en une heure) apparaissaient déconnectés en jeu, pendant que
     * ceux de Killian (700 à 950 amis, 456 événements sur la même heure)
     * restaient visibles — leur présence était rafraîchie par accident, par le
     * trafic. Un bot au repos n'a pas ce filet.
     *
     * Les envois sont espacés : 72 PATCH d'un coup, c'est un rate-limit Epic
     * assuré. sendEOSPresence() ne fait rien si STOMP n'est pas connecté.
     */
    public startPresenceRefresh(intervalMs: number = 240_000, espacementMs: number = 250): void {
        console.log(`[BotManager] 🟢 Rafraîchissement de la présence EOS toutes les ${intervalMs / 1000}s`);
        setInterval(async () => {
            const connectes = Array.from(this.bots.values()).filter(b => b.isConnected && b.client);
            let ok = 0;
            const echecs: string[] = [];
            for (const instance of connectes) {
                try {
                    await sendEOSPresence(instance.client);
                    ok++;
                } catch (e: any) {
                    echecs.push(`${instance.account.pseudo || instance.account.email}: ${e.message}`);
                }
                if (espacementMs > 0) await new Promise(r => setTimeout(r, espacementMs));
            }
            if (echecs.length > 0) {
                console.warn(`[BotManager] 🟠 Présence EOS republiée sur ${ok}/${connectes.length} bot(s) — ${echecs.length} échec(s) : ${echecs.slice(0, 3).join(' | ')}`);
            }
        }, intervalMs);
    }

    public startDBSync(intervalMs: number = 300_000): void {
        console.log(`[BotManager] 🔁 Synchronisation BD toutes les ${intervalMs / 1000}s`);
        setInterval(async () => {
            try {
                await this.syncFromDB();
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
    /** Compteurs pour le statut du bot Discord : bots réellement connectés / bots lancés. */
    public getFleetCounts(): { online: number; total: number } {
        return {
            online: this.getActiveBots().filter(b => b.isConnected).length,
            total: this.bots.size,
        };
    }

    public startHealthCheck(intervalMs: number = 60_000): void {
        const minActive = parseInt(process.env.MIN_ACTIVE_BOTS_ALERT || '1', 10);
        console.log(`[BotManager] 🩺 Health check toutes les ${intervalMs / 1000}s (seuil: ${minActive} bot(s) actif(s) min)`);

        setInterval(() => {
            const total = this.bots.size;
            const active = this.getActiveBots().filter(b => b.isConnected).length;

            // Filet de sécurité : relance les bots restés déconnectés
            // (les timers de reconnexion peuvent avoir tous échoué).
            for (const instance of this.bots.values()) {
                if (!instance.isConnected && !this.failedBots.has(instance.account.email)) {
                    this.reconnectBot(instance.account);
                }
            }

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

    private friendCountOf(botInstance: any): number {
        return botInstance.client?.friend?.list ? botInstance.client.friend.list.size : 0;
    }

    /**
     * Bots connectés et non pleins, du moins chargé au plus chargé.
     *
     * @param exclure Pseudos à écarter — typiquement les bots déjà amis avec
     *   l'utilisateur. Sans ça, /add retombait indéfiniment sur le même bot et
     *   répondait « vous êtes déjà ami », au lieu d'en proposer un autre.
     */
    getAvailableBots(exclure: string[] = []): any[] {
        const exclus = new Set(exclure.map(p => String(p ?? '').toLowerCase()));
        return this.getActiveBots()
            .filter(b => b.isConnected && b.client)
            .filter(b => !exclus.has(String(b.account.pseudo ?? '').toLowerCase()))
            .filter(b => this.friendCountOf(b) < 900)
            .sort((a, b) => this.friendCountOf(a) - this.friendCountOf(b));
    }

    /**
     * Gets the best available bot for adding a friend.
     * Criteria: Connected, Friend count < 900, Fewest friends first.
     */
    getBestBot(): any | null {
        return this.getAvailableBots()[0] ?? null;
    }

    /**
     * Renvoie les pseudos des bots connectés qui ont CET utilisateur (accountId Epic)
     * dans leur liste d'amis. Sert à alimenter la liste déroulante de /skin et /invite :
     * on ne propose que les bots que l'utilisateur peut réellement voir/rejoindre.
     */
    getBotsFriendedBy(accountId: string): string[] {
        if (!accountId) return [];
        return this.getActiveBots()
            .filter(b => b.isConnected && b.client?.friend?.list)
            .filter(b => b.client.friend.list.has(accountId))
            .map(b => b.account.pseudo);
    }

    /**
     * Fait inviter l'utilisateur (accountId Epic) dans le groupe du bot indiqué.
     * Le bot doit être ami avec l'utilisateur (sinon Epic refuse l'invitation).
     */
    async inviteToParty(botPseudo: string, accountId: string): Promise<string> {
        const botInstance = this.getActiveBots().find(b => b.account.pseudo === botPseudo);
        if (!botInstance || !botInstance.isConnected || !botInstance.client) {
            return `❌ Le bot **${botPseudo}** est introuvable ou hors ligne.`;
        }
        if (!botInstance.client.party) {
            return `❌ Le bot **${botPseudo}** n'est pas dans un groupe pour le moment.`;
        }
        try {
            await botInstance.client.party.invite(accountId);
            return `✅ **${botPseudo}** t'a invité dans son groupe ! Accepte l'invitation dans Fortnite. 🎮`;
        } catch (e: any) {
            console.error(`[${botPseudo}] ❌ Invitation échouée pour ${accountId}: ${e.message}`);
            return `❌ Échec de l'invitation : ${e.message}`;
        }
    }

    /** Joue la même emote (par id de cosmétique) sur tous les bots perso connectés de l'utilisateur. */
    async emoteAllOwned(discordId: string, emoteId: string): Promise<number> {
        const owned = (await this.dbManager.getBotsByOwner(discordId)).map(b => b.pseudo);
        const bots = this.getActiveBots().filter(b => b.isConnected && b.client && owned.includes(b.account.pseudo));
        let count = 0;
        for (const b of bots) {
            try {
                await ModernParty.setEmote(b.client, emoteId);
                count++;
            } catch (e: any) {
                console.error(`[${b.account.pseudo}] emote sync échouée: ${e.message}`);
            }
        }
        return count;
    }

    /** Applique un preset de loadout à tous les bots perso connectés de l'utilisateur. */
    async applyLoadoutToOwned(discordId: string, preset: import('./DatabaseManager').LoadoutPreset): Promise<number> {
        const owned = (await this.dbManager.getBotsByOwner(discordId)).map(b => b.pseudo);
        const bots = this.getActiveBots().filter(b => b.isConnected && b.client && owned.includes(b.account.pseudo));
        let count = 0;
        for (const b of bots) {
            try {
                await ModernParty.setLoadout(b.client, {
                    outfit: preset.outfit, backpack: preset.backpack, pickaxe: preset.pickaxe
                });
                if (preset.emote) await ModernParty.setEmote(b.client, preset.emote);
                count++;
            } catch (e: any) {
                console.error(`[${b.account.pseudo}] preset échoué: ${e.message}`);
            }
        }
        return count;
    }

    // ══════════════ BOT LOBBY (handoff) ══════════════
    /**
     * Trouve le bot connecté dont la party contient CE joueur (accountId Epic)
     * et où le bot est CHEF — condition pour piloter un bot lobby.
     */
    getBotHostingUser(accountId: string): any | null {
        if (!accountId) return null;
        return this.getActiveBots().find(b => {
            const party: any = b.isConnected && b.client?.party;
            if (!party?.me?.isLeader) return false;
            const members: any[] = Array.from(party.members?.values?.() ?? []);
            return members.some(m => m.id === accountId);
        }) || null;
    }

    /**
     * Démarre un bot lobby : le bot promeut le joueur chef et arme son départ
     * automatique au lancement de la partie (le vrai client du joueur matchmake ;
     * le compte bot bas niveau tire le lobby vers des bots, puis quitte).
     */
    async startBotLobby(botPseudo: string, userAccountId: string): Promise<string> {
        const inst = this.getActiveBots().find(b => b.account.pseudo === botPseudo);
        if (!inst?.isConnected || !inst.client?.party) return `❌ Bot **${botPseudo}** hors ligne ou sans groupe.`;
        // Pas de kick AFK pendant qu'on prépare/attend le lancement
        this.clearIdleTimer(inst.account.email);
        return BotLobby.startHandoff(inst.client, userAccountId);
    }

    async addFriendOnAvailableBot(targetUsername: string): Promise<'SUCCESS' | 'ERROR' | 'FULL' | 'ALREADY_FRIENDS'> {
        console.log(`[BotManager] Trying to add friend: ${targetUsername}`);

        if (this.getActiveBots().filter(b => b.isConnected).length === 0) return 'ERROR';

        const disponibles = this.getAvailableBots();
        if (disponibles.length === 0) {
            console.warn('[BotManager] All bots are full (>900 friends)');
            return 'FULL';
        }

        // Écarter d'emblée les bots qui ont déjà cet utilisateur : inutile de
        // leur envoyer une demande vouée au DuplicateFriendshipError, et surtout
        // ça permet d'en proposer un AUTRE au lieu de s'arrêter au premier.
        const cible = targetUsername.toLowerCase();
        const candidats = disponibles.filter(b => {
            const liste = b.client.friend?.list;
            if (!liste) return true;
            return !liste.find((f: any) => String(f.displayName ?? '').toLowerCase() === cible);
        });

        if (candidats.length === 0) {
            console.log(`[BotManager] ${targetUsername} est déjà ami avec les ${disponibles.length} bot(s) disponible(s)`);
            return 'ALREADY_FRIENDS';
        }

        // On parcourt les candidats : la liste d'amis locale peut être en retard
        // sur Epic, un DuplicateFriendshipError ne doit donc pas tout arrêter.
        let derniereErreur: any = null;
        for (const botInstance of candidats) {
            const identifier = botInstance.account.pseudo;
            try {
                console.log(`[${identifier}] Sending friend request to ${targetUsername}...`);
                await botInstance.client.friend.add(targetUsername);
                console.log(`[${identifier}] ✅ Friend request sent!`);
                return 'SUCCESS';
            } catch (error: any) {
                if (error?.name === 'DuplicateFriendshipError') {
                    console.log(`[${identifier}] ℹ️ ${targetUsername} déjà ami — on essaie le bot suivant`);
                    continue;
                }
                derniereErreur = error;
                console.error(`[${identifier}] ❌ Failed to add friend:`, error.message);
            }
        }

        return derniereErreur ? 'ERROR' : 'ALREADY_FRIENDS';
    }

    // removeFriend() a été retiré : il parcourait TOUTE la flotte, tous
    // propriétaires confondus, et retirait la personne des bots de chacun.
    // /remove agit désormais sur le compte Epic de l'appelant
    // (UserManager.removeFriend) et ne touche plus aux lobby bots.

    /**
     * Config effective d'un bot : les réglages de SON propriétaire.
     *
     * Le repli sur la config globale n'a lieu que si le propriétaire n'a pas
     * encore de ligne owner_settings — et c'est précisément ce repli qui a fait
     * fuiter le code créateur de Killian sur les bots d'Aurélien le 2026-08-07 :
     * ses deux premiers bots se sont connectés deux minutes avant qu'il
     * n'enregistre ses propres réglages. `ensureOwnerSettings()` matérialise
     * désormais une ligne par propriétaire pour que ce repli ne serve jamais.
     */
    public cfgFor(account: BotAccount): { status: string; joinMsg: string; addMsg: string } {
        const s = account.ownerDiscordId ? this.ownerSettings.get(account.ownerDiscordId) : undefined;
        return {
            status: s?.status ?? this.globalStatus,
            joinMsg: s?.joinMsg ?? this.joinMsg,
            addMsg: s?.addMsg ?? this.addMsg,
        };
    }

    /** Le propriétaire de ce bot a-t-il ses propres réglages ? (sinon : repli global) */
    private hasOwnSettings(account: BotAccount): boolean {
        return !!(account.ownerDiscordId && this.ownerSettings.has(account.ownerDiscordId));
    }

    /**
     * Donne une ligne owner_settings à tout propriétaire qui possède des bots
     * mais n'en a pas encore, en la remplissant avec la config globale actuelle.
     * Sans ça, ses bots portent la config d'autrui jusqu'à sa première sauvegarde.
     */
    public async ensureOwnerSettings(): Promise<number> {
        const owners = new Set<string>();
        for (const instance of this.bots.values()) {
            if (instance.account.ownerDiscordId) owners.add(instance.account.ownerDiscordId);
        }
        let created = 0;
        for (const ownerId of owners) {
            if (this.ownerSettings.has(ownerId)) continue;
            await this.dbManager.saveOwnerSettings({
                ownerDiscordId: ownerId,
                status: this.globalStatus,
                joinMsg: this.joinMsg,
                addMsg: this.addMsg,
            });
            console.log(`[BotManager] ⚙️ owner_settings créés pour ${ownerId} (évite l'héritage d'un autre owner)`);
            created++;
        }
        if (created > 0) {
            const all = await this.dbManager.getAllOwnerSettings();
            this.ownerSettings = new Map(all.map(s => [s.ownerDiscordId, s]));
        }
        return created;
    }

    /** (Re)charge owner_settings depuis la base et réapplique les statuts. */
    public async refreshOwnerSettings(): Promise<void> {
        try {
            const all = await this.dbManager.getAllOwnerSettings();
            this.ownerSettings = new Map(all.map(s => [s.ownerDiscordId, s]));

            // Compte-rendu par propriétaire : sans ça, une fuite de config entre
            // owners restait invisible dans les logs (le statut était réappliqué
            // silencieusement) et ne se voyait qu'en jeu, des heures plus tard.
            const parOwner = new Map<string, number>();
            let orphelins = 0;
            for (const instance of this.bots.values()) {
                if (!instance.isConnected || !instance.client) continue;
                const cfg = this.cfgFor(instance.account);
                try { instance.client.setStatus(cfg.status); } catch (e) {}
                if (this.hasOwnSettings(instance.account)) {
                    parOwner.set(cfg.status, (parOwner.get(cfg.status) || 0) + 1);
                } else {
                    orphelins++;
                }
            }
            const detail = Array.from(parOwner.entries()).map(([s, n]) => `${n}×"${s}"`).join(', ');
            console.log(`[BotManager] ⚙️ owner_settings chargés (${all.length} owner(s)) — statuts appliqués : ${detail || 'aucun'}${orphelins ? ` ; ${orphelins} bot(s) sans réglages propres (repli global)` : ''}`);
        } catch (e: any) {
            console.error('[BotManager] refreshOwnerSettings:', e.message);
        }
    }

    /**
     * Apply global config to all connected bots immediately.
     */
    applyGlobalConfig(config: { status?: string; joinMsg?: string; addMsg?: string }): void {
        // Le dashboard renvoie la config globale à chaque manager:login (toutes les 30s) même
        // si rien n'a changé — on ignore silencieusement les valeurs identiques pour éviter de
        // spammer les logs et de rappeler setStatus() sur chaque bot inutilement (rate-limit Epic).
        if (config.status !== undefined && config.status !== this.globalStatus) {
            this.globalStatus = config.status;
            // Apply status to all currently connected bots
            for (const instance of this.bots.values()) {
                if (instance.isConnected && instance.client) {
                    try {
                        const st = this.cfgFor(instance.account).status;
                        instance.client.setStatus(st);
                        console.log(`[${instance.account.pseudo}] 🎮 Status mis à jour: "${st}"`);
                    } catch (e) {}
                }
            }
        }
        if (config.joinMsg !== undefined && config.joinMsg !== this.joinMsg) {
            this.joinMsg = config.joinMsg;
            console.log(`[BotManager] 💬 Join message mis à jour`);
        }
        if (config.addMsg !== undefined && config.addMsg !== this.addMsg) {
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
                case 'glider':
                    if (!data) { result = '❌ Usage: glider <nom>'; break; }
                    result = await this.cosmeticsActions.setGlider(client, data);
                    break;
                case 'shoes':
                    if (!data) { result = '❌ Usage: shoes <nom>'; break; }
                    result = await this.cosmeticsActions.setShoes(client, data);
                    break;
                case 'style':
                    if (!data) { result = '❌ Usage: style <nom du style>'; break; }
                    result = await this.cosmeticsActions.setStyle(client, data);
                    break;
                case 'random':
                    result = await this.cosmeticsActions.setRandom(client, data || 'skin');
                    break;
                case 'stopdanse':
                    result = await this.cosmeticsActions.clearEmote(client);
                    break;
                case 'sitout':
                    await ModernParty.setSittingOut(client, true);
                    result = '🪑 Sit out activé.';
                    break;
                case 'sitin':
                    await ModernParty.setSittingOut(client, false);
                    result = '🎮 Sit out désactivé.';
                    break;
                case 'level':
                    const lvl = parseInt(data);
                    if (isNaN(lvl) || lvl < 1) { result = '❌ Usage: level <nombre>'; break; }
                    result = await this.cosmeticsActions.setLevel(client, lvl);
                    break;
                case 'hide':
                    try {
                        await ModernParty.setHidden(client, true, []);
                        result = '🙈 Tout le monde est caché sauf le bot.';
                    } catch (e: any) { result = `❌ ${e.message}`; }
                    break;
                case 'show':
                case 'unhide':
                    try {
                        await ModernParty.setHidden(client, false);
                        result = '👀 Membres de nouveau visibles.';
                    } catch (e: any) { result = `❌ ${e.message}`; }
                    break;
                case 'copy': {
                    if (!data) { result = '❌ Usage: copy <pseudo>'; break; }
                    const target = (client as any).party?.members?.find((m: any) =>
                        m.displayName?.toLowerCase().includes(String(data).toLowerCase()));
                    if (!target) { result = `❌ Joueur "${data}" introuvable dans le lobby.`; break; }
                    try {
                        await ModernParty.copyLoadoutFrom(client, target);
                        ModernParty.setMimicTarget(client, target.id);
                        try { await ModernParty.copyEmoteFrom(client, target); } catch (e) {}
                        result = `🎭 Copie de ${target.displayName} (skin + danses en direct).`;
                    } catch (e: any) { result = `❌ ${e.message}`; }
                    break;
                }
                case 'stopcopy':
                    result = ModernParty.clearMimic(client) ? '⏹️ Copie stoppée.' : 'ℹ️ Aucune copie en cours.';
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
