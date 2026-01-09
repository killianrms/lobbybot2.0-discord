import axios from 'axios';
import * as readline from 'readline';
import * as fs from 'fs';

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
    console.log('1. Allez sur https://www.epicgames.com/');
    console.log('2. Connectez-vous avec votre compte Epic Games');
    console.log('3. Ouvrez DevTools (F12) > Console');
    console.log('4. Collez ce code :\n');
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
        console.log('╔════════════════════════════════════════════════════════════╗');
        console.log('║                  COPIEZ CES VALEURS                        ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');
        console.log('Device ID:', deviceAuth.deviceId);
        console.log('Account ID:', deviceAuth.accountId);
        console.log('Secret:', deviceAuth.secret);
        console.log('');
        console.log('📋 Ajoutez cette ligne à accounts.csv :\n');
        console.log(`YourPseudo,your@email.com,password,${deviceAuth.deviceId},${deviceAuth.accountId},${deviceAuth.secret}`);
        console.log('');

        rl.close();

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
