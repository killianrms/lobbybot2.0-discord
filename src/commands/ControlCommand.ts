import {
    SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags,
} from 'discord.js';
import { Command, CommandContext } from './Command';

/**
 * /control — bot lobby (façon Victory), version « handoff ».
 *
 * Le vrai mécanisme des bot lobbies : un compte bot **bas niveau** dans ta party
 * tire le matchmaking vers des bots. Le lancement se fait par TON client (qui a
 * le droit « PLAY »), pas par le bot. Donc /control te **promeut chef**, tu lances
 * la partie dans Fortnite, et le bot quitte pile au démarrage → tu atterris seul
 * dans un lobby de bots. Zéro API non officielle.
 */

function readyEmbed(botPseudo: string): EmbedBuilder {
    return new EmbedBuilder()
        .setTitle('🎮 Bot Lobby')
        .setColor(0x5865F2)
        .setDescription(
            `Le bot **${botPseudo}** va te passer le lead pour que tu lances une partie de bots.\n\n` +
            `**Comment ça marche :**\n` +
            `• Je te promeus **chef du groupe**.\n` +
            `• Tu choisis ta **région** et ton **mode** dans Fortnite, puis tu **lances**.\n` +
            `• Le bot (bas niveau) tire le lobby vers des bots et **quitte au démarrage**.\n` +
            `• Tu restes seul dans une partie remplie de bots. 🤖\n\n` +
            `Clique **Prendre le lead** quand tu es **en jeu, dans le groupe du bot**.`
        )
        .setFooter({ text: 'Astuce : reste dans le lobby jusqu\'à ce que la partie charge.' });
}

function startRow(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('ctrl_take').setLabel('👑 Prendre le lead').setStyle(ButtonStyle.Success),
    );
}

export const ControlCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('control')
        .setDescription('Bot lobby : le bot te passe le lead pour lancer une partie de bots')
        .setDescriptionLocalizations({
            'es-ES': 'Bot lobby: el bot te pasa el liderazgo para lanzar una partida de bots',
            de: 'Bot-Lobby: Der Bot gibt dir die Führung, um ein Bot-Match zu starten',
        }),

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const user = await context.dbManager.getUser(interaction.user.id);
        const accountId = user?.deviceAuth?.accountId;
        if (!accountId) {
            await interaction.editReply('ℹ️ Connecte-toi d\'abord avec `/login`, puis rejoins le groupe d\'un bot (`/invite`).');
            return;
        }

        const hostBot = context.botManager.getBotHostingUser(accountId);
        if (!hostBot) {
            await interaction.editReply(
                '❌ Je ne te trouve dans le groupe d\'aucun bot **où le bot est chef**.\n' +
                '➡️ Fais `/invite` pour qu\'un bot t\'invite, rejoins-le en jeu, et réessaie.'
            );
            return;
        }
        const botPseudo = hostBot.account.pseudo;

        const reply = await interaction.editReply({ embeds: [readyEmbed(botPseudo)], components: [startRow()] });
        const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120_000 });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                await i.reply({ content: '❌ Ce menu ne t\'appartient pas.', flags: MessageFlags.Ephemeral });
                return;
            }
            if (i.customId !== 'ctrl_take') return;

            await i.update({
                embeds: [new EmbedBuilder().setTitle('⏳ Passage du lead…').setColor(0xF1C40F)
                    .setDescription('Je te promeus chef du groupe, un instant…')],
                components: [],
            });

            const result = await context.botManager.startBotLobby(botPseudo, accountId);
            const ok = result.startsWith('👑');

            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle(ok ? '✅ À toi de jouer !' : '❌ Échec')
                    .setColor(ok ? 0x57F287 : 0xE74C3C)
                    .setDescription(result)],
                components: [],
            });
            collector.stop();
        });

        collector.on('end', async () => {
            try { await interaction.editReply({ components: [] }); } catch (_) {}
        });
    }
};
