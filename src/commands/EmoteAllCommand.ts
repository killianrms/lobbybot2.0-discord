import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command, CommandContext } from './Command';
import { requirePremium } from './premiumGuard';
import { FortniteAPIService } from '../services/FortniteAPIService';

const api = new FortniteAPIService();

export const EmoteAllCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('emote-all')
        .setDescription('[Premium] Fais danser tous tes bots en même temps')
        .addStringOption(option =>
            option.setName('nom').setDescription('Nom de l\'emote/danse').setRequired(true)),

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        if (!(await requirePremium(interaction, context.dbManager))) return;
        await interaction.deferReply({ ephemeral: true });

        const query = interaction.options.getString('nom', true);
        const item = await api.searchCosmetic(query, 'emote');
        if (!item) { await interaction.editReply(`❌ Emote "${query}" introuvable.`); return; }

        const count = await context.botManager.emoteAllOwned(interaction.user.id, item.id);
        await interaction.editReply(
            count > 0
                ? `💃 **${item.name}** jouée sur ${count} de tes bots !`
                : '⚠️ Aucun de tes bots en ligne. Fais `/squad` d\'abord.'
        );
    }
};
