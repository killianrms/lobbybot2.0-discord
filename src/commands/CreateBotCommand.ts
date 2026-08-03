import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command, CommandContext } from './Command';
import { botQuotaFor, premiumButtonRow } from '../config/premium';

const PSEUDO_REGEX = /^[A-Za-z0-9._-]{2,14}$/;

export const CreateBotCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('createbot')
        .setDescription('Crée et héberge ton propre bot Fortnite (1 gratuit, jusqu\'à 3 en premium)')
        .addStringOption(option =>
            option.setName('pseudo')
                .setDescription('Le nom que tu veux pour ton bot (des chiffres seront ajoutés devant)')
                .setRequired(true)),

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        const pseudoSuffix = interaction.options.getString('pseudo', true).trim();

        if (!PSEUDO_REGEX.test(pseudoSuffix)) {
            await interaction.reply({
                content: '❌ Pseudo invalide. 2 à 14 caractères, lettres/chiffres/points/tirets uniquement.',
                ephemeral: true
            });
            return;
        }

        const isPremium = await context.dbManager.isPremium(interaction.user.id);
        const quota = botQuotaFor(isPremium);
        const owned = await context.dbManager.getBotsByOwner(interaction.user.id);
        if (owned.length >= quota) {
            // C'est LE moment où un utilisateur gratuit a envie de payer : bouton d'achat direct.
            const row = !isPremium ? premiumButtonRow() : null;
            await interaction.reply({
                content: isPremium
                    ? `ℹ️ Tu as atteint ta limite premium de **${quota} bots** (${owned.map(b => b.pseudo).join(', ')}).`
                    : `ℹ️ Tu as déjà un bot : **${owned[0].pseudo}**. Passe à **LobbyBot Premium** pour en avoir jusqu'à ${botQuotaFor(true)} !`,
                components: row ? [row] : [],
                ephemeral: true
            });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        const position = context.generatorManager.queueLength();
        await interaction.editReply(
            position > 0
                ? `🔧 Demande enregistrée (${position} devant toi dans la file). Ça peut prendre 1 à 5 minutes, je t'envoie un message privé une fois prêt !`
                : `🔧 Génération de ton bot **${pseudoSuffix}** en cours... Ça peut prendre 1 à 5 minutes, je t'envoie un message privé une fois prêt !`
        );

        const result = await context.generatorManager.requestBot(interaction.user.id, pseudoSuffix, isPremium);

        const message = result.status === 'success'
            ? `✅ Ton bot **${result.pseudo}** est créé et en ligne ! Il rejoint automatiquement les demandes d'ami avec le code créateur configuré. Utilise \`/add\` pour tester.`
            : `❌ La création de ton bot a échoué (${result.reason}). Réessaie plus tard ou contacte un admin.`;

        try {
            await interaction.user.send(message);
        } catch {
            // DMs fermés — on retente via editReply si le token d'interaction est encore valide
        }

        try {
            await interaction.editReply(message);
        } catch {
            // Token d'interaction expiré (>15min) — le DM ci-dessus est le fallback fiable
        }
    }
};
