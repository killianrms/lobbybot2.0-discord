import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { Command, CommandContext } from './Command';

/**
 * /commands — aide paginée. Anglais par défaut, descriptions traduites
 * FR/ES/DE selon la préférence /setlangage de l'utilisateur (le nom des
 * commandes slash reste toujours en anglais, seule la description change).
 */

type Lang = 'en' | 'fr' | 'es' | 'de';
const LANGS: Lang[] = ['en', 'fr', 'es', 'de'];

interface CmdEntry {
    usage: string;                 // ex: '!skin <name>'
    emoji: string;
    aliases?: string;              // ex: '!outfit'
    desc: Record<Lang, string>;
}

// ── Commandes in-game : cosmétiques ─────────────────────────────────────────
const IG_COSMETICS: CmdEntry[] = [
    {
        usage: '!skin <name>', emoji: '🧥', aliases: '!outfit',
        desc: {
            en: 'Changes the bot\'s skin. Typos are OK and styles work inline:\n> `!skin ghoul rose`, `!skin purple skull`, `!skin drift 4`',
            fr: 'Change le skin du bot. Les fautes de frappe passent et les styles marchent direct :\n> `!skin ghoul rose`, `!skin skull violet`, `!skin drift 4`',
            es: 'Cambia el skin del bot. Los errores de tipeo funcionan y los estilos también:\n> `!skin ghoul rosa`, `!skin skull morado`, `!skin drift 4`',
            de: 'Ändert den Skin des Bots. Tippfehler sind OK, Stile funktionieren direkt:\n> `!skin ghoul rosa`, `!skin skull lila`, `!skin drift 4`',
        },
    },
    {
        usage: '!style <style>', emoji: '🎨', aliases: '!variant',
        desc: {
            en: 'Applies a style to the current skin: `!style pink`, `!style gold`, `!style stage 3`',
            fr: 'Applique un style au skin actuel : `!style rose`, `!style gold`, `!style stage 3`',
            es: 'Aplica un estilo al skin actual: `!style rosa`, `!style gold`, `!style stage 3`',
            de: 'Wendet einen Stil auf den aktuellen Skin an: `!style rosa`, `!style gold`, `!style stage 3`',
        },
    },
    {
        usage: '!backpack <name|none>', emoji: '🎒', aliases: '!bag, !sac',
        desc: {
            en: 'Sets the back bling — `none` removes it.',
            fr: 'Change le sac à dos — `none` pour le retirer.',
            es: 'Cambia la mochila — `none` para quitarla.',
            de: 'Ändert den Rucksack — `none` zum Entfernen.',
        },
    },
    {
        usage: '!pickaxe <name>', emoji: '⛏️', aliases: '!pioche',
        desc: {
            en: 'Sets the pickaxe.',
            fr: 'Change la pioche.',
            es: 'Cambia el pico.',
            de: 'Ändert die Spitzhacke.',
        },
    },
    {
        usage: '!glider <name>', emoji: '🪂', aliases: '!planeur',
        desc: {
            en: 'Sets the glider.',
            fr: 'Change le planeur.',
            es: 'Cambia el ala delta.',
            de: 'Ändert den Gleiter.',
        },
    },
    {
        usage: '!shoes <name|none>', emoji: '👟', aliases: '!kicks',
        desc: {
            en: 'Sets the shoes (kicks).',
            fr: 'Change les chaussures.',
            es: 'Cambia los zapatos.',
            de: 'Ändert die Schuhe.',
        },
    },
    {
        usage: '!emote <name>', emoji: '💃', aliases: '!dance, !danse',
        desc: {
            en: 'Makes the bot dance. `!stopdanse` stops it.',
            fr: 'Fait danser le bot. `!stopdanse` pour arrêter.',
            es: 'Hace bailar al bot. `!stopdanse` para parar.',
            de: 'Lässt den Bot tanzen. `!stopdanse` zum Stoppen.',
        },
    },
    {
        usage: '!copy [player]', emoji: '🎭', aliases: '!stopcopy',
        desc: {
            en: 'The bot copies a player\'s FULL loadout — skin, styles **and dances, live**. Without argument it copies you. `!stopcopy` to stop.',
            fr: 'Le bot copie TOUT le loadout d\'un joueur — skin, styles **et danses, en direct**. Sans argument il te copie toi. `!stopcopy` pour arrêter.',
            es: 'El bot copia TODO el loadout de un jugador — skin, estilos **y bailes, en directo**. Sin argumento te copia a ti. `!stopcopy` para parar.',
            de: 'Der Bot kopiert das GANZE Loadout eines Spielers — Skin, Stile **und Tänze, live**. Ohne Argument kopiert er dich. `!stopcopy` zum Stoppen.',
        },
    },
    {
        usage: '!new [skins|emotes]', emoji: '🆕', aliases: '!stop',
        desc: {
            en: 'Showcases the newest items added in the latest update (often not released yet!), one every 6s. `!stop` to end.',
            fr: 'Défilé des derniers cosmétiques ajoutés par la MAJ (souvent pas encore sortis !), un toutes les 6s. `!stop` pour arrêter.',
            es: 'Desfile de los últimos cosméticos añadidos en la actualización (¡a menudo sin salir aún!), uno cada 6s. `!stop` para terminar.',
            de: 'Zeigt die neuesten Items des letzten Updates (oft noch unveröffentlicht!), eins alle 6s. `!stop` zum Beenden.',
        },
    },
    {
        usage: '!random [skin|emote]', emoji: '🎲', aliases: '!rdm',
        desc: {
            en: 'Random cosmetic.',
            fr: 'Cosmétique aléatoire.',
            es: 'Cosmético aleatorio.',
            de: 'Zufälliges Cosmetic.',
        },
    },
    {
        usage: '!level <n>', emoji: '⭐', aliases: '!niveau',
        desc: {
            en: 'Sets the bot\'s displayed level.',
            fr: 'Change le niveau affiché du bot.',
            es: 'Cambia el nivel mostrado del bot.',
            de: 'Ändert das angezeigte Level des Bots.',
        },
    },
    {
        usage: '!pinkghoul / !purpleskull', emoji: '💀',
        desc: {
            en: 'Instant shortcuts for the two most requested OG skins.',
            fr: 'Raccourcis instantanés pour les deux skins OG les plus demandés.',
            es: 'Atajos instantáneos para los dos skins OG más pedidos.',
            de: 'Sofort-Shortcuts für die zwei meistgefragten OG-Skins.',
        },
    },
];

