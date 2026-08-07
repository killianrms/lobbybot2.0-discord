/**
 * Lecture des fichiers de comptes fournis à /admin addbot.
 *
 * Deux formats acceptés, parce que les deux circulent vraiment :
 *   1. JSON — l'export du générateur (tableau, ou objet unique), avec le device
 *      auth soit imbriqué dans `device_auth`, soit à plat.
 *   2. TEXTE clé/valeur — ce que l'on recopie à la main depuis le générateur :
 *          email: bot@gmail.com
 *          password: ...
 *          pseudo: 1.GameBot
 *          DEVICE_ID=fa79...
 *          ACCOUNT_ID=05e1...
 *          SECRET=A25Z...
 *      Séparateur `:` ou `=`, casse et ordre libres, plusieurs comptes à la
 *      suite (séparés par une ligne vide OU simplement par le retour de la clé
 *      `email`).
 *
 * Avant, seul le JSON était lu : un .txt arrivait sous forme de chaîne, se
 * faisait envelopper dans un tableau et ressortait en « 1 rejetée — device auth
 * incomplet », ce qui accusait à tort le contenu du fichier.
 */

export interface ParsedAccount {
    email: string;
    pseudo: string | null;
    password: string | null;
    deviceId: string;
    accountId: string;
    secret: string;
}

export interface RejectedAccount {
    label: string;
    reason: string;
}

export interface ParseResult {
    entries: ParsedAccount[];
    rejected: RejectedAccount[];
    /** Ce que le parser a effectivement reconnu — sert au message d'erreur. */
    format: 'json' | 'texte' | 'inconnu';
}

// Formats réels observés côté Epic (vérifiés sur les comptes déjà en base) :
// device_id et account_id sont 32 hexa minuscules, le secret 32 alphanumériques
// majuscules. On reste tolérant sur la casse, strict sur la longueur.
const HEX32 = /^[0-9a-fA-F]{32}$/;
const ALNUM32 = /^[0-9A-Za-z]{32}$/;

const FIELD_ALIASES: Record<string, keyof RawEntry> = {
    email: 'email', mail: 'email', adresse: 'email', adresseemail: 'email',
    password: 'password', pass: 'password', mdp: 'password', motdepasse: 'password',
    pseudo: 'pseudo', displayname: 'pseudo', username: 'pseudo', nom: 'pseudo', name: 'pseudo',
    deviceid: 'deviceId', device: 'deviceId',
    accountid: 'accountId', account: 'accountId',
    secret: 'secret', secretid: 'secret',
};

interface RawEntry {
    email?: string;
    password?: string;
    pseudo?: string;
    deviceId?: string;
    accountId?: string;
    secret?: string;
}

