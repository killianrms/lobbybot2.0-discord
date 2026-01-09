import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { BotManager } from './BotManager';

export class DiscordManager {
    private client: Client;
    private botManager: BotManager;

    constructor(botManager: BotManager) {
        this.botManager = botManager;
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
        
        // SLASH COMMAND REGISTRATION ON READY
        this.client.on('ready', async () => {
             const commands = [
                new SlashCommandBuilder()
                    .setName('add')
                    .setDescription('Ajouter un bot en ami')
                    .addStringOption(option => 
                        option.setName('pseudo')
                            .setDescription('Votre pseudo Epic Games')
                            .setRequired(true))
            ];
            
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

            if (interaction.commandName === 'add') {
                const target = interaction.options.getString('pseudo');
                if (!target) return;

                await interaction.deferReply();

                const result = await this.botManager.addFriendOnAvailableBot(target);
                
                if (result === 'SUCCESS') {
                    await interaction.editReply(`✅ Demande d'ami envoyée à **${target}** !`);
                } else if (result === 'FULL') {
                    await interaction.editReply(`⚠️ Tous les bots sont pleins (+900 amis). Demandez à <@335755692134891520> !`);
                } else {
                    await interaction.editReply(`❌ Erreur technique. Impossible d'ajouter **${target}**.`);
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
