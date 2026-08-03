import { Pool, PoolClient } from 'pg';

export interface LoadoutPreset {
    name: string;
    outfit?: string;
    backpack?: string;
    pickaxe?: string;
    emote?: string;
    isActive: boolean;
}

export interface OwnerSettings {
    ownerDiscordId: string;
    creatorCode?: string;
    status?: string;
    joinMsg?: string;
    addMsg?: string;
}

import { BotAccount } from '../types';
import { CSVManager } from './CSVManager';

/**
 * DatabaseManager — backend PostgreSQL (base partagée avec le dashboard et
 * fn_account_generator).
 *
 * Connexion via DATABASE_URL, ex :
 *   DATABASE_URL=postgresql://lobbybot:***@postgres:5432/lobbybot
 *
 * Le schéma est créé par postgres-init/01-init.sh au premier démarrage du
 * conteneur postgres ; ici on ne fait que le consommer.
 */
export class DatabaseManager {
    private pool: Pool;
    private csvManager: CSVManager;

    constructor(csvManager: CSVManager) {
        this.csvManager = csvManager;

        const url = process.env.DATABASE_URL;
        if (!url) throw new Error('DATABASE_URL manquant (postgresql://user:pass@host:5432/lobbybot)');
        this.pool = new Pool({ connectionString: url, max: 5 });
        this.pool.on('error', (err) => console.error('[Database] Pool error:', err.message));

        console.log('[Database] PostgreSQL pool ready');
    }

    public async init(): Promise<void> {
        const { rows } = await this.pool.query('SELECT current_database() AS db, version() AS v');
        console.log(`[Database] Connected: ${rows[0].db} (${String(rows[0].v).split(' on ')[0]})`);
        await this.checkMigration();
    }

    /** Exécute fn dans une transaction (BEGIN/COMMIT, ROLLBACK sur erreur). */
    public async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await fn(client);
            await client.query('COMMIT');
            return result;
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    private async checkMigration(): Promise<void> {
        try {
            const { rows } = await this.pool.query('SELECT COUNT(*)::int AS count FROM epic_accounts');
            if (rows[0].count === 0) {
                console.log('[Database] DB empty, checking for CSV migration...');
                const accounts = await this.csvManager.readAccounts();
                if (accounts.length > 0) {
                    console.log(`[Database] Found ${accounts.length} accounts in CSV. Migrating...`);
                    await this.withTransaction(async (client) => {
                        for (const bot of accounts) {
                            await client.query(
                                `INSERT INTO epic_accounts (email, pseudo, device_id, account_id, secret_id)
                                 VALUES ($1, $2, $3, $4, $5)
                                 ON CONFLICT (email) DO NOTHING`,
                                [bot.email, bot.pseudo, bot.deviceAuth?.deviceId, bot.deviceAuth?.accountId, bot.deviceAuth?.secret]
                            );
                        }
                    });
                    console.log('[Database] Migration complete!');
                }
            }
        } catch (e: any) {
            console.error('[Database] Migration failed:', e.message);
        }
    }

    private rowToBot(row: any): BotAccount {
        return {
            email: row.email,
            pseudo: row.pseudo,
            password: '',
            ownerDiscordId: row.owner_discord_id ?? undefined,
            deviceAuth: { deviceId: row.device_id, accountId: row.account_id, secret: row.secret_id }
        };
    }

    public async getAllBots(): Promise<BotAccount[]> {
        const { rows } = await this.pool.query(
            "SELECT * FROM epic_accounts WHERE is_active IS DISTINCT FROM 0 AND secret_id IS NOT NULL AND secret_id <> ''"
        );
        return rows.map(r => this.rowToBot(r));
    }

    public async addBot(account: BotAccount, ownerDiscordId?: string): Promise<void> {
        await this.pool.query(
            `INSERT INTO epic_accounts (email, pseudo, device_id, account_id, secret_id, is_active, owner_discord_id)
             VALUES ($1, $2, $3, $4, $5, 1, $6)
             ON CONFLICT (email) DO UPDATE SET
                 pseudo = EXCLUDED.pseudo,
                 device_id = EXCLUDED.device_id,
                 account_id = EXCLUDED.account_id,
                 secret_id = EXCLUDED.secret_id,
                 is_active = 1,
                 owner_discord_id = COALESCE(EXCLUDED.owner_discord_id, epic_accounts.owner_discord_id)`,
            [account.email, account.pseudo, account.deviceAuth?.deviceId, account.deviceAuth?.accountId,
             account.deviceAuth?.secret, ownerDiscordId ?? account.ownerDiscordId ?? null]
        );
    }

