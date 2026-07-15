import { Client } from 'fnbr';

/**
 * Meta de membre de party « moderne » — depuis la refonte du lobby Fortnite,
 * le client lit les cosmétiques dans Default:MpLoadout1_j (format compact
 * ac/ab/ap…), le ready dans Default:MatchmakingInfo_j, le niveau dans
 * Default:BattlePassInfo_j et l'emote dans FrontendEmote.pickable.
 * fnbr 4.x écrit encore les anciennes clés (AthenaCosmeticLoadout_j,
 * LobbyState_j…) que le jeu ignore désormais. Schéma porté de rebootpy.
 */

const DEFAULT_MP_LOADOUT = {
    ac: { i: 'CID_001_Athena_Commando_F_Default', v: [] as string[] },
    ag: { i: 'DefaultGlider', v: [] as string[] },
    ap: { i: 'DefaultPickaxe', v: [] as string[] },
    lc: { i: 'DefaultColor1', v: [] as string[] },
    li: { i: 'StandardBanner1', v: [] as string[] },
    sb: { i: 'Sparks_Bass_Generic', v: ['0'] },
    sd: { i: 'Sparks_Drum_Generic', v: ['0'] },
    sg: { i: 'Sparks_Guitar_Generic', v: ['0'] },
    sk: { i: 'Sparks_Keytar_Generic', v: ['0'] },
    sm: { i: 'Sparks_Mic_Generic', v: ['0'] },
    vd: { i: 'ID_DriftTrail_Standard', v: ['0'] },
    vds: { i: 'ID_DriftTrail_Standard', v: ['0'] },
    vo: { i: 'ID_Booster_Standard', v: ['0'] },
    vos: { i: 'ID_Booster_Standard', v: ['0'] },
    vw: { i: 'ID_Wheel_OEM', v: ['0'] },
    vws: { i: 'ID_Wheel_OEM', v: ['0'] },
};

function getMe(client: Client): any {
    const m = (client as any).party?.me;
    if (!m) throw new Error('Bot pas dans un lobby');
    return m;
}

function currentLoadout(me: any): any {
    const prop = me.meta.get('Default:MpLoadout1_j');
    const s = prop?.MpLoadout1?.s;
    return s && Object.keys(s).length ? s : JSON.parse(JSON.stringify(DEFAULT_MP_LOADOUT));
}

/** Variante au format du meta moderne : { c: channel, v: tag, dE: 0 }. */
export interface LoadoutVariant { c: string; v: string; dE: number }

export interface LoadoutItems {
    outfit?: string;
    backpack?: string;
    pickaxe?: string;
    glider?: string;
    shoes?: string;
}

// slot loadout → clé compacte du MpLoadout (ac=skin, ab=sac, ap=pioche, ag=planeur, as=chaussures)
const SLOT_KEYS: Record<keyof LoadoutItems, string> = {
    outfit: 'ac', backpack: 'ab', pickaxe: 'ap', glider: 'ag', shoes: 'as',
};

export async function setLoadout(
    client: Client,
    items: LoadoutItems,
    variants?: Partial<Record<keyof LoadoutItems, LoadoutVariant[]>>,
): Promise<void> {
    const me = getMe(client);
    const s = currentLoadout(me);

    for (const slot of Object.keys(SLOT_KEYS) as (keyof LoadoutItems)[]) {
        const value = items[slot];
        if (value === undefined) continue;
        const key = SLOT_KEYS[slot];
        // '' = retirer l'item (seul le skin est obligatoire)
        if (value === '' && slot !== 'outfit') delete s[key];
        else s[key] = { i: value, v: variants?.[slot] || [] };
    }

    await me.sendPatch({
        'Default:MpLoadout1_j': me.meta.set('Default:MpLoadout1_j', { MpLoadout1: { s } }),
    });
}

/** Loadout courant du bot (lecture seule) — clés compactes ac/ab/ap/ag/as. */
export function getLoadout(client: Client): any {
    return currentLoadout(getMe(client));
}

/** Applique des variantes (styles) à un slot déjà équipé, sans changer l'item. */
export async function setVariants(
    client: Client,
    slot: keyof LoadoutItems,
    variants: LoadoutVariant[],
): Promise<string> {
    const me = getMe(client);
    const s = currentLoadout(me);
    const key = SLOT_KEYS[slot];
    if (!s[key]?.i) throw new Error(`Aucun item équipé sur ce slot (${slot})`);

    s[key].v = variants;
    await me.sendPatch({
        'Default:MpLoadout1_j': me.meta.set('Default:MpLoadout1_j', { MpLoadout1: { s } }),
    });
    return s[key].i;
}

