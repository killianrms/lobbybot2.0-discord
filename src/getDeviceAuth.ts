import 'dotenv/config';
import axios from 'axios';
import * as readline from 'readline';
import { DatabaseManager } from './managers/DatabaseManager';
import { CSVManager } from './managers/CSVManager';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query: string): Promise<string> {
    return new Promise(resolve => rl.question(query, resolve));
}

const CLIENT_ID = '3f69e56c7649492c8cc29f1af08a8a12';  // Android (seul client avec permission de créer device auth)
const CLIENT_SECRET = 'b51ee9cb12234f50a69efa67ef53812e';

async function generateDeviceAuth() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║         Générer un Device Auth (Client Android)           ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('📋 Étapes :\n');
    console.log('1. Cliquez sur ce lien : https://www.epicgames.com/id/api/redirect?clientId=3f69e56c7649492c8cc29f1af08a8a12&responseType=code');
    console.log('2. Connectez-vous avec votre compte Epic Games');
    console.log('3. Le code s\'affichera automatiquement dans le JSON');
    console.log('4. Cherchez "authorizationCode" et copiez sa valeur\n');
    console.log('   OU si vous préférez :');
    console.log('   - Ouvrez DevTools (F12) > Console');
    console.log('   - Collez ce code pour afficher le code plus clairement :\n');
    console.log('─────────────────────────────────────────────────────────────');
    console.log("fetch('https://www.epicgames.com/id/api/redirect?clientId=3f69e56c7649492c8cc29f1af08a8a12&responseType=code',{credentials:'include'}).then(r=>r.json()).then(d=>{console.log('CODE:',d.authorizationCode);alert('CODE: '+d.authorizationCode)})");
    console.log('─────────────────────────────────────────────────────────────\n');

    const authCode = await question('Collez le authorization code : ');

    console.log('\n🔌 Connexion...\n');

    try {
        const authHeader = `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`;

        const tokenResponse = await axios.post(
            'https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token',
            new URLSearchParams({
                grant_type: 'authorization_code',
                code: authCode,
            }).toString(),
            {
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/x-www-form-urlencoded',
                }
            }
        );

        const accessToken = tokenResponse.data.access_token;
        const accountId = tokenResponse.data.account_id;
        const displayName = tokenResponse.data.displayName;

        console.log('✅ Authentifié en tant que:', displayName);
        console.log('📋 Account ID:', accountId);

        console.log('\n🔑 Création du device auth...\n');

        const deviceAuthResponse = await axios.post(
            `https://account-public-service-prod.ol.epicgames.com/account/api/public/account/${accountId}/deviceAuth`,
            {},
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                }
            }
        );

        const deviceAuth = deviceAuthResponse.data;

        console.log('✅ DEVICE AUTH CRÉÉ !\n');
        console.log('Device ID:', deviceAuth.deviceId);
        console.log('Account ID:', deviceAuth.accountId);
        console.log('Secret:', deviceAuth.secret);
        console.log('');

        // ── Enregistrement direct dans la base SQLite partagée ──────────
        const pseudoInput = await question(`Pseudo du bot [${displayName}] : `);
        const pseudo = pseudoInput.trim() || displayName;
        const emailInput = await question('Email du compte Epic : ');
        const email = emailInput.trim() || `${accountId}@epic.local`;

        console.log('\n💾 Enregistrement dans la base de données...');
        const db = new DatabaseManager(new CSVManager());
        await db.init();
        await db.addBot({
            pseudo,
            email,
            password: '',
            deviceAuth: {
                deviceId: deviceAuth.deviceId,
                accountId: deviceAuth.accountId,
                secret: deviceAuth.secret,
            },
        });

        console.log(`\n✅ Bot "${pseudo}" ajouté à la base ! Il apparaîtra dans le dashboard et sera lancé par le Manager.`);
        console.log('');

        rl.close();
        process.exit(0);

    } catch (error: any) {
        console.error('\n❌ ERREUR:', error.message);
        if (error.response?.data) {
            console.error('Details:', error.response.data);
        }
        rl.close();
        process.exit(1);
    }
}

generateDeviceAuth();
