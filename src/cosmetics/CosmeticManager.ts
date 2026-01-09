import { Client } from 'fnbr';
import { OUTFITS, BACKPACKS, PICKAXES, EMOTES, VARIANTS } from './cosmeticData';
import { FortniteAPIService } from '../services/FortniteAPIService';

export class CosmeticManager {
    private bot: Client;
    private fortniteAPI: FortniteAPIService;
    private copiedPlayer: any = null;

    constructor(bot: Client) {
        this.bot = bot;
        this.fortniteAPI = new FortniteAPIService();
    }

    /**
     * Change le skin du bot
     * @param skinName Nom simple (ex: 'drift') ou ID complet (ex: 'CID_165_Athena_Commando_M')
     * @param variantOptions Options de variants (optionnel)
     */
    async setOutfit(skinName: string, variantOptions?: any): Promise<string> {
        console.log(`[CosmeticManager] setOutfit appelé: ${skinName}`);

        if (!this.bot.party?.me) {
            throw new Error('Bot pas dans un lobby');
        }

        let skinId = OUTFITS[skinName.toLowerCase()] || skinName;

        // Si le skin n'est pas trouvé dans les données hardcodées, chercher via l'API
        if (!skinId.startsWith('CID_')) {
            console.log(`[CosmeticManager] Recherche via FortniteAPI: ${skinName}`);
            const cosmetic = await this.fortniteAPI.searchCosmetic(skinName, 'outfit');

            if (cosmetic) {
                skinId = cosmetic.id;
                console.log(`[CosmeticManager] Skin trouvé via API: ${cosmetic.name} (${skinId})`);
            } else {
                throw new Error(`Skin "${skinName}" introuvable`);
            }
        }

        // Appliquer le skin avec variants si fournis
        const variants = variantOptions || [];
        await (this.bot.party.me as any).setOutfit(skinId, variants);

        console.log(`[CosmeticManager] setOutfit appliqué: ${skinId} avec variants:`, variants);

        return skinId;
    }

    /**
     * Change le sac à dos
     */
    async setBackpack(backpackName: string): Promise<string> {
        if (!this.bot.party?.me) {
            throw new Error('Bot pas dans un lobby');
        }

        let backpackId = BACKPACKS[backpackName.toLowerCase()] || backpackName;

        // Si le backpack n'est pas trouvé, chercher via l'API
        if (!backpackId.startsWith('BID_')) {
            const cosmetic = await this.fortniteAPI.searchCosmetic(backpackName, 'backpack');

            if (cosmetic) {
                backpackId = cosmetic.id;
                console.log(`[CosmeticManager] Backpack trouvé via API: ${cosmetic.name} (${backpackId})`);
            } else {
                throw new Error(`Backpack "${backpackName}" introuvable`);
            }
        }

        await this.bot.party.me.setBackpack(backpackId);
        return backpackId;
    }

    /**
     * Enlève le sac à dos
     */
    async clearBackpack(): Promise<void> {
        if (!this.bot.party?.me) {
            throw new Error('Bot pas dans un lobby');
        }

        await this.bot.party.me.clearBackpack();
    }

    /**
     * Change la pioche
     */
    async setPickaxe(pickaxeName: string): Promise<string> {
        if (!this.bot.party?.me) {
            throw new Error('Bot pas dans un lobby');
        }

        let pickaxeId = PICKAXES[pickaxeName.toLowerCase()] || pickaxeName;

        // Si la pioche n'est pas trouvée, chercher via l'API
        if (!pickaxeId.startsWith('Pickaxe_')) {
            const cosmetic = await this.fortniteAPI.searchCosmetic(pickaxeName, 'pickaxe');

            if (cosmetic) {
                pickaxeId = cosmetic.id;
                console.log(`[CosmeticManager] Pickaxe trouvé via API: ${cosmetic.name} (${pickaxeId})`);
            } else {
                throw new Error(`Pickaxe "${pickaxeName}" introuvable`);
            }
        }

        await this.bot.party.me.setPickaxe(pickaxeId);
        return pickaxeId;
    }

    /**
     * Lance une emote/danse
     */
    async setEmote(emoteName: string): Promise<string> {
        if (!this.bot.party?.me) {
            throw new Error('Bot pas dans un lobby');
        }

        let emoteId = EMOTES[emoteName.toLowerCase()] || emoteName;

        // Si l'emote n'est pas trouvée, chercher via l'API
        if (!emoteId.startsWith('EID_')) {
            const cosmetic = await this.fortniteAPI.searchCosmetic(emoteName, 'emote');

            if (cosmetic) {
                emoteId = cosmetic.id;
                console.log(`[CosmeticManager] Emote trouvé via API: ${cosmetic.name} (${emoteId})`);
            } else {
                throw new Error(`Emote "${emoteName}" introuvable`);
            }
        }

        await this.bot.party.me.setEmote(emoteId);
        return emoteId;
    }