/**
 * Bannière du lobby : li = icône (ex: StandardBanner15), lc = couleur
 * (ex: DefaultColor12). Visible sur la carte de membre.
 */
export async function setBanner(client: Client, icon?: string, color?: string): Promise<void> {
    const me = getMe(client);
    const s = currentLoadout(me);
    if (icon) s.li = { i: icon, v: [] };
    if (color) s.lc = { i: color, v: [] };
    await me.sendPatch({
        'Default:MpLoadout1_j': me.meta.set('Default:MpLoadout1_j', { MpLoadout1: { s } }),
    });
}

async function setReadyStatus(client: Client, status: 'Ready' | 'NotReady' | 'SittingOut'): Promise<void> {
    const me = getMe(client);
    const prop = me.meta.get('Default:MatchmakingInfo_j');
    const info = prop?.MatchmakingInfo && Object.keys(prop.MatchmakingInfo).length
        ? prop.MatchmakingInfo
        : {};
    info.readyStatus = status;

    await me.sendPatch({
        'Default:MatchmakingInfo_j': me.meta.set('Default:MatchmakingInfo_j', { MatchmakingInfo: info }),
    });
}

export async function setReady(client: Client, ready: boolean): Promise<void> {
    return setReadyStatus(client, ready ? 'Ready' : 'NotReady');
}

/** « Ne participe pas » (sit out) — le bot reste dans le lobby sans être compté. */
export async function setSittingOut(client: Client, sitOut: boolean): Promise<void> {
    return setReadyStatus(client, sitOut ? 'SittingOut' : 'NotReady');
}

export async function setEmote(client: Client, eid: string): Promise<void> {
    const me = getMe(client);
    // Le jeu attend le chemin complet de l'asset, pas l'EID nu
    const pickable = eid && !eid.includes('.')
        ? `/BRCosmetics/Athena/Items/Cosmetics/Dances/${eid}.${eid}`
        : (eid || 'None');

    const prop = me.meta.get('Default:FrontendEmote_j');
    const data = prop?.FrontendEmote && Object.keys(prop.FrontendEmote).length
        ? prop.FrontendEmote
        : { pickable: 'None', emoteEKey: '', emoteSection: -1, multipurposeEmoteData: -1 };
    data.pickable = pickable;

    await me.sendPatch({
        'Default:FrontendEmote_j': me.meta.set('Default:FrontendEmote_j', { FrontendEmote: data }),
    });
}

export async function clearEmote(client: Client): Promise<void> {
    return setEmote(client, 'None');
}

export async function copyLoadoutFrom(client: Client, member: any): Promise<void> {
    const me = getMe(client);
    const prop = member.meta?.get?.('Default:MpLoadout1_j');
    const src = prop?.MpLoadout1?.s;
    if (!src || !Object.keys(src).length) {
        throw new Error('Loadout du joueur introuvable (pas encore synchronisé ?)');
    }

    const s = currentLoadout(me);
    // ac=skin, ab=sac, ap=pioche, ag=planeur, as=chaussures, at=traînée
    for (const k of ['ac', 'ab', 'ap', 'ag', 'as', 'at']) {
        if (src[k]) s[k] = src[k];
        else delete s[k];
    }

    await me.sendPatch({
        'Default:MpLoadout1_j': me.meta.set('Default:MpLoadout1_j', { MpLoadout1: { s } }),
    });
}

/**
 * Copie l'emote en cours d'un membre (chemin d'asset brut + clé de chiffrement
 * éventuelle) — utilisé par le mode mimic de !copy pour rejouer les danses.
 */
export async function copyEmoteFrom(client: Client, member: any): Promise<boolean> {
    const me = getMe(client);
    const src = member.meta?.get?.('Default:FrontendEmote_j')?.FrontendEmote;
    const pickable = src?.pickable || 'None';

    const prop = me.meta.get('Default:FrontendEmote_j');
    const data = prop?.FrontendEmote && Object.keys(prop.FrontendEmote).length
        ? prop.FrontendEmote
        : { pickable: 'None', emoteEKey: '', emoteSection: -1, multipurposeEmoteData: -1 };

    if (data.pickable === pickable) return false; // déjà identique, rien à rejouer
    data.pickable = pickable;
    data.emoteEKey = src?.emoteEKey || '';
    if (src?.emoteSection !== undefined) data.emoteSection = src.emoteSection;

    await me.sendPatch({
        'Default:FrontendEmote_j': me.meta.set('Default:FrontendEmote_j', { FrontendEmote: data }),
    });
    return true;
}

