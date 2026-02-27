import axios from 'axios';
import { Client } from 'fnbr';
import { DatabaseManager } from './DatabaseManager';

const EPIC_TOKEN_URL    = 'https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token';
const EPIC_DEVICE_CODE_URL = 'https://account-public-service-prod.ol.epicgames.com/account/api/oauth/deviceAuthorization';
const EPIC_EXCHANGE_URL = 'https://account-public-service-prod.ol.epicgames.com/account/api/oauth/exchange';

// launcherAppClient2 — le seul client Epic qui supporte le device code flow
const LAUNCHER_CLIENT_ID     = '34a02cf8f4414e29b15921876da36f9a';
const LAUNCHER_CLIENT_SECRET = 'daafbccc737745039dffe53d94fc76cf';

export interface DeviceFlowInfo {
    userCode: string;
    deviceCode: string;
    activationUrl: string;
    expiresIn: number;
    interval: number;
}

export class UserManager {
    private db: DatabaseManager;

    constructor(db: DatabaseManager) {
        this.db = db;
    }

    // ─── DEVICE CODE FLOW ──────────────────────────────────────────────────────

    /**
     * Étape 1 : demande un code à Epic et retourne les infos à montrer à l'utilisateur.
     * Retourne null si Epic refuse (on bascule vers le flow manuel).
     */
    public async initiateDeviceFlow(): Promise<DeviceFlowInfo | null> {
        try {
            const basicAuth = Buffer.from(`${LAUNCHER_CLIENT_ID}:${LAUNCHER_CLIENT_SECRET}`).toString('base64');

            const resp = await axios.post(
                EPIC_DEVICE_CODE_URL,
                'scope=basic_profile+friends_list+openid+presence',
                {
                    headers: {
                        'Authorization': `Basic ${basicAuth}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    timeout: 10_000,
                }
            );

            const d = resp.data;
            return {
                userCode:      d.user_code,
                deviceCode:    d.device_code,
                activationUrl: `https://www.epicgames.com/id/activate?userCode=${d.user_code}`,
                expiresIn:     d.expires_in  ?? 600,
                interval:      d.interval    ?? 5,
            };
        } catch (e: any) {
            console.error('[UserManager] Device flow init failed:', e.response?.data ?? e.message);
            return null;
        }
    }

    /**
     * Étape 2 : poll une seule fois le token Epic.
     * Retourne :
     *   'PENDING'          → l'utilisateur n'a pas encore autorisé
     *   'EXPIRED'          → le code a expiré
     *   'SUCCESS:pseudo'   → connecté
     *   'ERROR:...'        → autre erreur
     */
    public async pollDeviceFlow(discordId: string, deviceCode: string): Promise<string> {
        const basicAuth = Buffer.from(`${LAUNCHER_CLIENT_ID}:${LAUNCHER_CLIENT_SECRET}`).toString('base64');

        try {
            // Récupère le token via device_code
            const tokenResp = await axios.post(
                EPIC_TOKEN_URL,
                `grant_type=device_code&device_code=${encodeURIComponent(deviceCode)}`,
                {
                    headers: {
                        'Authorization': `Basic ${basicAuth}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    timeout: 10_000,
                }
            );

            const accessToken = tokenResp.data.access_token;

            // Récupère un exchange code pour passer à fnbr
            const exchResp = await axios.get(EPIC_EXCHANGE_URL, {
                headers: { 'Authorization': `Bearer ${accessToken}` },
                timeout: 10_000,
            });

            return await this._loginWithExchangeCode(discordId, exchResp.data.code);

        } catch (e: any) {
            const errCode = e.response?.data?.errorCode ?? '';

            if (errCode.includes('authorization_pending')) return 'PENDING';
            if (errCode.includes('expired_token') || errCode.includes('expired'))  return 'EXPIRED';
            if (errCode.includes('access_denied')) return 'DENIED';

            console.error('[UserManager] Poll device flow error:', e.response?.data ?? e.message);
            return `ERROR:${e.message}`;
        }
    }

    // ─── AUTHORIZATION CODE FLOW (fallback) ───────────────────────────────────

    /**
     * Login via le code d'autorisation Epic (méthode manuelle).
     * FIX : écoute l'event deviceauth:created avant login() pour capturer les credentials.
     */
    public async handleLogin(discordId: string, authCode: string): Promise<string> {
        const tempClient = new Client({
            auth: {
                authorizationCode: authCode,
                authClient: 'fortniteAndroidGameClient',
            },
        });

        try {
            let deviceAuth: any = null;

            // ⚠️ CRITIQUE : fnbr ne crée le deviceAuth que si quelqu'un écoute cet event
            tempClient.on('deviceauth:created', (da) => {
                deviceAuth = da;
            });

            await tempClient.login();

            const pseudo = tempClient.user?.self?.displayName ?? 'Unknown';

            if (!deviceAuth) {
                // Fallback : créer le deviceAuth manuellement
                deviceAuth = await (tempClient as any).auth.createDeviceAuth();
            }

            await this.db.saveUser(discordId, pseudo, {
                accountId: deviceAuth.accountId ?? deviceAuth.account_id,
                deviceId:  deviceAuth.deviceId  ?? deviceAuth.device_id,
                secret:    deviceAuth.secret,
            });

            await tempClient.logout();
            return `SUCCESS:${pseudo}`;

        } catch (e: any) {
            console.error('[UserManager] handleLogin error:', e);
            return `ERROR:${e.message}`;
        }
    }

    // ─── HELPERS ──────────────────────────────────────────────────────────────

    private async _loginWithExchangeCode(discordId: string, exchangeCode: string): Promise<string> {
        const tempClient = new Client({
            auth: {
                exchangeCode,
                authClient: 'fortniteAndroidGameClient',
            },
        });

        let deviceAuth: any = null;
        tempClient.on('deviceauth:created', (da) => { deviceAuth = da; });

        await tempClient.login();

        const pseudo = tempClient.user?.self?.displayName ?? 'Unknown';

        if (!deviceAuth) {
            deviceAuth = await (tempClient as any).auth.createDeviceAuth();
        }

        await this.db.saveUser(discordId, pseudo, {
            accountId: deviceAuth.accountId ?? deviceAuth.account_id,
            deviceId:  deviceAuth.deviceId  ?? deviceAuth.device_id,
            secret:    deviceAuth.secret,
        });

        await tempClient.logout();
        return `SUCCESS:${pseudo}`;
    }

    // ─── AUTRES MÉTHODES (inchangées) ─────────────────────────────────────────

    public async logout(discordId: string): Promise<void> {
        await this.db.deleteUser(discordId);
    }

    public async addBotAsFriend(discordId: string, targetPseudo: string): Promise<string> {
        const user = await this.db.getUser(discordId);
        if (!user) return 'NOT_LOGGED_IN';

        try {
            const userClient = new Client({ auth: { deviceAuth: user.deviceAuth } });
            await userClient.login();
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
            const col = (userClient as any).friends;
            if (col) col.forEach((f: any) => friends.push(f.displayName));

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
                'https://fortnite-public-service-prod11.ol.epicgames.com/fortnite/api/game/v2/profile/'
                + userClient.user?.self?.id
                + '/client/SetAffiliateName?profileId=common_core',
                '',
                { affiliateName: code }
            );

            await userClient.logout();
            return 'SUCCESS';
        } catch (e: any) {
            if (e?.code === 'errors.com.epicgames.modules.gamesubcatalog.invalid_affiliate_name') return 'INVALID_CODE';
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

            const items = (userClient as any).inventory?.items;
            const locker = { skins: 0, backpacks: 0, pickaxes: 0, emotes: 0, legendary: 0 };

            if (items) {
                for (const [, item] of items) {
                    const type = (item as any).templateId?.split(':')[0];
                    if (type === 'AthenaCharacter') locker.skins++;
                    if (type === 'AthenaBackpack')  locker.backpacks++;
                    if (type === 'AthenaPickaxe')   locker.pickaxes++;
                    if (type === 'AthenaDance')      locker.emotes++;
                    if ((item as any).rarity === 'Legendary') locker.legendary++;
                }
            }

            await userClient.logout();
            return locker;
        } catch (e) {
            console.error('GetLocker Error:', e);
            return null;
        }
    }

    public async setLanguage(discordId: string, lang: string): Promise<void> {
        await this.db.setLanguage(discordId, lang);
    }

    public async getLanguage(discordId: string): Promise<string> {
        return await this.db.getLanguage(discordId);
    }
}
