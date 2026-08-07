/**
 * Vérifie un device auth auprès d'Epic AVANT de l'écrire en base.
 *
 * Un fichier peut être parfaitement écrit (32 caractères partout) et contenir
 * des device auths périmés : Epic les révoque au changement de mot de passe, à
 * la déconnexion globale, ou quand le générateur en recrée un via reset_id.
 * Sans ce contrôle, l'import remplissait la base de comptes morts — et pouvait
 * même écraser les identifiants VALIDES d'un compte déjà présent (vécu le
 * 2026-08-07 : 1.GameBot s'est fait remplacer son device auth fonctionnel).
 *
 * On n'ouvre pas un client fnbr complet pour ça (XMPP, EOS, partie…) : un simple
 * échange de jeton OAuth suffit et coûte une requête. Le jeton obtenu est
 * immédiatement révoqué pour ne pas laisser traîner de session ouverte.
 */
import axios from 'axios';

const TOKEN_URL = 'https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token';
const KILL_URL = 'https://account-public-service-prod.ol.epicgames.com/account/api/oauth/sessions/kill';

// fortniteAndroidGameClient — le même client que celui utilisé pour lancer les
// bots (cf. node_modules/fnbr/dist/resources/AuthClients.js). Un device auth
// n'est valable que pour la famille de clients qui l'a créé.
const CLIENT_ID = '3f69e56c7649492c8cc29f1af08a8a12';
const CLIENT_SECRET = 'b51ee9cb12234f50a69efa67ef53812e';
const BASIC = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

export interface DeviceAuthCheck {
    ok: boolean;
    /** Message court et lisible, destiné au retour Discord. */
    reason?: string;
    /** Pseudo Epic renvoyé par le jeton — sert à nommer un compte sans pseudo. */
    displayName?: string;
}

function shortReason(err: any): string {
    const data = err?.response?.data;
    const code: string = data?.errorCode || '';
    // Le cas de loin le plus fréquent : Epic ne reconnaît plus ce device auth
    // (changement de mot de passe, déconnexion globale, ou device auth recréé
    // par reset_id côté générateur — l'ancien fichier devient alors caduc).
    if (code.includes('invalid_account_credentials')) return 'device auth périmé ou révoqué (fichier trop ancien ?)';
    if (code.includes('device_auth.invalid') || code.includes('invalid_device_auth')) return 'device auth révoqué ou inconnu';
    if (code.includes('account_not_active') || code.includes('account_inactive')) return 'compte désactivé';
    if (code.includes('account.disabled') || code.includes('disabled_account')) return 'compte banni ou désactivé';
    if (code.includes('too_many_requests') || err?.response?.status === 429) return 'trop de requêtes Epic (réessaie plus tard)';
    if (err?.code === 'ECONNABORTED') return 'Epic n\'a pas répondu (délai dépassé)';
    return data?.errorMessage || err?.message || 'refusé par Epic';
}

export async function verifyDeviceAuth(
    deviceId: string, accountId: string, secret: string,
): Promise<DeviceAuthCheck> {
    try {
        const body = new URLSearchParams({
            grant_type: 'device_auth',
            account_id: accountId,
            device_id: deviceId,
            secret,
        });
        const { data } = await axios.post(TOKEN_URL, body.toString(), {
            headers: {
                Authorization: `basic ${BASIC}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            timeout: 15_000,
        });

        // Session refermée aussitôt : on ne voulait qu'une réponse oui/non.
        if (data?.access_token) {
            axios.delete(`${KILL_URL}/${data.access_token}`, {
                headers: { Authorization: `bearer ${data.access_token}` },
                timeout: 10_000,
            }).catch(() => { /* la session expirera d'elle-même */ });
        }

        return { ok: true, displayName: data?.displayName };
    } catch (err: any) {
        return { ok: false, reason: shortReason(err) };
    }
}

/**
 * Vérifie un lot en limitant la concurrence : Epic répond 429 si on lui envoie
 * 100 requêtes d'un coup, et un 429 ferait passer des comptes valides pour morts.
 */
export async function verifyDeviceAuthBatch<T extends { deviceId: string; accountId: string; secret: string }>(
    items: T[],
    concurrency = 4,
    onProgress?: (done: number, total: number) => void,
): Promise<Map<T, DeviceAuthCheck>> {
    const results = new Map<T, DeviceAuthCheck>();
    let index = 0;
    let done = 0;

    const worker = async () => {
        while (index < items.length) {
            const item = items[index++];
            results.set(item, await verifyDeviceAuth(item.deviceId, item.accountId, item.secret));
            done++;
            if (onProgress && done % 10 === 0) onProgress(done, items.length);
        }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    return results;
}
