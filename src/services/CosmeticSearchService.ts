import axios from 'axios';

/**
 * Recherche de cosmétiques tolérante aux fautes, avec résolution de variantes.
 *
 * Contrairement à FortniteAPIService.searchCosmetic (1 requête API par recherche,
 * matchMethod=contains, orthographe exacte exigée), ce service télécharge la liste
 * complète des cosmétiques une fois (rafraîchie toutes les 6 h) et fait la
 * recherche en local :
 *   - insensible aux accents, à la casse et à la ponctuation
 *   - tolère les fautes de frappe (distance de Levenshtein par token)
 *   - comprend les mots de style multilingues : « !skin ghoul rose » équipe
 *     Ghoul Trooper avec la variante Pink, « !skin skull violet » le Purple
 *     Glow du Skull Trooper, « !skin drift 4 » le Stage4 de Drift, etc.
 */

export type CosmeticType = 'outfit' | 'backpack' | 'pickaxe' | 'emote' | 'glider' | 'shoes';

export interface VariantOption {
    tag: string;
    name: string;
}

export interface VariantChannel {
    channel: string;
    options: VariantOption[];
}

export interface IndexedCosmetic {
    id: string;
    name: string;
    type: CosmeticType;
    rarity: string;
    norm: string;      // nom normalisé (minuscules, sans accents/ponctuation)
    tokens: string[];  // tokens du nom normalisé
    variants?: VariantChannel[];
}

/** Format attendu par le meta moderne MpLoadout1 (schéma rebootpy). */
export interface LoadoutVariant {
    c: string;  // channel (Material, ClothingColor, Progressive, Parts…)
    v: string;  // tag (Mat1, Stage4…)
    dE: number; // toujours 0
}

export interface SearchResult {
    id: string;
    name: string;
    rarity: string;
    variants: LoadoutVariant[];
    variantNames: string[]; // noms lisibles des styles appliqués (ex: ['Pink'])
}

const BACKEND_TYPE_MAP: Record<string, CosmeticType> = {
    AthenaCharacter: 'outfit',
    AthenaBackpack: 'backpack',
    AthenaPickaxe: 'pickaxe',
    AthenaDance: 'emote',
    AthenaGlider: 'glider',
    CosmeticShoes: 'shoes',
};

/**
 * Mots de style multilingues → équivalents anglais tels qu'ils apparaissent
 * dans les noms d'options de variantes de fortnite-api (« PINK », « Purple Glow »…).
 */
const VARIANT_WORDS: Record<string, string[]> = {
    // FR
    rose: ['pink'], violet: ['purple'], violette: ['purple'], pourpre: ['purple'],
    rouge: ['red'], vert: ['green'], verte: ['green'], bleu: ['blue'], bleue: ['blue'],
    jaune: ['yellow'], noir: ['black'], noire: ['black'], blanc: ['white'], blanche: ['white'],
    or: ['gold', 'golden'], dore: ['gold', 'golden'], doree: ['gold', 'golden'],
    argent: ['silver'], argente: ['silver'], argentee: ['silver'],
    orange: ['orange'], etape: ['stage'], stade: ['stage'],
    // ES
    rosa: ['pink'], morado: ['purple'], morada: ['purple'], lila: ['purple'],
    rojo: ['red'], roja: ['red'], verde: ['green'], azul: ['blue'],
    amarillo: ['yellow'], amarilla: ['yellow'], negro: ['black'], negra: ['black'],
    blanco: ['white'], blanca: ['white'], dorado: ['gold', 'golden'], plateado: ['silver'],
    // DE
    rot: ['red'], grun: ['green'], blau: ['blue'], gelb: ['yellow'],
    schwarz: ['black'], weiss: ['white'], golden: ['gold', 'golden'], silber: ['silver'],
    stufe: ['stage'],
};

/**
 * Alias explicites pour les skins rares que tout le monde cherche.
 * variantQuery est résolue dynamiquement contre les variantes de l'item
 * (les tags exacts viennent de l'API, pas de valeurs codées en dur).
 */
