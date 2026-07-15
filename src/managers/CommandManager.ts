import { Client } from 'fnbr';
import * as ModernParty from '../utils/ModernParty';
import { CosmeticsActions } from '../actions/CosmeticsActions';
import { PartyActions } from '../actions/PartyActions';
import { SocialActions } from '../actions/SocialActions';
import { cosmeticSearch, CosmeticType } from '../services/CosmeticSearchService';

export class CommandManager {
    private cosmetics: CosmeticsActions;
    private party: PartyActions;
    private social: SocialActions;
    private admins: string[] = (process.env.LOBBY_ADMIN_PSEUDOS || 'AerozOff')
        .split(',')
        .map(p => p.trim().toLowerCase())
        .filter(Boolean);

    // Sessions de showcase !new en cours (une par bot) — WeakMap pour suivre le client
    private showcases = new WeakMap<object, { cancelled: boolean }>();

    constructor() {
        this.cosmetics = new CosmeticsActions();
        this.party = new PartyActions();
        this.social = new SocialActions();
    }

    public async handleMessage(client: Client, message: any): Promise<void> {
        if (!message.content.startsWith('!')) return;

        const args = message.content.slice(1).split(' ');
        const command = args.shift()?.toLowerCase();
        const query = args.join(' ');
        const author = message.author.displayName;

        console.log(`[${client.user?.self?.displayName}] 📩 Command: ${command} "${query}" from ${author}`);

        let response = '';

        try {
            switch (command) {
                // ═══════════ COSMÉTIQUES ═══════════
                case 'skin':
                case 'outfit':
                    if (!query) { response = 'Usage: !skin <nom> — ex: !skin ghoul rose, !skin drift 4'; break; }
                    response = await this.cosmetics.setSkin(client, query);
                    break;
                case 'pinkghoul':
                    response = await this.cosmetics.setSkin(client, 'pink ghoul');
                    break;
                case 'purpleskull':
                    response = await this.cosmetics.setSkin(client, 'purple skull');
                    break;
                case 'style':
                case 'variant':
                case 'variants':
                    if (!query) { response = 'Usage: !style <nom du style> — ex: !style rose, !style stage 4, !style gold'; break; }
                    response = await this.cosmetics.setStyle(client, query);
                    break;
                case 'bag':
                case 'backpack':
                case 'sac':
                    if (!query) { response = 'Usage: !backpack <nom> (ou "none" pour retirer)'; break; }
                    response = await this.cosmetics.setBackpack(client, query);
                    break;
                case 'pickaxe':
                case 'pioche':
                    if (!query) { response = 'Usage: !pickaxe <nom>'; break; }
                    response = await this.cosmetics.setPickaxe(client, query);
                    break;
                case 'glider':
                case 'planeur':
                    if (!query) { response = 'Usage: !glider <nom>'; break; }
                    response = await this.cosmetics.setGlider(client, query);
                    break;
                case 'shoes':
                case 'kicks':
                case 'chaussures':
                    if (!query) { response = 'Usage: !shoes <nom> (ou "none" pour retirer)'; break; }
                    response = await this.cosmetics.setShoes(client, query);
                    break;
                case 'emote':
                case 'dance':
                case 'danse':
                    if (!query) { response = 'Usage: !emote <nom>'; break; }
                    response = await this.cosmetics.setEmote(client, query);
                    break;
                case 'stopdanse':
                case 'stopdance':
                case 'stopmote':
                case 'clearemote':
                    response = await this.cosmetics.clearEmote(client);
                    break;
                case 'random':
                case 'rdm':
                    response = await this.cosmetics.setRandom(client, query || 'skin');
                    break;
                case 'new':
                case 'news':
                case 'nouveautes': {
                    response = await this.startShowcase(client, message, query);
                    break;
                }
                case 'level':
                case 'niveau':
                    const lvl = parseInt(query);
                    if (isNaN(lvl) || lvl < 1) { response = 'Usage: !level <nombre>'; break; }
                    response = await this.cosmetics.setLevel(client, lvl);
                    break;

                case 'copy':
                case 'copie': {
                    if (!client.party) { response = '❌ Pas dans un groupe'; break; }
                    if (query.toLowerCase() === 'stop') {
                        response = this.stopMimic(client);
                        break;
                    }
                    // Sans argument : copier le loadout de l'auteur de la commande
                    const targetName = query || author;
                    const member = client.party.members.find((m: any) => m.displayName?.toLowerCase().includes(targetName.toLowerCase()));
                    if (!member) { response = `❌ Joueur "${targetName}" introuvable dans le lobby.`; break; }
                    if (member.id === client.user?.self?.id) { response = '❌ Je ne peux pas me copier moi-même.'; break; }
                    try {
                        await ModernParty.copyLoadoutFrom(client, member);
                        // Mode mimic : suivre aussi les changements de skin ET les danses
                        ModernParty.setMimicTarget(client, member.id);
                        try { await ModernParty.copyEmoteFrom(client, member); } catch (e) {}
                        response = `🎭 Je copie **${member.displayName}** ! Skin, styles et danses suivis en direct. !stopcopy pour arrêter.`;
                    } catch (e: any) {
                        response = `❌ ${e.message}`;
                    }
                    break;
                }
                case 'stopcopy':
                case 'uncopy':
                    response = this.stopMimic(client);
                    break;

                case 'stop': {
                    // Stoppe les opérations en cours (showcase !new + mode copie)
                    const stopped: string[] = [];
                    const sc = this.showcases.get(client as any);
                    if (sc && !sc.cancelled) { sc.cancelled = true; stopped.push('défilé'); }
                    if (ModernParty.clearMimic(client)) stopped.push('copie');
                    response = stopped.length ? `⏹️ Stoppé : ${stopped.join(' + ')}.` : 'ℹ️ Rien à stopper. (!stopdanse pour arrêter la danse)';
                    break;
                }

                case 'hide': {
                    // Par défaut : cacher TOUT le monde sauf le bot (screens skins rares 😏)
                    // "!hide me" garde aussi l'auteur visible
                    const keepAuthor = query.toLowerCase() === 'me';
                    try {
                        await ModernParty.setHidden(client, true, keepAuthor ? [message.author.id] : []);
                        response = keepAuthor
                            ? '🙈 Tout le monde est caché sauf le bot et toi. !show pour rétablir.'
                            : '🙈 Tout le monde est caché, il ne reste que le bot ! !show pour rétablir.';
                    } catch (e: any) {
                        response = `❌ ${e.message}`;
                    }
                    break;
                }
                case 'show':
                case 'unhide':
                    try {
                        await ModernParty.setHidden(client, false);
                        response = '👀 Tous les membres sont de nouveau visibles.';
                    } catch (e: any) {
                        response = `❌ ${e.message}`;
                    }
                    break;

                // ═══════════ LOBBY ═══════════
                case 'ready':
                case 'pret':
                    response = await this.party.setReady(client, true);
                    break;
                case 'unready':
                case 'paspret':
                    response = await this.party.setReady(client, false);
                    break;
                case 'sitout':
                    try {
                        await ModernParty.setSittingOut(client, true);
                        response = '🪑 Le bot ne participe plus (sit out).';
                    } catch (e: any) { response = `❌ ${e.message}`; }
                    break;
                case 'sitin':
                    try {
                        await ModernParty.setSittingOut(client, false);
                        response = '🎮 Le bot participe de nouveau.';
                    } catch (e: any) { response = `❌ ${e.message}`; }
                    break;
                case 'invite': {
                    if (!client.party) { response = '❌ Pas dans un groupe'; break; }
                    try {
                        // Sans argument : inviter l'auteur ; sinon un ami par pseudo
                        let targetId = message.author.id;
                        let targetName = author;
                        if (query) {
                            const friend = (client as any).friend?.list?.find((f: any) =>
                                f.displayName?.toLowerCase().includes(query.toLowerCase()));
                            if (!friend) { response = `❌ Ami "${query}" introuvable.`; break; }
                            targetId = friend.id;
                            targetName = friend.displayName;
                        }
                        await (client.party as any).invite(targetId);
                        response = `📨 Invitation envoyée à **${targetName}** !`;
                    } catch (e: any) {
                        response = `❌ Invitation impossible : ${e.message}`;
                    }
                    break;
                }
                case 'partyinfo':
                case 'party': {
                    const p: any = client.party;
                    if (!p) { response = '❌ Pas dans un groupe'; break; }
                    const members: any[] = Array.from(p.members?.values?.() ?? []);
                    const names = members.map(m => `${m.isLeader ? '👑 ' : ''}${m.displayName || m.id}`).join(', ');
                    response = `👥 **${members.length}/16** — ${names}`;
                    break;
                }
                case 'fc':
                case 'friendcount':
                case 'friends': {
                    const count = (client as any).friend?.list?.size ?? 0;
                    response = `🤝 J'ai **${count}** amis (max 1000).`;
                    break;
                }
                case 'leave':
                case 'quit':
                    if (this.isAdmin(author)) response = await this.party.leaveParty(client);
                    break;
                case 'kick':
                    if (this.isAdmin(author)) response = await this.party.kickMember(client, query);
                    break;
                case 'promote':
                    // Sans argument : promouvoir l'auteur de la commande
                    if (this.isAdmin(author)) response = await this.party.promoteMember(client, query || author);
                    break;
                case 'privacy':
                    if (this.isAdmin(author)) response = await this.party.setPrivacy(client, query);
                    break;

                // ═══════════ SOCIAL ═══════════
                case 'add':
                    if (this.isAdmin(author)) response = await this.social.addFriend(client, query);
                    break;

                // ═══════════ UTILITAIRES ═══════════
                case 'ping':
                    response = '🏓 Pong!';
                    break;
                case 'help':
                case 'aide':
                case 'commands':
                    response = `━━━━━━━━━━━━━━━━━━━━━━━━
🤖 LobbyBot — Commandes
━━━━━━━━━━━━━━━━━━━━━━━━
👗 Cosmétiques:
  !skin <nom> — fautes OK, styles inclus (!skin ghoul rose, !skin drift 4)
  !style <style> — style du skin actuel (rose, gold, stage 3…)
  !backpack <nom/none> · !pickaxe <nom>
  !glider <nom> · !shoes <nom/none>
  !emote <nom> - !stopdanse pour arrêter
  !copy [pseudo] — copie skin + styles + DANSES en direct (!stopcopy)
  !random [skin/emote/pioche] — cosmétique aléatoire
  !new [skins/emotes] — défilé des nouveautés (!stop)
  !level <n> — niveau affiché
🎮 Lobby:
  !ready / !unready · !sitout / !sitin
  !hide [me] / !show — cacher le lobby (screens 😏)
  !invite [pseudo] · !partyinfo · !fc
  Admin: !kick !promote !privacy !leave !add
📌 Code créateur : aeroz
━━━━━━━━━━━━━━━━━━━━━━━━`;
                    break;
            }
        } catch (e: any) {
            response = `❌ Erreur interne: ${e.message}`;
        }

        if (response) {
            try {
                 await message.reply(response);
            } catch (e) {
                // Cannot reply?
            }
        }
    }

