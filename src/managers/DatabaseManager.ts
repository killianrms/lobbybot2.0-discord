import { Pool } from 'pg';
import { BotAccount } from '../types';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { CSVManager } from './CSVManager';

export class DatabaseManager {
    private pool: Pool;
    private csvManager: CSVManager;

    constructor(csvManager: CSVManager) {
        this.csvManager = csvManager;

        const isExternal = process.env.DB_HOST && process.env.DB_HOST !== 'localhost' && process.env.DB_HOST !== '127.0.0.1';

        this.pool = new Pool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'lobbybot',
            password: process.env.DB_PASS || 'lobbybotpassword',
            database: process.env.DB_NAME || 'lobbybot',
            port: parseInt(process.env.DB_PORT || '5432', 10),
            ssl: isExternal ? { rejectUnauthorized: false } : false,
            connectionTimeoutMillis: 10000,
            idleTimeoutMillis: 30000,
        });

        // Handle unexpected pool errors to prevent crashes
        this.pool.on('error', (err) => {
            console.error('[Database] Pool error (will reconnect on next query):', err.message);
        });
    }

    public async init(retries = 5, delay = 3000): Promise<void> {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const client = await this.pool.connect();
                console.log('[Database] Connected to PostgreSQL');

                // Create tables
                await client.query(`
                    CREATE TABLE IF NOT EXISTS epic_accounts (
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

                // Migration: copy bots → epic_accounts if legacy table exists and epic_accounts is empty
                try {
                    const legacyExists = await client.query(`SELECT to_regclass('public.bots') AS tbl`);
                    if (legacyExists.rows[0]?.tbl) {
                        const epCount = await client.query('SELECT count(*) AS c FROM epic_accounts');
                        if (parseInt(epCount.rows[0].c) === 0) {
                            await client.query(`INSERT INTO epic_accounts SELECT * FROM bots ON CONFLICT DO NOTHING`);
                            console.log('[Database] Migrated bots → epic_accounts');
                        }
                    }
                } catch { /* bots table may not exist */ }

                // Migration for existing users table if language column is missing
                try {
                    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';`);
                    await client.query(`ALTER TABLE users ALTER COLUMN language SET DEFAULT 'en';`);
                } catch (e) {
                    // Column likely exists or other minor issue
                }

                client.release();
                await this.checkMigration();
                return; // Success — exit the retry loop

            } catch (e: any) {
                console.error(`[Database] Connection attempt ${attempt}/${retries} failed: ${e.message}`);
                if (attempt < retries) {
                    const waitTime = delay * attempt;
                    console.log(`[Database] Retrying in ${waitTime / 1000}s...`);
                    await new Promise(r => setTimeout(r, waitTime));
                } else {
                    console.error('[Database] All connection attempts failed. The bot will start but DB features will be unavailable.');
                }
            }
        }
    }

    private encryptSecret(plaintext: string): string | null {
        const masterKey = process.env.EPIC_MASTER_KEY;
        if (!masterKey) {
            console.warn('[Database] EPIC_MASTER_KEY not set, cannot encrypt secret');
            return null;
        }
        const iv = crypto.randomBytes(16);
        const key = crypto.createHash('sha256').update(masterKey).digest();
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return `${iv.toString('hex')}:${encrypted}`;
    }

    private decryptSecret(encrypted: string | null): string | null {
        if (!encrypted) return null;
        const masterKey = process.env.EPIC_MASTER_KEY;
        if (!masterKey) {
            console.warn('[Database] EPIC_MASTER_KEY not set, cannot decrypt secret');
            return null;
        }
        try {
            // Format: iv_hex:ciphertext_hex (AES-256-CBC, key = SHA-256(EPIC_MASTER_KEY))
            const parts = encrypted.split(':');
            if (parts.length === 2) {
                const iv = Buffer.from(parts[0], 'hex');
                const key = crypto.createHash('sha256').update(masterKey).digest();
                const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
                let decrypted = decipher.update(parts[1], 'hex', 'utf8');
                decrypted += decipher.final('utf8');
                return decrypted;
            }
        } catch (e: any) {
            console.error('[Database] Decryption failed:', e.message);
        }
        return null;
    }

    private async checkMigration() {
        try {
            const res = await this.pool.query('SELECT count(*) as count FROM epic_accounts');
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
                                INSERT INTO epic_accounts (email, pseudo, device_id, account_id, secret)
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
        const res = await this.pool.query('SELECT * FROM epic_accounts WHERE is_active IS DISTINCT FROM false');
        if (res.rows.length > 0) {
            const sample = res.rows[0].secret_enc ?? res.rows[0].secret ?? 'NULL';
            // Temporary: log format of encrypted value to identify correct decryption scheme
            console.log(`[Database] secret_enc sample (60 chars): "${String(sample).substring(0, 60)}"`);
        }
        return res.rows.map(row => ({
            email: row.email,
            pseudo: row.pseudo,
            password: '',
            deviceAuth: {
                deviceId: row.device_id,
                accountId: row.account_id,
                secret: row.secret_enc
                    ? this.decryptSecret(row.secret_enc)
                    : (row.secret ?? null)
            }
        }));
    }

    public async addBot(account: BotAccount): Promise<void> {
        const secretEnc = account.deviceAuth?.secret
            ? this.encryptSecret(account.deviceAuth.secret)
            : null;

        await this.pool.query(`
            INSERT INTO epic_accounts (email, pseudo, device_id, account_id, secret_enc)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (email) DO UPDATE SET
                pseudo = EXCLUDED.pseudo,
                device_id = EXCLUDED.device_id,
                account_id = EXCLUDED.account_id,
                secret_enc = EXCLUDED.secret_enc
        `, [
            account.email,
            account.pseudo,
            account.deviceAuth?.deviceId,
            account.deviceAuth?.accountId,
            secretEnc
        ]);
    }

    public async removeBot(email: string): Promise<void> {
        await this.pool.query('DELETE FROM epic_accounts WHERE email = $1', [email]);
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