const ALIASES: Record<string, { type: CosmeticType; id: string; variantQuery?: string }> = {
    // Renegade Raider
    'rr': { type: 'outfit', id: 'CID_028_Athena_Commando_F' },
    'renegade': { type: 'outfit', id: 'CID_028_Athena_Commando_F' },
    // Ghoul Trooper (+ rose)
    'ghoul': { type: 'outfit', id: 'CID_029_Athena_Commando_F_Halloween' },
    'pinkghoul': { type: 'outfit', id: 'CID_029_Athena_Commando_F_Halloween', variantQuery: 'pink' },
    'pink ghoul': { type: 'outfit', id: 'CID_029_Athena_Commando_F_Halloween', variantQuery: 'pink' },
    'ghoul pink': { type: 'outfit', id: 'CID_029_Athena_Commando_F_Halloween', variantQuery: 'pink' },
    'ghoul rose': { type: 'outfit', id: 'CID_029_Athena_Commando_F_Halloween', variantQuery: 'pink' },
    // Skull Trooper (+ violet)
    'skull': { type: 'outfit', id: 'CID_030_Athena_Commando_M_Halloween' },
    'purpleskull': { type: 'outfit', id: 'CID_030_Athena_Commando_M_Halloween', variantQuery: 'purple' },
    'purple skull': { type: 'outfit', id: 'CID_030_Athena_Commando_M_Halloween', variantQuery: 'purple' },
    'skull purple': { type: 'outfit', id: 'CID_030_Athena_Commando_M_Halloween', variantQuery: 'purple' },
    'skull violet': { type: 'outfit', id: 'CID_030_Athena_Commando_M_Halloween', variantQuery: 'purple' },
    // Autres classiques
    'aerial': { type: 'outfit', id: 'CID_017_Athena_Commando_M' },
    'galaxy': { type: 'outfit', id: 'CID_175_Athena_Commando_M_Celestial' },
    'ikonik': { type: 'outfit', id: 'CID_313_Athena_Commando_M_KpopFashion' },
    'og default': { type: 'outfit', id: 'CID_001_Athena_Commando_F_Default' },
    'rickroll': { type: 'emote', id: 'EID_NeverGonna' },
    'never gonna': { type: 'emote', id: 'EID_NeverGonna' },
    'l': { type: 'emote', id: 'EID_TakeTheL' },
};

/** Normalise : minuscules, sans accents, sans ponctuation, espaces uniques. */
export function normalize(s: string): string {
    return s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Distance de Levenshtein avec plafond (early exit). */
function levenshtein(a: string, b: string, max: number): number {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    if (a === b) return 0;
    const prev = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
        let best = (prev[0] = i) as number;
        let diag = i - 1;
        for (let j = 1; j <= b.length; j++) {
            const tmp = prev[j];
            prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
            diag = tmp;
            if (prev[j] < best) best = prev[j];
        }
        if (best > max) return max + 1;
    }
    return prev[b.length];
}

function tokenMatches(qTok: string, nTok: string): boolean {
    if (nTok.startsWith(qTok)) return true;
    const maxDist = qTok.length >= 5 ? 2 : qTok.length >= 4 ? 1 : 0;
    if (maxDist === 0) return false;
    return levenshtein(qTok, nTok, maxDist) <= maxDist;
}

function scoreEntry(qNorm: string, qTokens: string[], entry: IndexedCosmetic): number {
    const lengthPenalty = Math.max(0, entry.norm.length - qNorm.length) * 0.5;

    if (entry.norm === qNorm) return 1000;
    if (entry.norm.startsWith(qNorm)) return 850 - lengthPenalty;
    if (entry.norm.includes(qNorm)) return 750 - lengthPenalty;

    // Chaque token de la requête doit correspondre à un token du nom (préfixe ou typo)
    let allExact = true;
    let totalDist = 0;
    for (const qTok of qTokens) {
        let matched = false;
        let exact = false;
        for (const nTok of entry.tokens) {
            if (nTok === qTok || nTok.startsWith(qTok)) { matched = true; exact = true; break; }
        }
        if (!matched) {
            for (const nTok of entry.tokens) {
                if (tokenMatches(qTok, nTok)) {
                    matched = true;
                    totalDist += 1;
                    break;
                }
            }
        }
        if (!matched) { allExact = false; totalDist = -1; break; }
        if (!exact) allExact = false;
    }
    if (totalDist >= 0) {
        return (allExact ? 700 : 600) - lengthPenalty - totalDist * 15;
    }

    // Dernier recours : typo globale (« gholu troper »)
    if (qNorm.length >= 5) {
        const maxDist = Math.min(3, Math.floor(qNorm.length / 4));
        const d = levenshtein(qNorm, entry.norm, maxDist);
        if (d <= maxDist) return 560 - d * 35;
    }
    return 0;
}

const MIN_SCORE = 450;
const REFRESH_MS = 6 * 60 * 60 * 1000; // 6 h

export class CosmeticSearchService {
    private index: Map<CosmeticType, IndexedCosmetic[]> = new Map();
    private byId: Map<string, IndexedCosmetic> = new Map();
    private loadedAt = 0;
    private loading: Promise<void> | null = null;

    /** Charge (ou recharge) la liste complète des cosmétiques en mémoire. */
    async ensureLoaded(): Promise<boolean> {
        if (this.byId.size > 0 && Date.now() - this.loadedAt < REFRESH_MS) return true;
        if (!this.loading) {
            this.loading = this.load().finally(() => { this.loading = null; });
        }
        try {
            await this.loading;
            return this.byId.size > 0;
        } catch {
            return this.byId.size > 0; // garde l'ancien cache si le refresh échoue
        }
    }

