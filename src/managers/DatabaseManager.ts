import { Pool } from 'pg';
import { BotAccount } from '../types';
import fs from 'fs';
import path from 'path';
import { CSVManager } from './CSVManager';

export class DatabaseManager {
    private pool: Pool;
    private csvManager: CSVManager;

    constructor(csvManager: CSVManager) {
        this.csvManager = csvManager;

        this.pool = new Pool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'lobbybot',
            password: process.env.DB_PASS || 'lobbybotpassword',
            database: process.env.DB_NAME || 'lobbybot',
            port: 5432,
        });

        this.init();
    }

    private async init() {
        try {
            const client = await this.pool.connect();
            console.log('[Database] Connected to PostgreSQL');

            // Create table
            await client.query(`
                CREATE TABLE IF NOT EXISTS bots (
                    email TEXT PRIMARY KEY,
                    pseudo TEXT,
                    device_id TEXT,
                    account_id TEXT,
                    secret TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS users (
                    discord_id TEXT PRIMARY KEY,
                    epic_pseudo TEXT,
                    device_id TEXT,
                    account_id TEXT,
                    secret TEXT,
                    language TEXT DEFAULT 'en',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Migration for existing users table if language column is missing
            try {
                await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';`);
                // Also update default for future rows if table existed but we want new default
                await client.query(`ALTER TABLE users ALTER COLUMN language SET DEFAULT 'en';`);
            } catch (e) {
                // Column likely exists or other minor issue
            }

            client.release();
            await this.checkMigration();

        } catch (e: any) {
            console.error('[Database] Connection failed:', e.message);
        }
    }

    private async checkMigration() {
        try {
            const res = await this.pool.query('SELECT count(*) as count FROM bots');
            const rowCount = parseInt(res.rows[0].count);

            if (rowCount === 0) {
                console.log('[Database] DB empty, checking for CSV migration...');

                const accounts = await this.csvManager.readAccounts();
                if (accounts.length > 0) {
                    console.log(`[Database] Found ${accounts.length} accounts in CSV. Migrating...`);

                    const client = await this.pool.connect();
                    try {
                        await client.query('BEGIN');

                        for (const bot of accounts) {
                            await client.query(`
                                INSERT INTO bots (email, pseudo, device_id, account_id, secret)
                                VALUES ($1, $2, $3, $4, $5)
                                ON CONFLICT (email) DO NOTHING
                            `, [
                                bot.email,
                                bot.pseudo,
                                bot.deviceAuth?.deviceId,
                                bot.deviceAuth?.accountId,
                                bot.deviceAuth?.secret
                            ]);
                        }

                        await client.query('COMMIT');
                        console.log('[Database] Migration complete!');
                    } catch (e) {
                        await client.query('ROLLBACK');
                        throw e;
                    } finally {
                        client.release();
                    }
                }
            }
        } catch (e: any) {
            console.error('[Database] Migration failed:', e.message);
        }
    }

    public async getAllBots(): Promise<BotAccount[]> {
        const res = await this.pool.query('SELECT * FROM bots');
        return res.rows.map(row => ({
            email: row.email,
            pseudo: row.pseudo,
            password: '', // Dummy password for type compatibility
            deviceAuth: {
                deviceId: row.device_id,
                accountId: row.account_id,
                secret: row.secret
            }
        }));
    }

    public async addBot(account: BotAccount): Promise<void> {
        await this.pool.query(`
            INSERT INTO bots (email, pseudo, device_id, account_id, secret)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (email) DO UPDATE SET
                pseudo = EXCLUDED.pseudo,
                device_id = EXCLUDED.device_id,
                account_id = EXCLUDED.account_id,
                secret = EXCLUDED.secret
        `, [
            account.email,
            account.pseudo,
            account.deviceAuth?.deviceId,
            account.deviceAuth?.accountId,
            account.deviceAuth?.secret
        ]);
    }

    public async removeBot(email: string): Promise<void> {
        await this.pool.query('DELETE FROM bots WHERE email = $1', [email]);
    }

    // --- USER MANAGEMENT ---

    public async saveUser(discordId: string, pseudo: string, deviceAuth: any): Promise<void> {
        await this.pool.query(`
            INSERT INTO users (discord_id, epic_pseudo, device_id, account_id, secret)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (discord_id) DO UPDATE SET
                epic_pseudo = EXCLUDED.epic_pseudo,
                device_id = EXCLUDED.device_id,
                account_id = EXCLUDED.account_id,
                secret = EXCLUDED.secret
        `, [
            discordId,
            pseudo,
            deviceAuth.deviceId,
            deviceAuth.accountId,
            deviceAuth.secret
        ]);
    }

    public async getUser(discordId: string): Promise<any | null> {
        const res = await this.pool.query('SELECT * FROM users WHERE discord_id = $1', [discordId]);

        if (res.rows.length === 0) return null;

        const row = res.rows[0];
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
        await this.pool.query('DELETE FROM users WHERE discord_id = $1', [discordId]);
    }

    public async setLanguage(discordId: string, lang: string): Promise<void> {
        // Upsert logic: if user doesn't exist, we just create a row with the language? 
        // Or we assume user exists? For robustnes, we should probably allows setting language even if not logged in fully?
        // But for this bot, 'users' table is for logged in users with credentials.
        // If we want to support language for non-logged in users we'd need a separate table or just row without credentials.
        // For simplicity, let's assume we update if exists, or insert if not (but without auth).

        await this.pool.query(`
            INSERT INTO users (discord_id, language)
            VALUES ($1, $2)
            ON CONFLICT (discord_id) DO UPDATE SET
                language = EXCLUDED.language
        `, [discordId, lang]);
    }

    public async getLanguage(discordId: string): Promise<string> {
        const res = await this.pool.query('SELECT language FROM users WHERE discord_id = $1', [discordId]);
        if (res.rows.length > 0) {
            return res.rows[0].language || 'en';
        }
        return 'en';
    }
}
