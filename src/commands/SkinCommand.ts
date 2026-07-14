import { SlashCommandBuilder, ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { Command, CommandContext } from './Command';
import { respondFriendedBots } from './friendBotAutocomplete';

// Cooldown dédié au changement de skin (en plus du rate-limit global de 3s) :
// changer de skin appelle l'API Epic côté bot, on évite le spam qui déclenche
// les rate-limits Epic et fait clignoter le lobby.
const SKIN_COOLDOWN_MS = 8000;
const lastSkinUse = new Map<string, number>();

export const SkinCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('skin')
        .setDescription('Fait porter un skin à un de tes bots amis (pour tes screenshots)')
        .addStringOption(option =>
            option.setName('bot')
                .setDescription('Le bot ami qui portera le skin')
                .setRequired(true)
                .setAutocomplete(true))
        .addStringOption(option =>
            option.setName('nom')
                .setDescription('Nom du skin (ex: Renegade Raider, Aura...)')
                .setRequired(true)),

    async autocomplete(interaction: AutocompleteInteraction, context: CommandContext) {
        await respondFriendedBots(interaction, context);
    },

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        const botPseudo = interaction.options.getString('bot', true);
        const skinName = interaction.options.getString('nom', true);

        // Cooldown dédié
        const now = Date.now();
        const last = lastSkinUse.get(interaction.user.id) ?? 0;
        if (now - last < SKIN_COOLDOWN_MS) {
            const wait = Math.ceil((SKIN_COOLDOWN_MS - (now - last)) / 1000);
            await interaction.reply({ content: `⏱️ Attends encore ${wait}s avant de rechanger de skin.`, flags: 64 });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        // Sécurité : on vérifie que le bot demandé est bien un ami de l'utilisateur.
        const user = await context.dbManager.getUser(interaction.user.id);
        if (!user?.deviceAuth?.accountId) {
            await interaction.editReply('ℹ️ Connecte-toi d\'abord avec `/login`, puis ajoute un bot avec `/add`.');
            return;
        }

        const friendedBots = context.botManager.getBotsFriendedBy(user.deviceAuth.accountId);
        if (friendedBots.length === 0) {
            await interaction.editReply('ℹ️ Tu n\'as aucun bot en ami. Fais `/add` pour en ajouter un, puis réessaie.');
            return;
        }
        if (!friendedBots.includes(botPseudo)) {
            await interaction.editReply(`❌ Tu n'es pas ami avec **${botPseudo}**. Choisis un bot dans la liste déroulante.`);
            return;
        }

        lastSkinUse.set(interaction.user.id, now);

        const result = await context.botManager.executeAction(botPseudo, 'skin', skinName);
        await interaction.editReply(result);
    }
};
