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
                )
            `);
            
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
}
