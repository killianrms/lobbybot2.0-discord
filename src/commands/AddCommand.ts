import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command, CommandContext } from './Command';
import { getTranslation } from '../utils/locales';

export const AddCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('add')
        .setDescription('Ajouter un bot en ami')
        .addStringOption(option =>
            option.setName('pseudo')
                .setDescription('Votre pseudo Epic Games (Optionnel si connecté)')
                .setRequired(false)),

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        const target = interaction.options.getString('pseudo');

        if (target) {
            // LEGACY FLOW
            const result = await context.botManager.addFriendOnAvailableBot(target);
            if (result === 'SUCCESS') {
                await interaction.editReply(`✅ Demande d'ami envoyée à **${target}** ! (Veuillez accepter)`);
            } else if (result === 'FULL') {
                await interaction.editReply(`⚠️ Tous les bots sont pleins.`);
            } else {
                await interaction.editReply(`❌ Erreur technique.`);
            }
        } else {
            // SMART FLOW
            const bestBot = context.botManager.getBestBot();

            if (!bestBot) {
                await interaction.editReply(getTranslation(userLang, 'NO_BOTS'));
                return;
            }

            const result = await context.userManager.addBotAsFriend(interaction.user.id, bestBot.account.pseudo);

            if (result === 'SUCCESS') {
                await interaction.editReply(`✅ Bot **${bestBot.account.pseudo}** ajouté en ami automatiquement !`);
            } else if (result === 'NOT_LOGGED_IN') {
                await interaction.editReply(`ℹ️ Vous n'êtes pas connecté. Utilisez \`/login <code>\` ou spécifiez votre pseudo.`);
            } else {
                await interaction.editReply(`❌ Erreur lors de l'ajout automatique.`);
            }
        }
    }
};