// ── Commandes in-game : lobby ───────────────────────────────────────────────
const IG_LOBBY: CmdEntry[] = [
    {
        usage: '!hide [me] / !show', emoji: '🙈', aliases: '!unhide',
        desc: {
            en: 'Hides everyone except the bot (perfect for screenshots 😏). `!hide me` keeps you visible. Bot must be party leader.',
            fr: 'Cache tout le monde sauf le bot (parfait pour les screens 😏). `!hide me` te garde visible. Le bot doit être chef du groupe.',
            es: 'Oculta a todos excepto el bot (perfecto para capturas 😏). `!hide me` te mantiene visible. El bot debe ser líder.',
            de: 'Versteckt alle außer dem Bot (perfekt für Screenshots 😏). `!hide me` hält dich sichtbar. Bot muss Party-Leader sein.',
        },
    },
    {
        usage: '!ready / !unready', emoji: '✅', aliases: '!pret, !paspret',
        desc: {
            en: 'Sets the bot Ready / Not ready.',
            fr: 'Met le bot Prêt / Pas prêt.',
            es: 'Pone el bot Listo / No listo.',
            de: 'Setzt den Bot auf Bereit / Nicht bereit.',
        },
    },
    {
        usage: '!sitout / !sitin', emoji: '🪑',
        desc: {
            en: 'The bot sits out (not counted in the match) / participates again.',
            fr: 'Le bot ne participe plus (pas compté dans la partie) / participe de nouveau.',
            es: 'El bot deja de participar / participa de nuevo.',
            de: 'Der Bot setzt aus / nimmt wieder teil.',
        },
    },
    {
        usage: '!invite [player]', emoji: '📨',
        desc: {
            en: 'The bot invites you (or a friend) to its party.',
            fr: 'Le bot t\'invite (ou un ami) dans son groupe.',
            es: 'El bot te invita (o a un amigo) a su grupo.',
            de: 'Der Bot lädt dich (oder einen Freund) in seine Party ein.',
        },
    },
    {
        usage: '!partyinfo / !fc', emoji: '👥', aliases: '!party, !friendcount',
        desc: {
            en: 'Party members / bot\'s friend count.',
            fr: 'Membres du groupe / nombre d\'amis du bot.',
            es: 'Miembros del grupo / número de amigos del bot.',
            de: 'Party-Mitglieder / Freundesanzahl des Bots.',
        },
    },
    {
        usage: '!kick !promote !privacy !leave !add', emoji: '👑',
        desc: {
            en: '*(admin)* Kick / promote / party privacy / leave / send friend request.',
            fr: '*(admin)* Exclure / promouvoir / confidentialité / quitter / demande d\'ami.',
            es: '*(admin)* Expulsar / promover / privacidad / salir / solicitud de amistad.',
            de: '*(admin)* Kicken / befördern / Privatsphäre / verlassen / Freundschaftsanfrage.',
        },
    },
    {
        usage: '!help / !ping', emoji: '❓', aliases: '!aide',
        desc: {
            en: 'Command list in Fortnite chat / response test.',
            fr: 'Liste des commandes dans le chat Fortnite / test de réponse.',
            es: 'Lista de comandos en el chat de Fortnite / prueba de respuesta.',
            de: 'Befehlsliste im Fortnite-Chat / Antworttest.',
        },
    },
];

