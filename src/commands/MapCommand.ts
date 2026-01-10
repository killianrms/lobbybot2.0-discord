import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command, CommandContext } from './Command';

export const MapCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('map')
        .setDescription('Voir la carte actuelle'),

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        await interaction.deferReply();
        const mapUrl = await context.apiManager.getMap();
        if (mapUrl) {
            await interaction.editReply({ files: [mapUrl] });
        } else {
            await interaction.editReply('❌ Impossible de récupérer la carte.');
        }
    }
};
