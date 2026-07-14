import { SlashCommandBuilder, ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { Command, CommandContext } from './Command';
import { respondFriendedBots } from './friendBotAutocomplete';

export const InviteCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('invite')
        .setDescription('Un de tes bots amis t\'invite dans son groupe Fortnite')
        .addStringOption(option =>
            option.setName('bot')
                .setDescription('Le bot qui t\'invite (par défaut : le premier bot ami)')
                .setRequired(false)
                .setAutocomplete(true)),

    async autocomplete(interaction: AutocompleteInteraction, context: CommandContext) {
        await respondFriendedBots(interaction, context);
    },

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        await interaction.deferReply({ ephemeral: true });

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

        const chosen = interaction.options.getString('bot');
        if (chosen && !friendedBots.includes(chosen)) {
            await interaction.editReply(`❌ Tu n'es pas ami avec **${chosen}**. Choisis un bot dans la liste déroulante.`);
            return;
        }

        const botPseudo = chosen ?? friendedBots[0];
        const result = await context.botManager.inviteToParty(botPseudo, user.deviceAuth.accountId);
        await interaction.editReply(result);
    }
};
