import { Client } from 'fnbr';
import { FortniteAPIService } from '../services/FortniteAPIService';
import * as ModernParty from '../utils/ModernParty';

export class CosmeticsActions {
    private apiService: FortniteAPIService;

    constructor() {
        this.apiService = new FortniteAPIService();
    }

    async setSkin(client: Client, query: string): Promise<string> {
        const item = await this.apiService.searchCosmetic(query, 'outfit');
        if (!item) return `❌ Skin "${query}" introuvable.`;

        if (!client.party) return '❌ Le bot n\'est pas dans un groupe.';

        try {
            await ModernParty.setLoadout(client, { outfit: item.id });
            return `✅ Skin défini sur : **${item.name}**`;
        } catch (e: any) {
             return `❌ Erreur changement skin: ${e.message}`;
        }
    }

    async setBackpack(client: Client, query: string): Promise<string> {
        if (!client.party) return '❌ Le bot n\'est pas dans un groupe.';

        if (['none', 'vide', 'aucun', 'sac'].includes(query.toLowerCase())) {
             await ModernParty.setLoadout(client, { backpack: '' });
             return '✅ Sac à dos retiré.';
        }

        const item = await this.apiService.searchCosmetic(query, 'backpack');
        if (!item) return `❌ Sac "${query}" introuvable.`;

        try {
            await ModernParty.setLoadout(client, { backpack: item.id });
            return `✅ Sac défini sur : **${item.name}**`;
        } catch (e: any) {
             return `❌ Erreur changement sac: ${e.message}`;
        }
    }

    async setPickaxe(client: Client, query: string): Promise<string> {
        const item = await this.apiService.searchCosmetic(query, 'pickaxe');
        if (!item) return `❌ Pioche "${query}" introuvable.`;

        if (!client.party) return '❌ Le bot n\'est pas dans un groupe.';

        try {
            await ModernParty.setLoadout(client, { pickaxe: item.id });
            return `✅ Pioche définie sur : **${item.name}**`;
        } catch (e: any) {
             return `❌ Erreur changement pioche: ${e.message}`;
        }
    }

    async setEmote(client: Client, query: string): Promise<string> {
        const item = await this.apiService.searchCosmetic(query, 'emote');
        if (!item) return `❌ Emote "${query}" introuvable.`;

        if (!client.party) return '❌ Le bot n\'est pas dans un groupe.';

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
