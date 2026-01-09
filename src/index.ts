import { CSVManager } from './managers/CSVManager';
import { BotManager } from './managers/BotManager';
import { AdminManager } from './managers/AdminManager';

// Initialisation
const csvManager = new CSVManager();
const adminManager = new AdminManager();
const botManager = new BotManager(csvManager, adminManager);

// Fonction principale
async function main() {
    console.log('╔════════════════════════════════════════╗');
    console.log('║   Fortnite Multi-Bot Manager          ║');
    console.log('╚════════════════════════════════════════╝\n');

    try {
        // Lancer tous les bots
        await botManager.launchAllBots();

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
