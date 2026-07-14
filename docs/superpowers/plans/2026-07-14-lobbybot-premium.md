# LobbyBot Premium Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a paid "LobbyBot Premium" tier where each subscriber gets their own personal fleet of bots they can summon into their own Fortnite party, with synced emotes, loadout presets, and priority generation.

**Architecture:** Premium status is stored as an internal flag in a `premium` SQLite table (source-agnostic), fed either by Discord App Subscription entitlements or a manual admin grant (for testing / external payment). All premium features gate on a single `dbManager.isPremium(discordId)` check. Personal bots are the existing `epic_accounts.owner_discord_id` rows; `/squad` reuses the already-built `BotManager.inviteToParty()`.

**Tech Stack:** TypeScript, discord.js ^14.25.1, better-sqlite3 (synchronous), fnbr ^4.1.2. Build with `npm run build` (tsc). No unit-test framework in this repo — verification is `npm run build` + concrete runtime checks (Discord command in the test guild + PM2 logs + `node -e` against the DB).

## Global Constraints

- Runtime host: PM2 under `PM2_HOME=C:\Users\Aeroz\.pm2`. To reload after a build: `$env:PM2_HOME='C:\Users\Aeroz\.pm2'; pm2 restart lobbybot-discord`.
- DB is shared with the dashboard; schema changes must be `CREATE TABLE IF NOT EXISTS` / additive `ALTER TABLE` migrations only (never drop/rename existing columns).
- better-sqlite3 is synchronous — new DB helpers are sync (no `async`/`await`), even though some existing methods are `async`.
- Commands live in `src/commands/*.ts`, are registered in `src/commands/index.ts`, and receive `CommandContext` (`botManager`, `userManager`, `apiManager`, `dbManager`, `generatorManager`, `backupManager`).
- Premium launch quota: **3 personal bots** (env `PREMIUM_BOT_QUOTA`, default `3`). Free quota: **1** (unchanged behaviour).
- Price/tier copy: "LobbyBot Premium", single tier. Do not hardcode the price in code.
- All new user-facing strings in French (matches existing commands).

---

## File Structure

- `src/config/premium.ts` — **Create.** Central premium constants (quota, env keys).
- `src/managers/DatabaseManager.ts` — **Modify.** New `premium` + `loadout_presets` tables; `isPremium`, `grantPremium`, `revokePremium`, `getBotsByOwner`, preset CRUD.
- `src/commands/premiumGuard.ts` — **Create.** `requirePremium()` shared gate + upsell reply.
- `src/commands/AdminCommand.ts` — **Modify.** `premium` subcommand (manual grant/revoke).
- `src/commands/SquadCommand.ts` — **Create.** `/squad`.
- `src/commands/EmoteAllCommand.ts` — **Create.** `/emote-all`.
- `src/commands/PresetCommand.ts` — **Create.** `/preset save|apply|list`.
- `src/commands/CreateBotCommand.ts` — **Modify.** Quota by premium; pass priority.
- `src/managers/GeneratorManager.ts` — **Modify.** Priority queue.
- `src/managers/DiscordManager.ts` — **Modify.** Entitlement listeners + role sync.
- `src/commands/index.ts` — **Modify.** Register new commands.
- `.env` — **Modify.** `PREMIUM_BOT_QUOTA`, `PREMIUM_ROLE_ID`, `PREMIUM_SKU_ID`.

---

## Task 1: Premium core (DB flag + config)

**Files:**
- Create: `src/config/premium.ts`
- Modify: `src/managers/DatabaseManager.ts` (add table in `init()`, add methods after `setBotOwner`)

**Interfaces:**
- Produces:
  - `PREMIUM_BOT_QUOTA: number`, `FREE_BOT_QUOTA: number`, `PREMIUM_ROLE_ID: string | undefined`, `PREMIUM_SKU_ID: string | undefined` (from `src/config/premium.ts`)
  - `DatabaseManager.isPremium(discordId: string): boolean`
  - `DatabaseManager.grantPremium(discordId: string, source: string, expiresAt?: string | null): void`
  - `DatabaseManager.revokePremium(discordId: string): void`
  - `DatabaseManager.getBotsByOwner(discordId: string): BotAccount[]`

- [ ] **Step 1: Create the config module**

Create `src/config/premium.ts`:

