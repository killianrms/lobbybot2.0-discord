import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } from 'discord.js';
import { BotManager } from './BotManager';
import { UserManager } from './UserManager';
import { APIManager } from './APIManager';
import { getTranslation } from '../utils/locales';
import { CommandList } from '../commands';

export class DiscordManager {
    private client: Client;
    private botManager: BotManager;
    private userManager: UserManager;
    private apiManager: APIManager;

    constructor(botManager: BotManager, userManager: UserManager, apiManager: APIManager) {
        this.botManager = botManager;
        this.userManager = userManager;
        this.apiManager = apiManager;
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent
            ]
        });
    }

    public async start(token: string): Promise<void> {
        this.setupEvents();
        try {
            await this.client.login(token);
            console.log(`🤖 Discord Bot Connected as ${this.client.user?.tag}`);
        } catch (e) {
            console.error('❌ Failed to login to Discord:', e);
        }
    }

    private setupEvents(): void {

        // Prevent unhandled error events from crashing the process
        this.client.on('error', (error) => {
            console.error('[Discord] Client error:', error.message);
        });

        // SLASH COMMAND REGISTRATION ON READY
        this.client.on('ready', async () => {
            const commands = CommandList.map(c => c.data);

            const rest = new REST({ version: '10' }).setToken(this.client.token || '');

            try {
                if (this.client.user) {
                    await rest.put(
                        Routes.applicationCommands(this.client.user.id),
                        { body: commands },
                    );
                    console.log('✅ Slash Commands registered!');
                }
            } catch (error) {
                console.error('❌ Failed to register slash commands:', error);
            }
        });

        // INTERACTION HANDLER
        this.client.on('interactionCreate', async (interaction) => {

            // --- BUTTON: login_check_device → poll device flow ---
            if (interaction.isButton() && interaction.customId === 'login_check_device') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const lang = await this.userManager.getLanguage(interaction.user.id).catch(() => 'en');
                const t = (key: string) => getTranslation(lang, key);

                const result = await this.userManager.completeDeviceFlow(interaction.user.id);

                if (result.startsWith('SUCCESS')) {
                    const pseudo = result.split(':')[1];
                    await interaction.editReply(t('LOGIN_SUCCESS').replace('{pseudo}', pseudo));
                } else if (result === 'PENDING') {
                    await interaction.editReply(t('LOGIN_PENDING'));
                } else if (result === 'EXPIRED') {
                    await interaction.editReply(t('LOGIN_EXPIRED'));
                } else {
                    await interaction.editReply(t('LOGIN_ERROR').replace('{error}', result.split(':')[1] || ''));
                }
                return;
            }

            // --- BUTTON: login_enter_code → open modal (fallback flow) ---
            if (interaction.isButton() && interaction.customId === 'login_enter_code') {
                // showModal must be called immediately — use Discord locale, no DB query
                const lang = interaction.locale?.startsWith('fr') ? 'fr'
                    : interaction.locale?.startsWith('es') ? 'es'
                    : interaction.locale?.startsWith('de') ? 'de'
                    : 'en';
                const t = (key: string) => getTranslation(lang, key);

                const modal = new ModalBuilder()
                    .setCustomId('login_modal')
                    .setTitle(t('LOGIN_MODAL_TITLE'));

                const codeInput = new TextInputBuilder()
                    .setCustomId('epic_code')
                    .setLabel(t('LOGIN_MODAL_LABEL'))
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder(t('LOGIN_MODAL_PLACEHOLDER'))
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(codeInput));
                await interaction.showModal(modal);
                return;
            }

            // --- MODAL SUBMIT: login_modal → process auth code (fallback flow) ---
            if (interaction.isModalSubmit() && interaction.customId === 'login_modal') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const lang = await this.userManager.getLanguage(interaction.user.id).catch(() => 'en');
                const t = (key: string) => getTranslation(lang, key);

                const code = interaction.fields.getTextInputValue('epic_code').trim();
                const result = await this.userManager.handleLogin(interaction.user.id, code);

                if (result.startsWith('SUCCESS')) {
                    await interaction.editReply(t('LOGIN_SUCCESS').replace('{pseudo}', result.split(':')[1]));
                } else {
                    await interaction.editReply(t('LOGIN_ERROR').replace('{error}', result.split(':')[1] || ''));
                }
                return;
            }

            if (!interaction.isChatInputCommand()) return;

            // Skip stale interactions (queued during restart, already expired)
            if (Date.now() - interaction.createdTimestamp > 1500) return;

            const command = CommandList.find(c => c.data.name === interaction.commandName);
            if (!command) return;

            // Fetch language quickly — short timeout to preserve the 3s deferReply window
            let userLang = 'en';
            try {
                userLang = await Promise.race([
                    this.userManager.getLanguage(interaction.user.id),
                    new Promise<string>((resolve) => setTimeout(() => resolve('en'), 300))
                ]);
            } catch {
                userLang = 'en';
            }

            try {
                await command.execute(interaction, {
                    botManager: this.botManager,
                    userManager: this.userManager,
                    apiManager: this.apiManager
                }, userLang);
            } catch (error) {
                console.error('[Discord] Command error:', error);
                try {
                    const errMsg = 'Une erreur est survenue lors de l\'exécution de cette commande.';
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