    /**
     * Défilé des nouveautés de la MAJ (!new) : équipe chaque nouveau cosmétique
     * quelques secondes. Les items de la dernière mise à jour incluent souvent
     * des skins pas encore sortis en boutique.
     */
    private async startShowcase(client: Client, message: any, typeQuery: string): Promise<string> {
        if (!client.party) return '❌ Pas dans un groupe';

        const existing = this.showcases.get(client as any);
        if (existing && !existing.cancelled) return '⏳ Un défilé est déjà en cours — !stop pour l\'arrêter.';

        const typeMap: Record<string, CosmeticType> = {
            '': 'outfit', 'skins': 'outfit', 'skin': 'outfit',
            'emotes': 'emote', 'emote': 'emote', 'danses': 'emote',
            'sacs': 'backpack', 'sac': 'backpack', 'backpacks': 'backpack',
            'pioches': 'pickaxe', 'pioche': 'pickaxe', 'pickaxes': 'pickaxe',
        };
        const type = typeMap[typeQuery.toLowerCase().trim()];
        if (!type) return 'Usage: !new [skins|emotes|sacs|pioches]';

        const items = await cosmeticSearch.getNewCosmetics(type);
        if (!items.length) return '❌ Aucune nouveauté trouvée pour le moment.';

        const session = { cancelled: false };
        this.showcases.set(client as any, session);

        const list = items.slice(0, 30);
        // Boucle en tâche de fond : on répond tout de suite, le défilé continue
        (async () => {
            for (const item of list) {
                if (session.cancelled || !client.party) break;
                try {
                    if (type === 'emote') await ModernParty.setEmote(client, item.id);
                    else await ModernParty.setLoadout(client, { [type === 'outfit' ? 'outfit' : type]: item.id } as any);
                    await message.reply(`🆕 **${item.name}** ${item.rarity ? `(${item.rarity})` : ''}`);
                } catch (e) { /* item suivant */ }
                await new Promise(r => setTimeout(r, 6000));
            }
            session.cancelled = true;
        })();

        return `🆕 **${list.length}** nouveauté(s) de la MAJ — défilé lancé (6s par item, !stop pour arrêter) !`;
    }

    private stopMimic(client: Client): string {
        return ModernParty.clearMimic(client)
            ? '⏹️ Je ne copie plus personne.'
            : 'ℹ️ Je ne copiais personne.';
    }

    private isAdmin(username: string): boolean {
        return this.admins.includes(username.toLowerCase());
    }
}
