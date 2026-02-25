import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
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
            if (!interaction.isChatInputCommand()) return;

            const commandName = interaction.commandName;

            // LOAD LANGUAGE FROM DB
            const userLang = await this.userManager.getLanguage(interaction.user.id);

            const command = CommandList.find(c => c.data.name === commandName);

            if (command) {
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
