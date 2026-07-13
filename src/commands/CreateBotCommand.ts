import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command, CommandContext } from './Command';

const PSEUDO_REGEX = /^[A-Za-z0-9._-]{2,14}$/;

export const CreateBotCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('createbot')
        .setDescription('Crée et héberge ton propre bot Fortnite (1 par personne)')
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

        const existing = await context.dbManager.getBotByOwner(interaction.user.id);
        if (existing) {
            await interaction.reply({
                content: `ℹ️ Tu as déjà un bot : **${existing.pseudo}**. Un seul bot par personne pour l'instant.`,
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

        const result = await context.generatorManager.requestBot(interaction.user.id, pseudoSuffix);

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