// ── Commandes Discord : compte & bots ───────────────────────────────────────
const DISCORD_ACCOUNT: CmdEntry[] = [
    {
        usage: '/login', emoji: '🔗',
        desc: {
            en: 'Links your Epic Games account (1-click device flow).',
            fr: 'Connecte ton compte Epic Games (activation en 1 clic).',
            es: 'Vincula tu cuenta de Epic Games (activación en 1 clic).',
            de: 'Verknüpft dein Epic Games Konto (1-Klick-Aktivierung).',
        },
    },
    {
        usage: '/logout', emoji: '🚪',
        desc: {
            en: 'Unlinks your Epic Games account.',
            fr: 'Déconnecte ton compte Epic Games.',
            es: 'Desvincula tu cuenta de Epic Games.',
            de: 'Trennt dein Epic Games Konto.',
        },
    },
    {
        usage: '/add [pseudo]', emoji: '➕',
        desc: {
            en: 'A bot sends you a friend request (auto if logged in).',
            fr: 'Un bot t\'envoie une demande d\'ami (auto si connecté).',
            es: 'Un bot te envía una solicitud de amistad (auto si conectado).',
            de: 'Ein Bot sendet dir eine Freundschaftsanfrage (auto wenn eingeloggt).',
        },
    },
    {
        usage: '/skin <bot> <name>', emoji: '🧥',
        desc: {
            en: 'Makes one of your friended bots wear a skin (dropdown list).',
            fr: 'Fait porter un skin à un de tes bots amis (liste déroulante).',
            es: 'Hace que uno de tus bots amigos use un skin (lista desplegable).',
            de: 'Lässt einen deiner Bot-Freunde einen Skin tragen (Dropdown).',
        },
    },
    {
        usage: '/invite [bot]', emoji: '🎉',
        desc: {
            en: 'A bot invites you to its Fortnite party.',
            fr: 'Un bot t\'invite dans son groupe Fortnite.',
            es: 'Un bot te invita a su grupo de Fortnite.',
            de: 'Ein Bot lädt dich in seine Fortnite-Party ein.',
        },
    },
    {
        usage: '/remove', emoji: '➖',
        desc: {
            en: 'Removes the bot from your Epic friends list.',
            fr: 'Supprime le bot de ta liste d\'amis Epic.',
            es: 'Elimina el bot de tu lista de amigos de Epic.',
            de: 'Entfernt den Bot aus deiner Epic-Freundesliste.',
        },
    },
    {
        usage: '/listbots · /info · /status', emoji: '🤖',
        desc: {
            en: 'Available bots + status / global stats / Fortnite services status.',
            fr: 'Bots disponibles + statut / stats globales / état des services Fortnite.',
            es: 'Bots disponibles + estado / estadísticas globales / estado de los servicios.',
            de: 'Verfügbare Bots + Status / globale Statistiken / Fortnite-Dienststatus.',
        },
    },
];

