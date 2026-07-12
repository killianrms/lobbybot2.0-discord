import Database from 'better-sqlite3';
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

    constructor(csvManager: CSVManager) {
        this.csvManager = csvManager;

        const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/lobbybot.db');
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
        `);
        console.log('[Database] Tables ready');

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
}
