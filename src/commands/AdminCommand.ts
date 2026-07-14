import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import axios from 'axios';
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
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('backup')
                .setDescription('Exporte toute la BD (bots + users) en JSON')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('restore')
                .setDescription('Réimporte un fichier JSON exporté par /admin backup (upsert, ne supprime rien)')
                .addAttachmentOption(option => option.setName('fichier').setDescription('Le fichier backup-*.json').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('createbot')
                .setDescription('Génère N bots Fortnite pour la flotte (sans limite, pas de propriétaire)')
                .addIntegerOption(option => option.setName('count').setDescription('Nombre de bots à créer (défaut: 1)').setRequired(false).setMinValue(1))
                .addStringOption(option => option.setName('pseudo').setDescription('Suffixe du pseudo (défaut: celui configuré via /admin config)').setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('config')
                .setDescription('Configure le générateur de comptes (persistant) — sans argument, affiche la config actuelle')
                .addStringOption(option => option.setName('pseudo').setDescription('Suffixe de pseudo par défaut').setRequired(false))
                .addIntegerOption(option => option.setName('digits').setDescription('Nombre de chiffres aléatoires avant le pseudo').setRequired(false).setMinValue(0))
                .addStringOption(option => option.setName('email').setDescription('Email Gmail (Dot Trick) à utiliser').setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('premium')
                .setDescription('Accorder ou retirer le premium à un utilisateur (test/manuel)')
                .addUserOption(option => option.setName('user').setDescription('Membre Discord').setRequired(true))
                .addStringOption(option => option.setName('action').setDescription('grant ou revoke').setRequired(true)
                    .addChoices({ name: 'grant', value: 'grant' }, { name: 'revoke', value: 'revoke' }))
                .addIntegerOption(option => option.setName('jours').setDescription('Durée en jours (grant seulement ; vide = illimité)').setRequired(false).setMinValue(1))
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
        } else if (subcommand === 'backup') {
            await interaction.deferReply({ ephemeral: true });

            try {
                const filePath = await context.backupManager.writeBackup();
                console.log(`[Admin] ${interaction.user.tag} triggered a manual backup: ${filePath}`);
                // Le fichier reste sur le serveur (pas envoyé sur Discord) : il contient des
                // credentials Fortnite en clair, autant limiter son exposition au strict minimum.
                await interaction.editReply(`✅ Backup créé sur le serveur : \`${filePath}\``);
            } catch (e: any) {
                console.error('[Admin] ❌ Backup failed:', e.message);
                await interaction.editReply(`❌ Erreur lors du backup: ${e.message}`);
            }
        } else if (subcommand === 'restore') {
            await interaction.deferReply({ ephemeral: true });

            const attachment = interaction.options.getAttachment('fichier', true);

            try {
                const response = await axios.get(attachment.url, { responseType: 'json', timeout: 15_000 });
                const dump = response.data;

                if (!dump || (!Array.isArray(dump.epic_accounts) && !Array.isArray(dump.users))) {
                    await interaction.editReply('❌ Fichier invalide : format backup attendu (`epic_accounts` / `users`).');
                    return;
                }

                console.log(`[Admin] ${interaction.user.tag} restoring from ${attachment.name}`);
                const { bots, users } = await context.dbManager.importRaw(dump);

                // Relance tout bot restauré qui ne tourne pas déjà
                const accounts = await context.dbManager.getAllBots();
                for (const account of accounts) {
                    await context.botManager.launchBot(account);
                }

                await interaction.editReply(`✅ Restauration terminée : **${bots}** bot(s) et **${users}** utilisateur(s) réimportés.`);
            } catch (e: any) {
                console.error('[Admin] ❌ Restore failed:', e.message);
                await interaction.editReply(`❌ Erreur lors de la restauration: ${e.message}`);
            }
        } else if (subcommand === 'createbot') {
            const pseudoSuffix = interaction.options.getString('pseudo')?.trim() || undefined;
            const count = interaction.options.getInteger('count') || 1;

            await interaction.deferReply({ ephemeral: true });

            const label = pseudoSuffix ? `"${pseudoSuffix}"` : '(pseudo par défaut configuré)';
            const position = context.generatorManager.queueLength();
            await interaction.editReply(
                position > 0
                    ? `🔧 Batch de **${count}** bot(s) ${label} mis en file (${position} devant). Ça peut prendre du temps, je t'envoie un DM une fois fini.`
                    : `🔧 Génération de **${count}** bot(s) ${label} en cours... Ça peut prendre du temps, je t'envoie un DM une fois fini.`
            );

            console.log(`[Admin] ${interaction.user.tag} requesting ${count} fleet bot(s) with pseudo ${label}`);

            // Pas de discordId propriétaire : ce sont des bots de flotte, pas de limite 1-par-personne.
            const result = await context.generatorManager.requestBots(null, pseudoSuffix, count);

            const lines = [`✅ **${result.successes.length}/${count}** bot(s) créé(s) et lancé(s) : ${result.successes.map(s => s.pseudo).join(', ') || 'aucun'}`];
            if (result.failed > 0) {
                lines.push(`❌ ${result.failed} échec(s)${result.reason ? ` (${result.reason})` : ''}`);
            }
            const message = lines.join('\n');

            try {
                await interaction.user.send(message);
            } catch {
                // DMs fermés — le editReply ci-dessous est le fallback si le token est encore valide
            }
            try {
                await interaction.editReply(message);
            } catch {
                // Token expiré (batch trop long) — le DM ci-dessus est le fallback fiable
            }
        } else if (subcommand === 'config') {
            await interaction.deferReply({ ephemeral: true });

            const pseudo = interaction.options.getString('pseudo')?.trim();
            const digits = interaction.options.getInteger('digits');
            const email = interaction.options.getString('email')?.trim();

            const changes: string[] = [];

            if (pseudo) {
                const r = context.generatorManager.setDefaultPseudo(pseudo);
                changes.push(r.ok ? `✅ Pseudo par défaut → **${pseudo}**` : `❌ Pseudo: ${r.output}`);
            }
            if (digits !== null) {
                const r = context.generatorManager.setDigits(digits);
                changes.push(r.ok ? `✅ Chiffres avant le pseudo → **${digits}**` : `❌ Digits: ${r.output}`);
            }
            if (email) {
                const r = context.generatorManager.setGmailAddress(email);
                changes.push(r.ok
                    ? `✅ Email Gmail → **${email}**\n⚠️ Si ce n'est pas juste une variante à points du même compte, relance \`--setup-gmail\` sur la machine pour le mot de passe d'application.`
                    : `❌ Email: ${r.output}`);
            }

            console.log(`[Admin] ${interaction.user.tag} updated generator config: ${changes.join(' | ') || 'no changes'}`);

            const stats = context.generatorManager.getStats();
            const lines = [...changes];
            if (changes.length > 0) lines.push('');
            lines.push('**Config actuelle du générateur :**');
            if (stats.ok) {
                lines.push(
                    `Gmail: \`${stats.stats.gmail}\``,
                    `Pseudo par défaut: \`${stats.stats.pseudo}\``,
                    `Chiffres: \`${stats.stats.digits}\``,
                    `Variations restantes: ${stats.stats.variations_remaining}/${stats.stats.variations_total}`,
                    `Comptes en BD: ${stats.stats.db_total} (actifs: ${stats.stats.db_active})`
                );
            } else {
                lines.push(`❌ Impossible de lire les stats: ${stats.output}`);
            }

            await interaction.editReply(lines.join('\n'));
        } else if (subcommand === 'premium') {
            await interaction.deferReply({ ephemeral: true });

            const target = interaction.options.getUser('user', true);
            const action = interaction.options.getString('action', true);
            if (action === 'revoke') {
                context.dbManager.revokePremium(target.id);
                await interaction.editReply(`✅ Premium retiré à ${target.tag}.`);
                return;
            }
            const jours = interaction.options.getInteger('jours');
            const expiresAt = jours ? new Date(Date.now() + jours * 86400_000).toISOString() : null;
            context.dbManager.grantPremium(target.id, 'manual', expiresAt);
            await interaction.editReply({
                content: `✅ Premium accordé à ${target.tag}${jours ? ` pour ${jours} jour(s)` : ' (illimité)'}.`
            });
            return;
        }
    }
};