// ── Commandes Discord : Fortnite & infos ────────────────────────────────────
const DISCORD_MISC: CmdEntry[] = [
    {
        usage: '/shop · /map · /news', emoji: '🛒',
        desc: {
            en: 'Today\'s item shop / current map / Fortnite news.',
            fr: 'Boutique du jour / carte actuelle / actus Fortnite.',
            es: 'Tienda del día / mapa actual / noticias de Fortnite.',
            de: 'Heutiger Shop / aktuelle Karte / Fortnite-News.',
        },
    },
    {
        usage: '/locker · /list', emoji: '🎒',
        desc: {
            en: 'Your Fortnite locker summary / your Epic friends list. Requires `/login`.',
            fr: 'Résumé de ton casier Fortnite / ta liste d\'amis Epic. Nécessite `/login`.',
            es: 'Resumen de tu taquilla / tu lista de amigos de Epic. Requiere `/login`.',
            de: 'Deine Locker-Übersicht / deine Epic-Freundesliste. Benötigt `/login`.',
        },
    },
    {
        usage: '/sac [code]', emoji: '👑',
        desc: {
            en: 'Sets your Support-A-Creator code (default: **aeroz** 💙).',
            fr: 'Définit ton code créateur (défaut : **aeroz** 💙).',
            es: 'Define tu código de creador (por defecto: **aeroz** 💙).',
            de: 'Setzt deinen Creator-Code (Standard: **aeroz** 💙).',
        },
    },
    {
        usage: '/setlangage <lang>', emoji: '🌍',
        desc: {
            en: 'Changes the bot\'s reply language (EN default, FR, ES, DE).',
            fr: 'Change la langue des réponses du bot (EN par défaut, FR, ES, DE).',
            es: 'Cambia el idioma de las respuestas del bot (EN por defecto, FR, ES, DE).',
            de: 'Ändert die Antwortsprache des Bots (EN Standard, FR, ES, DE).',
        },
    },
];