    /**
     * Import en masse (upsert par email) — utilisé par /admin addbot avec un
     * fichier JSON. Tout passe dans UNE transaction. Retourne inserted/updated.
     */
    public async importBots(
        bots: Array<{ email: string; pseudo?: string; password_enc?: string; deviceId?: string; accountId?: string; secret?: string }>,
        ownerDiscordId: string
    ): Promise<{ inserted: number; updated: number }> {
        let inserted = 0;
        let updated = 0;
        await this.withTransaction(async (client) => {
            for (const b of bots) {
                const res = await client.query(
                    `INSERT INTO epic_accounts (email, pseudo, password_enc, device_id, account_id, secret_id, is_active, owner_discord_id)
                     VALUES ($1, $2, $3, $4, $5, $6, 1, $7)
                     ON CONFLICT (email) DO UPDATE SET
                         pseudo = EXCLUDED.pseudo,
                         password_enc = COALESCE(EXCLUDED.password_enc, epic_accounts.password_enc),
                         device_id = EXCLUDED.device_id,
                         account_id = EXCLUDED.account_id,
                         secret_id = EXCLUDED.secret_id,
                         is_active = 1,
                         owner_discord_id = EXCLUDED.owner_discord_id
                     RETURNING (xmax = 0) AS inserted`,
                    [b.email, b.pseudo ?? null, b.password_enc ?? null, b.deviceId ?? null,
                     b.accountId ?? null, b.secret ?? null, ownerDiscordId]
                );
                if (res.rows[0]?.inserted) inserted++; else updated++;
            }
        });
        return { inserted, updated };
    }

    public async removeBot(email: string): Promise<void> {
        await this.pool.query('DELETE FROM epic_accounts WHERE email = $1', [email]);
    }

    public async getBotByOwner(discordId: string): Promise<BotAccount | null> {
        const { rows } = await this.pool.query('SELECT * FROM epic_accounts WHERE owner_discord_id = $1 LIMIT 1', [discordId]);
        return rows[0] ? this.rowToBot(rows[0]) : null;
    }

    public async getBotByEmail(email: string): Promise<BotAccount | null> {
        const { rows } = await this.pool.query('SELECT * FROM epic_accounts WHERE email = $1', [email]);
        return rows[0] ? this.rowToBot(rows[0]) : null;
    }

    public async setBotOwner(email: string, discordId: string): Promise<void> {
        await this.pool.query('UPDATE epic_accounts SET owner_discord_id = $1 WHERE email = $2', [discordId, email]);
    }

    /** Tous les bots appartenant à cet utilisateur (flotte perso). */
    public async getBotsByOwner(discordId: string): Promise<BotAccount[]> {
        const { rows } = await this.pool.query('SELECT * FROM epic_accounts WHERE owner_discord_id = $1 ORDER BY created_at', [discordId]);
        return rows.map(r => this.rowToBot(r));
    }

    // --- ADMINS (table admins ; fallback .env ADMIN_IDS si table vide) ---

    public async getAdminIds(): Promise<string[]> {
        try {
            const { rows } = await this.pool.query('SELECT discord_id FROM admins');
            if (rows.length > 0) return rows.map(r => r.discord_id);
        } catch (e: any) {
            console.error('[Database] getAdminIds:', e.message);
        }
        // Fallback de secours : .env (base injoignable ou table vide)
        return process.env.ADMIN_IDS?.split(',').map(id => id.trim()).filter(Boolean)
            || ['335755692134891520'];
    }

    public async isAdmin(discordId: string): Promise<boolean> {
        return (await this.getAdminIds()).includes(discordId);
    }

    // --- OWNER SETTINGS (code créateur + messages par propriétaire) ---

    public async getOwnerSettings(ownerDiscordId: string): Promise<OwnerSettings | null> {
        const { rows } = await this.pool.query('SELECT * FROM owner_settings WHERE owner_discord_id = $1', [ownerDiscordId]);
        if (!rows[0]) return null;
        const r = rows[0];
        return {
            ownerDiscordId: r.owner_discord_id,
            creatorCode: r.creator_code ?? undefined,
            status: r.status ?? undefined,
            joinMsg: r.join_msg ?? undefined,
            addMsg: r.add_msg ?? undefined,
        };
    }

    public async getAllOwnerSettings(): Promise<OwnerSettings[]> {
        const { rows } = await this.pool.query('SELECT * FROM owner_settings');
        return rows.map(r => ({
            ownerDiscordId: r.owner_discord_id,
            creatorCode: r.creator_code ?? undefined,
            status: r.status ?? undefined,
            joinMsg: r.join_msg ?? undefined,
            addMsg: r.add_msg ?? undefined,
        }));
    }

