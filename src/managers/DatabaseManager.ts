import Database from 'better-sqlite3';

export interface LoadoutPreset {
    name: string;
    outfit?: string;
    backpack?: string;
    pickaxe?: string;
    emote?: string;
    isActive: boolean;
}
import * as path from 'path';
import * as fs from 'fs';
import { BotAccount } from '../types';
import { CSVManager } from './CSVManager';

/**
 * DatabaseManager — SQLite backend (shared with the web dashboard).
 *
 * The database file is shared with lobbybot2.0-website so the Discord manager
 * and the dashboard read/write the exact same bots and users.
 *
 * Set DB_PATH in .env to the dashboard's data/lobbybot.db file, e.g.:
 *   DB_PATH=C:\\Users\\Aeroz\\Desktop\\dev\\bot\\lobbybot2.0-website\\data\\lobbybot.db
 *
 * If DB_PATH is not set, it falls back to a local ./data/lobbybot.db file.
 */
export class DatabaseManager {
    private db: Database.Database;
    private csvManager: CSVManager;
    public readonly dbPath: string;

    constructor(csvManager: CSVManager) {
        this.csvManager = csvManager;

        const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/lobbybot.db');
        this.dbPath = dbPath;
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });

        this.db = new Database(dbPath, { timeout: 30000 });
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('foreign_keys = ON');
        this.db.pragma('busy_timeout = 30000');

        console.log(`[Database] SQLite connected: ${dbPath}`);
    }

    public async init(): Promise<void> {
        // Create tables (idempotent — matches the dashboard schema)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS epic_accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                pseudo TEXT,
                password_enc TEXT,
                secret_id TEXT,
                device_id TEXT,
                account_id TEXT,
                is_active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_used_at DATETIME
            );
            CREATE TABLE IF NOT EXISTS users (
                discord_id TEXT PRIMARY KEY,
                epic_pseudo TEXT,
                device_id TEXT,
                account_id TEXT,
                secret TEXT,
                language TEXT DEFAULT 'en',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS premium (
                discord_id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                granted_at TEXT NOT NULL,
                expires_at TEXT
            );
        `);

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS loadout_presets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                discord_id TEXT NOT NULL,
                name TEXT NOT NULL,
                outfit TEXT,
                backpack TEXT,
                pickaxe TEXT,
                emote TEXT,
                is_active INTEGER NOT NULL DEFAULT 0,
                UNIQUE(discord_id, name)
            );
        `);
        console.log('[Database] Tables ready');

        // Migration : owner_discord_id (bots générés en self-service via /createbot).
        // La table est aussi écrite par fn_account_generator (Python), qui ne connaît
        // pas cette colonne — on l'ajoute nous-mêmes si elle manque.
        const columns = this.db.prepare("PRAGMA table_info(epic_accounts)").all() as any[];
        if (!columns.some(c => c.name === 'owner_discord_id')) {
            this.db.exec('ALTER TABLE epic_accounts ADD COLUMN owner_discord_id TEXT');
            console.log('[Database] Migration: colonne owner_discord_id ajoutée');
        }

        await this.checkMigration();
    }

    private async checkMigration(): Promise<void> {
        try {
            const row = this.db.prepare('SELECT COUNT(*) AS count FROM epic_accounts').get() as { count: number };
            if (row.count === 0) {
                console.log('[Database] DB empty, checking for CSV migration...');
                const accounts = await this.csvManager.readAccounts();
                if (accounts.length > 0) {
                    console.log(`[Database] Found ${accounts.length} accounts in CSV. Migrating...`);
                    const insert = this.db.prepare(`
                        INSERT INTO epic_accounts (email, pseudo, device_id, account_id, secret_id)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT(email) DO NOTHING
                    `);
                    const migrate = this.db.transaction((rows: BotAccount[]) => {
                        for (const bot of rows) {
                            insert.run(
                                bot.email,
                                bot.pseudo,
                                bot.deviceAuth?.deviceId,
                                bot.deviceAuth?.accountId,
                                bot.deviceAuth?.secret
                            );
                        }
                    });
                    migrate(accounts);
                    console.log('[Database] Migration complete!');
                }
            }
        } catch (e: any) {
            console.error('[Database] Migration failed:', e.message);
        }
    }

    public async getAllBots(): Promise<BotAccount[]> {
        const rows = this.db.prepare('SELECT * FROM epic_accounts WHERE is_active IS NOT 0').all() as any[];
        return rows
            .filter(row => row.secret_id)
            .map(row => ({
                email: row.email,
                pseudo: row.pseudo,
                password: '',
                deviceAuth: { deviceId: row.device_id, accountId: row.account_id, secret: row.secret_id }
            }));
    }

    public async addBot(account: BotAccount): Promise<void> {
        this.db.prepare(`
            INSERT INTO epic_accounts (email, pseudo, device_id, account_id, secret_id, is_active)
            VALUES (?, ?, ?, ?, ?, 1)
            ON CONFLICT(email) DO UPDATE SET
                pseudo = excluded.pseudo,
                device_id = excluded.device_id,
                account_id = excluded.account_id,
                secret_id = excluded.secret_id,
                is_active = 1
        `).run(
            account.email,
            account.pseudo,
            account.deviceAuth?.deviceId,
            account.deviceAuth?.accountId,
            account.deviceAuth?.secret
        );
    }

    public async removeBot(email: string): Promise<void> {
        this.db.prepare('DELETE FROM epic_accounts WHERE email = ?').run(email);
    }

    public async getBotByOwner(discordId: string): Promise<BotAccount | null> {
        const row = this.db.prepare('SELECT * FROM epic_accounts WHERE owner_discord_id = ?').get(discordId) as any;
        if (!row) return null;
        return {
            email: row.email,
            pseudo: row.pseudo,
            password: '',
            ownerDiscordId: row.owner_discord_id,
            deviceAuth: { deviceId: row.device_id, accountId: row.account_id, secret: row.secret_id }
        };
    }

    public async getBotByEmail(email: string): Promise<BotAccount | null> {
        const row = this.db.prepare('SELECT * FROM epic_accounts WHERE email = ?').get(email) as any;
        if (!row) return null;
        return {
            email: row.email,
            pseudo: row.pseudo,
            password: '',
            ownerDiscordId: row.owner_discord_id,
            deviceAuth: { deviceId: row.device_id, accountId: row.account_id, secret: row.secret_id }
        };
    }

    public async setBotOwner(email: string, discordId: string): Promise<void> {
        this.db.prepare('UPDATE epic_accounts SET owner_discord_id = ? WHERE email = ?').run(discordId, email);
    }

    // --- PREMIUM ---

    /** True si l'utilisateur a un premium actif (pas d'expiration, ou expiration future). */
    public isPremium(discordId: string): boolean {
        const row = this.db
            .prepare('SELECT expires_at FROM premium WHERE discord_id = ?')
            .get(discordId) as { expires_at: string | null } | undefined;
        if (!row) return false;
        if (row.expires_at) {
            const t = Date.parse(row.expires_at);
            if (!Number.isNaN(t) && t < Date.now()) return false;
        }
        return true;
    }

    /** Accorde/renouvelle le premium. source: 'discord' | 'manual' | 'external'. */
    public grantPremium(discordId: string, source: string, expiresAt: string | null = null): void {
        this.db.prepare(`
            INSERT INTO premium (discord_id, source, granted_at, expires_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(discord_id) DO UPDATE SET
                source = excluded.source,
                granted_at = excluded.granted_at,
                expires_at = excluded.expires_at
        `).run(discordId, source, new Date().toISOString(), expiresAt);
    }

    public revokePremium(discordId: string): void {
        this.db.prepare('DELETE FROM premium WHERE discord_id = ?').run(discordId);
    }

    /** Tous les bots appartenant à cet utilisateur (flotte perso). */
    public getBotsByOwner(discordId: string): BotAccount[] {
        const rows = this.db
            .prepare('SELECT * FROM epic_accounts WHERE owner_discord_id = ?')
            .all(discordId) as any[];
        return rows.map(row => ({
            email: row.email,
            pseudo: row.pseudo,
            password: '',
            ownerDiscordId: row.owner_discord_id,
            deviceAuth: { deviceId: row.device_id, accountId: row.account_id, secret: row.secret_id }
        }));
    }

    // --- LOADOUT PRESETS ---

    public savePreset(discordId: string, preset: Omit<LoadoutPreset, 'isActive'>): void {
        this.db.prepare(`
            INSERT INTO loadout_presets (discord_id, name, outfit, backpack, pickaxe, emote)
            VALUES (@discord_id, @name, @outfit, @backpack, @pickaxe, @emote)
            ON CONFLICT(discord_id, name) DO UPDATE SET
                outfit = excluded.outfit, backpack = excluded.backpack,
                pickaxe = excluded.pickaxe, emote = excluded.emote
        `).run({
            discord_id: discordId, name: preset.name,
            outfit: preset.outfit ?? null, backpack: preset.backpack ?? null,
            pickaxe: preset.pickaxe ?? null, emote: preset.emote ?? null
        });
    }

    public listPresets(discordId: string): LoadoutPreset[] {
        const rows = this.db.prepare('SELECT * FROM loadout_presets WHERE discord_id = ? ORDER BY name').all(discordId) as any[];
        return rows.map(r => ({
            name: r.name, outfit: r.outfit ?? undefined, backpack: r.backpack ?? undefined,
            pickaxe: r.pickaxe ?? undefined, emote: r.emote ?? undefined, isActive: r.is_active === 1
        }));
    }

    /** Marque un preset comme actif (un seul actif par user). Renvoie false si introuvable. */
    public setActivePreset(discordId: string, name: string): boolean {
        const exists = this.db.prepare('SELECT 1 FROM loadout_presets WHERE discord_id = ? AND name = ?').get(discordId, name);
        if (!exists) return false;
        this.db.prepare('UPDATE loadout_presets SET is_active = 0 WHERE discord_id = ?').run(discordId);
        this.db.prepare('UPDATE loadout_presets SET is_active = 1 WHERE discord_id = ? AND name = ?').run(discordId, name);
        return true;
    }

    public getActivePreset(discordId: string): LoadoutPreset | null {
        const r = this.db.prepare('SELECT * FROM loadout_presets WHERE discord_id = ? AND is_active = 1').get(discordId) as any;
        if (!r) return null;
        return {
            name: r.name, outfit: r.outfit ?? undefined, backpack: r.backpack ?? undefined,
            pickaxe: r.pickaxe ?? undefined, emote: r.emote ?? undefined, isActive: true
        };
    }

    // --- USER MANAGEMENT ---

    public async saveUser(discordId: string, pseudo: string, deviceAuth: any): Promise<void> {
        this.db.prepare(`
            INSERT INTO users (discord_id, epic_pseudo, device_id, account_id, secret)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(discord_id) DO UPDATE SET
                epic_pseudo = excluded.epic_pseudo,
                device_id = excluded.device_id,
                account_id = excluded.account_id,
                secret = excluded.secret
        `).run(discordId, pseudo, deviceAuth.deviceId, deviceAuth.accountId, deviceAuth.secret);
    }

    public async getUser(discordId: string): Promise<any | null> {
        const row = this.db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId) as any;
        if (!row) return null;
        return {
            discordId: row.discord_id,
            pseudo: row.epic_pseudo,
            language: row.language || 'en',
            deviceAuth: {
                deviceId: row.device_id,
                accountId: row.account_id,
                secret: row.secret
            }
        };
    }

    public async getAllUsers(): Promise<any[]> {
        const rows = this.db.prepare('SELECT * FROM users WHERE secret IS NOT NULL').all() as any[];
        return rows.map(row => ({
            discordId: row.discord_id,
            pseudo: row.epic_pseudo,
            language: row.language || 'en',
            deviceAuth: {
                deviceId: row.device_id,
                accountId: row.account_id,
                secret: row.secret
            }
        }));
    }

    public async deleteUser(discordId: string): Promise<void> {
        this.db.prepare('DELETE FROM users WHERE discord_id = ?').run(discordId);
    }

    public async setLanguage(discordId: string, lang: string): Promise<void> {
        this.db.prepare(`
            INSERT INTO users (discord_id, language)
            VALUES (?, ?)
            ON CONFLICT(discord_id) DO UPDATE SET language = excluded.language
        `).run(discordId, lang);
    }

    public async getLanguage(discordId: string): Promise<string> {
        const row = this.db.prepare('SELECT language FROM users WHERE discord_id = ?').get(discordId) as any;
        return row?.language || 'en';
    }

    // --- BACKUP / RESTORE (dump brut des deux tables, pour ne rien perdre en cas de migration/incident) ---

    public async exportRaw(): Promise<{ exported_at: string; epic_accounts: any[]; users: any[] }> {
        return {
            exported_at: new Date().toISOString(),
            epic_accounts: this.db.prepare('SELECT * FROM epic_accounts').all(),
            users: this.db.prepare('SELECT * FROM users').all(),
        };
    }

    /**
     * Réimporte un dump produit par exportRaw(). Upsert par email (epic_accounts) / discord_id (users) —
     * ne supprime rien, ne fait qu'ajouter/mettre à jour. Retourne le nombre de lignes traitées.
     */
    public async importRaw(dump: { epic_accounts?: any[]; users?: any[] }): Promise<{ bots: number; users: number }> {
        let bots = 0;
        let users = 0;

        const upsertBot = this.db.prepare(`
            INSERT INTO epic_accounts (email, pseudo, password_enc, secret_id, device_id, account_id, is_active, owner_discord_id)
            VALUES (@email, @pseudo, @password_enc, @secret_id, @device_id, @account_id, @is_active, @owner_discord_id)
            ON CONFLICT(email) DO UPDATE SET
                pseudo = excluded.pseudo,
                password_enc = excluded.password_enc,
                secret_id = excluded.secret_id,
                device_id = excluded.device_id,
                account_id = excluded.account_id,
                is_active = excluded.is_active,
                owner_discord_id = excluded.owner_discord_id
        `);
        for (const row of dump.epic_accounts || []) {
            if (!row.email) continue;
            upsertBot.run({
                email: row.email,
                pseudo: row.pseudo ?? null,
                password_enc: row.password_enc ?? null,
                secret_id: row.secret_id ?? null,
                device_id: row.device_id ?? null,
                account_id: row.account_id ?? null,
                is_active: row.is_active ?? 1,
                owner_discord_id: row.owner_discord_id ?? null,
            });
            bots++;
        }

        const upsertUser = this.db.prepare(`
            INSERT INTO users (discord_id, epic_pseudo, device_id, account_id, secret, language)
            VALUES (@discord_id, @epic_pseudo, @device_id, @account_id, @secret, @language)
            ON CONFLICT(discord_id) DO UPDATE SET
                epic_pseudo = excluded.epic_pseudo,
                device_id = excluded.device_id,
                account_id = excluded.account_id,
                secret = excluded.secret,
                language = excluded.language
        `);
        for (const row of dump.users || []) {
            if (!row.discord_id) continue;
            upsertUser.run({
                discord_id: row.discord_id,
                epic_pseudo: row.epic_pseudo ?? null,
                device_id: row.device_id ?? null,
                account_id: row.account_id ?? null,
                secret: row.secret ?? null,
                language: row.language ?? 'en',
            });
            users++;
        }

        return { bots, users };
    }
}