// ── Premium ─────────────────────────────────────────────────────────────────
const DISCORD_PREMIUM: CmdEntry[] = [
    {
        usage: '/premium', emoji: '💎',
        desc: {
            en: 'Discover LobbyBot Premium or check your subscription.',
            fr: 'Découvre LobbyBot Premium ou consulte ton abonnement.',
            es: 'Descubre LobbyBot Premium o consulta tu suscripción.',
            de: 'Entdecke LobbyBot Premium oder prüfe dein Abo.',
        },
    },
    {
        usage: '/squad', emoji: '🤝',
        desc: {
            en: '**[Premium]** Your own personal bots join your Fortnite party — a full squad just for you.',
            fr: '**[Premium]** Tes bots perso rejoignent ton groupe Fortnite — une squad entière rien que pour toi.',
            es: '**[Premium]** Tus bots personales se unen a tu grupo — un squad entero solo para ti.',
            de: '**[Premium]** Deine persönlichen Bots joinen deiner Party — ein ganzes Squad nur für dich.',
        },
    },
    {
        usage: '/emote-all <name>', emoji: '🕺',
        desc: {
            en: '**[Premium]** All your bots dance the same emote at once. Perfect for videos!',
            fr: '**[Premium]** Tous tes bots dansent la même emote en même temps. Parfait pour les vidéos !',
            es: '**[Premium]** Todos tus bots bailan la misma emote a la vez. ¡Perfecto para vídeos!',
            de: '**[Premium]** Alle deine Bots tanzen dieselbe Emote gleichzeitig. Perfekt für Videos!',
        },
    },
    {
        usage: '/preset save|apply|list', emoji: '💾',
        desc: {
            en: '**[Premium]** Save full loadouts (skin+backpack+pickaxe+emote) and apply them to your whole fleet in one command.',
            fr: '**[Premium]** Sauvegarde des loadouts complets (skin+sac+pioche+emote) et applique-les à toute ta flotte en une commande.',
            es: '**[Premium]** Guarda loadouts completos y aplícalos a toda tu flota en un comando.',
            de: '**[Premium]** Speichere komplette Loadouts und wende sie mit einem Befehl auf deine ganze Flotte an.',
        },
    },
];

