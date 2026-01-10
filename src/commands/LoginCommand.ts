import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command, CommandContext } from './Command';

export const LoginCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('login')
        .setDescription('Connecter votre compte Epic Games pour l\'auto-add')
        .addStringOption(option =>
            option.setName('code')
                .setDescription('Le code d\'autorisation Epic Games')
                .setRequired(true)),

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        const code = interaction.options.getString('code');
        if (!code) return;

        await interaction.deferReply({ ephemeral: true });

        const result = await context.userManager.handleLogin(interaction.user.id, code);

        if (result.startsWith('SUCCESS')) {
            const pseudo = result.split(':')[1];
            await interaction.editReply(`✅ Connecté en tant que **${pseudo}** ! Vous pouvez maintenant utiliser \`/add\` sans arguments.`);
        } else {
            await interaction.editReply(`❌ Échec de la connexion: ${result.split(':')[1]}`);
        }
    }
};
