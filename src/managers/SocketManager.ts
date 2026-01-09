import * as io from 'socket.io-client';
import { BotManager } from './BotManager';

export class SocketManager {
    private socket: any;
    private botManager: BotManager;
    private dashboardUrl: string;

    constructor(botManager: BotManager, dashboardUrl: string) {
        this.botManager = botManager;
        this.dashboardUrl = dashboardUrl;
        this.socket = io.connect(this.dashboardUrl, { autoConnect: false });
    }

    public connect(): void {
        console.log('🔌 Connecting to Dashboard at', this.dashboardUrl);
        if (!this.socket.connected) {
             this.socket.connect();
        }

        this.socket.on('connect', () => {
            console.log('✅ Manager Connected to Dashboard!');
            this.sendLogin();
        });

        this.socket.on('disconnect', () => {
             console.log('❌ Disconnected from Dashboard');
        });
        
        this.socket.on('cmd:manager:add', async (data: { target: string, requester?: string }) => {
            console.log(`📥 Dashboard requested add friend: ${data.target}`);
            const success = await this.botManager.addFriendOnAvailableBot(data.target);
        });
    }

    public sendLogin(): void {
        const bots = this.botManager.getActiveBots();
        const botData = bots.map(b => ({
            name: b.account.pseudo,
            friends: (b.client && b.client.friends) ? b.client.friends.size : 0,
            isOnline: b.isConnected
        }));

        this.socket.emit('manager:login', {
            id: 'fortnite-manager',
            type: 'manager',
            botCount: bots.length,
            bots: botData
        });
    }

    public sendAddRequest(target: string, discordUser: string): void {
        this.socket.emit('cmd:discord:add', { target, requester: discordUser });
    }
}