    private async load(): Promise<void> {
        const res = await axios.get('https://fortnite-api.com/v2/cosmetics/br', {
            params: { language: 'en' },
            timeout: 30000,
        });
        const items: any[] = res.data?.data || [];
        if (!Array.isArray(items) || items.length === 0) throw new Error('Réponse cosmétiques vide');

        const index = new Map<CosmeticType, IndexedCosmetic[]>();
        const byId = new Map<string, IndexedCosmetic>();

        for (const item of items) {
            const type = BACKEND_TYPE_MAP[item?.type?.backendValue];
            if (!type || !item?.id || !item?.name) continue;
            const norm = normalize(item.name);
            if (!norm) continue;
            const entry: IndexedCosmetic = {
                id: item.id,
                name: item.name,
                type,
                rarity: item.rarity?.displayValue || item.rarity?.value || '',
                norm,
                tokens: norm.split(' '),
                variants: Array.isArray(item.variants) && item.variants.length
                    ? item.variants.map((v: any) => ({
                        channel: v.channel,
                        options: (v.options || []).map((o: any) => ({ tag: o.tag, name: o.name || o.tag })),
                    }))
                    : undefined,
            };
            if (!index.has(type)) index.set(type, []);
            index.get(type)!.push(entry);
            byId.set(entry.id.toLowerCase(), entry);
        }

        this.index = index;
        this.byId = byId;
        this.loadedAt = Date.now();
        console.log(`[CosmeticSearch] 📚 ${byId.size} cosmétiques indexés (${[...index.keys()].join(', ')})`);
    }

    getById(id: string): IndexedCosmetic | null {
        return this.byId.get(id.toLowerCase()) || null;
    }

    /**
     * Résout des mots de style (« rose », « stage 4 », « gold »…) contre les
     * variantes d'un cosmétique. Retourne null si un mot ne correspond à rien.
     */
    resolveVariants(entry: IndexedCosmetic, variantQuery: string): { variants: LoadoutVariant[]; names: string[] } | null {
        if (!entry.variants?.length) return null;
        const qNorm = normalize(variantQuery);
        if (!qNorm) return null;

        // Expansion multilingue : « rose » → essaie aussi « pink »
        const candidates = new Set<string>([qNorm]);
        const words = qNorm.split(' ');
        const expanded = words.map(w => VARIANT_WORDS[w] ? [w, ...VARIANT_WORDS[w]] : [w]);
        // produit cartésien limité (les requêtes font 1-3 mots)
        let combos: string[] = [''];
        for (const opts of expanded) {
            const next: string[] = [];
            for (const base of combos) for (const o of opts) next.push(base ? `${base} ${o}` : o);
            combos = next.slice(0, 20);
        }
        combos.forEach(c => candidates.add(c));

        // « drift 4 » / « étape 4 » → « stage 4 »
        for (const c of [...candidates]) {
            const m = c.match(/^(?:stage\s*)?(\d+)$/);
            if (m) { candidates.add(`stage ${m[1]}`); candidates.add(`stage${m[1]}`); }
        }

        let best: { channel: string; tag: string; name: string } | null = null;
        for (const channel of entry.variants) {
            for (const option of channel.options) {
                const optNorm = normalize(option.name);
                const tagNorm = normalize(option.tag);
                for (const cand of candidates) {
                    if (!cand) continue;
                    if (optNorm === cand || tagNorm === cand
                        || (cand.length >= 3 && optNorm.includes(cand))
                        || (optNorm.length >= 3 && cand.includes(optNorm))) {
                        // priorité au match exact
                        const exact = optNorm === cand || tagNorm === cand;
                        if (!best || exact) best = { channel: channel.channel, tag: option.tag, name: option.name };
                        if (exact) break;
                    }
                }
            }
        }
        if (!best) return null;
        return {
            variants: [{ c: best.channel, v: best.tag, dE: 0 }],
            names: [best.name],
        };
    }

