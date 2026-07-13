import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { Command, CommandContext } from './Command';

const PAGES = [
    // PAGE 1 - Commandes in-game : Cosmétiques
    new EmbedBuilder()
        .setTitle('📖 Commandes des bots Fortnite — LobbyBot')
        .setColor(0x57F287)
        .setDescription('Ces commandes s\'utilisent **directement dans le jeu** :\n- Dans le **chat du lobby Fortnite** (avec un bot dans ton groupe)\n- En **message privé** à un bot sur Epic Games\n**Utilise les boutons ⬅️ ➡️ pour naviguer entre les pages.**')
        .addFields(
            {
                name: '━━━━━━━━━━━━━━━━━━━━━━',
                value: '**👗 Page 1 / 4 — In-Game : Cosmétiques**',
                inline: false
            },
            {
                name: '🧥 `!skin <nom>`',
                value: 'Change le skin du bot.\n> Ex: `!skin drift`, `!skin renegade raider`, `!skin CID_165_Athena_Commando_M`\n> *(alias : `!outfit`)*',
                inline: false
            },
            {
                name: '🎒 `!backpack <nom>`',
                value: 'Change le sac à dos du bot.\n> Ex: `!backpack dragon`\n> Tape `!backpack none` pour **retirer** le sac\n> *(alias : `!bag`, `!sac`)*',
                inline: false
            },
            {
                name: '⛏️ `!pickaxe <nom>`',
                value: 'Change la pioche du bot.\n> Ex: `!pickaxe reaper`\n> *(alias : `!pioche`)*',
                inline: false
            },
            {
                name: '💃 `!emote <nom>`',
                value: 'Fait danser le bot.\n> Ex: `!emote floss`, `!emote orange justice`, `!danse hype`\n> *(alias : `!dance`, `!danse`)*',
                inline: false
            },
            {
                name: '⏹️ `!stopdanse`',
                value: 'Arrête la danse en cours.\n> *(alias : `!stopdance`, `!clearemote`)*',
                inline: false
            },
            {
                name: '⭐ `!level <nombre>`',
                value: 'Change le niveau affiché du bot.\n> Ex: `!level 100`\n> *(alias : `!niveau`)*',
                inline: false
            },
            {
                name: '🎭 `!copy [pseudo]`',
                value: 'Le bot copie un loadout complet (skin, sac, pioche, planeur…).\n> Sans argument : copie **ton** loadout\n> Ex: `!copy` ou `!copy NomDuJoueur`\n> *(alias : `!copie`)*',
                inline: false
            }
        )
        .setFooter({ text: 'Page 1 / 4 • LobbyBot by aeroz' }),

    // PAGE 2 - Commandes in-game : Lobby
    new EmbedBuilder()
        .setTitle('📖 Commandes des bots Fortnite — LobbyBot')
        .setColor(0x57F287)
        .addFields(
            {
                name: '━━━━━━━━━━━━━━━━━━━━━━',
                value: '**🎮 Page 2 / 4 — In-Game : Lobby**',
                inline: false
            },
            {
                name: '🙈 `!hide` / 👀 `!show`',
                value: 'Cache **tous les membres du lobby sauf le bot** (parfait pour les screens 😏), puis `!show` pour tout rétablir.\n> `!hide me` : te garde visible avec le bot\n> ⚠️ Le bot doit être **chef du groupe** (dans SON lobby)\n> *(alias : `!unhide`)*',
                inline: false
            },
            {
                name: '✅ `!ready` / ❌ `!unready`',
                value: 'Met le bot **Prêt** / **Pas prêt** dans le lobby.\n> *(alias : `!pret`, `!paspret`)*',
                inline: false
            },
            {
                name: '👑 `!promote [pseudo]` *(admin)*',
                value: 'Donne le chef de groupe.\n> Sans argument : **te promeut toi**\n> Ex: `!promote` ou `!promote NomDuJoueur`',
                inline: false
            },
            {
                name: '👢 `!kick <pseudo>` *(admin)*',
                value: 'Expulse un joueur du lobby.\n> Ex: `!kick NomDuJoueur`',
                inline: false
            },
            {
                name: '🔒 `!privacy <mode>` *(admin)*',
                value: 'Change la confidentialité du lobby.\n> `!privacy public` — Ouvert à tous\n> `!privacy private` — Privé\n> `!privacy friends` — Amis seulement',
                inline: false
            },
            {
                name: '🚪 `!leave` *(admin)*',
                value: 'Fait quitter le lobby au bot.\n> *(alias : `!quit`)*',
                inline: false
            },
            {
                name: '➕ `!add <pseudo>` *(admin)*',
                value: 'Le bot envoie une demande d\'ami à ce pseudo.',
                inline: false
            },
            {
                name: '❓ `!help` / 🏓 `!ping`',
                value: 'Liste des commandes dans le chat Fortnite / test de réponse.\n> *(alias : `!aide`)*',
                inline: false
            },
            {
                name: '━━━━━━━━━━━━━━━━━━━━━━',
                value: '💡 **Astuce** : Tous les noms de cosmétiques acceptent aussi les **IDs complets** Fortnite (ex: `CID_028_Athena_Commando_F`).',
                inline: false
            }
        )
        .setFooter({ text: 'Page 2 / 4 • LobbyBot by aeroz' }),

    // PAGE 3 - Discord : Compte & Bots
    new EmbedBuilder()
        .setTitle('📖 Commandes Discord — LobbyBot')
        .setColor(0x5865F2)
        .addFields(
            {
                name: '━━━━━━━━━━━━━━━━━━━━━━',
                value: '**📋 Page 3 / 4 — Discord : Compte & Bots**',
                inline: false
            },
            {
                name: '🔗 `/login <code>`',
                value: 'Connecte ton compte Epic Games au bot.\n> Récupère ton code sur [epicgames.com/id](https://www.epicgames.com/id/login?redirectUrl=https%3A%2F%2Fwww.epicgames.com%2Fid%2Fapi%2Fredirect%3FclientId%3D3f69e56c7649492c8cc29f1af08a8a12%26responseType%3Dcode)\n> (résultat uniquement visible par toi)',
                inline: false
            },
            {
                name: '🚪 `/logout`',
                value: 'Déconnecte ton compte Epic Games du bot.',
                inline: false
            },
            {
                name: '➕ `/add [pseudo]`',
                value: 'Ajoute un bot Fortnite en ami.\n> Sans argument : utilise ton compte connecté (auto)\n> Avec `pseudo` : envoie la demande à ce pseudo directement',
                inline: false
            },
            {
                name: '➖ `/remove`',
                value: 'Supprime le bot de ta liste d\'amis Epic Games.',
                inline: false
            },
            {
                name: '🤖 `/listbots`',
                value: 'Affiche la liste de tous les bots disponibles avec leur statut.',
                inline: false
            },
            {
                name: '📊 `/info`',
                value: 'Affiche les statistiques globales (bots en ligne, amis totaux, places restantes…)',
                inline: false
            }
        )
        .setFooter({ text: 'Page 3 / 4 • LobbyBot by aeroz' }),

    // PAGE 4 - Discord : Fortnite & Infos
    new EmbedBuilder()
        .setTitle('📖 Commandes Discord — LobbyBot')
        .setColor(0x5865F2)
        .addFields(
            {
                name: '━━━━━━━━━━━━━━━━━━━━━━',
                value: '**🎮 Page 4 / 4 — Discord : Fortnite & Infos**',
                inline: false
            },
            {
                name: '🛒 `/shop`',
                value: 'Affiche la boutique Fortnite du jour avec les prix V-Bucks.',
                inline: false
            },
            {
                name: '🗺️ `/map`',
                value: 'Affiche la carte Fortnite actuelle.',
                inline: false
            },
            {
                name: '📰 `/news`',
                value: 'Affiche les dernières actualités Fortnite.',
                inline: false
            },
            {
                name: '🔧 `/status`',
                value: 'Vérifie si les services Fortnite sont opérationnels.',
                inline: false
            },
            {
                name: '👑 `/sac [code]`',
                value: 'Définit ton code créateur Fortnite (Support-A-Creator).\n> Sans argument : utilise le code **aeroz** par défaut\n> Nécessite d\'être connecté avec `/login`',
                inline: false
            },
            {
                name: '🎒 `/locker`',
                value: 'Affiche le contenu de ton vestiaire Fortnite (skins, pickaxes…)\n> Nécessite d\'être connecté avec `/login`',
                inline: false
            },
            {
                name: '👥 `/list`',
                value: 'Affiche ta liste d\'amis Epic Games avec pagination.',
                inline: false
            },
            {
                name: '🌍 `/setlanguage`',
                value: 'Change la langue des réponses du bot (FR, EN…)',
                inline: false
            }
        )
        .setFooter({ text: 'Page 4 / 4 • LobbyBot by aeroz' })
];

