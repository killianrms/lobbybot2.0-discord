import { Client, GatewayIntentBits } from 'discord.js';
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
                
                const success = await this.botManager.addFriendOnAvailableBot(target);
                
                if (success) {
                    message.reply(`✅ Demande d'ami envoyée à **${target}** !`);
                } else {
                    message.reply(`❌ Impossible d'ajouter **${target}**. Aucun bot disponible ou erreur.`);
                }
            }
        });
    }
}
