import * as crypto from 'crypto';
import * as fs from 'fs';

/**
 * Chiffrement Fernet (spec : https://github.com/fernet/spec) compatible avec
 * cryptography.fernet côté Python — la même EPIC_MASTER_KEY que le générateur.
 *
 * Sert à l'import JSON de /admin addbot : les exports du générateur contiennent
 * les mots de passe Epic EN CLAIR, la base ne stocke que password_enc (Fernet).
 */

let cachedKey: Buffer | null | undefined;

function loadMasterKey(): Buffer | null {
    if (cachedKey !== undefined) return cachedKey;
    let b64 = process.env.EPIC_MASTER_KEY || '';
    if (!b64) {
        // Le .env du générateur est monté dans ce conteneur (/app/generator)
        try {
            const env = fs.readFileSync('/app/generator/.env', 'utf-8');
            b64 = env.match(/^EPIC_MASTER_KEY=(.+)$/m)?.[1]?.trim() || '';
        } catch {}
    }
    try {
        const key = Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
        cachedKey = key.length === 32 ? key : null;
    } catch {
        cachedKey = null;
    }
    if (!cachedKey) console.warn('[Fernet] EPIC_MASTER_KEY introuvable/invalide — les mots de passe importés ne seront pas stockés');
    return cachedKey;
}

export function hasMasterKey(): boolean {
    return loadMasterKey() !== null;
}

/** Chiffre une chaîne au format Fernet. Renvoie null si la clé est absente. */
export function fernetEncrypt(plaintext: string): string | null {
    const key = loadMasterKey();
    if (!key) return null;
    const signingKey = key.subarray(0, 16);
    const encryptionKey = key.subarray(16);

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-128-cbc', encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);

    const timestamp = Buffer.alloc(8);
    timestamp.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000)));

    const body = Buffer.concat([Buffer.from([0x80]), timestamp, iv, ciphertext]);
    const hmac = crypto.createHmac('sha256', signingKey).update(body).digest();

    // base64 URL-safe AVEC padding (exigé par urlsafe_b64decode côté Python)
    const b64 = Buffer.concat([body, hmac]).toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_');
}
