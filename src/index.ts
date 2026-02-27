import 'dotenv/config';
import { BotManager } from './managers/BotManager';
import { CSVManager } from './managers/CSVManager';
import { DatabaseManager } from './managers/DatabaseManager';
import { DiscordManager } from './managers/DiscordManager';
import { SocketManager } from './managers/SocketManager';
import { UserManager } from './managers/UserManager';
import { APIManager } from './managers/APIManager';

async function main() {
    console.log('╔════════════════════════════════════════╗');
    console.log('║   Fortnite Multi-Bot Manager (DB)      ║');
    console.log('╚════════════════════════════════════════╝');

    // 1. Initialize Managers
    const csvManager = new CSVManager();
    const dbManager = new DatabaseManager(csvManager);
    await dbManager.init();
    const botManager = new BotManager(dbManager);
    const userManager = new UserManager(dbManager);
    const apiManager = new APIManager();

    // Corrected arg order: BotManager first, then URL
    const socketManager = new SocketManager(
        botManager,
        process.env.DASHBOARD_URL || 'http://localhost:3000'
    );

    // Connect socket
    socketManager.connect();

    const discordManager = new DiscordManager(botManager, userManager, apiManager);

    // 2. Start Services
    await botManager.launchAllBots();
    botManager.startPolling(30000); // sync DB every 30s
    await discordManager.start(process.env.DISCORD_TOKEN || '');
}

main().catch(console.error);
