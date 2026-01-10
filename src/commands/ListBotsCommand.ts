import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { Command, CommandContext } from './Command';
import { getTranslation } from '../utils/locales';

export const ListBotsCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('listbots')
        .setDescription('Affiche la liste des bots connectés'),

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        const bots = context.botManager.getActiveBots().filter(b => b.isConnected);

        if (bots.length === 0) {
            await interaction.reply(getTranslation(userLang, 'NO_BOTS'));
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        // Pagination Logic
        const ITEMS_PER_PAGE = 25; // 25 bots per page
        const totalPages = Math.ceil(bots.length / ITEMS_PER_PAGE);
        let currentPage = 0;

        const generateEmbed = (page: number) => {
            const start = page * ITEMS_PER_PAGE;
            const end = start + ITEMS_PER_PAGE;
            const pageItems = bots.slice(start, end);

            return new EmbedBuilder()
                .setTitle(`${getTranslation(userLang, 'BOTS_CONNECTED')} (${bots.length})`)
                .setColor('#0099ff')
                .setDescription(pageItems.map(b => `• **${b.account.pseudo}** (${b.client?.friends?.size || 0} amis)`).join('\n'))
                .setFooter({ text: `${getTranslation(userLang, 'PAGE')} ${page + 1}/${totalPages}` });
        };

        const generateRow = (page: number) => {
            return new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('prev_bots')
                        .setLabel(getTranslation(userLang, 'PREV'))
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId('next_bots')
                        .setLabel(getTranslation(userLang, 'NEXT'))
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === totalPages - 1)
                );
        };

        const reply = await interaction.editReply({
            embeds: [generateEmbed(currentPage)],
            components: totalPages > 1 ? [generateRow(currentPage)] : []
        });

        if (totalPages > 1) {
            const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) {
                    await i.reply({ content: getTranslation(userLang, 'NOT_YOUR_BUTTONS'), ephemeral: true });
                    return;
                }

                if (i.customId === 'prev_bots') currentPage--;
                else if (i.customId === 'next_bots') currentPage++;

                await i.update({
                    embeds: [generateEmbed(currentPage)],
                    components: [generateRow(currentPage)]
                });
            });
        }
    }
};