    public async saveOwnerSettings(s: OwnerSettings): Promise<void> {
        await this.pool.query(
            `INSERT INTO owner_settings (owner_discord_id, creator_code, status, join_msg, add_msg, updated_at)
             VALUES ($1, $2, $3, $4, $5, now())
             ON CONFLICT (owner_discord_id) DO UPDATE SET
                 creator_code = EXCLUDED.creator_code,
                 status = EXCLUDED.status,
                 join_msg = EXCLUDED.join_msg,
                 add_msg = EXCLUDED.add_msg,
                 updated_at = now()`,
            [s.ownerDiscordId, s.creatorCode ?? null, s.status ?? null, s.joinMsg ?? null, s.addMsg ?? null]
        );
    }

    // --- PREMIUM ---

    /** True si l'utilisateur a un premium actif (pas d'expiration, ou expiration future). */
    public async isPremium(discordId: string): Promise<boolean> {
        const { rows } = await this.pool.query('SELECT expires_at FROM premium WHERE discord_id = $1', [discordId]);
        if (!rows[0]) return false;
        if (rows[0].expires_at) {
            const t = Date.parse(rows[0].expires_at);
            if (!Number.isNaN(t) && t < Date.now()) return false;
        }
        return true;
    }

    /** Accorde/renouvelle le premium. source: 'discord' | 'manual' | 'external'. */
    public async grantPremium(discordId: string, source: string, expiresAt: string | null = null): Promise<void> {
        await this.pool.query(
            `INSERT INTO premium (discord_id, source, granted_at, expires_at)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (discord_id) DO UPDATE SET
                 source = EXCLUDED.source,
                 granted_at = EXCLUDED.granted_at,
                 expires_at = EXCLUDED.expires_at`,
            [discordId, source, new Date().toISOString(), expiresAt]
        );
    }

    public async revokePremium(discordId: string): Promise<void> {
        await this.pool.query('DELETE FROM premium WHERE discord_id = $1', [discordId]);
    }

    /** Détails de l'abonnement (ou null). Ne filtre pas l'expiration — voir isPremium(). */
    public async getPremium(discordId: string): Promise<{ source: string; granted_at: string | null; expires_at: string | null } | null> {
        const { rows } = await this.pool.query('SELECT source, granted_at, expires_at FROM premium WHERE discord_id = $1', [discordId]);
        return rows[0] ?? null;
    }

    // --- LOADOUT PRESETS ---

    public async savePreset(discordId: string, preset: Omit<LoadoutPreset, 'isActive'>): Promise<void> {
        await this.pool.query(
            `INSERT INTO loadout_presets (discord_id, name, outfit, backpack, pickaxe, emote)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (discord_id, name) DO UPDATE SET
                 outfit = EXCLUDED.outfit, backpack = EXCLUDED.backpack,
                 pickaxe = EXCLUDED.pickaxe, emote = EXCLUDED.emote`,
            [discordId, preset.name, preset.outfit ?? null, preset.backpack ?? null,
             preset.pickaxe ?? null, preset.emote ?? null]
        );
    }

    public async listPresets(discordId: string): Promise<LoadoutPreset[]> {
        const { rows } = await this.pool.query('SELECT * FROM loadout_presets WHERE discord_id = $1 ORDER BY name', [discordId]);
        return rows.map(r => ({
            name: r.name, outfit: r.outfit ?? undefined, backpack: r.backpack ?? undefined,
            pickaxe: r.pickaxe ?? undefined, emote: r.emote ?? undefined, isActive: r.is_active === 1
        }));
    }

    /** Marque un preset comme actif (un seul actif par user). Renvoie false si introuvable. */
    public async setActivePreset(discordId: string, name: string): Promise<boolean> {
        return await this.withTransaction(async (client) => {
            const exists = await client.query('SELECT 1 FROM loadout_presets WHERE discord_id = $1 AND name = $2', [discordId, name]);
            if (exists.rowCount === 0) return false;
            await client.query('UPDATE loadout_presets SET is_active = 0 WHERE discord_id = $1', [discordId]);
            await client.query('UPDATE loadout_presets SET is_active = 1 WHERE discord_id = $1 AND name = $2', [discordId, name]);
            return true;
        });
    }

    public async getActivePreset(discordId: string): Promise<LoadoutPreset | null> {
        const { rows } = await this.pool.query('SELECT * FROM loadout_presets WHERE discord_id = $1 AND is_active = 1', [discordId]);
        const r = rows[0];
        if (!r) return null;
        return {
            name: r.name, outfit: r.outfit ?? undefined, backpack: r.backpack ?? undefined,
            pickaxe: r.pickaxe ?? undefined, emote: r.emote ?? undefined, isActive: true
        };
    }

