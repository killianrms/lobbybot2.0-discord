import { io, Socket } from 'socket.io-client';
import { BotManager } from './BotManager';

export class SocketManager {
    private socket: Socket | null = null;
    private botManager: BotManager;
    private dashboardUrl: string;

    constructor(botManager: BotManager, dashboardUrl: string) {
        this.botManager = botManager;
        this.dashboardUrl = dashboardUrl;
    }

    public connect(): void {
        console.log('�� Connecting to Dashboard at', this.dashboardUrl);
        this.socket = io(this.dashboardUrl);

        this.socket.on('connect', () => {
            console.log('✅ Manager Connected to Dashboard!');
            this.sendLogin();
        });

        this.socket.on('disconnect', () => {
            console.log('❌ Disconnected from Dashboard');
        });
        
        // Listen for add requests FROM the dashboard
        this.socket.on('cmd:manager:add', async (data: { target: string, requester?: string }) => {
            console.log(`📥 Dashboard requested add friend: ${data.target}`);
            const success = await this.botManager.addFriendOnAvailableBot(data.target);
            // Optionally reply to dashboard
        });
    }

    public sendLogin(): void {
        const bots = this.botManager.getActiveBots();
        const botData = bots.map(b => ({
            name: b.account.pseudo,
            // Access friend count safely. 'client.friends' is usually a Map in fnbr
            friends: (b.client && b.client.friends) ? b.client.friends.size : 0,
            isOnline: b.isConnected
        }));

        this.socket?.emit('manager:login', {
            id: 'fortnite-manager',
            type: 'manager',
            botCount: bots.length,
            bots: botData
        });
    }

    public sendAddRequest(target: string, discordUser: string): void {
        this.socket?.emit('cmd:discord:add', { target, requester: discordUser });
    }
}
