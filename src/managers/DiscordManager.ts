import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
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

    private async getUserLang(userId: string): Promise<string> {
        try {
            return await Promise.race([
                this.userManager.getLanguage(userId),
                new Promise<string>((resolve) => setTimeout(() => resolve('en'), 1500))
            ]);
        } catch {
            return 'en';
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

            // --- SLASH COMMANDS ---
            if (!interaction.isChatInputCommand()) return;

            // Skip stale interactions (queued during restart, already expired)
            if (Date.now() - interaction.createdTimestamp > 2500) return;

            const command = CommandList.find(c => c.data.name === interaction.commandName);
            if (!command) return;

            // Fetch language with a timeout to preserve the 3s deferReply window
            const userLang = await this.getUserLang(interaction.user.id);

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