    // --- USER MANAGEMENT ---

    public async saveUser(discordId: string, pseudo: string, deviceAuth: any): Promise<void> {
        await this.pool.query(
            `INSERT INTO users (discord_id, epic_pseudo, device_id, account_id, secret)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (discord_id) DO UPDATE SET
                 epic_pseudo = EXCLUDED.epic_pseudo,
                 device_id = EXCLUDED.device_id,
                 account_id = EXCLUDED.account_id,
                 secret = EXCLUDED.secret`,
            [discordId, pseudo, deviceAuth.deviceId, deviceAuth.accountId, deviceAuth.secret]
        );
    }

    private rowToUser(row: any): any {
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

    public async getUser(discordId: string): Promise<any | null> {
        const { rows } = await this.pool.query('SELECT * FROM users WHERE discord_id = $1', [discordId]);
        return rows[0] ? this.rowToUser(rows[0]) : null;
    }

    public async getAllUsers(): Promise<any[]> {
        const { rows } = await this.pool.query('SELECT * FROM users WHERE secret IS NOT NULL');
        return rows.map(r => this.rowToUser(r));
    }

    public async deleteUser(discordId: string): Promise<void> {
        await this.pool.query('DELETE FROM users WHERE discord_id = $1', [discordId]);
    }

    public async setLanguage(discordId: string, lang: string): Promise<void> {
        await this.pool.query(
            `INSERT INTO users (discord_id, language) VALUES ($1, $2)
             ON CONFLICT (discord_id) DO UPDATE SET language = EXCLUDED.language`,
            [discordId, lang]
        );
    }

    public async getLanguage(discordId: string): Promise<string> {
        const { rows } = await this.pool.query('SELECT language FROM users WHERE discord_id = $1', [discordId]);
        return rows[0]?.language || 'en';
    }

    // --- BACKUP / RESTORE (dump brut des deux tables, pour ne rien perdre en cas de migration/incident) ---

    public async exportRaw(): Promise<{ exported_at: string; epic_accounts: any[]; users: any[] }> {
        const accounts = await this.pool.query('SELECT * FROM epic_accounts ORDER BY id');
        const users = await this.pool.query('SELECT * FROM users');
        return {
            exported_at: new Date().toISOString(),
            epic_accounts: accounts.rows,
            users: users.rows,
        };
    }

    /**
     * Réimporte un dump produit par exportRaw(). Upsert par email (epic_accounts) / discord_id (users) —
     * ne supprime rien, ne fait qu'ajouter/mettre à jour. Retourne le nombre de lignes traitées.
     */
    public async importRaw(dump: { epic_accounts?: any[]; users?: any[] }): Promise<{ bots: number; users: number }> {
        let bots = 0;
        let users = 0;

        await this.withTransaction(async (client) => {
            for (const row of dump.epic_accounts || []) {
                if (!row.email) continue;
                await client.query(
                    `INSERT INTO epic_accounts (email, pseudo, password_enc, secret_id, device_id, account_id, is_active, owner_discord_id)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                     ON CONFLICT (email) DO UPDATE SET
                         pseudo = EXCLUDED.pseudo,
                         password_enc = EXCLUDED.password_enc,
                         secret_id = EXCLUDED.secret_id,
                         device_id = EXCLUDED.device_id,
                         account_id = EXCLUDED.account_id,
                         is_active = EXCLUDED.is_active,
                         owner_discord_id = EXCLUDED.owner_discord_id`,
                    [row.email, row.pseudo ?? null, row.password_enc ?? null, row.secret_id ?? null,
                     row.device_id ?? null, row.account_id ?? null, row.is_active ?? 1, row.owner_discord_id ?? null]
                );
                bots++;
            }

            for (const row of dump.users || []) {
                if (!row.discord_id) continue;
                await client.query(
                    `INSERT INTO users (discord_id, epic_pseudo, device_id, account_id, secret, language)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     ON CONFLICT (discord_id) DO UPDATE SET
                         epic_pseudo = EXCLUDED.epic_pseudo,
                         device_id = EXCLUDED.device_id,
                         account_id = EXCLUDED.account_id,
                         secret = EXCLUDED.secret,
                         language = EXCLUDED.language`,
                    [row.discord_id, row.epic_pseudo ?? null, row.device_id ?? null,
                     row.account_id ?? null, row.secret ?? null, row.language ?? 'en']
                );
                users++;
            }
        });

        return { bots, users };
    }
}
