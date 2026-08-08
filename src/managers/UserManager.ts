import axios from 'axios';
import { Client } from 'fnbr';
import { DatabaseManager } from './DatabaseManager';

const EPIC_TOKEN_URL       = 'https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token';
const EPIC_DEVICE_CODE_URL = 'https://account-public-service-prod.ol.epicgames.com/account/api/oauth/deviceAuthorization';
const EPIC_EXCHANGE_URL    = 'https://account-public-service-prod.ol.epicgames.com/account/api/oauth/exchange';

// Clients à essayer dans l'ordre pour le device code flow (credentials publics fnbr)
const DEVICE_FLOW_CLIENTS = [
    { id: '98f7e42c2e3a4f86a74eb43fbb41ed39', secret: '0a2449a2-001a-451e-afec-3e812901c4d7' }, // fortniteNewSwitchGameClient
    { id: '3f69e56c7649492c8cc29f1af08a8a12', secret: 'b51ee9cb12234f50a69efa67ef53812e' }, // fortniteAndroidGameClient
    { id: '3446cd72694c4a4485d81b77adbb2141', secret: '9209d4a5e25a457fb9b07489d313b41a' }, // fortniteIOSGameClient
];

export interface DeviceFlowInfo {
    clientId: string;
    clientSecret: string;
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

    // ─── DEVICE CODE FLOW ───────────────────────────────────────────────────────