    /**
     * Recherche principale : ID exact, alias, fuzzy, et découpe automatique
     * « <nom> <style> » (ex: « ghoul rose », « drift stage 4 »).
     */
    async search(type: CosmeticType, rawQuery: string): Promise<SearchResult | null> {
        const loaded = await this.ensureLoaded();
        const qNorm = normalize(rawQuery);
        if (!qNorm) return null;

        // 1) ID Fortnite direct (CID_…, EID_…, ou n'importe quel id du cache)
        if (/_/.test(rawQuery.trim())) {
            const direct = this.getById(rawQuery.trim());
            if (direct) return { id: direct.id, name: direct.name, rarity: direct.rarity, variants: [], variantNames: [] };
            if (!loaded) return { id: rawQuery.trim(), name: rawQuery.trim(), rarity: '', variants: [], variantNames: [] };
        }

        // 2) Alias explicites (avec éventuel style embarqué)
        const alias = ALIASES[qNorm];
        if (alias && alias.type === type) {
            const entry = this.getById(alias.id);
            if (entry) {
                let variants: LoadoutVariant[] = [];
                let names: string[] = [];
                if (alias.variantQuery) {
                    const rv = this.resolveVariants(entry, alias.variantQuery);
                    if (rv) { variants = rv.variants; names = rv.names; }
                }
                return { id: entry.id, name: entry.name, rarity: entry.rarity, variants, variantNames: names };
            }
        }

        if (!loaded) return null;
        const pool = this.index.get(type) || [];
        const qTokens = qNorm.split(' ');

        const fuzzy = (tokens: string[]): { entry: IndexedCosmetic; score: number } | null => {
            const q = tokens.join(' ');
            let bestEntry: IndexedCosmetic | null = null;
            let bestScore = 0;
            for (const entry of pool) {
                const s = scoreEntry(q, tokens, entry);
                if (s > bestScore || (s === bestScore && bestEntry && entry.norm.length < bestEntry.norm.length)) {
                    bestScore = s;
                    bestEntry = entry;
                }
            }
            return bestEntry && bestScore >= MIN_SCORE ? { entry: bestEntry, score: bestScore } : null;
        };

        // 3) Requête complète
        const full = fuzzy(qTokens);

        // 4) Découpe « nom + style » : on retire 1 puis 2 tokens de fin
        let bestSplit: { entry: IndexedCosmetic; score: number; variants: LoadoutVariant[]; names: string[] } | null = null;
        for (let cut = 1; cut <= 2 && qTokens.length - cut >= 1; cut++) {
            const baseTokens = qTokens.slice(0, qTokens.length - cut);
            const variantQuery = qTokens.slice(qTokens.length - cut).join(' ');
            // alias sur la base aussi (« skull violet » → alias « skull » + style « violet »)
            const baseNorm = baseTokens.join(' ');
            const baseAlias = ALIASES[baseNorm];
            let baseMatch = (baseAlias && baseAlias.type === type)
                ? (() => { const e = this.getById(baseAlias.id); return e ? { entry: e, score: 900 } : null; })()
                : fuzzy(baseTokens);
            if (!baseMatch) continue;
            const rv = this.resolveVariants(baseMatch.entry, variantQuery);
            if (!rv) continue;
            const score = baseMatch.score - 10;
            if (!bestSplit || score > bestSplit.score) {
                bestSplit = { entry: baseMatch.entry, score, variants: rv.variants, names: rv.names };
            }
        }

        // 5) Arbitrage : un match complet quasi exact gagne, sinon la découpe avec style
        if (full && (!bestSplit || full.score >= 800 || full.score >= bestSplit.score)) {
            return { id: full.entry.id, name: full.entry.name, rarity: full.entry.rarity, variants: [], variantNames: [] };
        }
        if (bestSplit) {
            return {
                id: bestSplit.entry.id,
                name: bestSplit.entry.name,
                rarity: bestSplit.entry.rarity,
                variants: bestSplit.variants,
                variantNames: bestSplit.names,
            };
        }
        return null;
    }

    /** Cosmétique aléatoire d'un type donné. */
    async random(type: CosmeticType): Promise<IndexedCosmetic | null> {
        if (!(await this.ensureLoaded())) return null;
        const pool = this.index.get(type) || [];
        if (!pool.length) return null;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    /**
     * Nouveautés de la dernière MAJ (souvent pas encore sorties en boutique) —
     * endpoint /cosmetics/br/new de fortnite-api.
     */
    async getNewCosmetics(type?: CosmeticType): Promise<IndexedCosmetic[]> {
        await this.ensureLoaded();
        try {
            const res = await axios.get('https://fortnite-api.com/v2/cosmetics/br/new', { timeout: 15000 });
            const raw: any[] = res.data?.data?.items || (Array.isArray(res.data?.data) ? res.data.data : []);
            const out: IndexedCosmetic[] = [];
            for (const item of raw) {
                const t = BACKEND_TYPE_MAP[item?.type?.backendValue];
                if (!t || !item?.id) continue;
                if (type && t !== type) continue;
                const cached = this.getById(item.id);
                out.push(cached || {
                    id: item.id,
                    name: item.name || item.id,
                    type: t,
                    rarity: item.rarity?.displayValue || '',
                    norm: normalize(item.name || item.id),
                    tokens: normalize(item.name || item.id).split(' '),
                });
            }
            return out;
        } catch (e: any) {
            console.error('[CosmeticSearch] ❌ /cosmetics/br/new:', e.message);
            return [];
        }
    }
}

/** Instance partagée par tous les bots (un seul cache en mémoire). */
export const cosmeticSearch = new CosmeticSearchService();
