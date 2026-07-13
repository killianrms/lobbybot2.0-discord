import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command, CommandContext } from './Command';

// Charger les IDs admin depuis .env (séparés par des virgules)
const ADMIN_IDS = process.env.ADMIN_IDS?.split(',').map(id => id.trim()) || ['335755692134891520'];

export const AdminCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Commandes administrateur')
        .addSubcommand(subcommand =>
            subcommand
                .setName('addbot')
                .setDescription('Ajouter un nouveau bot Fortnite')
                .addStringOption(option => option.setName('pseudo').setDescription('Pseudo').setRequired(true))
                .addStringOption(option => option.setName('email').setDescription('Email').setRequired(true))
                .addStringOption(option => option.setName('password').setDescription('Mot de passe').setRequired(true))
                .addStringOption(option => option.setName('device_id').setDescription('Device ID').setRequired(true))
                .addStringOption(option => option.setName('account_id').setDescription('Account ID').setRequired(true))
                .addStringOption(option => option.setName('secret').setDescription('Secret').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('sac-all')
                .setDescription('Définit le code créateur sur tous les utilisateurs connectés via /login')
                .addStringOption(option => option.setName('code').setDescription('Code créateur (défaut: aeroz)').setRequired(false))
        ) as any,

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        // Vérification admin
        if (!ADMIN_IDS.includes(interaction.user.id)) {
            console.warn(`[Security] Unauthorized admin attempt from ${interaction.user.tag} (${interaction.user.id})`);
            await interaction.reply({
                content: '🔒 Vous n\'avez pas la permission d\'utiliser cette commande.',
                ephemeral: true
            });
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'addbot') {
            await interaction.deferReply({ ephemeral: true });

            const newBot = {
                pseudo: interaction.options.getString('pseudo', true),
                email: interaction.options.getString('email', true),
                password: interaction.options.getString('password', true),
                deviceAuth: {
                    deviceId: interaction.options.getString('device_id', true),
                    accountId: interaction.options.getString('account_id', true),
                    secret: interaction.options.getString('secret', true)
                }
            };

            try {
                console.log(`[Admin] ${interaction.user.tag} adding bot: ${newBot.pseudo}`);
                await context.botManager.addNewBot(newBot);
                await interaction.editReply(`✅ Bot **${newBot.pseudo}** ajouté et lancé avec succès !`);
                console.log(`[Admin] ✅ Bot ${newBot.pseudo} added successfully`);
            } catch (e: any) {
                console.error(`[Admin] ❌ Failed to add bot ${newBot.pseudo}:`, e.message);
                await interaction.editReply(`❌ Erreur lors de l'ajout du bot: ${e.message}`);
            }
        } else if (subcommand === 'sac-all') {
            await interaction.deferReply({ ephemeral: true });

            const code = interaction.options.getString('code') || 'aeroz';
            console.log(`[Admin] ${interaction.user.tag} setting affiliate code "${code}" on all users logged in via /login`);

            const { success, failed } = await context.userManager.setAffiliateForAllUsers(code);

            const lines = [`✅ Code créateur **${code}** appliqué à **${success.length}** utilisateur(s) connecté(s) via /login.`];
            if (failed.length > 0) {
                lines.push(`❌ Échec sur ${failed.length} utilisateur(s):`);
                lines.push(...failed.slice(0, 15).map(f => `  • ${f.discordId}: ${f.reason}`));
                if (failed.length > 15) lines.push(`  ... et ${failed.length - 15} autre(s)`);
            }

            await interaction.editReply(lines.join('\n'));
        }
    }
};
