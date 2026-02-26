import { Client } from 'fnbr';
import axios from 'axios';
import { DatabaseManager } from './DatabaseManager';

const EG_CLIENT_ID = '3f69e56c7649492c8cc29f1af08a8a12';
const EG_CLIENT_SECRET = 'b51ee9cb12234f50a69efa67ef53812e';
const EG_AUTH_HEADER = `Basic ${Buffer.from(`${EG_CLIENT_ID}:${EG_CLIENT_SECRET}`).toString('base64')}`;

export class UserManager {
    private db: DatabaseManager;
    private deviceFlowSessions: Map<string, string> = new Map(); // discordId -> device_code

    constructor(db: DatabaseManager) {
        this.db = db;
    }

    public async initiateDeviceFlow(discordId: string): Promise<{ userCode: string; activateUrl: string }> {
        const response = await axios.post(
            'https://account-public-service-prod.ol.epicgames.com/account/api/oauth/deviceAuthorization',
            '',
            { headers: { 'Authorization': EG_AUTH_HEADER, 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        const { device_code, user_code, verification_uri_complete } = response.data;
        this.deviceFlowSessions.set(discordId, device_code);
        return {
            userCode: user_code as string,
            activateUrl: (verification_uri_complete as string) || `https://www.epicgames.com/id/activate?userCode=${user_code}`
        };
    }

    public async completeDeviceFlow(discordId: string): Promise<string> {
        const deviceCode = this.deviceFlowSessions.get(discordId);
        if (!deviceCode) return 'ERROR:no_session';

        try {
            const tokenResponse = await axios.post(
                'https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token',
                new URLSearchParams({
                    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
                    device_code: deviceCode
                }).toString(),
                { headers: { 'Authorization': EG_AUTH_HEADER, 'Content-Type': 'application/x-www-form-urlencoded' } }
            );

            const { access_token, account_id, displayName } = tokenResponse.data;

            const deviceAuthResponse = await axios.post(
                `https://account-public-service-prod.ol.epicgames.com/account/api/public/account/${account_id}/deviceAuth`,
                {},
                { headers: { 'Authorization': `Bearer ${access_token}` } }
            );

            await this.db.saveUser(discordId, displayName, deviceAuthResponse.data);
            this.deviceFlowSessions.delete(discordId);
            return `SUCCESS:${displayName}`;
        } catch (e: any) {
            const errorCode = e.response?.data?.errorCode || '';
            if (errorCode.includes('authorization_pending')) return 'PENDING';
            if (errorCode.includes('expired')) {
                this.deviceFlowSessions.delete(discordId);
                return 'EXPIRED';
            }
            return `ERROR:${e.response?.data?.errorMessage || e.message}`;
        }
    }

    public async handleLogin(discordId: string, authCode: string): Promise<string> {
        const tempClient = new Client({
            auth: {
                authorizationCode: authCode,
                authClient: 'fortniteAndroidGameClient'
            }
        });

        try {
            await tempClient.login();
            const deviceAuth = (tempClient as any).auth.deviceAuth;
            const pseudo = tempClient.user?.self?.displayName || 'Unknown';

            await this.db.saveUser(discordId, pseudo, deviceAuth);
            await tempClient.logout();

            return `SUCCESS:${pseudo}`;
        } catch (e: any) {
            console.error('Login error:', e);
            return `ERROR:${e.message}`;
        }
    }

    public async logout(discordId: string): Promise<void> {
        await this.db.deleteUser(discordId);
    }

    public async addBotAsFriend(discordId: string, targetPseudo: string): Promise<string> {
        const user = await this.db.getUser(discordId);
        if (!user) return 'NOT_LOGGED_IN';

        try {
            const userClient = new Client({
                auth: {
                    deviceAuth: user.deviceAuth
                }
            });

            await userClient.login();

            // Explicitly cast to any to avoid type errors with fnbr
            await (userClient as any).friend.add(targetPseudo);
            await userClient.logout();
            return 'SUCCESS';

        } catch (e) {
            console.error(e);
            return 'ERROR';
        }
    }

    public async getFriends(discordId: string): Promise<string[] | null> {
        const user = await this.db.getUser(discordId);
        if (!user) return null;

        try {
            const userClient = new Client({ auth: { deviceAuth: user.deviceAuth } });
            await userClient.login();

            const friends: string[] = [];
            const friendsCollection = (userClient as any).friends;

            if (friendsCollection) {
                friendsCollection.forEach((f: any) => {
                    friends.push(f.displayName);
                });
            }

            await userClient.logout();
            return friends;
        } catch (e) {
            console.error('GetFriends Error:', e);
            return null;
        }
    }

    public async setAffiliate(discordId: string, code: string): Promise<string> {
        const user = await this.db.getUser(discordId);
        if (!user) return 'NOT_LOGGED_IN';

        try {
            const userClient = new Client({ auth: { deviceAuth: user.deviceAuth } });
            await userClient.login();

            await (userClient as any).http.sendPost(
                'https://fortnite-public-service-prod11.ol.epicgames.com/fortnite/api/game/v2/profile/' + userClient.user?.self?.id + '/client/SetAffiliateName?profileId=common_core',
                '',
                { affiliateName: code }
            );

            await userClient.logout();
            return 'SUCCESS';
        } catch (e: any) {
            // Check for specific error code if needed
            if (e && e.code === 'errors.com.epicgames.modules.gamesubcatalog.invalid_affiliate_name') {
                return 'INVALID_CODE';
            }
            console.error('SetAffiliate Error:', e);
            return 'ERROR';
        }
    }

    public async getLocker(discordId: string): Promise<any | null> {
        const user = await this.db.getUser(discordId);
        if (!user) return null;

        try {
            const userClient = new Client({ auth: { deviceAuth: user.deviceAuth } });
            await userClient.login();

            const items = (userClient as any).inventory.items;
            const locker = {
                skins: 0,
                backpacks: 0,
                pickaxes: 0,
                emotes: 0,
                legendary: 0 // New metric
            };

            if (items) {
                for (const [key, item] of items) {
                    const templateId = (item as any).templateId;
                    if (!templateId) continue;

                    const type = templateId.split(':')[0];

                    // Helper: Check rarity (limited accuracy without full cosmetic definitions, but accessible via template attributes if available?)
                    // Fnbr items usually have attributes. But without downloading huge cosmetic list, we rely on counts.
                    // Actually, we can checking item definition? No, explicit rarity is in properties?
                    // We will stick to counts for now, but broken down by type.

                    if (type === 'AthenaCharacter') locker.skins++;
                    if (type === 'AthenaBackpack') locker.backpacks++;
                    if (type === 'AthenaPickaxe') locker.pickaxes++;
                    if (type === 'AthenaDance') locker.emotes++;

                    // Check for legendary rarity
                    if ((item as any).rarity === 'Legendary') {
                        locker.legendary++;
                    }
                }
            }

            await userClient.logout();
            return locker;
        } catch (e) {
            console.error('GetLocker Error:', e);
            return null;
        }
    }

    // --- LANGUAGE METHODS ---

    public async setLanguage(discordId: string, lang: string): Promise<void> {
        await this.db.setLanguage(discordId, lang);
    }

    public async getLanguage(discordId: string): Promise<string> {
        return await this.db.getLanguage(discordId);
    }
}