```typescript
/** Constantes centrales de l'offre premium. */
export const FREE_BOT_QUOTA = 1;
export const PREMIUM_BOT_QUOTA = parseInt(process.env.PREMIUM_BOT_QUOTA || '3', 10);

/** Rôle Discord attribué aux membres premium (facultatif tant que non configuré). */
export const PREMIUM_ROLE_ID = process.env.PREMIUM_ROLE_ID;

/** SKU de l'abonnement premium (Discord App Subscription). */
export const PREMIUM_SKU_ID = process.env.PREMIUM_SKU_ID;

export function botQuotaFor(isPremium: boolean): number {
    return isPremium ? PREMIUM_BOT_QUOTA : FREE_BOT_QUOTA;
}
```

- [ ] **Step 2: Create the `premium` table**

In `src/managers/DatabaseManager.ts`, inside `init()`, right after the `users` table `CREATE TABLE` block, add:

```typescript
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS premium (
                discord_id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                granted_at TEXT NOT NULL,
                expires_at TEXT
            );
        `);
```

- [ ] **Step 3: Add the premium + fleet methods**

In `src/managers/DatabaseManager.ts`, immediately after the `setBotOwner` method, add:

```typescript
    // --- PREMIUM ---

    /** True si l'utilisateur a un premium actif (pas d'expiration, ou expiration future). */
    public isPremium(discordId: string): boolean {
        const row = this.db
            .prepare('SELECT expires_at FROM premium WHERE discord_id = ?')
            .get(discordId) as { expires_at: string | null } | undefined;
        if (!row) return false;
        if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return false;
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
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: compiles with no errors.

- [ ] **Step 5: Runtime verify the table + round-trip**

Run (uses the shared DB via `DB_PATH` from `.env`; adjust the path if needed):

```bash
node -e "const D=require('better-sqlite3'); const p=process.env.DB_PATH||'./data/lobbybot.db'; const db=new D(p); db.prepare('CREATE TABLE IF NOT EXISTS premium (discord_id TEXT PRIMARY KEY, source TEXT NOT NULL, granted_at TEXT NOT NULL, expires_at TEXT)').run(); db.prepare(\"INSERT OR REPLACE INTO premium VALUES ('TEST','manual',datetime('now'),NULL)\").run(); console.log('row:', db.prepare(\"SELECT * FROM premium WHERE discord_id='TEST'\").get()); db.prepare(\"DELETE FROM premium WHERE discord_id='TEST'\").run();"
```
Expected: prints a `row:` object with `discord_id: 'TEST'`, then cleans it up.

- [ ] **Step 6: Commit**

```bash
git add src/config/premium.ts src/managers/DatabaseManager.ts
git commit -m "feat(premium): premium table + isPremium/grant/revoke + getBotsByOwner"
```

---

## Task 2: Manual admin grant (`/admin premium`)

Lets you flip premium on your own account to test every premium feature before Discord monetization is live.

**Files:**
- Modify: `src/commands/AdminCommand.ts` (add subcommand builder + handler case)

**Interfaces:**
- Consumes: `DatabaseManager.grantPremium`, `DatabaseManager.revokePremium`, `DatabaseManager.isPremium` (Task 1)

- [ ] **Step 1: Add the subcommand to the builder**

In `src/commands/AdminCommand.ts`, after the `config` subcommand block (the last `.addSubcommand(...)` before `.execute`), add:

```typescript
        .addSubcommand(subcommand =>
            subcommand
                .setName('premium')
                .setDescription('Accorder ou retirer le premium à un utilisateur (test/manuel)')
                .addUserOption(option => option.setName('user').setDescription('Membre Discord').setRequired(true))
                .addStringOption(option => option.setName('action').setDescription('grant ou revoke').setRequired(true)
                    .addChoices({ name: 'grant', value: 'grant' }, { name: 'revoke', value: 'revoke' }))
                .addIntegerOption(option => option.setName('jours').setDescription('Durée en jours (grant seulement ; vide = illimité)').setRequired(false).setMinValue(1)))
```

- [ ] **Step 2: Add the handler case**

In `AdminCommand.execute`, in the `switch (subcommand)` block, add a `case 'premium':`:

```typescript
            case 'premium': {
                const target = interaction.options.getUser('user', true);
                const action = interaction.options.getString('action', true);
                if (action === 'revoke') {
                    context.dbManager.revokePremium(target.id);
                    await interaction.reply({ content: `✅ Premium retiré à ${target.tag}.`, ephemeral: true });
                    return;
                }
                const jours = interaction.options.getInteger('jours');
                const expiresAt = jours ? new Date(Date.now() + jours * 86400_000).toISOString() : null;
                context.dbManager.grantPremium(target.id, 'manual', expiresAt);
                await interaction.reply({
                    content: `✅ Premium accordé à ${target.tag}${jours ? ` pour ${jours} jour(s)` : ' (illimité)'}.`,
                    ephemeral: true
                });
                return;
            }
```

Note: if the existing switch uses `deferReply`/`editReply` at the top, mirror that pattern instead of `interaction.reply` to avoid double-acknowledge. Check the top of `execute` and match it.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 4: Runtime verify**

Rebuild + restart, then in the test guild run `/admin premium user:@you action:grant`, then confirm:

```bash
node -e "const D=require('better-sqlite3'); const db=new D(process.env.DB_PATH||'./data/lobbybot.db'); console.log(db.prepare('SELECT * FROM premium').all());"
```
Expected: your Discord ID appears with `source: 'manual'`.

- [ ] **Step 5: Commit**

```bash
git add src/commands/AdminCommand.ts
git commit -m "feat(premium): /admin premium grant|revoke for manual testing"
```

---

## Task 3: Premium guard + `/squad`

**Files:**
- Create: `src/commands/premiumGuard.ts`
- Create: `src/commands/SquadCommand.ts`
- Modify: `src/commands/index.ts` (import + register `SquadCommand`)

**Interfaces:**
- Consumes: `DatabaseManager.isPremium`, `DatabaseManager.getBotsByOwner`, `DatabaseManager.getUser`, `BotManager.getActiveBots`, `BotManager.inviteToParty(botPseudo, accountId)` (already exists)
- Produces: `requirePremium(interaction, dbManager): boolean`

- [ ] **Step 1: Create the guard**

Create `src/commands/premiumGuard.ts`:

```typescript
import { ChatInputCommandInteraction } from 'discord.js';
import { DatabaseManager } from '../managers/DatabaseManager';

/**
 * Renvoie true si l'utilisateur est premium. Sinon répond avec un message
 * d'upsell (éphémère) et renvoie false. À appeler en tête d'une commande premium
 * AVANT tout deferReply.
 */
export function requirePremium(interaction: ChatInputCommandInteraction, dbManager: DatabaseManager): boolean {
    if (dbManager.isPremium(interaction.user.id)) return true;
    interaction.reply({
        content: '🔒 Cette commande est réservée à **LobbyBot Premium**.\nAbonne-toi pour débloquer ta flotte perso, `/squad`, les emotes synchronisées et les presets !',
        ephemeral: true
    }).catch(() => {});
    return false;
}
```

- [ ] **Step 2: Create `/squad`**

Create `src/commands/SquadCommand.ts`:

```typescript
import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command, CommandContext } from './Command';
import { requirePremium } from './premiumGuard';

export const SquadCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('squad')
        .setDescription('[Premium] Fais rejoindre tes bots perso dans ton groupe Fortnite'),

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        if (!requirePremium(interaction, context.dbManager)) return;

        await interaction.deferReply({ ephemeral: true });

        const user = await context.dbManager.getUser(interaction.user.id);
        if (!user?.deviceAuth?.accountId) {
            await interaction.editReply('ℹ️ Connecte-toi d\'abord avec `/login` pour que tes bots puissent te rejoindre.');
            return;
        }

        const ownedBots = context.dbManager.getBotsByOwner(interaction.user.id);
        if (ownedBots.length === 0) {
            await interaction.editReply('ℹ️ Tu n\'as pas encore de bot perso. Crée-en un avec `/createbot`.');
            return;
        }

        const activePseudos = new Set(
            context.botManager.getActiveBots().filter((b: any) => b.isConnected).map((b: any) => b.account.pseudo)
        );
        const online = ownedBots.filter(b => b.pseudo && activePseudos.has(b.pseudo));
        if (online.length === 0) {
            await interaction.editReply('⚠️ Aucun de tes bots n\'est en ligne pour le moment. Réessaie dans un instant.');
            return;
        }

        const results: string[] = [];
        for (const bot of online) {
            const res = await context.botManager.inviteToParty(bot.pseudo as string, user.deviceAuth.accountId);
            results.push(`• ${bot.pseudo} → ${res.startsWith('✅') ? 'invité' : res}`);
            await new Promise(r => setTimeout(r, 600)); // espacement anti rate-limit
        }

        await interaction.editReply(`🎬 Ta squad arrive (${online.length} bot(s)) :\n${results.join('\n')}\nAccepte les invitations dans Fortnite !`);
    }
};
```

- [ ] **Step 3: Register the command**

In `src/commands/index.ts`: add `import { SquadCommand } from './SquadCommand';` with the other imports, and add `SquadCommand,` to the `baseCommands` array.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 5: Runtime verify**

Rebuild + restart the bot. In the test guild:
- As a non-premium user, `/squad` → shows the 🔒 upsell.
- As premium (from Task 2) with `/login` done and at least one owned bot online → the owned bot(s) send you a party invite in Fortnite; reply lists each bot.

- [ ] **Step 6: Commit**

```bash
git add src/commands/premiumGuard.ts src/commands/SquadCommand.ts src/commands/index.ts
git commit -m "feat(premium): /squad summons a user's personal bots into their party"
```

---

## Task 4: `/emote-all` (synced emotes)

**Files:**
- Create: `src/commands/EmoteAllCommand.ts`
- Modify: `src/commands/index.ts` (import + register)

**Interfaces:**
- Consumes: `requirePremium` (Task 3), `DatabaseManager.getBotsByOwner`, `BotManager.getActiveBots`, `FortniteAPIService.searchCosmetic`, `ModernParty.setEmote`
- Produces: `BotManager.emoteAllOwned(discordId, emoteId): Promise<number>` (count of bots that played it)

- [ ] **Step 1: Add the BotManager helper**

In `src/managers/BotManager.ts`, add near `inviteToParty`:

```typescript
    /** Joue la même emote (par id de cosmétique) sur tous les bots perso connectés de l'utilisateur. */
    async emoteAllOwned(discordId: string, emoteId: string): Promise<number> {
        const owned = this.dbManager.getBotsByOwner(discordId).map(b => b.pseudo);
        const bots = this.getActiveBots().filter(b => b.isConnected && b.client && owned.includes(b.account.pseudo));
        let count = 0;
        for (const b of bots) {
            try {
                await ModernParty.setEmote(b.client, emoteId);
                count++;
            } catch (e: any) {
                console.error(`[${b.account.pseudo}] emote sync échouée: ${e.message}`);
            }
        }
        return count;
    }
```

Note: confirm `ModernParty` is already imported in `BotManager.ts` (it is — used by `executeAction`). Confirm `this.dbManager` is the field name (it is).

- [ ] **Step 2: Create the command**

Create `src/commands/EmoteAllCommand.ts`:

```typescript
import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command, CommandContext } from './Command';
import { requirePremium } from './premiumGuard';
import { FortniteAPIService } from '../services/FortniteAPIService';

const api = new FortniteAPIService();

export const EmoteAllCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('emote-all')
        .setDescription('[Premium] Fais danser tous tes bots en même temps')
        .addStringOption(option =>
            option.setName('nom').setDescription('Nom de l\'emote/danse').setRequired(true)),

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        if (!requirePremium(interaction, context.dbManager)) return;
        await interaction.deferReply({ ephemeral: true });

        const query = interaction.options.getString('nom', true);
        const item = await api.searchCosmetic(query, 'emote');
        if (!item) { await interaction.editReply(`❌ Emote "${query}" introuvable.`); return; }

        const count = await context.botManager.emoteAllOwned(interaction.user.id, item.id);
        await interaction.editReply(
            count > 0
                ? `💃 **${item.name}** jouée sur ${count} de tes bots !`
                : '⚠️ Aucun de tes bots en ligne. Fais `/squad` d\'abord.'
        );
    }
};
```

- [ ] **Step 3: Register**

In `src/commands/index.ts`: import `EmoteAllCommand` and add it to `baseCommands`.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: no errors. (If `searchCosmetic`'s signature differs, match the one used in `src/actions/CosmeticsActions.ts` — `this.apiService.searchCosmetic(query, 'emote')` returning `{ id, name }`.)

- [ ] **Step 5: Runtime verify**

Rebuild + restart. As premium with bots online (post-`/squad`): `/emote-all nom:Floss` → your bots all emote; reply shows the count.

- [ ] **Step 6: Commit**

```bash
git add src/managers/BotManager.ts src/commands/EmoteAllCommand.ts src/commands/index.ts
git commit -m "feat(premium): /emote-all plays a synced emote across a user's bots"
```

---

## Task 5: Loadout presets (`/preset`)

**Files:**
- Modify: `src/managers/DatabaseManager.ts` (table + CRUD)
- Create: `src/commands/PresetCommand.ts`
- Modify: `src/commands/SquadCommand.ts` (auto-apply active preset)
- Modify: `src/commands/index.ts` (register)

**Interfaces:**
- Produces:
  - `interface LoadoutPreset { name: string; outfit?: string; backpack?: string; pickaxe?: string; emote?: string; isActive: boolean }`
  - `DatabaseManager.savePreset(discordId, preset): void`
  - `DatabaseManager.listPresets(discordId): LoadoutPreset[]`
  - `DatabaseManager.setActivePreset(discordId, name): boolean`
  - `DatabaseManager.getActivePreset(discordId): LoadoutPreset | null`
  - `BotManager.applyLoadoutToOwned(discordId, preset): Promise<number>`

- [ ] **Step 1: Create the table**

In `DatabaseManager.init()`, after the `premium` table:

```typescript
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
```

- [ ] **Step 2: Add the preset type + CRUD**

At the top of `DatabaseManager.ts` (after imports) add:

```typescript
export interface LoadoutPreset {
    name: string;
    outfit?: string;
    backpack?: string;
    pickaxe?: string;
    emote?: string;
    isActive: boolean;
}
```

After the premium methods, add:

```typescript
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
```

- [ ] **Step 3: Add the BotManager applier**

In `src/managers/BotManager.ts`, near `emoteAllOwned`, add (imports `LoadoutPreset` from DatabaseManager, and `ModernParty` already imported):

```typescript
    /** Applique un preset de loadout à tous les bots perso connectés de l'utilisateur. */
    async applyLoadoutToOwned(discordId: string, preset: import('./DatabaseManager').LoadoutPreset): Promise<number> {
        const owned = this.dbManager.getBotsByOwner(discordId).map(b => b.pseudo);
        const bots = this.getActiveBots().filter(b => b.isConnected && b.client && owned.includes(b.account.pseudo));
        let count = 0;
        for (const b of bots) {
            try {
                await ModernParty.setLoadout(b.client, {
                    outfit: preset.outfit, backpack: preset.backpack, pickaxe: preset.pickaxe
                });
                if (preset.emote) await ModernParty.setEmote(b.client, preset.emote);
                count++;
            } catch (e: any) {
                console.error(`[${b.account.pseudo}] preset échoué: ${e.message}`);
            }
        }
        return count;
    }
```

Note: `ModernParty.setLoadout` accepts `{ outfit?, backpack?, pickaxe? }` (see `CosmeticsActions`). Passing `undefined` fields leaves them unchanged.

- [ ] **Step 4: Create `/preset`**

Create `src/commands/PresetCommand.ts`:

```typescript
import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command, CommandContext } from './Command';
import { requirePremium } from './premiumGuard';
import { FortniteAPIService } from '../services/FortniteAPIService';

const api = new FortniteAPIService();

export const PresetCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('preset')
        .setDescription('[Premium] Gère tes presets de loadout')
        .addSubcommand(sc => sc.setName('save').setDescription('Enregistre un preset')
            .addStringOption(o => o.setName('nom').setDescription('Nom du preset').setRequired(true))
            .addStringOption(o => o.setName('skin').setDescription('Skin').setRequired(false))
            .addStringOption(o => o.setName('sac').setDescription('Sac à dos').setRequired(false))
            .addStringOption(o => o.setName('pioche').setDescription('Pioche').setRequired(false))
            .addStringOption(o => o.setName('emote').setDescription('Emote').setRequired(false)))
        .addSubcommand(sc => sc.setName('apply').setDescription('Applique un preset à tes bots (et le rend actif)')
            .addStringOption(o => o.setName('nom').setDescription('Nom du preset').setRequired(true)))
        .addSubcommand(sc => sc.setName('list').setDescription('Liste tes presets')),

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        if (!requirePremium(interaction, context.dbManager)) return;
        const sub = interaction.options.getSubcommand();
        await interaction.deferReply({ ephemeral: true });

        if (sub === 'list') {
            const presets = context.dbManager.listPresets(interaction.user.id);
            if (presets.length === 0) { await interaction.editReply('Aucun preset. Crée-en un avec `/preset save`.'); return; }
            await interaction.editReply('🎭 Tes presets :\n' + presets.map(p => `• **${p.name}**${p.isActive ? ' (actif)' : ''}`).join('\n'));
            return;
        }

        if (sub === 'save') {
            const name = interaction.options.getString('nom', true);
            const resolve = async (q: string | null, type: 'outfit' | 'backpack' | 'pickaxe' | 'emote') => {
                if (!q) return undefined;
                const item = await api.searchCosmetic(q, type);
                return item?.id;
            };
            const preset = {
                name,
                outfit: await resolve(interaction.options.getString('skin'), 'outfit'),
                backpack: await resolve(interaction.options.getString('sac'), 'backpack'),
                pickaxe: await resolve(interaction.options.getString('pioche'), 'pickaxe'),
                emote: await resolve(interaction.options.getString('emote'), 'emote'),
            };
            context.dbManager.savePreset(interaction.user.id, preset);
            await interaction.editReply(`✅ Preset **${name}** enregistré. Applique-le avec \`/preset apply nom:${name}\`.`);
            return;
        }

        // apply
        const name = interaction.options.getString('nom', true);
        if (!context.dbManager.setActivePreset(interaction.user.id, name)) {
            await interaction.editReply(`❌ Preset "${name}" introuvable.`);
            return;
        }
        const preset = context.dbManager.getActivePreset(interaction.user.id)!;
        const count = await context.botManager.applyLoadoutToOwned(interaction.user.id, preset);
        await interaction.editReply(
            count > 0
                ? `✅ Preset **${name}** appliqué à ${count} bot(s). Il sera aussi appliqué automatiquement à ta prochaine \`/squad\`.`
                : `✅ Preset **${name}** activé. Aucun bot en ligne pour l'instant — il s'appliquera au prochain \`/squad\`.`
        );
    }
};
```

- [ ] **Step 5: Auto-apply active preset in `/squad`**

In `src/commands/SquadCommand.ts`, after the invite loop (just before the final `editReply`), add:

```typescript
        const activePreset = context.dbManager.getActivePreset(interaction.user.id);
        if (activePreset) {
            await context.botManager.applyLoadoutToOwned(interaction.user.id, activePreset);
        }
