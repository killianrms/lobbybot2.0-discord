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

    /**
     * Configure les événements pour un bot
     */
    private setupBotEvents(bot: Client, account: BotAccount) {
        const identifier = account.pseudo || account.email;

        // Événement quand le bot est prêt
        bot.on('ready', async () => {
            // Charger les informations du user
            await bot.user.fetchSelf();
            bot.setStatus("Utilisez le code : MON-CODE");
            console.log(`[${identifier}] ✅ Bot connecté en tant que ${bot.user.self?.displayName || 'Unknown'}`);
            console.log(`[${identifier}] ID: ${bot.user.self?.id || 'Unknown'}`);

            // Vérifier que STOMP est connecté
            if (bot.stomp && (bot.stomp as any).isConnected) {
                console.log(`[${identifier}] 💬 STOMP/EOS Chat: Connecté`);
            } else {
                console.log(`[${identifier}] 💬 STOMP/EOS Chat: Désactivé`);
            }

            // Vérifier XMPP
            console.log(`[${identifier}] 🔍 Debug XMPP:`, {
                hasXmpp: !!bot.xmpp,
                connection: !!(bot.xmpp as any)?.connection,
                jid: (bot.xmpp as any)?.connection?.jid?.toString()
            });
            if (bot.xmpp) {
                console.log(`[${identifier}] 💬 XMPP: Actif`);
            } else {
                console.log(`[${identifier}] ⚠️  XMPP: Non connecté`);
            }
        });

        // Événement pour sauvegarder le device auth
        bot.on('deviceauth:created', async (deviceAuth: DeviceAuth) => {
            console.log(`[${identifier}] 🔑 Device auth créé, sauvegarde...`);
            try {
                await this.csvManager.saveDeviceAuth(account.email, deviceAuth);
                console.log(`[${identifier}] ✅ Device auth sauvegardé dans le CSV`);
                account.deviceAuth = deviceAuth;
            } catch (error) {
                console.error(`[${identifier}] ❌ Erreur sauvegarde device auth:`, error);
            }
        });

        // Accepter automatiquement les demandes d'ami
        bot.on('friend:request', async (request) => {
            console.log(`[${identifier}] 👋 Demande d'ami de ${request.displayName} (ID: ${request.id})`);
            await request.accept();
            console.log(`[${identifier}] ✅ Ami accepté`);
        });

        // Événement quand un ami est ajouté
        bot.on('friend:added', (friend) => {
            console.log(`[${identifier}] 🎉 Nouvel ami: ${friend.displayName} (ID: ${friend.id})`);
        });

        // Log de tous les amis au démarrage
        bot.on('ready', () => {
            setTimeout(() => {
                console.log(`[${identifier}] 👥 Liste d'amis (${bot.friend.list.size}):`);
                bot.friend.list.forEach((friend) => {
                    console.log(`[${identifier}]   - ${friend.displayName} (${friend.id}) ${friend.isOnline ? '🟢' : '⚫'}`);
                });
            }, 2000);
        });

        // Événements du lobby
        bot.on('party:member:joined', (member) => {
            if (member.id === bot.user.self?.id) {
                console.log(`[${identifier}] 🎮 Lobby rejoint`);
                // Initialiser le CosmeticManager maintenant que le bot est dans un lobby
                if (!this.cosmeticManagers.has(account.email)) {
                    const cosmeticManager = new CosmeticManager(bot);
                    this.cosmeticManagers.set(account.email, cosmeticManager);
                    console.log(`[${identifier}] 🎨 CosmeticManager initialisé`);
                }
            } else {
                console.log(`[${identifier}] ➕ ${member.displayName} a rejoint le lobby`);
            }
        });

        bot.on('party:member:left', (member) => {
            console.log(`[${identifier}] ➖ ${member.displayName} a quitté le lobby`);
        });

        bot.on('party:member:message', async (message) => {
            console.log(`[${identifier}] 🔔 EVENT party:member:message déclenché!`);
            console.log(`[${identifier}] 🔔 Author ID: ${message.author.id}, Self ID: ${bot.user.self?.id}`);

            // Ignorer nos propres messages dans le lobby
            if (message.author.id === bot.user.self?.id) {
                console.log(`[${identifier}] 🔇 Ignoré: notre propre message`);
                return;
            }

            // Décoder le message Base64 qui contient un JSON avec le vrai message
            let realMessage = message.content;
            try {
                // Les messages du lobby sont encodés en Base64
                const decoded = Buffer.from(message.content, 'base64').toString('utf-8');
                console.log(`[${identifier}] 🔍 Décodé:`, decoded.substring(0, 200));

                // Nettoyer les caractères null à la fin
                const cleaned = decoded.replace(/\0+$/, '');
                const parsed = JSON.parse(cleaned);
                realMessage = parsed.msg || message.content;
                console.log(`[${identifier}] 💬 [LOBBY] ${message.author.displayName}: ${realMessage}`);
            } catch (e: any) {
                // Si le décodage échoue, utiliser le message brut
                console.log(`[${identifier}] ❌ Erreur décodage:`, e.message);
                console.log(`[${identifier}] 💬 [LOBBY] ${message.author.displayName}: ${message.content}`);
            }

            const content = realMessage.toLowerCase().trim();
            const args = content.split(' ');
            const command = args[0];

            const cosmeticManager = this.cosmeticManagers.get(account.email);
            if (!cosmeticManager) {
                console.error(`[${identifier}] ❌ CosmeticManager pas initialisé`);
                return;
            }

            // Fonction helper pour envoyer dans le lobby
            const sendPartyMessage = async (text: string) => {
                try {
                    await message.reply(text);
                    console.log(`[${identifier}] 📤 Message lobby envoyé: ${text}`);
                } catch (error: any) {
                    console.error(`[${identifier}] ❌ Erreur envoi lobby:`, error.message);
                }
            };

            try {
                console.log(`[${identifier}] 🔧 Traitement commande lobby: ${command}`);

                if (command === 'ping') {
                    await sendPartyMessage('Pong!');
                }
                else if (['salut', 'hello', 'hi'].includes(command)) {
                    await sendPartyMessage('Salut!');
                }
                else if (['help', 'aide'].includes(command)) {
                    await sendPartyMessage('Commandes: skin, emote, ready, level, crown, copy, promote, hide, kick, set, sitout, leave, invite, whisper, rdm, new');
                }
                else if (command === 'skin' || command === 'outfit') {
                    if (args.length < 2) {
                        await sendPartyMessage('Usage: skin <nom>');
                        return;
                    }
                    const skinName = args.slice(1).join(' ');
                    await cosmeticManager.setOutfit(skinName);
                    await sendPartyMessage(`✅ Skin: ${skinName}`);
                }
                else if (command === 'pioche' || command === 'pick') {
                    if (args.length < 2) {
                        await sendPartyMessage('Usage: pioche <nom>');
                        return;
                    }
                    const pickaxeName = args.slice(1).join(' ');
                    await cosmeticManager.setPickaxe(pickaxeName);
                    await sendPartyMessage(`✅ Pioche: ${pickaxeName}`);
                }
                else if (command === 'emote' || command === 'dance') {
                    if (args.length < 2) {
                        await sendPartyMessage('Usage: emote <nom>');
                        return;
                    }
                    const emoteName = args.slice(1).join(' ');
                    await cosmeticManager.setEmote(emoteName);
                    await sendPartyMessage(`✅ Emote: ${emoteName}`);
                }
                else if (command === 'ready') {
                    await cosmeticManager.setReady(true);
                    await sendPartyMessage('✅ Prêt!');
                }
                else if (command === 'level') {
                    if (args.length < 2) {
                        await sendPartyMessage('Usage: level <nombre>');
                        return;
                    }
                    const level = parseInt(args[1]);
                    await cosmeticManager.setLevel(level);
                    await sendPartyMessage(`✅ Level: ${level}`);
                }
                // Nouvelles commandes avancées
                else if (command === 'crown' || command === 'crowns') {
                    if (args.length < 2 || isNaN(parseInt(args[1]))) {
                        await sendPartyMessage('Usage: crown <nombre>');
                        return;
                    }
                    const amount = parseInt(args[1]);
                    await cosmeticManager.setCrown(amount);
                    await sendPartyMessage(`✅ ${amount} couronnes`);
                    // Faire l'emote de couronne pour montrer
                    try {
                        await cosmeticManager.clearEmote();
                        await cosmeticManager.setEmote('EID_Coronet');
                    } catch (e) {
                        // Emote might not exist, ignore
                    }
                }
                else if (command === 'rdm' || command === 'random') {
                    const type = args[1] || 'skin';
                    if (!['skin', 'emote'].includes(type)) {
                        await sendPartyMessage('Usage: rdm [skin|emote]');
                        return;
                    }
                    const cosmeticName = await cosmeticManager.setRandomCosmetic(type as any);
                    await sendPartyMessage(`✅ Random ${type}: ${cosmeticName}`);
                }
                else if (command === 'copy' || command === 'clone') {
                    // Trouver le membre dans le party
                    const members = bot.party?.members;
                    if (!members) {
                        await sendPartyMessage('❌ Pas dans un party');
                        return;
                    }

                    let targetMember: any = null;

                    // Si aucun argument, copier l'auteur du message
                    if (args.length < 2) {
                        for (const [id, member] of members) {
                            if (member.id === message.author.id) {
                                targetMember = member;
                                break;
                            }
                        }
                    } else {
                        // Sinon, chercher le joueur spécifié
                        const playerName = args.slice(1).join(' ');
                        for (const [id, member] of members) {
                            if (member.displayName && member.displayName.toLowerCase().includes(playerName.toLowerCase())) {
                                targetMember = member;
                                break;
                            }
                        }
                    }

                    if (!targetMember) {
                        await sendPartyMessage(`❌ Joueur introuvable`);
                        return;
                    }

                    await cosmeticManager.copyPlayer(targetMember);
                    await sendPartyMessage(`✅ Copie de ${targetMember.displayName || 'vous'}`);
                }
                else if (command === 'stop') {
                    if (cosmeticManager.isCopying()) {
                        cosmeticManager.stopCopying();
                        await sendPartyMessage('✅ Arrêt de la copie');
                    } else {
                        await cosmeticManager.clearEmote();
                        await sendPartyMessage('✅ Emote arrêtée');
                    }
                }
                else if (command === 'new') {
                    const type = args[1] || 'skin';
                    if (!['skin', 'emote'].includes(type)) {
                        await sendPartyMessage('Usage: new [skin|emote]');
                        return;
                    }
                    await sendPartyMessage(`🔄 Showcase des nouveaux ${type}s...`);
                    await cosmeticManager.showcaseNewCosmetics(type as any);
                    await sendPartyMessage('✅ Showcase terminé');
                }
                else if (command === 'promote') {
                    // Trouver un membre à promouvoir
                    const members = bot.party?.members;
                    if (!members) {
                        await sendPartyMessage('❌ Pas dans un party');
                        return;
                    }

                    // Si un nom est spécifié
                    if (args.length >= 2) {
                        const playerName = args.slice(1).join(' ');
                        let targetMember: any = null;
                        for (const [id, member] of members) {
                            if (member.displayName && member.displayName.toLowerCase().includes(playerName.toLowerCase())) {
                                targetMember = member;
                                break;
                            }
                        }

                        if (targetMember) {
                            try {
                                await targetMember.promote();
                                await sendPartyMessage(`✅ ${targetMember.displayName} promu chef`);
                            } catch (error: any) {
                                await sendPartyMessage('❌ Erreur promotion');
                            }
                        } else {
                            await sendPartyMessage(`❌ Joueur "${playerName}" introuvable`);
                        }
                    } else {
                        // Promouvoir l'auteur du message
                        for (const [id, member] of members) {
                            if (member.id === message.author.id) {
                                try {
                                    await member.promote();
                                    await sendPartyMessage(`✅ Vous êtes chef!`);
                                } catch (error: any) {
                                    await sendPartyMessage('❌ Erreur promotion');
                                }
                                break;
                            }
                        }
                    }
                }
                else if (command === 'hide') {
                    const members = bot.party?.members;
                    if (!members || !bot.party?.me?.isLeader) {
                        await sendPartyMessage('❌ Je dois être chef');
                        return;
                    }

                    try {
                        // Hide all members
                        if (args[1] === 'all') {
                            (bot.party as any).patch({
                                'Default:RawSquadAssignments_j': {
                                    RawSquadAssignments: [{
                                        memberId: bot.user?.self?.id,
                                        absoluteMemberIdx: 1
                                    }]
                                }
                            });
                            await sendPartyMessage('✅ Tous cachés');
                        } else if (args.length >= 2) {
                            // Hide specific player
                            const playerName = args.slice(1).join(' ');
                            let targetMember: any = null;
                            for (const [id, member] of members) {
                                if (member.displayName && member.displayName.toLowerCase().includes(playerName.toLowerCase())) {
                                    targetMember = member;
                                    break;
                                }
                            }

                            if (targetMember) {
                                const rawSquadAssignments = (bot.party.meta as any).get('Default:RawSquadAssignments_j')?.RawSquadAssignments || [];
                                const filtered = rawSquadAssignments.filter((m: any) => m.memberId !== targetMember.id);
                                (bot.party as any).patch({
                                    'Default:RawSquadAssignments_j': {
                                        RawSquadAssignments: filtered
                                    }
                                });
                                await sendPartyMessage(`✅ ${targetMember.displayName} caché`);
                            } else {
                                await sendPartyMessage(`❌ Joueur "${playerName}" introuvable`);
                            }
                        } else {
                            await sendPartyMessage('Usage: hide <nom> ou hide all');
                        }
                    } catch (error: any) {
                        await sendPartyMessage('❌ Erreur');
                    }
                }
                else if (command === 'kick') {
                    const members = bot.party?.members;
                    if (!members || !bot.party?.me?.isLeader) {
                        await sendPartyMessage('❌ Je dois être chef');
                        return;
                    }

                    if (args.length < 2) {
                        await sendPartyMessage('Usage: kick <nom>');
                        return;
                    }

                    const playerName = args.slice(1).join(' ');
                    let targetMember: any = null;
                    for (const [id, member] of members) {
                        if (member.displayName && member.displayName.toLowerCase().includes(playerName.toLowerCase())) {
                            targetMember = member;
                            break;
                        }
                    }

                    if (targetMember) {
                        try {
                            await targetMember.kick();
                            await sendPartyMessage(`✅ ${targetMember.displayName} kické`);
                        } catch (error: any) {
                            await sendPartyMessage('❌ Erreur kick');
                        }
                    } else {
                        await sendPartyMessage(`❌ Joueur "${playerName}" introuvable`);
                    }
                }
                else if (command === 'set') {
                    if (!bot.party?.me?.isLeader) {
                        await sendPartyMessage('❌ Je dois être chef');
                        return;
                    }

                    if (args.length < 2 || isNaN(parseInt(args[1]))) {
                        await sendPartyMessage('Usage: set <nombre> (max 16)');
                        return;
                    }

                    const size = Math.min(16, Math.max(1, parseInt(args[1])));
                    try {
                        await (bot.party as any).setMaxSize(size);
                        await sendPartyMessage(`✅ Taille max: ${size}`);
                    } catch (error: any) {
                        await sendPartyMessage('❌ Erreur');
                    }
                }
                else if (command === 'sitout' || command === 'sit') {
                    try {
                        await (bot.party?.me as any).setSittingOut(true);
                        await sendPartyMessage('✅ Assis dehors');
                    } catch (error: any) {
                        await sendPartyMessage('❌ Erreur');
                    }
                }
                else if (command === 'unsit' || command === 'playing') {
                    try {
                        await (bot.party?.me as any).setSittingOut(false);
                        await sendPartyMessage('✅ En jeu');
                    } catch (error: any) {
                        await sendPartyMessage('❌ Erreur');
                    }
                }
                else if (command === 'leave') {
                    try {
                        await sendPartyMessage('👋 Au revoir!');
                        await bot.party?.leave();
                    } catch (error: any) {
                        await sendPartyMessage('❌ Erreur');
                    }
                }
                else if (command === 'invite') {
                    // Invite tous les amis en ligne
                    const friends = (bot as any).friends;
                    if (!friends) {
                        await sendPartyMessage('❌ Pas d\'amis');
                        return;
                    }

                    let inviteCount = 0;
                    for (const [id, friend] of friends) {
                        if ((friend as any).isOnline) {
                            try {
                                await (friend as any).invite();
                                inviteCount++;
                            } catch (e) {
                                // Ignore errors
                            }
                        }
                    }
                    await sendPartyMessage(`✅ ${inviteCount} invitations envoyées`);
                }
                else if (command === 'whisper' || command === 'w') {
                    if (args.length < 2) {
                        await sendPartyMessage('Usage: whisper <message>');
                        return;
                    }

                    const whisperMsg = args.slice(1).join(' ');
                    const friends = (bot as any).friends;
                    if (!friends) {
                        await sendPartyMessage('❌ Pas d\'amis');
                        return;
                    }

                    let sentCount = 0;
                    for (const [id, friend] of friends) {
                        if ((friend as any).isOnline) {
                            try {
                                await (friend as any).sendMessage(whisperMsg);
                                sentCount++;
                            } catch (e) {
                                // Ignore errors
                            }
                        }
                    }
                    await sendPartyMessage(`✅ Message envoyé à ${sentCount} amis`);
                }
            } catch (error: any) {
                console.error(`[${identifier}] ❌ Erreur commande lobby:`, error.message);
            }
        });

        // Messages
        bot.on('friend:message', async (message) => {
            console.log(`[${identifier}] 💬 ${message.author.displayName}: ${message.content}`);
            console.log(`[${identifier}] 📨 Type de message:`, message.constructor.name);
            console.log(`[${identifier}] 📨 Message ID:`, message.id);

            // Filtrer les échos de nos propres messages
            const sentIds = this.sentMessageIds.get(account.email);
            if (sentIds && sentIds.has(message.id)) {
                console.log(`[${identifier}] 🔇 Écho de notre propre message ignoré`);
                sentIds.delete(message.id);
                return;
            }

            // Vérifier si l'auteur est bien un ami
            const friend = bot.friend.list.get(message.author.id);
            console.log(`[${identifier}] 👤 Auteur dans la liste d'amis:`, !!friend);
            if (friend) {
                console.log(`[${identifier}] 👤 Ami: ${friend.displayName}, En ligne: ${friend.isOnline}`);
            }

            const content = message.content.toLowerCase().trim();
            const args = content.split(' ');
            const command = args[0];

            const cosmeticManager = this.cosmeticManagers.get(account.email);
            if (!cosmeticManager) {
                console.error(`[${identifier}] ❌ CosmeticManager pas initialisé`);
                return;
            }

            // Fonction helper pour envoyer un message et tracker son ID
            const sendMessage = async (text: string) => {
                try {
                    const sent = await message.reply(text);
                    console.log(`[${identifier}] 📤 Message envoyé - ID: ${sent.id}`);
                    if (!this.sentMessageIds.has(account.email)) {
                        this.sentMessageIds.set(account.email, new Set());
                    }
                    this.sentMessageIds.get(account.email)!.add(sent.id);
                    // Nettoyer après 5 secondes pour éviter la fuite mémoire
                    setTimeout(() => {
                        this.sentMessageIds.get(account.email)?.delete(sent.id);
                    }, 5000);
                    return sent;
                } catch (sendError: any) {
                    console.error(`[${identifier}] ❌ Erreur envoi message:`, sendError.message);
                    console.error(`[${identifier}] ❌ Code erreur:`, sendError.code);
                    throw sendError;
                }
            };

            try {
                console.log(`[${identifier}] 🔧 Traitement commande: ${command}`);
                // Commandes basiques
                if (command === 'ping') {
                    await sendMessage('Pong! 🏓');
                    console.log(`[${identifier}] 📤 Répondu: Pong!`);
                }
                else if (['salut', 'hello', 'hi'].includes(command)) {
                    await sendMessage('Salut! 👋 Comment ça va ?');
                    console.log(`[${identifier}] 📤 Répondu: Salut!`);
                }
                else if (['help', 'aide'].includes(command)) {
                    const helpText = `Commandes disponibles:
🎮 Basiques: ping, salut, help
👗 Cosmétiques: skin <nom>, backpack <nom>, pickaxe <nom>, dance <nom>
📋 Liste: skins, emotes
🔧 Autres: level <nombre>, ready, unready
🎲 Avancé: rdm [type], copy <joueur>, stop, crown <nb>, new [type]
👑 Admin: admin list/add/remove, ban/unban <joueur>`;
                    await sendMessage(helpText);
                    console.log(`[${identifier}] 📤 Aide envoyée`);
                }
                // Commandes cosmétiques
                else if (command === 'skin' || command === 'outfit') {
                    if (args.length < 2) {
                        await sendMessage('Usage: skin <nom>');
                        return;
                    }
                    const skinName = args.slice(1).join(' ');
                    console.log(`[${identifier}] 👗 Skin: ${skinName}`);
                    await cosmeticManager.setOutfit(skinName);
                    await sendMessage(`✅ Skin changé: ${skinName}`);
                    console.log(`[${identifier}] 👗 Skin changé: ${skinName}`);
                }
                else if (command === 'backpack' || command === 'back') {
                    if (args.length < 2) {
                        await sendMessage('Usage: backpack <nom>');
                        return;
                    }
                    const backpackName = args.slice(1).join(' ');
                    await cosmeticManager.setBackpack(backpackName);
                    await sendMessage(`✅ Sac à dos: ${backpackName}`);
                    console.log(`[${identifier}] 🎒 Backpack: ${backpackName}`);
                }
                else if (command === 'pickaxe' || command === 'pick') {
                    if (args.length < 2) {
                        await sendMessage('Usage: pickaxe <nom>');
                        return;
                    }
                    const pickaxeName = args.slice(1).join(' ');
                    await cosmeticManager.setPickaxe(pickaxeName);
                    await sendMessage(`✅ Pioche: ${pickaxeName}`);
                    console.log(`[${identifier}] ⛏️  Pickaxe: ${pickaxeName}`);
                }
                else if (command === 'dance' || command === 'emote') {
                    if (args.length < 2) {
                        await sendMessage('Usage: dance <nom>');
                        return;
                    }
                    const emoteName = args.slice(1).join(' ');
                    await cosmeticManager.setEmote(emoteName);
                    await sendMessage(`✅ Danse: ${emoteName}`);
                    console.log(`[${identifier}] 💃 Emote: ${emoteName}`);
                }
                else if (command === 'stop' || command === 'stopdance') {
                    await cosmeticManager.clearEmote();
                    await sendMessage('✅ Danse arrêtée');
                    console.log(`[${identifier}] 🛑 Emote arrêtée`);
                }
                // Listes
                else if (command === 'skins') {
                    const cosmetics = cosmeticManager.getAvailableCosmetics();
                    const list = cosmetics.outfits.slice(0, 15).join(', ');
                    await sendMessage(`Skins disponibles: ${list}...`);
                    console.log(`[${identifier}] 📋 Liste skins envoyée`);
                }
                else if (command === 'emotes' || command === 'dances') {
                    const cosmetics = cosmeticManager.getAvailableCosmetics();
                    const list = cosmetics.emotes.slice(0, 15).join(', ');
                    await sendMessage(`Emotes disponibles: ${list}...`);
                    console.log(`[${identifier}] 📋 Liste emotes envoyée`);
                }
                // Autres commandes
                else if (command === 'level') {
                    if (args.length < 2 || isNaN(parseInt(args[1]))) {
                        await sendMessage('Usage: level <nombre>');
                        return;
                    }
                    const level = parseInt(args[1]);
                    await cosmeticManager.setLevel(level);
                    await sendMessage(`✅ Level: ${level}`);
                    console.log(`[${identifier}] 📊 Level: ${level}`);
                }
                else if (command === 'ready') {
                    await cosmeticManager.setReady(true);
                    await sendMessage('✅ Prêt!');
                    console.log(`[${identifier}] ✔️  Ready`);
                }
                else if (command === 'unready') {
                    await cosmeticManager.setReady(false);
                    await sendMessage('✅ Pas prêt');
                    console.log(`[${identifier}] ❌ Unready`);
                }
                // Nouvelles commandes avancées
                else if (command === 'crown' || command === 'crowns') {
                    if (args.length < 2 || isNaN(parseInt(args[1]))) {
                        await sendMessage('Usage: crown <nombre>');
                        return;
                    }
                    const amount = parseInt(args[1]);
                    await cosmeticManager.setCrown(amount);
                    await sendMessage(`✅ ${amount} couronnes`);
                    // Faire l'emote de couronne pour montrer
                    try {
                        await cosmeticManager.clearEmote();
                        await cosmeticManager.setEmote('EID_Coronet');
                    } catch (e) {
                        // Emote might not exist, ignore
                    }
                    console.log(`[${identifier}] 👑 Crown: ${amount}`);
                }
                else if (command === 'rdm' || command === 'random') {
                    const type = args[1] || 'skin';
                    if (!['skin', 'emote', 'backpack', 'pickaxe'].includes(type)) {
                        await sendMessage('Usage: rdm [skin|emote|backpack|pickaxe]');
                        return;
                    }
                    const cosmeticName = await cosmeticManager.setRandomCosmetic(type as any);
                    await sendMessage(`✅ Random ${type}: ${cosmeticName}`);
                    console.log(`[${identifier}] 🎲 Random ${type}: ${cosmeticName}`);
                }
                else if (command === 'copy' || command === 'clone') {
                    // Trouver le membre dans le party
                    const members = bot.party?.members;
                    if (!members) {
                        await sendMessage('❌ Pas dans un party');
                        return;
                    }

                    let targetMember: any = null;

                    // Si aucun argument, copier l'auteur du message
                    if (args.length < 2) {
                        for (const [id, member] of members) {
                            if (member.id === message.author.id) {
                                targetMember = member;
                                break;
                            }
                        }
                    } else {
                        // Sinon, chercher le joueur spécifié
                        const playerName = args.slice(1).join(' ');
                        for (const [id, member] of members) {
                            if (member.displayName && member.displayName.toLowerCase().includes(playerName.toLowerCase())) {
                                targetMember = member;
                                break;
                            }
                        }
                    }

                    if (!targetMember) {
                        await sendMessage(`❌ Joueur introuvable`);
                        return;
                    }

                    await cosmeticManager.copyPlayer(targetMember);
                    await sendMessage(`✅ Copie de ${targetMember.displayName || 'vous'}`);
                    console.log(`[${identifier}] 🎭 Copy: ${targetMember.displayName}`);
                }
                else if (command === 'stop') {
                    if (cosmeticManager.isCopying()) {
                        cosmeticManager.stopCopying();
                        await sendMessage('✅ Arrêt de la copie');
                        console.log(`[${identifier}] 🛑 Stop copying`);
                    } else {
                        await cosmeticManager.clearEmote();
                        await sendMessage('✅ Danse arrêtée');
                    }
                }
                else if (command === 'new') {
                    const type = args[1] || 'skin';
                    if (!['skin', 'emote', 'backpack', 'pickaxe'].includes(type)) {
                        await sendMessage('Usage: new [skin|emote|backpack|pickaxe]');
                        return;
                    }
                    await sendMessage(`🔄 Showcase des nouveaux ${type}s...`);
                    await cosmeticManager.showcaseNewCosmetics(type as any);
                    await sendMessage('✅ Showcase terminé');
                    console.log(`[${identifier}] 🆕 New ${type}s showcased`);
                }
                // Commandes admin
                else if (command === 'admin') {
                    if (!this.adminManager.isAdmin(message.author.displayName || '')) {
                        await sendMessage('❌ Vous n\'avez pas les permissions admin');
                        return;
                    }

                    if (args[1] === 'list') {
                        const admins = this.adminManager.getAdmins();
                        await sendMessage(`👑 Admins: ${admins.join(', ')}`);
                    } else if (args[1] === 'add' && args[2]) {
                        this.adminManager.addAdmin(args[2]);
                        await sendMessage(`✅ ${args[2]} ajouté comme admin`);
                    } else if (args[1] === 'remove' && args[2]) {
                        this.adminManager.removeAdmin(args[2]);
                        await sendMessage(`✅ ${args[2]} retiré des admins`);
                    } else {
                        await sendMessage('Usage: admin [list|add <nom>|remove <nom>]');
                    }
                }
                else if (command === 'ban') {
                    if (!this.adminManager.isAdmin(message.author.displayName || '')) {
                        await sendMessage('❌ Vous n\'avez pas les permissions admin');
                        return;
                    }

                    if (args.length < 2) {
                        await sendMessage('Usage: ban <nom du joueur>');
                        return;
                    }

                    const playerName = args.slice(1).join(' ');
                    this.adminManager.addToBanList(playerName);
                    await sendMessage(`✅ ${playerName} banni`);
                    console.log(`[${identifier}] 🚫 Banned: ${playerName}`);
                }
                else if (command === 'unban') {
                    if (!this.adminManager.isAdmin(message.author.displayName || '')) {
                        await sendMessage('❌ Vous n\'avez pas les permissions admin');
                        return;
                    }

                    if (args.length < 2) {
                        await sendMessage('Usage: unban <nom du joueur>');
                        return;
                    }

                    const playerName = args.slice(1).join(' ');
                    this.adminManager.removeFromBanList(playerName);
                    await sendMessage(`✅ ${playerName} débanni`);
                    console.log(`[${identifier}] ✅ Unbanned: ${playerName}`);
                }
                // Commandes de party management
                else if (command === 'kick') {
                    const members = bot.party?.members;
                    if (!members || !bot.party?.me?.isLeader) {
                        await sendMessage('❌ Je dois être chef');
                        return;
                    }

                    if (args.length < 2) {
                        await sendMessage('Usage: kick <nom>');
                        return;
                    }

                    const playerName = args.slice(1).join(' ');
                    let targetMember: any = null;
                    for (const [id, member] of members) {
                        if (member.displayName && member.displayName.toLowerCase().includes(playerName.toLowerCase())) {
                            targetMember = member;
                            break;
                        }
                    }

                    if (targetMember) {
                        try {
                            await targetMember.kick();
                            await sendMessage(`✅ ${targetMember.displayName} kické`);
                        } catch (error: any) {
                            await sendMessage('❌ Erreur kick');
                        }
                    } else {
                        await sendMessage(`❌ Joueur "${playerName}" introuvable`);
                    }
                }
                else if (command === 'invite') {
                    const friends = (bot as any).friends;
                    if (!friends) {
                        await sendMessage('❌ Pas d\'amis');
                        return;
                    }

                    let inviteCount = 0;
                    for (const [id, friend] of friends) {
                        if ((friend as any).isOnline) {
                            try {
                                await (friend as any).invite();
                                inviteCount++;
                            } catch (e) {
                                // Ignore errors
                            }
                        }
                    }
                    await sendMessage(`✅ ${inviteCount} invitations envoyées`);
                    console.log(`[${identifier}] 📨 Invited ${inviteCount} friends`);
                }
                else if (command === 'whisper' || command === 'w') {
                    if (args.length < 2) {
                        await sendMessage('Usage: whisper <message>');
                        return;
                    }

                    const whisperMsg = args.slice(1).join(' ');
                    const friends = (bot as any).friends;
                    if (!friends) {
                        await sendMessage('❌ Pas d\'amis');
                        return;
                    }

                    let sentCount = 0;
                    for (const [id, friend] of friends) {
                        if ((friend as any).isOnline) {
                            try {
                                await (friend as any).sendMessage(whisperMsg);
                                sentCount++;
                            } catch (e) {
                                // Ignore errors
                            }
                        }
                    }
                    await sendMessage(`✅ Message envoyé à ${sentCount} amis`);
                    console.log(`[${identifier}] 📨 Whispered to ${sentCount} friends`);
                }
            } catch (error: any) {
                console.error(`[${identifier}] ❌ Erreur commande:`, error.message);
                try {
                    await sendMessage(`❌ Erreur: ${error.message}`);
                } catch (e) {
                    // Ignore si l'envoi du message d'erreur échoue
                }
            }
        });

        // Invitations de groupe - accepter automatiquement
        (bot as any).on('party:invitation', async (invitation: any) => {
            console.log(`[${identifier}] 📨 Invitation de ${invitation.sender.displayName}`);
            try {
                await invitation.accept();
                console.log(`[${identifier}] ✅ Invitation acceptée`);
            } catch (error: any) {
                console.error(`[${identifier}] ❌ Erreur invitation:`, error.message);
            }
        });

        // Events pour copy/clone - Changement d'outfit
        (bot as any).on('party:member:outfit_change', async (member: any, oldOutfit: any, newOutfit: any) => {
            const cosmeticManager = this.cosmeticManagers.get(account.email);
            if (!cosmeticManager) return;

            const copiedPlayer = cosmeticManager.getCopiedPlayer();
            if (copiedPlayer && member.id === copiedPlayer.id) {
                try {
                    await bot.party?.me?.setOutfit(newOutfit, member.outfit_variants || []);
                    console.log(`[${identifier}] 🎭 Copied outfit change from ${member.displayName || 'unknown'}`);
                } catch (error: any) {
                    console.error(`[${identifier}] ❌ Error copying outfit:`, error.message);
                }
            }
        });

        // Events pour copy/clone - Changement d'emote
        (bot as any).on('party:member:emote_change', async (member: any, oldEmote: any, newEmote: any) => {
            const cosmeticManager = this.cosmeticManagers.get(account.email);
            if (!cosmeticManager) return;

            const copiedPlayer = cosmeticManager.getCopiedPlayer();
            if (copiedPlayer && member.id === copiedPlayer.id) {
                try {
                    if (newEmote === null) {
                        await bot.party?.me?.clearEmote();
                    } else {
                        await bot.party?.me?.setEmote(newEmote);
                    }
                    console.log(`[${identifier}] 💃 Copied emote change from ${member.displayName || 'unknown'}`);
                } catch (error: any) {
                    console.error(`[${identifier}] ❌ Error copying emote:`, error.message);
                }
            }
        });

        // Vérification des bans dans les updates de membres
        (bot as any).on('party:member:update', async (member: any) => {
            // Ignorer le bot lui-même
            if (member.id === bot.user?.self?.id) return;

            const displayName = member.displayName || '';

            // Vérifier si le joueur est banni
            if (this.adminManager.isBanned(displayName)) {
                try {
                    console.log(`[${identifier}] 🚫 Kicking banned player: ${displayName}`);
                    await member.kick();
                } catch (error: any) {
                    console.error(`[${identifier}] ❌ Error kicking banned player:`, error.message);
                }
            }

            // Vérifier si le skin est banni
            if (member.outfit && this.adminManager.isSkinBanned(member.outfit)) {
                // Ne pas kicker les admins
                if (!this.adminManager.isAdmin(displayName)) {
                    try {
                        console.log(`[${identifier}] 🚫 Kicking player with banned skin: ${displayName}`);
                        await member.kick();
                    } catch (error: any) {
                        console.error(`[${identifier}] ❌ Error kicking player:`, error.message);
                    }
                }
            }
        });

        // Gestion des erreurs
        (bot as any).on('error', (error: any) => {
            console.error(`[${identifier}] ❌ Erreur:`, error.message || error);
        });
    }

    /**
     * Lance un bot
     */
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
                connectToSTOMP: true,  // Garder STOMP pour la réception
                connectToXMPP: true,   // Et XMPP aussi
                debug: (msg) => {
                    if (msg.includes('STOMP') || msg.includes('chat') || msg.includes('XMPP')) {
                        console.log(`[${identifier}] 🔍`, msg);
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

    /**
     * Arrête un bot
     */
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

    /**
     * Lance tous les bots depuis le CSV
     */
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

    /**
     * Obtient tous les bots actifs
     */
    getActiveBots(): any[] {
        return Array.from(this.bots.values());
    }

    /**
     * Obtient un bot par email
     */
    getBot(email: string): any {
        return this.bots.get(email);
    }

    /**
     * Arrête tous les bots
     */
    async stopAllBots(): Promise<void> {
        console.log('🛑 Arrêt de tous les bots...');

        for (const [email] of this.bots) {
            await this.stopBot(email);
        }

        console.log('✅ Tous les bots ont été arrêtés');
    }
}

    /**
     * Tries to add a friend on the first available connected bot.
     * @param targetUsername The Epic username to add
     * @returns true if successful, false otherwise
     */
    async addFriendOnAvailableBot(targetUsername: string): Promise<boolean> {
        console.log(`[BotManager] Trying to add friend: ${targetUsername}`);
        
        // Find a connected bot
        const connectedBots = this.getActiveBots().filter(b => b.isConnected && b.client && b.client.party);
        
        if (connectedBots.length === 0) {
            console.error('[BotManager] No connected bots available to add friend');
            return false;
        }

        // Pick the first one (or implement load balancing)
        const botInstance = connectedBots[0];
        const identifier = botInstance.account.pseudo;

        try {
            console.log(`[${identifier}] Sending friend request to ${targetUsername}...`);
            await botInstance.client.friend.add(targetUsername);
            console.log(`[${identifier}] ✅ Friend request sent!`);
            return true;
        } catch (error: any) {
            console.error(`[${identifier}] ❌ Failed to add friend:`, error.message);
            return false;
        }

    /**
     * Tries to add a friend on the first available connected bot.
     * @param targetUsername The Epic username to add
     * @returns true if successful, false otherwise
     */
    async addFriendOnAvailableBot(targetUsername: string): Promise<boolean> {
        console.log(`[BotManager] Trying to add friend: ${targetUsername}`);
        
        // Find a connected bot
        const connectedBots = this.getActiveBots().filter(b => b.isConnected && b.client && b.client.party);
        
        if (connectedBots.length === 0) {
            console.error('[BotManager] No connected bots available to add friend');
            return false;
        }

        // Pick the first one (or implement load balancing)
        const botInstance = connectedBots[0];
        const identifier = botInstance.account.pseudo;

        try {
            console.log(`[${identifier}] Sending friend request to ${targetUsername}...`);
            await botInstance.client.friend.add(targetUsername);
            console.log(`[${identifier}] ✅ Friend request sent!`);
            return true;
        } catch (error: any) {
            console.error(`[${identifier}] ❌ Failed to add friend:`, error.message);
            return false;
        }
    }
}
