import 'dotenv/config';
import { BotManager } from './managers/BotManager';
import { CSVManager } from './managers/CSVManager';
import { DatabaseManager } from './managers/DatabaseManager';
import { DiscordManager } from './managers/DiscordManager';
import { SocketManager } from './managers/SocketManager';
import { UserManager } from './managers/UserManager';
import { APIManager } from './managers/APIManager';
import { GeneratorManager } from './managers/GeneratorManager';
import { BackupManager } from './managers/BackupManager';
import { sendAlert } from './utils/AlertManager';

// Filet de sécurité : capture tout ce qui n'est pas géré ailleurs (DB, Discord, Fortnite...)
// et prévient sur le webhook au lieu de laisser le process planter en silence.
process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught Exception:', err);
    sendAlert('uncaught-exception', '🔴 Exception non gérée', `\`\`\`${err.stack || err.message}\`\`\``, 'critical');
});

process.on('unhandledRejection', (reason: any) => {
    console.error('[FATAL] Unhandled Rejection:', reason);
    sendAlert('unhandled-rejection', '🔴 Promise rejetée non gérée', `\`\`\`${reason?.stack || String(reason)}\`\`\``, 'critical');
});

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
    const generatorManager = new GeneratorManager(dbManager, botManager);
    const backupManager = new BackupManager(dbManager);

    // Corrected arg order: BotManager first, then URL
    const socketManager = new SocketManager(
        botManager,
        process.env.DASHBOARD_URL || 'http://localhost:3000'
    );

    // Connect socket
    socketManager.connect();

    const discordManager = new DiscordManager(botManager, userManager, apiManager, dbManager, generatorManager, backupManager);

    // 2. Start Services
    await botManager.refreshOwnerSettings(); // config par owner AVANT le lancement des bots
    await botManager.launchAllBots();

    // Sync dashboard after all bots are up, then every 30s
    socketManager.sendLogin();
    socketManager.startPeriodicUpdates();

    // Check DB every 5min for new bots added externally
    botManager.startDBSync();
    botManager.startHealthCheck();
    backupManager.startAutoBackup();

    await discordManager.start(process.env.DISCORD_TOKEN || '');
}

main().catch((err) => {
    console.error(err);
    sendAlert('main-crash', '🔴 Crash au démarrage du bot', `\`\`\`${err.stack || err.message}\`\`\``, 'critical');
});
