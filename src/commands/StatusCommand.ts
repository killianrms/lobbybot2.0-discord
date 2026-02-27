import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command, CommandContext } from './Command';

export const StatusCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Voir l\'état des services Fortnite'),

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        const status = await context.apiManager.getStatus();
        await interaction.editReply(status ? '🟢 Les services Fortnite semblent opérationnels.' : '🔴 Problème détecté sur les services Fortnite.');
    }
};