```

- [ ] **Step 6: Register + build**

Register `PresetCommand` in `src/commands/index.ts`, then run `npm run build`.
Expected: no errors.

- [ ] **Step 7: Runtime verify**

Rebuild + restart. As premium: `/preset save nom:og skin:Renegade Raider` → saved; `/preset apply nom:og` → active + applied; `/preset list` shows `og (actif)`; `/squad` re-applies it.

- [ ] **Step 8: Commit**

```bash
git add src/managers/DatabaseManager.ts src/managers/BotManager.ts src/commands/PresetCommand.ts src/commands/SquadCommand.ts src/commands/index.ts
git commit -m "feat(premium): loadout presets (/preset save|apply|list) + auto-apply on /squad"
```

---

## Task 6: Premium quota + priority generation

**Files:**
- Modify: `src/managers/GeneratorManager.ts` (priority in queue)
- Modify: `src/commands/CreateBotCommand.ts` (quota by premium, pass priority)

**Interfaces:**
- Consumes: `botQuotaFor` (Task 1), `DatabaseManager.isPremium`, `DatabaseManager.getBotsByOwner`
- Produces: `GeneratorManager.requestBot(discordId, pseudoSuffix, priority?: boolean)` (new optional arg)

- [ ] **Step 1: Add priority to the queue**

In `src/managers/GeneratorManager.ts`:

Add `priority?: boolean;` to the `QueueItem` interface.

Change `requestBot` signature and body:

```typescript
    public async requestBot(discordId: string, pseudoSuffix: string, priority = false): Promise<GenerationResult> {
        const batch = await this.requestBots(discordId, pseudoSuffix, 1, priority);
        if (batch.successes.length > 0) {
            return { status: 'success', email: batch.successes[0].email, pseudo: batch.successes[0].pseudo };
        }
        return { status: 'failed', reason: batch.reason || 'Échec de la génération' };
    }
