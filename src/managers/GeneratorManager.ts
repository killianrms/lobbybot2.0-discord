import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseManager } from './DatabaseManager';
import { BotManager } from './BotManager';
import { sendAlert } from '../utils/AlertManager';

export type GenerationResult =
    | { status: 'success'; email: string; pseudo: string }
    | { status: 'failed'; reason: string };

export interface BatchResult {
    successes: { email: string; pseudo: string }[];
    failed: number;
    reason?: string; // renseigné si le batch entier a échoué avant même de démarrer
}

interface QueueItem {
    discordId: string | null; // null = bot de flotte admin, pas de propriétaire / pas de limite 1-par-personne
    pseudoSuffix?: string; // absent = utilise le suffixe persisté dans config.json
    count: number;
    resolve: (result: BatchResult) => void;
}

/**
 * Pilote fn_account_generator (script Python externe) pour créer des comptes Epic
 * à la demande via /createbot et /admin createbot. Un seul job à la fois (le script
 * pilote un navigateur + résout des captchas — deux instances en parallèle se
 * marcheraient dessus), les jobs s'empilent dans une file FIFO.
 */
export class GeneratorManager {
    private dbManager: DatabaseManager;
    private botManager: BotManager;
    private queue: QueueItem[] = [];
    private processing = false;

    constructor(dbManager: DatabaseManager, botManager: BotManager) {
        this.dbManager = dbManager;
        this.botManager = botManager;
    }

    public queueLength(): number {
        return this.queue.length + (this.processing ? 1 : 0);
    }

    /** Utilisé par /createbot : 1 bot, propriétaire = l'utilisateur qui demande. */
    public async requestBot(discordId: string, pseudoSuffix: string): Promise<GenerationResult> {
        const batch = await this.requestBots(discordId, pseudoSuffix, 1);
        if (batch.successes.length > 0) {
            return { status: 'success', email: batch.successes[0].email, pseudo: batch.successes[0].pseudo };
        }
        return { status: 'failed', reason: batch.reason || 'Échec de la génération' };
    }

    /** Utilisé par /admin createbot : N bots, pas de propriétaire (flotte), pas de limite. */
    public requestBots(discordId: string | null, pseudoSuffix: string | undefined, count: number): Promise<BatchResult> {
        return new Promise((resolve) => {
            this.queue.push({ discordId, pseudoSuffix, count, resolve });
            this.processNext();
        });
    }

    private async processNext(): Promise<void> {
        if (this.processing) return;
        const item = this.queue.shift();
        if (!item) return;

        this.processing = true;
        try {
            const result = await this.runGenerator(item.pseudoSuffix, item.count);

            for (const account of result.successes) {
                if (item.discordId) {
                    await this.dbManager.setBotOwner(account.email, item.discordId);
                }
                const botAccount = await this.dbManager.getBotByEmail(account.email);
                if (botAccount) {
                    await this.botManager.launchBot(botAccount);
                }
            }

            item.resolve(result);
        } catch (e: any) {
            console.error('[GeneratorManager] Erreur inattendue:', e.message);
            sendAlert('generator-crash', '🔴 Erreur du générateur de comptes', `\`\`\`${e.message}\`\`\``, 'critical');
            item.resolve({ successes: [], failed: item.count, reason: e.message });
        } finally {
            this.processing = false;
            this.processNext();
        }
    }

