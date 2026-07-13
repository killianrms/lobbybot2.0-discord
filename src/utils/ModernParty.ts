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

export async function setLoadout(
    client: Client,
    items: { outfit?: string; backpack?: string; pickaxe?: string },
): Promise<void> {
    const me = getMe(client);
    const s = currentLoadout(me);

    if (items.outfit !== undefined) s.ac = { i: items.outfit, v: [] };
    if (items.pickaxe !== undefined) s.ap = { i: items.pickaxe, v: [] };
    if (items.backpack !== undefined) {
        if (items.backpack === '') delete s.ab;
        else s.ab = { i: items.backpack, v: [] };
    }

    await me.sendPatch({
        'Default:MpLoadout1_j': me.meta.set('Default:MpLoadout1_j', { MpLoadout1: { s } }),
    });
}

export async function setReady(client: Client, ready: boolean): Promise<void> {
    const me = getMe(client);
    const prop = me.meta.get('Default:MatchmakingInfo_j');
    const info = prop?.MatchmakingInfo && Object.keys(prop.MatchmakingInfo).length
        ? prop.MatchmakingInfo
        : {};
    info.readyStatus = ready ? 'Ready' : 'NotReady';

    await me.sendPatch({
        'Default:MatchmakingInfo_j': me.meta.set('Default:MatchmakingInfo_j', { MatchmakingInfo: info }),
    });
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