function buildRow(page: number): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('help_prev')
            .setLabel('⬅️ Précédent')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId('help_page')
            .setLabel(`${page + 1} / ${PAGES.length}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId('help_next')
            .setLabel('Suivant ➡️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === PAGES.length - 1)
    );
}

export const HelpCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('commandes')
        .setDescription('Commandes des bots Fortnite in-game (+ commandes Discord)'),

    async execute(interaction: ChatInputCommandInteraction, _context: CommandContext, _userLang: string) {
        await interaction.deferReply({ ephemeral: true });

        let currentPage = 0;

        const reply = await interaction.editReply({
            embeds: [PAGES[currentPage]],
            components: [buildRow(currentPage)]
        });

        const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 120_000 // 2 minutes
        });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                await i.reply({ content: '❌ Ce menu ne t\'appartient pas.', ephemeral: true });
                return;
            }

            if (i.customId === 'help_prev') currentPage = Math.max(0, currentPage - 1);
            else if (i.customId === 'help_next') currentPage = Math.min(PAGES.length - 1, currentPage + 1);

            await i.update({
                embeds: [PAGES[currentPage]],
                components: [buildRow(currentPage)]
            });
        });

        collector.on('end', async () => {
            try {
                await interaction.editReply({ components: [] });
            } catch (_) {}
        });
    }
};
