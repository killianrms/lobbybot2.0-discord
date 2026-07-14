import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command, CommandContext } from './Command';
import { requirePremium } from './premiumGuard';

export const SquadCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('squad')
        .setDescription('[Premium] Fais rejoindre tes bots perso dans ton groupe Fortnite'),

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        if (!requirePremium(interaction, context.dbManager)) return;

        await interaction.deferReply({ ephemeral: true });

        const user = await context.dbManager.getUser(interaction.user.id);
        if (!user?.deviceAuth?.accountId) {
            await interaction.editReply('ℹ️ Connecte-toi d\'abord avec `/login` pour que tes bots puissent te rejoindre.');
            return;
        }

        const ownedBots = context.dbManager.getBotsByOwner(interaction.user.id);
        if (ownedBots.length === 0) {
            await interaction.editReply('ℹ️ Tu n\'as pas encore de bot perso. Crée-en un avec `/createbot`.');
            return;
        }

        const activePseudos = new Set(
            context.botManager.getActiveBots().filter((b: any) => b.isConnected).map((b: any) => b.account.pseudo)
        );
        const online = ownedBots.filter(b => b.pseudo && activePseudos.has(b.pseudo));
        if (online.length === 0) {
            await interaction.editReply('⚠️ Aucun de tes bots n\'est en ligne pour le moment. Réessaie dans un instant.');
            return;
        }

        const results: string[] = [];
        for (const bot of online) {
            const res = await context.botManager.inviteToParty(bot.pseudo as string, user.deviceAuth.accountId);
            results.push(`• ${bot.pseudo} → ${res.startsWith('✅') ? 'invité' : res}`);
            await new Promise(r => setTimeout(r, 600)); // espacement anti rate-limit
        }

        const activePreset = context.dbManager.getActivePreset(interaction.user.id);
        if (activePreset) {
            await context.botManager.applyLoadoutToOwned(interaction.user.id, activePreset);
        }

        await interaction.editReply(`🎬 Ta squad arrive (${online.length} bot(s)) :\n${results.join('\n')}\nAccepte les invitations dans Fortnite !`);
    }
};
