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

        await interaction.deferReply();

        if (target) {
            // LEGACY FLOW
            const result = await context.botManager.addFriendOnAvailableBot(target);
            if (result === 'SUCCESS') {
                await interaction.editReply(`✅ Demande d'ami envoyée à **${target}** ! (Veuillez accepter)`);
            } else if (result === 'FULL') {
                await interaction.editReply(`⚠️ Tous les bots sont pleins.`);
            } else if (result === 'ALREADY_FRIENDS') {
                await interaction.editReply(`ℹ️ **${target}** est déjà ami avec **tous les bots disponibles**. Aucun nouveau bot à ajouter.`);
            } else {
                await interaction.editReply(`❌ Erreur technique.`);
            }
        } else {
            // SMART FLOW
            const user = await context.dbManager.getUser(interaction.user.id);
            if (!user) {
                await interaction.editReply(`ℹ️ Vous n'êtes pas connecté. Utilisez \`/login <code>\` ou spécifiez votre pseudo.`);
                return;
            }

            // Les bots connaissent leur propre liste d'amis : on sait donc
            // localement lesquels ont déjà cet utilisateur, sans interroger Epic.
            const dejaAmis = context.botManager.getBotsFriendedBy(user.deviceAuth?.accountId);
            const candidats = context.botManager.getAvailableBots(dejaAmis);

            if (candidats.length === 0) {
                // Deux situations très différentes à ne pas confondre : plus
                // aucun bot disponible, ou déjà ami avec tous ceux qui existent.
                if (dejaAmis.length > 0) {
                    await interaction.editReply(
                        `ℹ️ Vous êtes déjà ami avec **tous les bots disponibles** (${dejaAmis.length}) : ${dejaAmis.join(', ')}.\n` +
                        `Aucun nouveau bot à ajouter pour le moment.`
                    );
                } else {
                    await interaction.editReply(getTranslation(userLang, 'NO_BOTS'));
                }
                return;
            }

            // On tente les candidats l'un après l'autre : la liste d'amis d'un
            // bot peut être en retard sur Epic. Plafonné à 3 pour ne pas faire
            // expirer l'interaction Discord (chaque essai ouvre une session Epic).
            let dernierResultat = 'ERROR';
            for (const bot of candidats.slice(0, 3)) {
                dernierResultat = await context.userManager.addBotAsFriend(interaction.user.id, bot.account.pseudo);

                if (dernierResultat === 'SUCCESS') {
                    await interaction.editReply(`✅ Bot **${bot.account.pseudo}** ajouté en ami automatiquement !`);
                    return;
                }
                if (dernierResultat === 'ALREADY_FRIENDS') continue; // bot suivant
                break; // NOT_LOGGED_IN ou erreur technique : inutile d'insister
            }

            if (dernierResultat === 'NOT_LOGGED_IN') {
                await interaction.editReply(`ℹ️ Vous n'êtes pas connecté. Utilisez \`/login <code>\` ou spécifiez votre pseudo.`);
            } else if (dernierResultat === 'ALREADY_FRIENDS') {
                await interaction.editReply(`ℹ️ Vous êtes déjà ami avec tous les bots disponibles. Aucun nouveau bot à ajouter.`);
            } else {
                await interaction.editReply(`❌ Erreur lors de l'ajout automatique.`);
            }
        }
    }
};
