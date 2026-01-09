/**
 * API Helper pour gérer les bots de manière programmatique
 * Ce fichier peut être importé dans un serveur Express/Fastify plus tard
 */

import { csvManager, botManager } from './index';
import { BotAccount } from './types';

export class BotAPI {
    /**
     * Ajoute un nouveau compte et lance le bot
     */
    static async addAndLaunchBot(account: BotAccount): Promise<void> {
        await csvManager.addAccount(account);
        await botManager.launchBot(account);
    }

    /**
     * Arrête et supprime un bot
     */
    static async stopAndRemoveBot(email: string): Promise<void> {
        await botManager.stopBot(email);
        await csvManager.removeAccount(email);
    }

    /**
     * Relance un bot spécifique
     */
    static async restartBot(email: string): Promise<void> {
        const bot = botManager.getBot(email);
        if (!bot) {
            throw new Error(`Bot ${email} non trouvé`);
        }

        await botManager.stopBot(email);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Attendre 2s
        await botManager.launchBot(bot.account);
    }

    /**
     * Obtient le statut de tous les bots
     */
    static async getBotStatus(): Promise<Array<{
        email: string;
        pseudo?: string;
        isConnected: boolean;
        hasDeviceAuth: boolean;
    }>> {
        const accounts = await csvManager.readAccounts();
        const activeBots = botManager.getActiveBots();

        return accounts.map(account => {
            const activeBot = activeBots.find(b => b.account.email === account.email);

            return {
                email: account.email,
                pseudo: account.pseudo,
                isConnected: activeBot?.isConnected || false,
                hasDeviceAuth: !!account.deviceAuth,
            };
        });
    }

    /**
     * Lance tous les bots qui ne sont pas déjà lancés
     */
    static async launchInactiveBots(): Promise<void> {
        const accounts = await csvManager.readAccounts();
        const activeBots = botManager.getActiveBots();

        for (const account of accounts) {
            const isActive = activeBots.some(b => b.account.email === account.email);
            if (!isActive) {
                await botManager.launchBot(account);
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
    }

    /**
     * Obtient le nombre de bots actifs
     */
    static getActiveBotCount(): number {
        return botManager.getActiveBots().length;
    }

    /**
     * Obtient un bot spécifique
     */
    static getBot(email: string) {
        return botManager.getBot(email);
    }
}

export default BotAPI;