    /**
     * Arrête l'emote
     */
    async clearEmote(): Promise<void> {
        if (!this.bot.party?.me) {
            throw new Error('Bot pas dans un lobby');
        }

        await this.bot.party.me.clearEmote();
    }

    /**
     * Change tous les cosmétiques en une fois
     */
    async setAllCosmetics(outfit?: string, backpack?: string, pickaxe?: string): Promise<void> {
        if (!this.bot.party?.me) {
            throw new Error('Bot pas dans un lobby');
        }

        const cosmetics: any = {};

        if (outfit) {
            cosmetics.outfit = OUTFITS[outfit.toLowerCase()] || outfit;
        }
        if (backpack) {
            cosmetics.backpack = BACKPACKS[backpack.toLowerCase()] || backpack;
        }
        if (pickaxe) {
            cosmetics.pickaxe = PICKAXES[pickaxe.toLowerCase()] || pickaxe;
        }

        await this.bot.party.me.setCosmetics(cosmetics);
    }

    /**
     * Obtient la liste des cosmétiques disponibles
     */
    getAvailableCosmetics() {
        return {
            outfits: Object.keys(OUTFITS),
            backpacks: Object.keys(BACKPACKS),
            pickaxes: Object.keys(PICKAXES),
            emotes: Object.keys(EMOTES),
        };
    }

    /**
     * Recherche un cosmétique par nom partiel
     */
    searchCosmetic(query: string): any {
        const q = query.toLowerCase();
        const results: any = {};

        const matchingOutfits = Object.keys(OUTFITS).filter(key => key.includes(q));
        if (matchingOutfits.length > 0) results.outfits = matchingOutfits;

        const matchingBackpacks = Object.keys(BACKPACKS).filter(key => key.includes(q));
        if (matchingBackpacks.length > 0) results.backpacks = matchingBackpacks;

        const matchingPickaxes = Object.keys(PICKAXES).filter(key => key.includes(q));
        if (matchingPickaxes.length > 0) results.pickaxes = matchingPickaxes;

        const matchingEmotes = Object.keys(EMOTES).filter(key => key.includes(q));
        if (matchingEmotes.length > 0) results.emotes = matchingEmotes;

        return results;
    }

    /**
     * Set level pour simuler un niveau
     */
    async setLevel(level: number): Promise<void> {
        if (!this.bot.party?.me) {
            throw new Error('Bot pas dans un lobby');
        }

        await this.bot.party.me.setLevel(level);
    }

    /**
     * Set ready state
     */
    async setReady(ready: boolean = true): Promise<void> {
        if (!this.bot.party?.me) {
            throw new Error('Bot pas dans un lobby');
        }

        await this.bot.party.me.setReadiness(ready);
    }

    /**
     * Set crown/victory count (spoofing)
     */
    async setCrown(amount: number): Promise<void> {
        if (!this.bot.party?.me) {
            throw new Error('Bot pas dans un lobby');
        }

        try {
            // Créer les stats de couronnes
            const cosmeticStats = [
                { statName: 'TotalVictoryCrowns', statValue: amount },
                { statName: 'TotalRoyalRoyales', statValue: amount },
                { statName: 'HasCrown', statValue: amount > 0 ? 1 : 0 }
            ];

            // Utiliser setCrown si disponible, sinon patch directement
            if (typeof (this.bot.party.me as any).setCrown === 'function') {
                await (this.bot.party.me as any).setCrown(amount);
            } else {
                // Patch manuel des métadonnées
                const me = this.bot.party.me as any;
                const currentOutfit = me.outfit || 'CID_001_Athena_Commando_F_Default';

                await me.setOutfit(currentOutfit, [], cosmeticStats);
            }

            console.log(`[CosmeticManager] Crown count set to ${amount}`);
        } catch (error: any) {
            console.error('[CosmeticManager] Error setting crown:', error.message);
            throw error;
        }
    }