    private runGenerator(pseudoSuffix: string | undefined, count: number): Promise<BatchResult> {
        return new Promise((resolve) => {
            const generatorPath = process.env.GENERATOR_PATH;
            if (!generatorPath) {
                resolve({ successes: [], failed: count, reason: 'GENERATOR_PATH non configuré' });
                return;
            }

            const pythonBin = process.env.PYTHON_BIN || 'python';
            const args = ['-m', 'src.main', '--create', String(count)];
            if (pseudoSuffix) args.push('--pseudo', pseudoSuffix);
            args.push('--json', '--quiet');

            console.log(`[GeneratorManager] Lancement: ${pythonBin} ${args.join(' ')}`);
            // PYTHONUTF8: sans console attachée, Python retombe sur cp1252 et crashe
            // (UnicodeEncodeError) dès que le générateur affiche sa bannière/emojis
            const proc = spawn(pythonBin, args, {
                cwd: generatorPath,
                env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
            });

            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', (d) => { stdout += d.toString(); });
            proc.stderr.on('data', (d) => { stderr += d.toString(); });

            // Sécurité : le script pilote un navigateur + résout des captchas, et attend 30s
            // entre chaque compte d'un même batch. On laisse ~90s de budget par compte + une
            // marge, plafonné à 1h pour ne pas bloquer la file indéfiniment sur un gros batch.
            const timeoutMs = Math.min(60 * 60 * 1000, Math.max(5 * 60 * 1000, count * 90 * 1000));
            const timeout = setTimeout(() => {
                proc.kill();
                resolve({ successes: [], failed: count, reason: `Timeout (${Math.round(timeoutMs / 60000)} min) — le générateur n'a pas répondu` });
            }, timeoutMs);

            proc.on('close', (code) => {
                clearTimeout(timeout);

                const jsonStart = stdout.lastIndexOf('\n{\n');
                const jsonText = jsonStart >= 0 ? stdout.slice(jsonStart + 1) : stdout;

                try {
                    const parsed = JSON.parse(jsonText);
                    const accounts: any[] = parsed?.accounts || [];
                    const successes = accounts
                        .filter(a => a.status === 'success')
                        .map(a => ({ email: a.email, pseudo: a.pseudo }));

                    if (successes.length > 0) {
                        resolve({ successes, failed: count - successes.length });
                    } else {
                        resolve({ successes: [], failed: count, reason: `Le générateur a échoué (code ${code})` });
                    }
                } catch {
                    console.error('[GeneratorManager] Sortie non-JSON:', stdout.slice(-2000), stderr.slice(-2000));
                    resolve({ successes: [], failed: count, reason: `Sortie invalide du générateur (code ${code})` });
                }
            });

            proc.on('error', (err) => {
                clearTimeout(timeout);
                resolve({ successes: [], failed: count, reason: `Impossible de lancer le générateur: ${err.message}` });
            });
        });
    }

    // ─── CONFIG (persisté dans config.json côté générateur) ────────────────────
    // Ces appels sont rapides (pas de navigateur/captcha) donc on ne passe pas par
    // la file d'attente — ils peuvent s'exécuter même pendant qu'un batch tourne.

    public setDefaultPseudo(pseudoSuffix: string): { ok: boolean; output: string } {
        return this.runQuickCommand(['--set-pseudo', pseudoSuffix]);
    }

    public setDigits(digits: number): { ok: boolean; output: string } {
        return this.runQuickCommand(['--set-digits', String(digits)]);
    }

    /**
     * Change l'email Gmail utilisé pour le Dot Trick, directement dans config.json.
     * Pas de flag CLI pour ça — attention : si c'est un Gmail RÉELLEMENT différent (pas
     * juste une variante à points du même compte), le mot de passe d'application encodé
     * existant ne sera plus valide, il faudra relancer --setup-gmail à la main sur la machine.
     */
    public setGmailAddress(email: string): { ok: boolean; output: string } {
        const generatorPath = process.env.GENERATOR_PATH;
        if (!generatorPath) return { ok: false, output: 'GENERATOR_PATH non configuré' };

        const configPath = path.join(generatorPath, 'config.json');
        try {
            const raw = fs.readFileSync(configPath, 'utf-8');
            const config = JSON.parse(raw);
            config.gmail = email;
            fs.writeFileSync(configPath, JSON.stringify(config, null, 4), 'utf-8');
            return { ok: true, output: `gmail défini sur ${email}` };
        } catch (e: any) {
            return { ok: false, output: `Erreur lecture/écriture config.json: ${e.message}` };
        }
    }

    public getStats(): { ok: boolean; stats?: any; output?: string } {
        const result = this.runQuickCommand(['--stats', '--json']);
        if (!result.ok) return { ok: false, output: result.output };
        try {
            // Le générateur imprime sa bannière ASCII avant le JSON : ne parser
            // qu'à partir de la première ligne qui ouvre un objet JSON.
            const jsonStart = result.output.search(/^\s*\{/m);
            const jsonText = jsonStart >= 0 ? result.output.slice(jsonStart) : result.output;
            return { ok: true, stats: JSON.parse(jsonText) };
        } catch {
            return { ok: false, output: result.output };
        }
    }

    private runQuickCommand(args: string[]): { ok: boolean; output: string } {
        const generatorPath = process.env.GENERATOR_PATH;
        if (!generatorPath) return { ok: false, output: 'GENERATOR_PATH non configuré' };

        const pythonBin = process.env.PYTHON_BIN || 'python';
        const result = spawnSync(pythonBin, ['-m', 'src.main', ...args], {
            cwd: generatorPath,
            timeout: 15_000,
            encoding: 'utf-8',
            env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
        });

        if (result.error) return { ok: false, output: result.error.message };
        if (result.status !== 0) return { ok: false, output: (result.stderr || result.stdout || '').trim() };
        return { ok: true, output: (result.stdout || '').trim() };
    }
}