/** `DEVICE_ID`, `device-id`, `Device Id` → `deviceid` */
function normalizeKey(key: string): string {
    return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseTextBlocks(text: string): RawEntry[] {
    const blocks: RawEntry[] = [];
    let current: RawEntry = {};
    let currentHasData = false;

    const flush = () => {
        if (currentHasData) blocks.push(current);
        current = {};
        currentHasData = false;
    };

    for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
        const line = rawLine.trim();
        if (line === '') { flush(); continue; }
        // Les séparateurs de blocs décoratifs (---, ===, ###) valent ligne vide.
        if (/^[-=#*_]{3,}$/.test(line)) { flush(); continue; }

        // Premier `:` ou `=` rencontré : le mot de passe peut contenir les deux.
        const sep = line.search(/[:=]/);
        if (sep <= 0) continue;

        const field = FIELD_ALIASES[normalizeKey(line.slice(0, sep))];
        if (!field) continue;

        const value = line.slice(sep + 1).trim();
        if (value === '') continue;

        // Une clé qui revient alors qu'elle est déjà remplie = compte suivant,
        // même sans ligne vide entre les deux.
        if (current[field] !== undefined) flush();

        current[field] = value;
        currentHasData = true;
    }
    flush();

    return blocks;
}

function fromJsonItem(item: any): RawEntry {
    const da = item?.device_auth ?? item?.deviceAuth ?? {};
    return {
        email: item?.email ?? undefined,
        password: item?.password ?? undefined,
        pseudo: item?.pseudo ?? item?.display_name ?? item?.displayName ?? undefined,
        deviceId: da.device_id ?? da.deviceId ?? item?.device_id ?? item?.deviceId ?? undefined,
        accountId: da.account_id ?? da.accountId ?? item?.account_id ?? item?.accountId ?? undefined,
        secret: da.secret_id ?? da.secret ?? item?.secret_id ?? item?.secret ?? undefined,
    };
}

/** Valide un bloc et dit précisément ce qui cloche — pas juste « incomplet ». */
function validate(raw: RawEntry): { ok: ParsedAccount } | { error: RejectedAccount } {
    const label = raw.email || raw.pseudo || raw.accountId || '(entrée sans email)';
    const missing: string[] = [];
    if (!raw.email) missing.push('email');
    if (!raw.deviceId) missing.push('DEVICE_ID');
    if (!raw.accountId) missing.push('ACCOUNT_ID');
    if (!raw.secret) missing.push('SECRET');
    if (missing.length > 0) {
        return { error: { label, reason: `champ(s) manquant(s) : ${missing.join(', ')}` } };
    }

    if (!raw.email!.includes('@')) {
        return { error: { label, reason: 'email invalide (pas de @)' } };
    }
    if (!HEX32.test(raw.deviceId!)) {
        return { error: { label, reason: `DEVICE_ID invalide (32 caractères hexadécimaux attendus, ${raw.deviceId!.length} reçus)` } };
    }
    if (!HEX32.test(raw.accountId!)) {
        return { error: { label, reason: `ACCOUNT_ID invalide (32 caractères hexadécimaux attendus, ${raw.accountId!.length} reçus)` } };
    }
    if (!ALNUM32.test(raw.secret!)) {
        return { error: { label, reason: `SECRET invalide (32 caractères alphanumériques attendus, ${raw.secret!.length} reçus)` } };
    }

    return {
        ok: {
            email: raw.email!.trim(),
            pseudo: raw.pseudo?.trim() || null,
            password: raw.password ?? null,
            deviceId: raw.deviceId!.toLowerCase(),
            accountId: raw.accountId!.toLowerCase(),
            secret: raw.secret!,
        },
    };
}

/**
 * @param body Le contenu brut du fichier (toujours du texte : c'est à l'appelant
 *             de télécharger en `responseType: 'text'`, sinon axios devine et un
 *             .txt ressort en chaîne là où le code attendait un objet).
 */
export function parseAccountsFile(body: string): ParseResult {
    const trimmed = (body ?? '').trim();
    if (trimmed === '') return { entries: [], rejected: [], format: 'inconnu' };

    let rawEntries: RawEntry[];
    let format: ParseResult['format'];

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            const data = JSON.parse(trimmed);
            rawEntries = (Array.isArray(data) ? data : [data]).map(fromJsonItem);
            format = 'json';
        } catch {
            // JSON malformé : on retente en texte, ça sauve les copier-coller
            // partiels. Si ça ne donne rien, le format reste « inconnu ».
            rawEntries = parseTextBlocks(trimmed);
            format = rawEntries.length > 0 ? 'texte' : 'inconnu';
        }
    } else {
        rawEntries = parseTextBlocks(trimmed);
        format = rawEntries.length > 0 ? 'texte' : 'inconnu';
    }

    const entries: ParsedAccount[] = [];
    const rejected: RejectedAccount[] = [];
    for (const raw of rawEntries) {
        const result = validate(raw);
        if ('ok' in result) entries.push(result.ok);
        else rejected.push(result.error);
    }

    return { entries, rejected, format };
}
