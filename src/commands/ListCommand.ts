import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { Command, CommandContext } from './Command';
import { getTranslation } from '../utils/locales';

export const ListCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('list')
        .setDescription('Affiche votre liste d\'amis (avec pagination)'),

    ephemeral: true,

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        const friends = await context.userManager.getFriends(interaction.user.id);

        if (!friends) {
            await interaction.editReply(getTranslation(userLang, 'NOT_LOGGED_IN'));
            return;
        }

        if (friends.length === 0) {
            await interaction.editReply(getTranslation(userLang, 'NO_FRIENDS'));
            return;
        }

        // Pagination Logic
        const ITEMS_PER_PAGE = 25;
        const totalPages = Math.ceil(friends.length / ITEMS_PER_PAGE);
        let currentPage = 0;

        const generateEmbed = (page: number) => {
            const start = page * ITEMS_PER_PAGE;
            const end = start + ITEMS_PER_PAGE;
            const pageItems = friends.slice(start, end);

            return new EmbedBuilder()
                .setTitle(`${getTranslation(userLang, 'FRIENDS_LIST')} (${friends.length})`)
                .setColor('#00ff00')
                .setDescription(pageItems.map(f => `• ${f}`).join('\n'))
                .setFooter({ text: `${getTranslation(userLang, 'PAGE')} ${page + 1}/${totalPages}` });
        };

        const generateRow = (page: number) => {
            return new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('prev')
                        .setLabel(getTranslation(userLang, 'PREV'))
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId('next')
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

                if (i.customId === 'prev') currentPage--;
                else if (i.customId === 'next') currentPage++;

                await i.update({
                    embeds: [generateEmbed(currentPage)],
                    components: [generateRow(currentPage)]
                });
            });
        }
    }
};