```

Change `requestBots` signature + enqueue so priority jobs go ahead of non-priority ones (but behind other priority jobs already waiting):

```typescript
    public requestBots(discordId: string | null, pseudoSuffix: string | undefined, count: number, priority = false): Promise<BatchResult> {
        return new Promise((resolve) => {
            const item: QueueItem = { discordId, pseudoSuffix, count, resolve, priority };
            if (priority) {
                const firstNonPriority = this.queue.findIndex(q => !q.priority);
                if (firstNonPriority === -1) this.queue.push(item);
                else this.queue.splice(firstNonPriority, 0, item);
            } else {
                this.queue.push(item);
            }
            this.processNext();
        });
    }
```

(The `admin createbot` caller in `AdminCommand` calls `requestBots(...)` with 3 args — the new 4th arg defaults to `false`, so it stays valid.)

- [ ] **Step 2: Quota by premium in `/createbot`**

In `src/commands/CreateBotCommand.ts`, replace the single-bot check:

```typescript
        const existing = await context.dbManager.getBotByOwner(interaction.user.id);
        if (existing) {
            await interaction.reply({
                content: `ℹ️ Tu as déjà un bot : **${existing.pseudo}**. Un seul bot par personne pour l'instant.`,
                ephemeral: true
            });
            return;
        }