    /**
     * Obtient un cosmétique aléatoire et l'applique
     */
    async setRandomCosmetic(type: 'skin' | 'emote' | 'backpack' | 'pickaxe' = 'skin'): Promise<string> {
        if (!this.bot.party?.me) {
            throw new Error('Bot pas dans un lobby');
        }

        const typeMap: { [key: string]: 'outfit' | 'emote' | 'backpack' | 'pickaxe' } = {
            skin: 'outfit',
            emote: 'emote',
            backpack: 'backpack',
            pickaxe: 'pickaxe',
        };

        const cosmetic = await this.fortniteAPI.getRandomCosmetic(typeMap[type]);

        if (!cosmetic) {
            throw new Error(`Impossible de récupérer un ${type} aléatoire`);
        }

        console.log(`[CosmeticManager] Random ${type}: ${cosmetic.name} (${cosmetic.id})`);

        if (type === 'skin') {
            await this.bot.party.me.setOutfit(cosmetic.id);
        } else if (type === 'emote') {
            await this.bot.party.me.setEmote(cosmetic.id);
        } else if (type === 'backpack') {
            await this.bot.party.me.setBackpack(cosmetic.id);
        } else if (type === 'pickaxe') {
            await this.bot.party.me.setPickaxe(cosmetic.id);
        }

        return cosmetic.name;
    }

    /**
     * Copie les cosmétiques d'un autre joueur
     */
    async copyPlayer(member: any): Promise<void> {
        if (!this.bot.party?.me) {
            throw new Error('Bot pas dans un lobby');
        }

        this.copiedPlayer = member;

        try {
            // Copier le skin avec variants
            await this.bot.party.me.setOutfit(member.outfit, member.outfit_variants || []);

            // Copier la pioche avec variants
            if (member.pickaxe) {
                await this.bot.party.me.setPickaxe(member.pickaxe, member.pickaxe_variants || []);
            }

            // Copier le backpack si présent
            if (member.backpack) {
                await this.bot.party.me.setBackpack(member.backpack);
            }

            console.log(`[CosmeticManager] Copying ${member.displayName || member.display_name}`);
        } catch (error: any) {
            console.error('[CosmeticManager] Error copying player:', error.message);
            throw error;
        }
    }

    /**
     * Arrête de copier un joueur
     */
    stopCopying(): void {
        this.copiedPlayer = null;
        console.log('[CosmeticManager] Stopped copying player');
    }

    /**
     * Vérifie si on copie un joueur
     */
    isCopying(): boolean {
        return this.copiedPlayer !== null;
    }

    /**
     * Obtient le joueur copié
     */
    getCopiedPlayer(): any {
        return this.copiedPlayer;
    }

    /**
     * Applique un variant avancé à un skin
     */
    async setOutfitWithVariants(
        skinName: string,
        variants: { material?: number; clothing_color?: number; parts?: number; progressive?: number }
    ): Promise<void> {
        if (!this.bot.party?.me) {
            throw new Error('Bot pas dans un lobby');
        }

        const skinId = await this.setOutfit(skinName);

        // Créer les variants
        const variantOptions: any = {};

        if (variants.material !== undefined) variantOptions.material = variants.material;
        if (variants.clothing_color !== undefined) variantOptions.clothing_color = variants.clothing_color;
        if (variants.parts !== undefined) variantOptions.parts = variants.parts;
        if (variants.progressive !== undefined) variantOptions.progressive = variants.progressive;

        // Réappliquer avec variants
        await this.bot.party.me.setOutfit(skinId, variantOptions);

        console.log(`[CosmeticManager] Applied variants to ${skinId}:`, variantOptions);
    }

    /**
     * Showcase des nouveaux cosmétiques
     */
    async showcaseNewCosmetics(type: 'skin' | 'emote' | 'backpack' | 'pickaxe' = 'skin', delay: number = 3000): Promise<void> {
        if (!this.bot.party?.me) {
            throw new Error('Bot pas dans un lobby');
        }

        const newCosmetics = await this.fortniteAPI.getNewCosmetics();

        const typeMap: { [key: string]: string } = {
            skin: 'AthenaCharacter',
            emote: 'AthenaDance',
            backpack: 'AthenaBackpack',
            pickaxe: 'AthenaPickaxe',
        };

        const filtered = newCosmetics.filter(c => c.type.backendValue === typeMap[type]);

        console.log(`[CosmeticManager] Found ${filtered.length} new ${type}s`);

        for (const cosmetic of filtered) {
            try {
                if (type === 'skin') {
                    await this.bot.party.me.setOutfit(cosmetic.id);
                } else if (type === 'emote') {
                    await this.bot.party.me.clearEmote();
                    await this.bot.party.me.setEmote(cosmetic.id);
                } else if (type === 'backpack') {
                    await this.bot.party.me.setBackpack(cosmetic.id);
                } else if (type === 'pickaxe') {
                    await this.bot.party.me.setPickaxe(cosmetic.id);
                }

                console.log(`[CosmeticManager] Showcasing: ${cosmetic.name}`);

                // Attendre avant le prochain
                await new Promise(resolve => setTimeout(resolve, delay));
            } catch (error: any) {
                console.error(`[CosmeticManager] Error showcasing ${cosmetic.name}:`, error.message);
            }
        }

        console.log('[CosmeticManager] Finished showcasing new cosmetics');
    }
}
