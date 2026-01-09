import 'dotenv/config';
import { BotManager } from './managers/BotManager';
import { CSVManager } from './managers/CSVManager';
import { DatabaseManager } from './managers/DatabaseManager';
import { DiscordManager } from './managers/DiscordManager';
import { SocketManager } from './managers/SocketManager';

async function main() {
    console.log('╔════════════════════════════════════════╗');
    console.log('║   Fortnite Multi-Bot Manager (DB)      ║');
    console.log('╚════════════════════════════════════════╝');

    // 1. Initialize Managers
    const csvManager = new CSVManager();
    const dbManager = new DatabaseManager(csvManager); 
    const botManager = new BotManager(dbManager);
    
    // Corrected arg order: BotManager first, then URL
    const socketManager = new SocketManager(
        botManager,
        process.env.DASHBOARD_URL || 'http://localhost:3000'
    );
    
    // Connect socket
    socketManager.connect();
    
    const discordManager = new DiscordManager(botManager);

    // 2. Start Services
    await botManager.launchAllBots();
    await discordManager.start(process.env.DISCORD_TOKEN || '');
}

main().catch(console.error);
