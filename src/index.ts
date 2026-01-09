import { DiscordManager } from './managers/DiscordManager';
import { SocketManager } from './managers/SocketManager';
import dotenv from 'dotenv';
dotenv.config();
import { CSVManager } from './managers/CSVManager';
import { BotManager } from './managers/BotManager';
import { AdminManager } from './managers/AdminManager';

// Initialisation
const csvManager = new CSVManager();
const adminManager = new AdminManager();
const botManager = new BotManager(csvManager, adminManager);
const socketManager = new SocketManager(botManager, process.env.DASHBOARD_URL || 'http://localhost:3000');
const discordManager = new DiscordManager(botManager);

// Fonction principale
async function main() {
    console.log('╔════════════════════════════════════════╗');
    console.log('║   Fortnite Multi-Bot Manager          ║');
    console.log('╚════════════════════════════════════════╝\n');

    try {
        // Lancer tous les bots
        await botManager.launchAllBots();
        socketManager.connect();
        await discordManager.start(process.env.DISCORD_TOKEN || '');

        // Gérer l'arrêt propre
        process.on('SIGINT', async () => {
            console.log('\n\n🛑 Signal d\'arrêt reçu...');
            await botManager.stopAllBots();
            process.exit(0);
        });

    } catch (error: any) {
        console.error('❌ Erreur fatale:', error.message || error);
        process.exit(1);
    }
}

// Lancement
main().catch(console.error);

// Export pour utilisation comme module
export { csvManager, botManager };
