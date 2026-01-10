import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { Command, CommandContext } from './Command';

export const NewsCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('news')
        .setDescription('Voir les actualités'),

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        await interaction.deferReply();
        const news = await context.apiManager.getNews();
        if (news && news.length > 0) {
            const embeds = news.slice(0, 3).map((n: any) =>
                new EmbedBuilder()
                    .setTitle(n.title)
                    .setDescription(n.body)
                    .setImage(n.image)
                    .setColor(0x0099FF)
            );
            await interaction.editReply({ embeds: embeds });
        } else {
            await interaction.editReply('❌ Aucune actualité disponible.');
        }
    }
};