```

with:

```typescript
        const { botQuotaFor } = await import('../config/premium');
        const isPremium = context.dbManager.isPremium(interaction.user.id);
        const quota = botQuotaFor(isPremium);
        const owned = context.dbManager.getBotsByOwner(interaction.user.id);
        if (owned.length >= quota) {
            await interaction.reply({
                content: isPremium
                    ? `ℹ️ Tu as atteint ta limite premium de **${quota} bots** (${owned.map(b => b.pseudo).join(', ')}).`
                    : `ℹ️ Tu as déjà un bot : **${owned[0].pseudo}**. Passe à **LobbyBot Premium** pour en avoir jusqu'à ${botQuotaFor(true)} !`,
                ephemeral: true
            });
            return;
        }
```

Then change the generation call to pass priority:

```typescript
        const result = await context.generatorManager.requestBot(interaction.user.id, pseudoSuffix, isPremium);
```

(Replace the top-level `import` style if you prefer: add `import { botQuotaFor } from '../config/premium';` at the top and drop the dynamic `await import`.)

- [ ] **Step 3: Update the command description**

In `CreateBotCommand.data`, change the description to `'Crée et héberge ton propre bot Fortnite (1 gratuit, jusqu'à 3 en premium)'`.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 5: Runtime verify**

- Non-premium with 1 bot → `/createbot` refuses and mentions premium.
- Premium → allowed until 3 bots; the upsell text changes.
- (Priority ordering is exercised only under a real queue; verify the code path compiles and `admin createbot` still works with its 3-arg call.)

