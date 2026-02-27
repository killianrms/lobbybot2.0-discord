import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command, CommandContext } from './Command';
import { getTranslation } from '../utils/locales';

export const SacCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('sac')
        .setDescription('Définit votre code créateur (Support-A-Creator)')
        .addStringOption(option =>
            option.setName('code')
                .setDescription('Le code créateur (défaut: aeroz)')
                .setRequired(false)),

    ephemeral: true,

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        const code = interaction.options.getString('code') || 'aeroz';

        const result = await context.userManager.setAffiliate(interaction.user.id, code);

        if (result === 'NOT_LOGGED_IN') {
            await interaction.editReply(getTranslation(userLang, 'NOT_LOGGED_IN'));
        } else if (result === 'INVALID_CODE') {
            await interaction.editReply(`❌ Le code créateur "**${code}**" est invalide ou introuvable.`);
        } else if (result === 'SUCCESS') {
            await interaction.editReply(`✅ Code créateur défini sur : **${code}**`);
        } else {
            await interaction.editReply(getTranslation(userLang, 'ERROR'));
        }
    }
};
