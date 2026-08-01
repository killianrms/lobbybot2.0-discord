import { Client } from 'fnbr';

/**
 * Bot lobby « handoff » — le vrai mécanisme (façon Victory/FNLB), sans API de
 * matchmaking non officielle.
 *
 * Fonctionnement réel des bot lobbies : un compte **bas niveau** dans la party
 * tire le matchmaking vers des adversaires bots. Le lancement se fait par le
 * VRAI client du joueur (qui possède le droit « PLAY »), pas par le bot headless.
 *
 * Séquence :
 *   1. Le joueur est dans la party du bot (bot chef).
 *   2. /control → le bot PROMEUT le joueur chef (member.promote()).
 *   3. Le joueur choisit région/mode dans Fortnite et lance la partie.
 *   4. Le bot détecte le début du matchmaking (PartyState / matchstate du chef)
 *      et QUITTE la party → le joueur reste seul et charge dans un lobby bot.
 *
 * Aucune requête signée, aucune usurpation : uniquement des opérations de party
 * officielles (promote / leave / lecture de meta). Le seul prérequis « métier »
 * est que le compte bot soit bas niveau / récent.
 */

// États de party qui signifient « le matchmaking / la partie a démarré ».
// En lobby, PartyState vaut "BattleRoyaleView". Dès que le chef lance, il passe
// à une valeur de matchmaking/jeu — on ne code donc pas une liste blanche mais
// on considère « tout sauf le lobby » comme un départ.
const LOBBY_STATE = 'BattleRoyaleView';

interface Handoff {
    userId: string;      // accountId Epic du joueur promu chef
    userName: string;
    armedAt: number;
    leaving: boolean;
}

// Un handoff armé par bot (client → état). WeakMap : nettoyé avec le client.
const handoffs = new WeakMap<object, Handoff>();

export function getHandoff(client: Client): Handoff | null {
    return handoffs.get(client as any) ?? null;
}

export function clearHandoff(client: Client): boolean {
    return handoffs.delete(client as any);
}

/**
 * Démarre un bot lobby : promeut le joueur chef et arme le départ automatique.
 * Retourne un message destiné au joueur.
 */
export async function startHandoff(client: Client, userAccountId: string): Promise<string> {
    const party: any = (client as any).party;
    if (!party) return '❌ Le bot n\'est pas dans un groupe.';
    if (!party.me?.isLeader) return '❌ Le bot doit être chef du groupe (rejoins SON lobby via /invite).';

    const members: any[] = Array.from(party.members?.values?.() ?? []);
    const target = members.find(m => m.id === userAccountId);
    if (!target) return '❌ Tu n\'es pas dans le groupe du bot. Fais /invite puis rejoins-le.';
    if (target.id === client.user?.self?.id) return '❌ Cible invalide.';

    try {
        await target.promote();
    } catch (e: any) {
        return `❌ Impossible de te promouvoir chef : ${e.message}`;
    }

    handoffs.set(client as any, {
        userId: userAccountId,
        userName: target.displayName || userAccountId,
        armedAt: Date.now(),
        leaving: false,
    });

    return (
        '👑 **Tu es maintenant chef du groupe !**\n\n' +
        '1️⃣ Dans **Fortnite**, choisis ta **région** (Paramètres › Matchmaking) et ton **mode**.\n' +
        '2️⃣ **Lance la partie** (bouton Jouer).\n' +
        '3️⃣ Je quitte automatiquement dès que la partie démarre — tu atterris seul dans un **lobby de bots**. 🤖\n\n' +
        '⏳ *Tu as 3 minutes. `/control` de nouveau pour réarmer.*'
    );
}

/** Vrai si le PartyState indique que le matchmaking/la partie a démarré. */
function hasMatchStarted(party: any, leaderId: string): boolean {
    // 1) État global de la party
    const state = party?.meta?.get?.('Default:PartyState_s');
    if (typeof state === 'string' && state && state !== LOBBY_STATE) return true;

    // 2) État de match du chef (le joueur) : PreLobby → InGame/ReturningToFrontEnd
    const leader = Array.from(party?.members?.values?.() ?? []).find((m: any) => m.id === leaderId) as any;
    const loc = leader?.meta?.match?.location ?? leader?.match?.location;
    if (loc && loc !== 'PreLobby') return true;

    return false;
}

/**
 * Appelé sur chaque mise à jour de party/membre. Si un handoff est armé et que
 * le matchmaking a démarré, le bot quitte (après un court délai configurable
 * pour laisser le joueur être bien assigné au serveur bot).
 * Retourne true si un départ a été déclenché.
 */
export async function maybeLeaveForHandoff(client: Client): Promise<boolean> {
    const h = handoffs.get(client as any);
    if (!h || h.leaving) return false;

    // Expiration (le joueur n'a jamais lancé)
    if (Date.now() - h.armedAt > 3 * 60_000) {
        handoffs.delete(client as any);
        return false;
    }

    const party: any = (client as any).party;
    if (!party) { handoffs.delete(client as any); return false; }

    if (!hasMatchStarted(party, h.userId)) return false;

    h.leaving = true;
    const delayMs = Math.max(0, parseInt(process.env.BOTLOBBY_LEAVE_DELAY_MS || '2500', 10));
    await new Promise(r => setTimeout(r, delayMs));
    try {
        await party.leave();
    } catch (e) {
        // même en cas d'échec, on considère le handoff terminé
    }
    handoffs.delete(client as any);
    return true;
}

/** Modes proposés dans /control (juste informatif : le joueur choisit en jeu). */
export const BOTLOBBY_MODES = ['Solo', 'Duo', 'Trio', 'Squad', 'Zero Build'];