- [ ] **Step 6: Commit**

```bash
git add src/managers/GeneratorManager.ts src/commands/CreateBotCommand.ts
git commit -m "feat(premium): premium bot quota (3) + priority generation queue"
```

---

## Task 7: Discord entitlement sync + role

Wires real Discord App Subscription payments to the internal premium flag and the premium role. Full end-to-end test requires the published SKU (blocked on Discord monetization onboarding), so verification here is code-path + logging.

**Files:**
- Modify: `src/managers/DiscordManager.ts` (entitlement listeners + role helper)
- Modify: `.env` (`PREMIUM_ROLE_ID`, `PREMIUM_SKU_ID`, `PREMIUM_BOT_QUOTA`)

**Interfaces:**
- Consumes: `PREMIUM_SKU_ID`, `PREMIUM_ROLE_ID` (Task 1), `DatabaseManager.grantPremium`, `DatabaseManager.revokePremium`

- [ ] **Step 1: Add env keys**

In `.env` add:

```
PREMIUM_BOT_QUOTA=3
PREMIUM_ROLE_ID=
PREMIUM_SKU_ID=
```

(Leave the last two blank until the role and SKU exist; the code must no-op safely when blank.)

- [ ] **Step 2: Add entitlement listeners**

In `src/managers/DiscordManager.ts`, add these imports at the top if missing:

