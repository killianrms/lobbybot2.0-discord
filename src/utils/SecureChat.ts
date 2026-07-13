import { Client } from 'fnbr';
import { generateKeyPairSync, sign as edSign, randomUUID, KeyObject } from 'crypto';

/**
 * Chat signé — le client Fortnite n'affiche plus que les messages signés
 * ed25519 : le corps est un JSON base64 (mid/sid/rid/msg/tst/…) signé avec
 * une clé privée dont la clé publique est enregistrée auprès du service
 * publickey d'Epic (le JWT retourné est joint à chaque message).
 * fnbr 4.x envoie du texte brut non signé → accepté par l'API mais jamais
 * affiché in-game. Port du flux rebootpy (create_signed_message).
 */

interface KeyState { privateKey: KeyObject; jwt: string; }

const keyStates = new WeakMap<object, KeyState>();
const dmConversations = new WeakMap<object, Map<string, { id: string; isReportable: any }>>();

async function ensureKeys(c: any): Promise<KeyState> {
    const existing = keyStates.get(c);
    if (existing) return existing;

    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    // Clé publique brute (32 octets) = fin de l'encodage DER/SPKI
    const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
    const key = der.subarray(der.length - 32).toString('base64');

    const res = await c.http.epicgamesRequest({
        method: 'POST',
        url: 'https://publickey-service-live.ecosec.on.epicgames.com/publickey/v2/publickey/',
        headers: { 'Content-Type': 'application/json' },
        data: { key, algorithm: 'ed25519' },
    }, 'fortnite');

    const state: KeyState = { privateKey, jwt: res.jwt };
    keyStates.set(c, state);
    return state;
}

function signedBody(
    st: KeyState,
    selfId: string,
    conversationId: string,
    content: string,
    cty: string,
    seq: number,
): { body: string; sig: string } {
    const info = {
        mid: randomUUID().replace(/-/g, ''),
        sid: selfId,
        rid: conversationId,
        msg: content,
        tst: Math.floor(Date.now() / 1000),
        seq,
        rec: false,
        mts: [] as string[],
        cty,
    };
    const body = Buffer.from(JSON.stringify(info), 'utf8').toString('base64');
    // La signature couvre le corps base64 suivi d'un octet nul
    const sig = edSign(
        null,
        Buffer.concat([Buffer.from(body, 'utf8'), Buffer.from([0])]),
        st.privateKey,
    ).toString('base64');
    return { body, sig };
}

export async function sendPartyMessage(client: Client, content: string): Promise<void> {
    const c: any = client;
    const party = c.party;
    if (!party) throw new Error('Bot pas dans un lobby');
    if (party.size < 2) return; // seul dans la party : personne à qui parler

    const selfId = c.user.self.id;
    const st = await ensureKeys(c);
    const convId = `p-${party.id}`;
    const { body, sig } = signedBody(st, selfId, convId, content, 'Party', 1);

    await c.http.epicgamesRequest({
        method: 'POST',
        url: `https://api.epicgames.dev/epic/chat/v1/public/${c.config.eosDeploymentId}/conversations/${convId}/messages?fromAccountId=${selfId}`,
        headers: { 'Content-Type': 'application/json' },
        data: {
            allowedRecipients: party.members.filter((m: any) => m.id !== selfId).map((m: any) => m.id),
            message: { body },
            isReportable: false,
            metadata: {
                TmV: '2',
                Pub: st.jwt,
                Sig: sig,
                NPM: '1',
                PlfNm: c.config.platform,
                PlfId: selfId,
            },
        },
    }, 'fortniteEOS');
}

export async function whisper(
    client: Client,
    accountId: string,
    content: string,
    isRetry = false,
): Promise<void> {
    const c: any = client;
    const selfId = c.user.self.id;
    const st = await ensureKeys(c);

    let cache = dmConversations.get(c);
    if (!cache) {
        cache = new Map();
        dmConversations.set(c, cache);
    }

    let conv = cache.get(accountId);
    if (!conv) {
        const data = await c.http.epicgamesRequest({
            method: 'POST',
            url: 'https://api.epicgames.dev/epic/chat/v1/public/_/conversations?createIfExists=false',
            headers: { 'Content-Type': 'application/json' },
            data: { title: '', type: 'dm', members: [selfId, accountId] },
        }, 'fortniteEOS');
        conv = { id: data.conversationId, isReportable: data.isReportable };
        cache.set(accountId, conv);
    }

    const { body, sig } = signedBody(st, selfId, conv.id, content, 'Persistent', 0);

    try {
        await c.http.epicgamesRequest({
            method: 'POST',
            url: `https://api.epicgames.dev/epic/chat/v1/public/_/conversations/${conv.id}/messages?fromAccountId=${selfId}`,
            headers: { 'Content-Type': 'application/json' },
            data: {
                allowedRecipients: [accountId, selfId],
                message: { body },
                isReportable: conv.isReportable,
                metadata: {
                    TmV: '2',
                    Pub: st.jwt,
                    Sig: sig,
                    PlfNm: c.config.platform,
                    PlfId: selfId,
                },
            },
        }, 'fortniteEOS');
    } catch (e: any) {
        const msg = `${e?.code ?? ''} ${e?.message ?? ''}`;
        if (!isRetry && msg.includes('is_reportable_mismatch')) {
            // isReportable a changé côté serveur : re-résoudre la conversation et retenter une fois
            cache.delete(accountId);
            return whisper(client, accountId, content, true);
        }
        throw e;
    }
}
