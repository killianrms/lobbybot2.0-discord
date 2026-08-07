import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import axios from 'axios';
import { Command, CommandContext } from './Command';
import { fernetEncrypt, hasMasterKey } from '../utils/Fernet';
import { parseAccountsFile } from '../utils/AccountsFileParser';

// Charger les IDs admin depuis .env (séparés par des virgules)
// Les admins vivent dans la table `admins` (Postgres) ; ADMIN_IDS du .env
// reste un fallback de secours géré par DatabaseManager.getAdminIds().

export const AdminCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Commandes administrateur')
        // Invisible pour les membres ordinaires : seuls les administrateurs du
        // serveur la voient par défaut ; accordable à ton frère/neveu via
        // Paramètres du serveur → Intégrations → LobbyBot → /admin.
        // La vraie autorisation reste le contrôle en base (table admins) au début
        // d'execute() — ceci ne fait que cacher la commande de l'UI.
        .setDefaultMemberPermissions('0')
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('addbot')
                .setDescription('Importer des bots depuis un fichier du générateur — JSON ou texte (upsert, owner = toi)')
                .addAttachmentOption(option => option.setName('fichier').setDescription('JSON du générateur, ou .txt avec email / DEVICE_ID / ACCOUNT_ID / SECRET').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('mybots')
                .setDescription('Liste uniquement TES bots (owner = toi), contrairement à /listbots qui montre tout')
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
        if (!(await context.dbManager.isAdmin(interaction.user.id))) {
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

            const attachment = interaction.options.getAttachment('fichier', true);
            if (attachment.size > 5 * 1024 * 1024) {
                await interaction.editReply('❌ Fichier trop volumineux (max 5 Mo).');
                return;
            }

            try {
                // `responseType: 'text'` et pas 'json' : c'est le parser qui décide
                // du format. Avec 'json', axios rendait un .txt sous forme de chaîne
                // brute, qui finissait « rejetée — device auth incomplet » alors que
                // le fichier était parfaitement valide.
                const response = await axios.get(attachment.url, { responseType: 'text', timeout: 15_000, transformResponse: [(d) => d] });
                const { entries: parsed, rejected, format } = parseAccountsFile(String(response.data ?? ''));

                const entries = parsed.map(a => ({
                    email: a.email,
                    pseudo: a.pseudo ?? undefined,
                    // Mot de passe : chiffré Fernet comme le fait le générateur (même clé)
                    password_enc: a.password ? (fernetEncrypt(a.password) ?? undefined) : undefined,
                    deviceId: a.deviceId,
                    accountId: a.accountId,
                    secret: a.secret,
                }));

                if (entries.length === 0) {
                    const lines = [`❌ Aucune entrée valide dans \`${attachment.name}\` (format détecté : **${format}**).`];
                    if (rejected.length > 0) {
                        lines.push('', 'Détail :');
                        lines.push(...rejected.slice(0, 5).map(r => `• \`${r.label}\` → ${r.reason}`));
                        if (rejected.length > 5) lines.push(`• … et ${rejected.length - 5} autre(s)`);
                    } else {
                        lines.push('', 'Aucun champ reconnu. Formats acceptés :',
                            '```',
                            'email: bot@gmail.com',
                            'password: ...',
                            'pseudo: 1.GameBot',
                            'DEVICE_ID=...',
                            'ACCOUNT_ID=...',
                            'SECRET=...',
                            '```',
                            '…ou le JSON exporté par le générateur.');
                    }
                    await interaction.editReply(lines.join('\n'));
                    return;
                }

                console.log(`[Admin] ${interaction.user.tag} importe ${entries.length} bot(s) (format ${format})`);
                const { inserted, updated } = await context.dbManager.importBots(entries, interaction.user.id);
                const launched = await context.botManager.syncFromDB();

                // Un compte peut être parfaitement écrit dans le fichier et bien
                // enregistré en BD, mais refusé par Epic (device auth révoqué, ban…).
                // On nomme ces comptes-là : sans ça, l'écart entre « créés » et
                // « lancés » ne dit pas LESQUELS n'ont pas démarré.
                const enLigne = new Set(context.botManager.getActiveBots().map((b: any) => b.account.email));
                const nonLances = entries.filter(e => !enLigne.has(e.email));

                const lines = [
                    `✅ Import terminé : **${inserted}** créé(s), **${updated}** mis à jour (owner : <@${interaction.user.id}>).`,
                    `🚀 ${launched} bot(s) lancé(s) immédiatement.`,
                ];
                if (rejected.length > 0) {
                    lines.push(`⚠️ **${rejected.length}** entrée(s) ignorée(s) — fichier incomplet, rien en BD :`);
                    lines.push(...rejected.slice(0, 5).map(r => `• \`${r.label}\` → ${r.reason}`));
                    if (rejected.length > 5) lines.push(`• … et ${rejected.length - 5} autre(s)`);
                }
                if (nonLances.length > 0) {
                    lines.push(`⚠️ **${nonLances.length}** compte(s) en BD mais refusé(s) par Epic (device auth expiré ou compte banni) :`);
                    lines.push(...nonLances.slice(0, 5).map(e => `• \`${e.pseudo || e.email}\``));
                    if (nonLances.length > 5) lines.push(`• … et ${nonLances.length - 5} autre(s)`);
                    lines.push('_Les autres bots ne sont pas affectés._');
                }
                if (entries.some(e => e.password_enc === undefined) && !hasMasterKey()) {
                    lines.push('⚠️ EPIC_MASTER_KEY absente : mots de passe non stockés (device auth importés quand même).');
                }
                await interaction.editReply(lines.join('\n'));
            } catch (e: any) {
                console.error('[Admin] ❌ Import JSON échoué:', e.message);
                await interaction.editReply(`❌ Erreur lors de l'import : ${e.message}`);
            }
        } else if (subcommand === 'mybots') {
            await interaction.deferReply({ ephemeral: true });

            try {
                const owned = await context.dbManager.getBotsByOwner(interaction.user.id);
                if (owned.length === 0) {
                    await interaction.editReply('ℹ️ Aucun bot ne t\'appartient (owner_discord_id). Importe avec `/admin addbot` ou crée avec `/createbot`.');
                    return;
                }
                const online = new Set(
                    context.botManager.getActiveBots().filter((b: any) => b.isConnected).map((b: any) => b.account.email)
                );
                const lines = owned.slice(0, 40).map(b =>
                    `${online.has(b.email) ? '🟢' : '⚫'} **${b.pseudo || b.email}** — \`${b.email}\``
                );
                if (owned.length > 40) lines.push(`… et ${owned.length - 40} autre(s)`);
                await interaction.editReply({
                    embeds: [{
                        title: `🤖 Tes bots (${owned.length})`,
                        description: lines.join('\n'),
                        color: 0x0099ff,
                        footer: { text: '🟢 connecté · ⚫ hors ligne — /listbots montre toute la flotte' },
                    }]
                });
            } catch (e: any) {
                await interaction.editReply(`❌ Erreur : ${e.message}`);
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
                await context.dbManager.revokePremium(target.id);
                await interaction.editReply(`✅ Premium retiré à ${target.tag}.`);
                return;
            }
            const jours = interaction.options.getInteger('jours');
            const expiresAt = jours ? new Date(Date.now() + jours * 86400_000).toISOString() : null;
            await context.dbManager.grantPremium(target.id, 'manual', expiresAt);
            await interaction.editReply({
                content: `✅ Premium accordé à ${target.tag}${jours ? ` pour ${jours} jour(s)` : ' (illimité)'}.`
            });
            return;
        }
    }
};
