const { Client, GatewayIntentBits } = require('discord.js');
const SocketManager = require('./src/managers/SocketManager');
require('dotenv').config();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const config = { dashboardUrl: 'http://localhost:3000' };

const socketManager = new SocketManager(client, config);

client.once('ready', () => {
    console.log(`🤖 Discord Bot Logged in as ${client.user.tag}`);
    socketManager.connect();
});

client.on('messageCreate', async message => {
    // Simple command handler for !add
    if (message.content.startsWith('!add')) {
        const target = message.content.split(' ')[1];
        if (target) {
            socketManager.requestAddFriend(target, message.author.id);
            message.reply(`Demande d'ajout pour **${target}** envoyée au dashboard ! ⏳`);
        } else {
            message.reply('Usage: !add <EpicUsername>');
        }
    }
});

const token = process.env.DISCORD_TOKEN || 'YOUR_TOKEN_HERE';
if (token === 'YOUR_TOKEN_HERE') {
    console.log('⚠️ Please set DISCORD_TOKEN in .env or hardcode it.');
} else {
    client.login(token);
}