const UI: Record<Lang, {
    igTitle: string; dcTitle: string; premiumTitle: string;
    intro: string; page1: string; page2: string; page3: string; page4: string; page5: string;
    tip: string; premiumFooter: string; prev: string; next: string; notYours: string; footer: string;
}> = {
    en: {
        igTitle: '📖 Fortnite Bot Commands — LobbyBot',
        dcTitle: '📖 Discord Commands — LobbyBot',
        premiumTitle: '💎 LobbyBot Premium',
        intro: 'These commands are used **directly in the game**:\n- In the **Fortnite lobby chat** (with a bot in your party)\n- Via **private message** to a bot on Epic Games\n**Use the ⬅️ ➡️ buttons to navigate.**',
        page1: '**👗 Page 1 / 5 — In-Game: Cosmetics**',
        page2: '**🎮 Page 2 / 5 — In-Game: Lobby**',
        page3: '**📋 Page 3 / 5 — Discord: Account & Bots**',
        page4: '**🎮 Page 4 / 5 — Discord: Fortnite & Info**',
        page5: '**💎 Page 5 / 5 — Premium**',
        tip: '💡 **Tip**: cosmetic names are typo-tolerant, and every command also accepts full Fortnite IDs (e.g. `CID_028_Athena_Commando_F`).',
        premiumFooter: '💙 Premium supports the project and keeps the bots online 24/7. `/premium` to subscribe!',
        prev: '⬅️ Previous', next: 'Next ➡️', notYours: '❌ This menu is not yours.',
        footer: 'LobbyBot by aeroz',
    },
    fr: {
        igTitle: '📖 Commandes des bots Fortnite — LobbyBot',
        dcTitle: '📖 Commandes Discord — LobbyBot',
        premiumTitle: '💎 LobbyBot Premium',
        intro: 'Ces commandes s\'utilisent **directement dans le jeu** :\n- Dans le **chat du lobby Fortnite** (avec un bot dans ton groupe)\n- En **message privé** à un bot sur Epic Games\n**Utilise les boutons ⬅️ ➡️ pour naviguer.**',
        page1: '**👗 Page 1 / 5 — In-Game : Cosmétiques**',
        page2: '**🎮 Page 2 / 5 — In-Game : Lobby**',
        page3: '**📋 Page 3 / 5 — Discord : Compte & Bots**',
        page4: '**🎮 Page 4 / 5 — Discord : Fortnite & Infos**',
        page5: '**💎 Page 5 / 5 — Premium**',
        tip: '💡 **Astuce** : les noms de cosmétiques tolèrent les fautes, et toutes les commandes acceptent aussi les IDs Fortnite complets (ex: `CID_028_Athena_Commando_F`).',
        premiumFooter: '💙 Le Premium soutient le projet et garde les bots en ligne 24/7. `/premium` pour t\'abonner !',
        prev: '⬅️ Précédent', next: 'Suivant ➡️', notYours: '❌ Ce menu ne t\'appartient pas.',
        footer: 'LobbyBot by aeroz',
    },
    es: {
        igTitle: '📖 Comandos de los bots de Fortnite — LobbyBot',
        dcTitle: '📖 Comandos de Discord — LobbyBot',
        premiumTitle: '💎 LobbyBot Premium',
        intro: 'Estos comandos se usan **directamente en el juego**:\n- En el **chat del lobby de Fortnite** (con un bot en tu grupo)\n- Por **mensaje privado** a un bot en Epic Games\n**Usa los botones ⬅️ ➡️ para navegar.**',
        page1: '**👗 Página 1 / 5 — In-Game: Cosméticos**',
        page2: '**🎮 Página 2 / 5 — In-Game: Lobby**',
        page3: '**📋 Página 3 / 5 — Discord: Cuenta & Bots**',
        page4: '**🎮 Página 4 / 5 — Discord: Fortnite & Info**',
        page5: '**💎 Página 5 / 5 — Premium**',
        tip: '💡 **Consejo**: los nombres toleran errores de tipeo y todos los comandos aceptan IDs completos de Fortnite (ej. `CID_028_Athena_Commando_F`).',
        premiumFooter: '💙 El Premium apoya el proyecto y mantiene los bots en línea 24/7. ¡`/premium` para suscribirte!',
        prev: '⬅️ Anterior', next: 'Siguiente ➡️', notYours: '❌ Este menú no es tuyo.',
        footer: 'LobbyBot by aeroz',
    },
    de: {
        igTitle: '📖 Fortnite-Bot-Befehle — LobbyBot',
        dcTitle: '📖 Discord-Befehle — LobbyBot',
        premiumTitle: '💎 LobbyBot Premium',
        intro: 'Diese Befehle werden **direkt im Spiel** verwendet:\n- Im **Fortnite-Lobby-Chat** (mit einem Bot in deiner Party)\n- Per **Privatnachricht** an einen Bot auf Epic Games\n**Nutze die ⬅️ ➡️ Buttons zum Navigieren.**',
        page1: '**👗 Seite 1 / 5 — In-Game: Kosmetik**',
        page2: '**🎮 Seite 2 / 5 — In-Game: Lobby**',
        page3: '**📋 Seite 3 / 5 — Discord: Konto & Bots**',
        page4: '**🎮 Seite 4 / 5 — Discord: Fortnite & Infos**',
        page5: '**💎 Seite 5 / 5 — Premium**',
        tip: '💡 **Tipp**: Namen sind tippfehlertolerant und alle Befehle akzeptieren auch komplette Fortnite-IDs (z.B. `CID_028_Athena_Commando_F`).',
        premiumFooter: '💙 Premium unterstützt das Projekt und hält die Bots 24/7 online. `/premium` zum Abonnieren!',
        prev: '⬅️ Zurück', next: 'Weiter ➡️', notYours: '❌ Dieses Menü gehört dir nicht.',
        footer: 'LobbyBot by aeroz',
    },
};

const SEPARATOR = '━━━━━━━━━━━━━━━━━━━━━━';

function entriesToFields(entries: CmdEntry[], lang: Lang) {
    return entries.map(e => ({
        name: `${e.emoji} \`${e.usage}\``,
        value: e.desc[lang] + (e.aliases ? `\n> *(alias: \`${e.aliases}\`)*` : ''),
        inline: false,
    }));
}

