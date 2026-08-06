#!/usr/bin/env node
/**
 * Patch de fnbr (dernière version testée : 4.3.1).
 *
 * FriendPresence lit `data.activity.value` et `data.props.*` sans protection.
 * Epic envoie régulièrement, sur le flux de présence EOS (STOMP), des payloads
 * sans bloc `activity` (ami qui passe hors ligne, présence non-Fortnite…) :
 *   TypeError: Cannot read properties of undefined (reading 'value')
 *     at new FriendPresence (.../FriendPresence.js:18)
 *     at WebSocket.<anonymous> (.../stomp/STOMP.js:190)
 * Le handler STOMP étant async, l'exception devient une unhandledRejection qui
 * partait en alerte Discord. Bénin (les bots restent connectés) mais bruyant.
 *
 * On rend les deux champs optionnels en tête de constructeur. Idempotent :
 * relancer le script ne double pas le patch.
 *
 * À réévaluer à chaque montée de version de fnbr : si l'upstream corrige,
 * ce patch devient inutile (il ne casse rien, il ne s'appliquera juste plus).
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'node_modules', 'fnbr', 'dist', 'src', 'structures', 'friend', 'FriendPresence.js');
const ANCHOR = '        super(client);\n';
const GUARD = '        // [patch local] Epic envoie des présences sans activity/props → TypeError\n'
    + '        if (!data) data = {};\n'
    + '        if (!data.activity) data.activity = {};\n'
    + '        if (!data.props) data.props = {};\n';

if (!fs.existsSync(FILE)) {
    console.error(`[patch-fnbr] ${FILE} introuvable — fnbr a-t-il changé de structure ?`);
    process.exit(1);
}

const src = fs.readFileSync(FILE, 'utf-8');

if (src.includes('[patch local]')) {
    console.log('[patch-fnbr] déjà appliqué, rien à faire');
    process.exit(0);
}

if (!src.includes(ANCHOR)) {
    console.error('[patch-fnbr] ancre "super(client);" introuvable — patch NON appliqué, à revoir');
    process.exit(1);
}

fs.writeFileSync(FILE, src.replace(ANCHOR, ANCHOR + GUARD), 'utf-8');
console.log('[patch-fnbr] FriendPresence protégé (activity/props optionnels)');
