import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command, CommandContext } from './Command';

export const LogoutCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('logout')
        .setDescription('Se déconnecter et supprimer ses données'),

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        await interaction.deferReply({ ephemeral: true });
        await context.userManager.logout(interaction.user.id);
        await interaction.editReply('🔒 Vous avez été déconnecté et vos données ont été supprimées.');
    }
};