const pagesCache = new Map<Lang, EmbedBuilder[]>();

function buildPages(lang: Lang): EmbedBuilder[] {
    const cached = pagesCache.get(lang);
    if (cached) return cached;
    const ui = UI[lang];

    const pages = [
        new EmbedBuilder()
            .setTitle(ui.igTitle)
            .setColor(0x57F287)
            .setDescription(ui.intro)
            .addFields({ name: SEPARATOR, value: ui.page1, inline: false }, ...entriesToFields(IG_COSMETICS, lang))
            .setFooter({ text: `1/5 • ${ui.footer}` }),
        new EmbedBuilder()
            .setTitle(ui.igTitle)
            .setColor(0x57F287)
            .addFields(
                { name: SEPARATOR, value: ui.page2, inline: false },
                ...entriesToFields(IG_LOBBY, lang),
                { name: SEPARATOR, value: ui.tip, inline: false },
            )
            .setFooter({ text: `2/5 • ${ui.footer}` }),
        new EmbedBuilder()
            .setTitle(ui.dcTitle)
            .setColor(0x5865F2)
            .addFields({ name: SEPARATOR, value: ui.page3, inline: false }, ...entriesToFields(DISCORD_ACCOUNT, lang))
            .setFooter({ text: `3/5 • ${ui.footer}` }),
        new EmbedBuilder()
            .setTitle(ui.dcTitle)
            .setColor(0x5865F2)
            .addFields({ name: SEPARATOR, value: ui.page4, inline: false }, ...entriesToFields(DISCORD_MISC, lang))
            .setFooter({ text: `4/5 • ${ui.footer}` }),
        new EmbedBuilder()
            .setTitle(ui.premiumTitle)
            .setColor(0xF1C40F)
            .addFields(
                { name: SEPARATOR, value: ui.page5, inline: false },
                ...entriesToFields(DISCORD_PREMIUM, lang),
                { name: SEPARATOR, value: ui.premiumFooter, inline: false },
            )
            .setFooter({ text: `5/5 • ${ui.footer}` }),
    ];
    pagesCache.set(lang, pages);
    return pages;
}

function buildRow(page: number, total: number, ui: (typeof UI)[Lang]): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('help_prev')
            .setLabel(ui.prev)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId('help_page')
            .setLabel(`${page + 1} / ${total}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId('help_next')
            .setLabel(ui.next)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === total - 1)
    );
}

export const HelpCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('commands')
        .setDescription('All bot commands: in-game (Fortnite chat) + Discord')
        .setDescriptionLocalizations({
            fr: 'Toutes les commandes : in-game (chat Fortnite) + Discord',
            'es-ES': 'Todos los comandos: in-game (chat de Fortnite) + Discord',
            de: 'Alle Befehle: In-Game (Fortnite-Chat) + Discord',
        }),

    async execute(interaction: ChatInputCommandInteraction, _context: CommandContext, userLang: string) {
        await interaction.deferReply({ ephemeral: true });

        const lang: Lang = (LANGS as string[]).includes(userLang) ? userLang as Lang : 'en';
        const pages = buildPages(lang);
        const ui = UI[lang];
        let currentPage = 0;

        const reply = await interaction.editReply({
            embeds: [pages[currentPage]],
            components: [buildRow(currentPage, pages.length, ui)]
        });

        const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 120_000 // 2 minutes
        });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                await i.reply({ content: ui.notYours, ephemeral: true });
                return;
            }

            if (i.customId === 'help_prev') currentPage = Math.max(0, currentPage - 1);
            else if (i.customId === 'help_next') currentPage = Math.min(pages.length - 1, currentPage + 1);

            await i.update({
                embeds: [pages[currentPage]],
                components: [buildRow(currentPage, pages.length, ui)]
            });
        });

        collector.on('end', async () => {
            try {
                await interaction.editReply({ components: [] });
            } catch (_) {}
        });
    }
};