```typescript
import { PREMIUM_SKU_ID, PREMIUM_ROLE_ID } from '../config/premium';
```

Inside the Discord client setup (where other `this.client.on(...)` handlers are registered, e.g. near `clientReady`/`interactionCreate`), add:

```typescript
        const syncRole = async (userId: string, add: boolean) => {
            if (!PREMIUM_ROLE_ID) return;
            try {
                for (const [, guild] of this.client.guilds.cache) {
                    const member = await guild.members.fetch(userId).catch(() => null);
                    if (!member) continue;
                    if (add) await member.roles.add(PREMIUM_ROLE_ID);
                    else await member.roles.remove(PREMIUM_ROLE_ID);
                }
            } catch (e: any) {
                console.error(`[Premium] Sync rôle (${add ? 'add' : 'remove'}) échouée pour ${userId}: ${e.message}`);
            }
        };

        const isOurSku = (ent: any) => !PREMIUM_SKU_ID || ent.skuId === PREMIUM_SKU_ID;

        this.client.on('entitlementCreate', async (ent: any) => {
            if (!ent.userId || !isOurSku(ent)) return;
            const expiresAt = ent.endsTimestamp ? new Date(ent.endsTimestamp).toISOString() : null;
            this.dbManager.grantPremium(ent.userId, 'discord', expiresAt);
            await syncRole(ent.userId, true);
            console.log(`[Premium] ✅ Entitlement créé pour ${ent.userId}`);
        });

        this.client.on('entitlementUpdate', async (_old: any, ent: any) => {
            if (!ent.userId || !isOurSku(ent)) return;
            const expiresAt = ent.endsTimestamp ? new Date(ent.endsTimestamp).toISOString() : null;
            // endsTimestamp dans le passé = abonnement terminé/annulé
            if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
                this.dbManager.revokePremium(ent.userId);
                await syncRole(ent.userId, false);
                console.log(`[Premium] ⏹️ Entitlement expiré pour ${ent.userId}`);
            } else {
                this.dbManager.grantPremium(ent.userId, 'discord', expiresAt);
                await syncRole(ent.userId, true);
                console.log(`[Premium] 🔄 Entitlement renouvelé pour ${ent.userId}`);
            }
        });

        this.client.on('entitlementDelete', async (ent: any) => {
            if (!ent.userId || !isOurSku(ent)) return;
            this.dbManager.revokePremium(ent.userId);
            await syncRole(ent.userId, false);
            console.log(`[Premium] 🗑️ Entitlement supprimé pour ${ent.userId}`);
        });
```

