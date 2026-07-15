import { Client } from 'fnbr';
import * as ModernParty from '../utils/ModernParty';
import { cosmeticSearch, CosmeticType } from '../services/CosmeticSearchService';

export class CosmeticsActions {

    /** Formatte « Nom (style X) » quand une variante est appliquée. */
    private label(name: string, variantNames: string[]): string {
        return variantNames.length ? `${name} *(style ${variantNames.join(', ')})*` : name;
    }

    private async setSlot(
        client: Client,
        slot: 'outfit' | 'backpack' | 'pickaxe' | 'glider' | 'shoes',
        type: CosmeticType,
        query: string,
        emoji: string,
        labelFr: string,
    ): Promise<string> {
        if (!client.party) return '❌ Le bot n\'est pas dans un groupe.';

        const item = await cosmeticSearch.search(type, query);
        if (!item) return `❌ ${labelFr} "${query}" introuvable. Essaie un autre nom (les fautes de frappe sont tolérées 😉)`;

        try {
            await ModernParty.setLoadout(
                client,
                { [slot]: item.id },
                item.variants.length ? { [slot]: item.variants } : undefined,
            );
            return `${emoji} ${labelFr} : **${this.label(item.name, item.variantNames)}**`;
        } catch (e: any) {
            return `❌ Erreur ${labelFr.toLowerCase()}: ${e.message}`;
        }
    }

    async setSkin(client: Client, query: string): Promise<string> {
        return this.setSlot(client, 'outfit', 'outfit', query, '✅', 'Skin');
    }

    async setBackpack(client: Client, query: string): Promise<string> {
        if (!client.party) return '❌ Le bot n\'est pas dans un groupe.';
        if (['none', 'vide', 'aucun', 'no', 'off'].includes(query.toLowerCase())) {
            await ModernParty.setLoadout(client, { backpack: '' });
            return '✅ Sac à dos retiré.';
        }
        return this.setSlot(client, 'backpack', 'backpack', query, '🎒', 'Sac');
    }

    async setPickaxe(client: Client, query: string): Promise<string> {
        return this.setSlot(client, 'pickaxe', 'pickaxe', query, '⛏️', 'Pioche');
    }

    async setGlider(client: Client, query: string): Promise<string> {
        return this.setSlot(client, 'glider', 'glider', query, '🪂', 'Planeur');
    }

    async setShoes(client: Client, query: string): Promise<string> {
        if (!client.party) return '❌ Le bot n\'est pas dans un groupe.';
        if (['none', 'vide', 'aucun', 'no', 'off'].includes(query.toLowerCase())) {
            await ModernParty.setLoadout(client, { shoes: '' });
            return '✅ Chaussures retirées.';
        }
        return this.setSlot(client, 'shoes', 'shoes', query, '👟', 'Chaussures');
    }

    async setEmote(client: Client, query: string): Promise<string> {
        if (!client.party) return '❌ Le bot n\'est pas dans un groupe.';

        const item = await cosmeticSearch.search('emote', query);
        if (!item) return `❌ Emote "${query}" introuvable.`;

        try {
            await ModernParty.setEmote(client, item.id);
            return `💃 Emote : **${item.name}**`;
        } catch (e: any) {
            return `❌ Erreur emote: ${e.message}`;
        }
    }

    async clearEmote(client: Client): Promise<string> {
        if (!client.party) return '❌ Le bot n\'est pas dans un groupe.';
        try {
            await ModernParty.clearEmote(client);
            return '⏹️ Danse arrêtée.';
        } catch (e: any) {
            return `❌ Erreur: ${e.message}`;
        }
    }

    /**
     * Applique un style au skin actuellement porté : !style rose, !style stage 4…
     */
    async setStyle(client: Client, query: string): Promise<string> {
        if (!client.party) return '❌ Le bot n\'est pas dans un groupe.';

        try {
            const loadout = ModernParty.getLoadout(client);
            const outfitId = loadout?.ac?.i;
            if (!outfitId) return '❌ Aucun skin équipé.';

            await cosmeticSearch.ensureLoaded();
            const entry = cosmeticSearch.getById(outfitId);
            if (!entry) return '❌ Skin actuel inconnu, impossible de trouver ses styles.';
            if (!entry.variants?.length) return `❌ **${entry.name}** n'a pas de styles.`;

            const rv = cosmeticSearch.resolveVariants(entry, query);
            if (!rv) {
                const available = entry.variants
                    .flatMap(ch => ch.options.map(o => o.name))
                    .slice(0, 12)
                    .join(', ');
                return `❌ Style "${query}" introuvable pour **${entry.name}**.\nStyles dispo : ${available}`;
            }

            await ModernParty.setVariants(client, 'outfit', rv.variants);
            return `🎨 Style **${rv.names.join(', ')}** appliqué sur **${entry.name}** !`;
        } catch (e: any) {
            return `❌ Erreur style: ${e.message}`;
        }
    }

    /** Cosmétique aléatoire : !random [skin|emote|pickaxe|backpack] */
    async setRandom(client: Client, typeQuery: string): Promise<string> {
        if (!client.party) return '❌ Le bot n\'est pas dans un groupe.';

        const typeMap: Record<string, CosmeticType> = {
            '': 'outfit', 'skin': 'outfit', 'outfit': 'outfit',
            'emote': 'emote', 'danse': 'emote', 'dance': 'emote',
            'pickaxe': 'pickaxe', 'pioche': 'pickaxe',
            'backpack': 'backpack', 'sac': 'backpack',
            'glider': 'glider', 'planeur': 'glider',
        };
        const type = typeMap[typeQuery.toLowerCase().trim()];
        if (!type) return 'Usage: !random [skin|emote|pickaxe|sac|planeur]';

        const item = await cosmeticSearch.random(type);
        if (!item) return '❌ Impossible de tirer un cosmétique aléatoire (API indisponible).';

        try {
            if (type === 'emote') await ModernParty.setEmote(client, item.id);
            else {
                const slot = type as 'outfit' | 'backpack' | 'pickaxe' | 'glider';
                await ModernParty.setLoadout(client, { [slot]: item.id });
            }
            return `🎲 **${item.name}** (${item.rarity})`;
        } catch (e: any) {
            return `❌ Erreur random: ${e.message}`;
        }
    }

    async setLevel(client: Client, level: number): Promise<string> {
        if (!client.party) return '❌ Le bot n\'est pas dans un groupe.';
        try {
            await ModernParty.setLevel(client, level);
            return `✅ Niveau défini sur : **${level}**`;
        } catch (e: any) {
            return `❌ Erreur: ${e.message}`;
        }
    }
}
