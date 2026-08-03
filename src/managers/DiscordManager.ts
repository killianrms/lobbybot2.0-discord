import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle, ActivityType } from 'discord.js';
import { BotManager } from './BotManager';
import { UserManager } from './UserManager';
import { APIManager } from './APIManager';
import { getTranslation } from '../utils/locales';
import { CommandList } from '../commands';
import { sendAlert } from '../utils/AlertManager';
import { DatabaseManager } from './DatabaseManager';
import { GeneratorManager } from './GeneratorManager';
import { BackupManager } from './BackupManager';
import { PREMIUM_SKU_ID, PREMIUM_ROLE_ID } from '../config/premium';

export class DiscordManager {
    private client: Client;
    private botManager: BotManager;
    private userManager: UserManager;
    private apiManager: APIManager;
    private dbManager: DatabaseManager;
    private generatorManager: GeneratorManager;
    private backupManager: BackupManager;
    private cooldowns: Map<string, number> = new Map();
    private readonly COOLDOWN_MS = 3000; // 3 secondes entre commandes

    constructor(botManager: BotManager, userManager: UserManager, apiManager: APIManager, dbManager: DatabaseManager, generatorManager: GeneratorManager, backupManager: BackupManager) {
        this.botManager = botManager;
        this.userManager = userManager;
        this.apiManager = apiManager;
        this.dbManager = dbManager;
        this.generatorManager = generatorManager;
        this.backupManager = backupManager;
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers
            ]
        });
    }

    public async start(token: string): Promise<void> {
        this.setupEvents();
        try {
            await this.client.login(token);
            console.log(`🤖 Discord Bot Connected as ${this.client.user?.tag}`);
            this.startPresenceUpdates();
        } catch (e) {
            console.error('❌ Failed to login to Discord:', e);
        }
    }

    /**
     * Statut du bot Discord rafraîchi en continu : "🤖 X/Y bots en ligne".
     * Un bot ne peut pas avoir de bouton cliquable dans sa présence (limitation
     * Discord) — le lien du serveur vit dans le "À propos" du profil de l'app.
     * On n'envoie la mise à jour que si le compteur change, pour ne pas spammer
     * la gateway (limite ~5 presence updates / 20s).
     */
    private startPresenceUpdates(intervalMs: number = 30_000): void {
        let last = '';
        const update = () => {
            const { online, total } = this.botManager.getFleetCounts();
            const state = `🤖 ${online}/${total} bots en ligne`;
            if (state === last) return;
            last = state;
            this.client.user?.setPresence({
                status: online > 0 ? 'online' : 'idle',
                activities: [{ type: ActivityType.Custom, name: 'lobbybot', state }],
            });
        };
        update();
        setInterval(update, intervalMs);
    }

    private async getUserLang(userId: string): Promise<string> {
        try {
            return await Promise.race([
                this.userManager.getLanguage(userId),
                new Promise<string>((resolve) => setTimeout(() => resolve('en'), 3000))
            ]);
        } catch {
            return 'en';
        }
    }

    private checkCooldown(userId: string): boolean {
        const now = Date.now();
        const lastUsed = this.cooldowns.get(userId);

        if (lastUsed && now - lastUsed < this.COOLDOWN_MS) {
            return false; // En cooldown
        }

        this.cooldowns.set(userId, now);
        return true; // Peut utiliser
    }

    private setupEvents(): void {

        // Prevent unhandled error events from crashing the process
        this.client.on('error', (error) => {
            console.error('[Discord] Client error:', error.message);
            sendAlert('discord-client-error', '🔴 Erreur du client Discord', `\`\`\`${error.message}\`\`\``, 'critical');
        });

        this.client.on('shardDisconnect', (event, shardId) => {
            console.error(`[Discord] Shard ${shardId} déconnecté:`, event.code, event.reason);
            sendAlert('discord-shard-disconnect', '🔴 Bot Discord déconnecté', `Shard ${shardId} déconnecté (code ${event.code}).`, 'critical');
        });

        // SLASH COMMAND REGISTRATION ON READY
        this.client.on('clientReady', async () => {
            const commands = CommandList.map(c => c.data);

            const rest = new REST({ version: '10' }).setToken(this.client.token || '');

            try {
                if (this.client.user) {
                    // Enregistrement par guild = quasi instantané (vs jusqu'à 1h pour le global).
                    // GUILD_ID en .env force une guild précise ; sinon, si le bot n'est que sur
                    // un seul serveur, on l'utilise automatiquement. Fallback sur le global sinon.
                    const guildId = process.env.GUILD_ID || (this.client.guilds.cache.size === 1 ? this.client.guilds.cache.first()!.id : null);

                    if (guildId) {
                        await rest.put(
                            Routes.applicationGuildCommands(this.client.user.id, guildId),
                            { body: commands },
                        );
                        // Vide les commandes globales pour éviter les doublons si on en avait
                        // enregistré avant de passer en mode guild.
                        await rest.put(Routes.applicationCommands(this.client.user.id), { body: [] });
                        console.log(`✅ Slash Commands registered (guild ${guildId}, instantané)!`);
                    } else {
                        await rest.put(
                            Routes.applicationCommands(this.client.user.id),
                            { body: commands },
                        );
                        console.log('✅ Slash Commands registered (global, jusqu\'à 1h de propagation)!');
                    }
                }
            } catch (error: any) {
                console.error('❌ Failed to register slash commands:', error);
                sendAlert('slash-commands-registration', '🔴 Échec d\'enregistrement des commandes Discord', `\`\`\`${error.message}\`\`\``, 'critical');
            }
        });

        // INTERACTION HANDLER
        this.client.on('interactionCreate', async (interaction) => {

            // --- BOUTONS ---
            if (interaction.isButton()) {
                if (interaction.customId === 'login_enter_code') {
                    const lang = await this.getUserLang(interaction.user.id);
                    const t = (key: string) => getTranslation(lang, key);

                    const modal = new ModalBuilder()
                        .setCustomId('login_modal')
                        .setTitle(t('LOGIN_MODAL_TITLE'));

                    const codeInput = new TextInputBuilder()
                        .setCustomId('login_code_input')
                        .setLabel(t('LOGIN_MODAL_LABEL'))
                        .setPlaceholder(t('LOGIN_MODAL_PLACEHOLDER'))
                        .setStyle(TextInputStyle.Short)
                        .setMinLength(10)
                        .setMaxLength(64)
                        .setRequired(true);

                    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(codeInput));
                    await interaction.showModal(modal);
                }
                return;
            }

            // --- MODALS ---
            if (interaction.isModalSubmit()) {
                if (interaction.customId === 'login_modal') {
                    await interaction.deferReply({ ephemeral: true });

                    const lang = await this.getUserLang(interaction.user.id);
                    const t = (key: string) => getTranslation(lang, key);

                    const code = interaction.fields.getTextInputValue('login_code_input').trim();
                    const result = await this.userManager.handleLogin(interaction.user.id, code);

                    if (result.startsWith('SUCCESS')) {
                        const pseudo = result.split(':')[1];
                        await interaction.editReply(
                            t('LOGIN_MODAL_SUCCESS').replace('{pseudo}', pseudo)
                        );
                    } else {
                        const reason = result.split(':').slice(1).join(':') || result;
                        await interaction.editReply(
                            t('LOGIN_MODAL_ERROR').replace('{reason}', reason)
                        );
                    }
                }
                return;
            }

            // --- AUTOCOMPLETE (listes déroulantes dynamiques : /skin, /invite…) ---
            if (interaction.isAutocomplete()) {
                const command = CommandList.find(c => c.data.name === interaction.commandName);
                if (command?.autocomplete) {
                    try {
                        await command.autocomplete(interaction, {
                            botManager: this.botManager,
                            userManager: this.userManager,
                            apiManager: this.apiManager,
                            dbManager: this.dbManager,
                            generatorManager: this.generatorManager,
                            backupManager: this.backupManager
                        });
                    } catch (e) {
                        console.error('[Discord] Autocomplete error:', e);
                        try { await interaction.respond([]); } catch {}
                    }
                }
                return;
            }

            // --- SLASH COMMANDS ---
            if (!interaction.isChatInputCommand()) return;

            // Skip stale interactions (queued during restart, already expired)
            if (Date.now() - interaction.createdTimestamp > 2500) return;

            const command = CommandList.find(c => c.data.name === interaction.commandName);
            if (!command) return;

            // Rate limiting (sauf pour /ping et /help)
            if (!['ping', 'help'].includes(interaction.commandName)) {
                if (!this.checkCooldown(interaction.user.id)) {
                    try {
                        await interaction.reply({
                            content: '⏱️ Ralentis ! Attends 3 secondes entre chaque commande.\n⏱️ Slow down! Wait 3 seconds between commands.',
                            flags: 64
                        });
                    } catch {}
                    return;
                }
            }

            // Fetch language with a timeout to preserve the 3s deferReply window
            const userLang = await this.getUserLang(interaction.user.id);

            try {
                await command.execute(interaction, {
                    botManager: this.botManager,
                    userManager: this.userManager,
                    apiManager: this.apiManager,
                    dbManager: this.dbManager,
                    generatorManager: this.generatorManager,
                    backupManager: this.backupManager
                }, userLang);
            } catch (error) {
                console.error('[Discord] Command error:', error);
                try {
                    const errMsg = userLang === 'fr'
                        ? '❌ Une erreur est survenue lors de l\'exécution de cette commande.'
                        : '❌ An error occurred while executing this command.';
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp({ content: errMsg, flags: 64 });
                    } else {
                        await interaction.reply({ content: errMsg, flags: 64 });
                    }
                } catch {
                    // Interaction expired, nothing we can do
                }
            }
        });

        // PREMIUM ENTITLEMENT SYNC (Discord App Subscriptions)
        const syncRole = async (userId: string, add: boolean) => {
            if (!PREMIUM_ROLE_ID) return;
            try {
                for (const [, guild] of this.client.guilds.cache) {
                    const member = await guild.members.fetch(userId).catch(() => null);
                    if (!member) continue;
                    if (add) await member.roles.add(PREMIUM_ROLE_ID);
                    else await member.roles.remove(PREMIUM_ROLE_ID);
                }
            } catch (e: any) {
                console.error(`[Premium] Sync rôle (${add ? 'add' : 'remove'}) échouée pour ${userId}: ${e.message}`);
            }
        };

        const isOurSku = (ent: any) => !PREMIUM_SKU_ID || ent.skuId === PREMIUM_SKU_ID;

        this.client.on('entitlementCreate', async (ent: any) => {
            if (!ent.userId || !isOurSku(ent)) return;
            const expiresAt = ent.endsTimestamp ? new Date(ent.endsTimestamp).toISOString() : null;
            await this.dbManager.grantPremium(ent.userId, 'discord', expiresAt);
            await syncRole(ent.userId, true);
            console.log(`[Premium] ✅ Entitlement créé pour ${ent.userId}`);
        });

        this.client.on('entitlementUpdate', async (_old: any, ent: any) => {
            if (!ent.userId || !isOurSku(ent)) return;
            const expiresAt = ent.endsTimestamp ? new Date(ent.endsTimestamp).toISOString() : null;
            // endsTimestamp dans le passé = abonnement terminé/annulé
            if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
                await this.dbManager.revokePremium(ent.userId);
                await syncRole(ent.userId, false);
                console.log(`[Premium] ⏹️ Entitlement expiré pour ${ent.userId}`);
            } else {
                await this.dbManager.grantPremium(ent.userId, 'discord', expiresAt);
                await syncRole(ent.userId, true);
                console.log(`[Premium] 🔄 Entitlement renouvelé pour ${ent.userId}`);
            }
        });

        this.client.on('entitlementDelete', async (ent: any) => {
            if (!ent.userId || !isOurSku(ent)) return;
            await this.dbManager.revokePremium(ent.userId);
            await syncRole(ent.userId, false);
            console.log(`[Premium] 🗑️ Entitlement supprimé pour ${ent.userId}`);
        });

        // LEGACY MESSAGE HANDLER (Keeping it as backup)
        this.client.on('messageCreate', async (message) => {
            if (message.author.bot) return;

            if (message.content.startsWith('!add')) {
                const args = message.content.split(' ');
                const target = args[1];

                if (!target) {
                    message.reply('Usage: `!add <EpicUsername>`');
                    return;
                }

                message.channel.send(`🔄 Traitement de l'ajout pour **${target}**...`);

                const result = await this.botManager.addFriendOnAvailableBot(target);

                if (result === 'SUCCESS') {
                    message.reply(`✅ Demande d'ami envoyée à **${target}** !`);
                } else if (result === 'FULL') {
                    message.reply(`⚠️ Tous les bots sont pleins (+900 amis). Merci de demander à <@335755692134891520> d'ajouter des bots !`);
                } else {
                    message.reply(`❌ Erreur technique. Impossible d'ajouter **${target}**. (Aucun bot connecté ?) . `);
                }
            }
        });
    }
}
