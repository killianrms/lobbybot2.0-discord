import {Client, SendMessageError} from 'fnbr';
import { BotAccount, DeviceAuth } from '../types';
import { CSVManager } from './CSVManager';
import { CosmeticManager } from '../cosmetics/CosmeticManager';
import { AdminManager } from './AdminManager';

export class BotManager {
    private bots: Map<string, any> = new Map();
    private csvManager: CSVManager;
    private cosmeticManagers: Map<string, CosmeticManager> = new Map();
    private sentMessageIds: Map<string, Set<string>> = new Map(); // Map<botEmail, Set<messageId>>
    private adminManager: AdminManager;

    constructor(csvManager: CSVManager, adminManager?: AdminManager) {
        this.csvManager = csvManager;
        this.adminManager = adminManager || new AdminManager();
    }


    /**
     * Tries to add a friend on the first available connected bot with < 900 friends.
     * @param targetUsername The Epic username to add
     * @returns 'SUCCESS', 'ERROR', or 'FULL'
     */
    async addFriendOnAvailableBot(targetUsername: string): Promise<'SUCCESS' | 'ERROR' | 'FULL'> {
        console.log(`[BotManager] Trying to add friend: ${targetUsername}`);
        
        // Find connected bots
        const connectedBots = this.getActiveBots().filter(b => b.isConnected && b.client);

        if (connectedBots.length === 0) {
            console.error('[BotManager] No connected bots available');
            return 'ERROR';
        }

        // Filter bots with < 900 friends
        // fnbr client.friends is a Map-like object usually
        const availableBots = connectedBots.filter(b => {
            const friendCount = b.client.friends ? b.client.friends.size : 0;
            return friendCount < 900; 
        });
        
        if (availableBots.length === 0) {
            console.warn('[BotManager] All bots are full (>900 friends)');
            return 'FULL';
        }

        // Pick the first one
        const botInstance = availableBots[0];
        const identifier = botInstance.account.pseudo;

        try {
            console.log(`[${identifier}] Sending friend request to ${targetUsername}...`);
            await botInstance.client.friend.add(targetUsername);
            console.log(`[${identifier}] ✅ Friend request sent!`);
            return 'SUCCESS';
        } catch (error: any) {
            console.error(`[${identifier}] ❌ Failed to add friend:`, error.message);
            return 'ERROR';
        }
    }
}
