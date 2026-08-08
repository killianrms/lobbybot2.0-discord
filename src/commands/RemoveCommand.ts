import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command, CommandContext } from './Command';

/**
 * /remove — retire un ami de TON compte Epic (celui connecté via /login).
 *
 * Historiquement cette commande appelait botManager.removeFriend(), qui
 * parcourait toute la flotte : n'importe qui pouvait retirer quelqu'un des bots
 * de tous les propriétaires à la fois. Elle agit désormais uniquement sur le
 * compte de l'appelant, ce qui est ce qu'on attend d'un /remove.
 */
export const RemoveCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Retirer un ami de TON compte Epic (nécessite /login)')
        .addStringOption(option =>
            option.setName('pseudo')
                .setDescription('Pseudo Epic de l\'ami à retirer')
                .setRequired(true)),

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        const target = interaction.options.getString('pseudo');
        if (!target) return;
        await interaction.deferReply({ ephemeral: true });

        const result = await context.userManager.removeFriend(interaction.user.id, target);

        switch (result) {
            case 'SUCCESS':
                await interaction.editReply(`✅ **${target}** a été retiré de ta liste d'amis Epic.`);
                break;
            case 'NOT_LOGGED_IN':
                await interaction.editReply('🔒 Tu dois d\'abord connecter ton compte Epic avec `/login`.');
                break;
            case 'NOT_FRIENDS':
                await interaction.editReply(`❌ **${target}** n'est pas dans ta liste d'amis.`);
                break;
            default:
                await interaction.editReply(`❌ Impossible de retirer **${target}**. Réessaie dans un instant.`);
        }
    }
};
