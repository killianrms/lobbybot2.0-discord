import { Client } from 'fnbr';

/**
 * Présence EOS — le social in-game de Fortnite ne lit plus la présence XMPP
 * (fnbr n'envoie que du XMPP, issues fnbr.js #847/#848). Sans ce PATCH sur le
 * service de présence EOS, les amis voient le bot "Dans le launcher" et ne
 * peuvent ni le rejoindre ni voir son statut. Port du fix rebootpy
 * (commits fb182a4 + dceeec7).
 */

// Build affiché dans EOS_ProductVersion (valeur rebootpy, surchargeable sans rebuild)
const FORTNITE_BUILD = process.env.FORTNITE_BUILD || '++Fortnite+Release-40.30-CL-53093531';

// Les props de présence EOS utilisent un encodage typé : s=string, i=int, b=bool, m=map JSON
const m = (obj: Record<string, unknown>) => `m${JSON.stringify(obj)}`;

// Un log de confirmation par client, pas à chaque refresh de présence
const announced = new WeakSet<object>();

export async function sendEOSPresence(client: Client): Promise<void> {
    const c: any = client;
    const connectionId = c.stomp?.connectionId;
    const accountId = client.user?.self?.id;
    if (!connectionId || !accountId) return; // STOMP pas (encore) connecté : rien à publier

    const deploymentId = c.config.eosDeploymentId;
    const platform = c.config.platform;
    const party: any = c.party;

    const baseProps: Record<string, string> = {
        EOS_Platform: platform,
        EOS_IntegratedPlatform: 'EGS',
        EOS_OnlinePlatformType: '100',
        EOS_ProductVersion: FORTNITE_BUILD,
        EOS_ProductName: 'Fortnite',
        EOS_Session: JSON.stringify({ version: 3 }),
        EOS_Lobby: JSON.stringify({ version: 3 }),
    };

    // Le texte affiché EN JEU. Il doit partir dans TOUS les cas, party ou non :
    // sans party, l'ancien payload n'envoyait aucun `activity`, donc Epic gardait
    // le dernier texte publié. Un bot qui changeait de propriétaire ou dont le
    // propriétaire changeait son code continuait d'afficher l'ancien code in-game
    // alors que le launcher (XMPP) montrait le bon — c'est le « launcher Aeroz /
    // en jeu RGP » constaté le 2026-08-07.
    const statusText = c.config.defaultStatus
        || (party ? `Lobby - ${party.size} / ${party.maxSize}` : 'Playing Battle Royale');

    let payload: any;
    if (!party) {
        payload = {
            status: 'online',
            activity: { value: statusText },
            props: baseProps,
            conn: { props: {} },
        };
    } else {
        const islandCode = party.playlist?.linkId?.mnemonic
            || party.playlist?.playlistName
            || '';

        payload = {
            status: 'online',
            activity: { value: statusText },
            props: {
                FortBasicInfo: m({ homeBaseRating: 0 }),
                FortLFG: 'i0',
                FortPartySize: 'i1',
                FortSubGame: 'i1',
                IslandCode: `s${islandCode}`,
                IsInZone: 'bfalse',
                FortGameplayStats: m({
                    state: '',
                    playlist: 'None',
                    numKills: 0,
                    bFellToDeath: false,
                }),
                SocialStatus: m({ attendingSocialEventIds: [] }),
                InUnjoinableMatch: 'bfalse',
                ...baseProps,
            },
            conn: { props: {} },
        };

        // Le bouton "Rejoindre" in-game n'apparaît que si le join info est publié ici
        if (party.config?.privacy?.presencePermission === 'Anyone') {
            payload.props['party.joininfodata.286331153'] = m({
                sDN: client.user?.self?.displayName,
                sP: platform,
                p: party.id,
                d: 'Fortnite',
                b: c.config.partyBuildId,
                f: 6,
                nAR: 0,
                pc: party.size,
            });
        }
    }

    await c.http.epicgamesRequest({
        method: 'PATCH',
        url: `https://api.epicgames.dev/epic/presence/v1/${deploymentId}/${accountId}/presence/${connectionId}`,
        headers: { 'Content-Type': 'application/json' },
        data: payload,
    }, 'fortniteEOS');

    if (!announced.has(c)) {
        announced.add(c);
        console.log(`[${client.user?.self?.displayName}] 🟢 Présence EOS publiée (statut in-game actif)`);
    }
}