// ── Mode mimic (!copy) ─────────────────────────────────────────────────────
// Le bot suit un membre : à chaque mise à jour de son état (skin, style,
// danse…), BotManager appelle syncMimicFromMember. WeakMap pour que l'état
// disparaisse avec le client.
const mimicTargets = new WeakMap<object, { targetId: string; lastLoadout: string }>();

export function setMimicTarget(client: Client, memberId: string): void {
    mimicTargets.set(client as any, { targetId: memberId, lastLoadout: '' });
}

export function getMimicTarget(client: Client): string | null {
    return mimicTargets.get(client as any)?.targetId ?? null;
}

export function clearMimic(client: Client): boolean {
    return mimicTargets.delete(client as any);
}

/** Recopie loadout + emote du membre suivi. Silencieux si rien n'a changé. */
export async function syncMimicFromMember(client: Client, member: any): Promise<void> {
    const state = mimicTargets.get(client as any);
    if (!state || member.id !== state.targetId) return;

    // Loadout : ne re-patcher que si le membre a vraiment changé quelque chose
    const src = member.meta?.get?.('Default:MpLoadout1_j')?.MpLoadout1?.s;
    if (src && Object.keys(src).length) {
        const snapshot = JSON.stringify(src);
        if (snapshot !== state.lastLoadout) {
            state.lastLoadout = snapshot;
            try { await copyLoadoutFrom(client, member); } catch (e) {}
        }
    }

    // Danse : copyEmoteFrom est déjà idempotent (compare pickable)
    try { await copyEmoteFrom(client, member); } catch (e) {}
}

// Parties dont le bot masque actuellement les membres (→ ids gardés visibles) —
// fnbr réécrit les squad assignments complets à chaque join, il faut donc
// pouvoir réappliquer le masquage avec la même liste d'exceptions.
const hiddenParties = new WeakMap<object, string[]>();

export function isHidden(client: Client): boolean {
    return hiddenParties.has(client as any);
}

export async function reapplyHidden(client: Client): Promise<void> {
    const keepIds = hiddenParties.get(client as any);
    if (keepIds) await setHidden(client, true, keepIds);
}

/**
 * Masque (ou réaffiche) les membres du lobby en les omettant des
 * rawSquadAssignments. Nécessite que le bot soit chef de la party.
 * "Caché" n'est pas une feature native : les membres restent dans la party.
 */
export async function setHidden(client: Client, hide: boolean, keepIds: string[] = []): Promise<void> {
    const c: any = client;
    const party = c.party;
    if (!party) throw new Error('Bot pas dans un lobby');
    if (!party.me?.isLeader) throw new Error('Le bot doit être chef du groupe (rejoins SON lobby)');

    const selfId = c.user.self.id;
    const visible = hide
        ? party.members.filter((m: any) => m.id === selfId || keepIds.includes(m.id))
        : party.members;
    const raw = visible.map((m: any, i: number) => ({ memberId: m.id, absoluteMemberIdx: i }));

    await party.sendPatch({
        'Default:SquadInformation_j': party.meta.set('Default:SquadInformation_j', {
            SquadInformation: {
                rawSquadAssignments: raw,
                squadData: [{ jamTempo: 0, jamKey: 0, jamMode: 0 }],
            },
        }),
    });

    if (hide) hiddenParties.set(c, keepIds);
    else hiddenParties.delete(c);
}

export async function setLevel(client: Client, level: number): Promise<void> {
    const me = getMe(client);
    const prop = me.meta.get('Default:BattlePassInfo_j');
    const data = prop?.BattlePassInfo && Object.keys(prop.BattlePassInfo).length
        ? prop.BattlePassInfo
        : { bHasPurchasedPass: false, passLevel: 1 };
    data.passLevel = level;

    await me.sendPatch({
        'Default:BattlePassInfo_j': me.meta.set('Default:BattlePassInfo_j', { BattlePassInfo: data }),
    });
}
