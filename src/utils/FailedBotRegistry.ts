import * as fs from 'fs';
import * as path from 'path';

/**
 * Registre persistant des bots qui n'arrivent pas à se connecter.
 * But : ne jamais perdre silencieusement un compte. Un échec de login peut venir
 * d'un reset de device auth côté Epic (récupérable via re-génération des device
 * auth) ou d'un ban (définitif). On garde une trace avec le nombre de tentatives
 * pour pouvoir réessayer plus tard AVANT de supprimer un compte pour de bon.
 */

export interface FailedBotEntry {
    email: string;
    pseudo?: string;
    reason: string;
    attempts: number;
    firstFailedAt: string;
    lastFailedAt: string;
    suspectedBanned: boolean;
}

const FILE = path.join(process.cwd(), 'data', 'failed_bots.json');

// Au-delà de ce nombre d'échecs consécutifs (malgré device auth valides), on
// considère le compte comme probablement banni.
const BAN_SUSPECT_THRESHOLD = 3;

function load(): Record<string, FailedBotEntry> {
    try {
        return JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    } catch {
        return {};
    }
}

function save(data: Record<string, FailedBotEntry>): void {
    try {
        fs.mkdirSync(path.dirname(FILE), { recursive: true });
        fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e: any) {
        console.error(`[FailedBotRegistry] Écriture impossible: ${e.message}`);
    }
}

/** Enregistre (ou incrémente) un échec de connexion pour ce bot. */
export function recordFailure(email: string, pseudo: string | undefined, reason: string): FailedBotEntry {
    const data = load();
    const now = new Date().toISOString();
    const existing = data[email];

    const entry: FailedBotEntry = existing
        ? { ...existing, pseudo: pseudo ?? existing.pseudo, reason, attempts: existing.attempts + 1, lastFailedAt: now }
        : { email, pseudo, reason, attempts: 1, firstFailedAt: now, lastFailedAt: now, suspectedBanned: false };

    entry.suspectedBanned = entry.attempts >= BAN_SUSPECT_THRESHOLD;
    data[email] = entry;
    save(data);

    if (entry.suspectedBanned) {
        console.warn(`[FailedBotRegistry] ⛔ ${pseudo || email} suspecté banni (${entry.attempts} échecs) — à vérifier avant suppression`);
    }
    return entry;
}

/** Efface l'entrée d'un bot qui a fini par se connecter. */
export function clearFailure(email: string): void {
    const data = load();
    if (data[email]) {
        delete data[email];
        save(data);
    }
}

/** Liste des bots suspectés bannis (pour revue manuelle avant suppression). */
export function getSuspectedBanned(): FailedBotEntry[] {
    return Object.values(load()).filter(e => e.suspectedBanned);
}

/** Tout le registre (pour le dashboard / une commande admin). */
export function getAll(): FailedBotEntry[] {
    return Object.values(load());
}