Note: confirm `this.dbManager` is accessible in `DiscordManager` (it receives the managers). If the field is named differently, match it. The `GuildMembers` intent must be enabled for `guild.members.fetch` — check the `GatewayIntentBits` list in the client constructor and add `GuildMembers` if absent (also enable it in the Developer Portal).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 4: Runtime verify (code-path)**

Rebuild + restart. Confirm the bot starts with no errors in `pm2 logs lobbybot-discord`. Full entitlement flow is verified once the SKU is published: subscribing in Discord should log `[Premium] ✅ Entitlement créé` and grant the role. Until then, use `/admin premium` (Task 2) for testing.

- [ ] **Step 5: Commit**

```bash
git add src/managers/DiscordManager.ts .env
git commit -m "feat(premium): Discord entitlement listeners + premium role sync"
```

Note: if `.env` is gitignored (it is for the bot), commit only `DiscordManager.ts` and set the env keys manually on the host.

---

## Self-Review

**Spec coverage:**
- Personal fleet / quota 3 → Task 1 (`getBotsByOwner`, quota consts), Task 6 (enforcement). ✓
- `/squad` → Task 3. ✓
- Synced emotes → Task 4. ✓
- Loadout presets + auto-apply → Task 5. ✓
- Priority generation → Task 6. ✓
- Premium detection (entitlements) + role sync → Task 7. ✓
- Internal premium flag decoupled from Discord (manual/external source) → Task 1 (`source` column) + Task 2 (manual grant). ✓
- Free vs premium split (free keeps `/skin`, `/invite`, `!` cmds) → no gating added to those (untouched). ✓
- Legal pages / hosting → already done (out of code scope). ✓

**Placeholder scan:** No TBD/TODO; every code step has full code. ✓

**Type consistency:** `isPremium` (sync bool) used consistently; `getBotsByOwner` returns `BotAccount[]` (sync) used in Tasks 3/4/5/6; `LoadoutPreset` shape identical across DatabaseManager + BotManager; `requirePremium(interaction, dbManager)` signature identical in Tasks 3/4/5; `requestBot(discordId, pseudoSuffix, priority?)` matches its caller in Task 6. ✓

**Note for the executor:** verify the exact intents list and `this.dbManager`/`this.client` field names in `DiscordManager.ts` before Task 7, and the `AdminCommand.execute` ack pattern (reply vs deferReply) before Task 2 — both flagged inline.