    /**
     * Étape 1 : demande un code à Epic et retourne les infos à montrer à l'utilisateur.
     *
     * IMPORTANT : l'endpoint /oauth/deviceAuthorization exige un Bearer token obtenu
     * via un grant client_credentials préalable — l'appeler directement en Basic auth
     * (comme le grant_type=device_code du polling) renvoie 401 authentication_failed.
     *
     * Retourne null si Epic refuse sur tous les clients (on bascule vers le flow manuel).
     */
    public async initiateDeviceFlow(): Promise<DeviceFlowInfo | null> {
        for (const client of DEVICE_FLOW_CLIENTS) {
            try {
                const basicAuth = Buffer.from(`${client.id}:${client.secret}`).toString('base64');

                // Étape 1a : token anonyme (client_credentials)
                const tokenResp = await axios.post(
                    EPIC_TOKEN_URL,
                    'grant_type=client_credentials',
                    {
                        headers: {
                            'Authorization': `Basic ${basicAuth}`,
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        timeout: 10_000,
                    }
                );
                const bearer = tokenResp.data.access_token;

                // Étape 1b : demande du device code avec le Bearer token
                const resp = await axios.post(
                    EPIC_DEVICE_CODE_URL,
                    'grant_type=urn:ietf:params:oauth:grant-type:device_code&scope=basic_profile+friends_list+openid+presence',
                    {
                        headers: {
                            'Authorization': `Bearer ${bearer}`,
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        timeout: 10_000,
                    }
                );

                const d = resp.data;
                console.log(`[UserManager] Device flow OK avec client ${client.id}`);
                return {
                    clientId:     client.id,
                    clientSecret: client.secret,
                    userCode:     d.user_code,
                    deviceCode:   d.device_code,
                    activationUrl: d.verification_uri_complete || `https://www.epicgames.com/activate?userCode=${d.user_code}`,
                    expiresIn:    d.expires_in ?? 600,
                    interval:     d.interval   ?? 5,
                };
            } catch (e: any) {
                console.log(`[UserManager] Device flow échec avec client ${client.id}:`, e.response?.data?.errorCode ?? e.message);
            }
        }

        console.error('[UserManager] Device flow échoué sur tous les clients → fallback manuel');
        return null;
    }

    /**
     * Étape 2 : poll une seule fois le token Epic.
     * Retourne :
     *   'PENDING'          → l'utilisateur n'a pas encore autorisé
     *   'EXPIRED'          → le code a expiré
     *   'SUCCESS:pseudo'   → connecté
     *   'ERROR:...'        → autre erreur
     */
    public async pollDeviceFlow(discordId: string, deviceCode: string, clientId: string, clientSecret: string): Promise<string> {
        const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

        try {
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

            const exchangeCode = await this._createExchangeCodeFromAccessToken(tokenResp.data.access_token);
            return await this._loginWithExchangeCode(discordId, exchangeCode);

        } catch (e: any) {
            const errCode = e.response?.data?.errorCode ?? '';

            if (errCode.includes('authorization_pending')) return 'PENDING';
            if (errCode.includes('expired_token') || errCode.includes('expired'))  return 'EXPIRED';
            if (errCode.includes('access_denied')) return 'DENIED';

            console.error('[UserManager] Poll device flow error:', e.response?.data ?? e.message);
            return `ERROR:${e.message}`;
        }
    }

    // ─── AUTHORIZATION CODE FLOW ────────────────────────────────────────────────

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

    private async _createExchangeCodeFromAccessToken(accessToken: string): Promise<string> {
        const resp = await axios.get(EPIC_EXCHANGE_URL, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            timeout: 10_000,
        });
        return resp.data.code;
    }

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
        } catch (e: any) {
            if (e?.name === 'DuplicateFriendshipError') return 'ALREADY_FRIENDS';
            console.error(e);
            return 'ERROR';
        }
    }

    /**
     * Retire UN ami du compte Epic de l'utilisateur (celui connecté via /login).
     *
     * Ne touche pas aux lobby bots : avant, /remove parcourait toute la flotte,
     * tous propriétaires confondus, et retirait la personne des bots de chacun.
     */
    public async removeFriend(discordId: string, targetPseudo: string): Promise<string> {
        const user = await this.db.getUser(discordId);
        if (!user) return 'NOT_LOGGED_IN';

        try {
            const userClient = new Client({ auth: { deviceAuth: user.deviceAuth } });
            await userClient.login();
            try {
                const friend = userClient.friend.list.find((f: any) =>
                    f.displayName?.toLowerCase() === targetPseudo.toLowerCase());
                if (!friend) return 'NOT_FRIENDS';
                await (friend as any).remove();
                return 'SUCCESS';
            } finally {
                await userClient.logout();
            }
        } catch (e: any) {
            console.error('RemoveFriend Error:', e.message);
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
            userClient.friend.list.forEach((f: any) => friends.push(f.displayName));

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

            // fnbr.js n'expose pas de méthode SetAffiliateName ni http.sendPost() — on appelle
            // directement le endpoint MCP via epicgamesRequest(), comme le fait FriendManager.add() en interne.
            await (userClient as any).http.epicgamesRequest({
                method: 'POST',
                url: `https://fortnite-public-service-prod11.ol.epicgames.com/fortnite/api/game/v2/profile/${userClient.user?.self?.id}/client/SetAffiliateName?profileId=common_core`,
                headers: { 'Content-Type': 'application/json' },
                data: { affiliateName: code },
            }, 'fortnite');

            await userClient.logout();
            return 'SUCCESS';
        } catch (e: any) {
            if (e?.code === 'errors.com.epicgames.modules.gamesubcatalog.invalid_affiliate_name') return 'INVALID_CODE';
            console.error('SetAffiliate Error:', e);
            return 'ERROR';
        }
    }

    /**
     * Applique le code créateur au compte Epic de chaque utilisateur connecté via /login (pas aux bots).
     */
    public async setAffiliateForAllUsers(code: string): Promise<{ success: string[]; failed: { discordId: string; reason: string }[] }> {
        const users = await this.db.getAllUsers();
        const success: string[] = [];
        const failed: { discordId: string; reason: string }[] = [];

        for (const user of users) {
            const result = await this.setAffiliate(user.discordId, code);
            if (result === 'SUCCESS') {
                success.push(user.pseudo || user.discordId);
            } else {
                failed.push({ discordId: user.pseudo || user.discordId, reason: result === 'INVALID_CODE' ? 'Code invalide' : result });
            }
        }

        return { success, failed };
    }

    public async getLocker(discordId: string): Promise<any | null> {
        const user = await this.db.getUser(discordId);
        if (!user) return null;

        try {
            const userClient = new Client({ auth: { deviceAuth: user.deviceAuth } });
            await userClient.login();

            // fnbr.js n'a pas de gestionnaire d'inventaire BR — on interroge directement
            // le profil MCP "athena" (comme le fait FriendManager.add() en interne pour les amis).
            const profileResp = await (userClient as any).http.epicgamesRequest({
                method: 'POST',
                url: `https://fortnite-public-service-prod11.ol.epicgames.com/fortnite/api/game/v2/profile/${userClient.user?.self?.id}/client/QueryProfile?profileId=athena`,
                headers: { 'Content-Type': 'application/json' },
                data: {},
            }, 'fortnite');

            const items = profileResp?.profileChanges?.[0]?.profile?.items ?? {};
            const locker = { skins: 0, backpacks: 0, pickaxes: 0, emotes: 0, legendary: 0 };

            for (const key of Object.keys(items)) {
                const item = items[key];
                const type = item?.templateId?.split(':')[0];
                if (type === 'AthenaCharacter') locker.skins++;
                if (type === 'AthenaBackpack')  locker.backpacks++;
                if (type === 'AthenaPickaxe')   locker.pickaxes++;
                if (type === 'AthenaDance')     locker.emotes++;
                if (item?.attributes?.rarity === 'legendary' || item?.attributes?.rarity === 'Legendary') locker.legendary++;
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
