import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { Command, CommandContext } from './Command';
import { FREE_BOT_QUOTA, PREMIUM_BOT_QUOTA, premiumButtonRow } from '../config/premium';

export const PremiumCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('premium')
        .setDescription('Découvre LobbyBot Premium ou consulte ton abonnement'),

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        const row = premiumButtonRow();

        if (await context.dbManager.isPremium(interaction.user.id)) {
            const details = await context.dbManager.getPremium(interaction.user.id);
            let expires = 'permanent';
            if (details?.expires_at) {
                const t = Date.parse(details.expires_at);
                expires = Number.isNaN(t) ? details.expires_at : `<t:${Math.floor(t / 1000)}:D>`;
            }
            const owned = await context.dbManager.getBotsByOwner(interaction.user.id);

            const embed = new EmbedBuilder()
                .setTitle('👑 LobbyBot Premium — actif')
                .setColor(0xF1C40F)
                .setDescription('Merci de soutenir LobbyBot ! Ton abonnement est actif.')
                .addFields(
                    { name: '📅 Renouvellement', value: expires, inline: true },
                    { name: '🤖 Flotte perso', value: `${owned.length}/${PREMIUM_BOT_QUOTA} bots (\`/createbot\`)`, inline: true },
                )
                .setFooter({ text: 'Gère ton abonnement dans Paramètres Discord → Abonnements' });

            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle('👑 LobbyBot Premium')
            .setColor(0xF1C40F)
            .setDescription('Débloque tout le potentiel de LobbyBot :')
            .addFields(
                { name: `🤖 Flotte perso — jusqu'à ${PREMIUM_BOT_QUOTA} bots`, value: `Crée ${PREMIUM_BOT_QUOTA} bots à toi avec \`/createbot\` (au lieu de ${FREE_BOT_QUOTA} en gratuit)` },
                { name: '⚡ File prioritaire', value: 'Tes bots sont générés avant les demandes gratuites' },
                { name: '👥 `/squad`', value: 'Toute ta flotte te rejoint en lobby en une commande (presets auto-appliqués)' },
                { name: '💃 `/emoteall`', value: 'Emotes synchronisées sur toute la flotte' },
                { name: '🎨 `/preset`', value: 'Sauvegarde et applique tes loadouts favoris' },
                { name: '✨ Rôle Premium', value: 'Affiché sur le serveur Discord' },
            );

        if (row) {
            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        } else {
            embed.setFooter({ text: 'Bientôt disponible à l\'achat — reste à l\'affût !' });
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
};
