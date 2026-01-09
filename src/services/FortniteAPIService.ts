import axios, { AxiosInstance } from 'axios';

export interface FortniteCosmetic {
    id: string;
    name: string;
    description: string;
    type: {
        value: string;
        displayValue: string;
        backendValue: string;
    };
    rarity: {
        value: string;
        displayValue: string;
        backendValue: string;
    };
    images: {
        smallIcon?: string;
        icon?: string;
        featured?: string;
    };
    variants?: Array<{
        channel: string;
        type: string;
        options: Array<{
            tag: string;
            name: string;
            image?: string;
        }>;
    }>;
}

export interface FortniteAPIResponse {
    status: number;
    data: FortniteCosmetic | FortniteCosmetic[];
}

export class FortniteAPIService {
    private client: AxiosInstance;
    private baseURL = 'https://fortnite-api.com/v2';

    constructor() {
        this.client = axios.create({
            baseURL: this.baseURL,
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    /**
     * Recherche un cosmétique par nom
     */
    async searchCosmetic(name: string, type?: 'outfit' | 'backpack' | 'pickaxe' | 'emote'): Promise<FortniteCosmetic | null> {
        try {
            const params: any = {
                name: name,
                matchMethod: 'contains',
                language: 'en',
            };

            // Ne pas filtrer par type pour avoir plus de résultats
            // L'API retourne le bon cosmétique basé sur le nom

            const response = await this.client.get<FortniteAPIResponse>('/cosmetics/br/search', { params });

            if (response.data.status === 200 && response.data.data) {
                return Array.isArray(response.data.data) ? response.data.data[0] : response.data.data;
            }

            return null;
        } catch (error: any) {
            console.error(`[FortniteAPI] Error searching cosmetic "${name}":`, error.message);
            return null;
        }
    }

    /**
     * Récupère tous les nouveaux cosmétiques
     */
    async getNewCosmetics(): Promise<FortniteCosmetic[]> {
        try {
            const response = await this.client.get<FortniteAPIResponse>('/cosmetics/br/new');

            if (response.data.status === 200 && response.data.data) {
                return Array.isArray(response.data.data) ? response.data.data : [response.data.data];
            }

            return [];
        } catch (error: any) {
            console.error('[FortniteAPI] Error getting new cosmetics:', error.message);
            return [];
        }
    }

    /**
     * Récupère tous les cosmétiques (avec pagination limitée)
     */
    async getAllCosmetics(type?: 'outfit' | 'backpack' | 'pickaxe' | 'emote'): Promise<FortniteCosmetic[]> {
        try {
            const backendTypeMap = {
                outfit: 'AthenaCharacter',
                backpack: 'AthenaBackpack',
                pickaxe: 'AthenaPickaxe',
                emote: 'AthenaDance',
            };

            const params: any = {
                language: 'en',
            };

            if (type && backendTypeMap[type]) {
                params.type = backendTypeMap[type];
            }

            const response = await this.client.get<FortniteAPIResponse>('/cosmetics/br', { params });

            if (response.data.status === 200 && response.data.data) {
                return Array.isArray(response.data.data) ? response.data.data : [response.data.data];
            }

            return [];
        } catch (error: any) {
            console.error('[FortniteAPI] Error getting all cosmetics:', error.message);
            return [];
        }
    }

    /**
     * Récupère un cosmétique spécifique par ID
     */
    async getCosmeticById(id: string): Promise<FortniteCosmetic | null> {
        try {
            const response = await this.client.get<FortniteAPIResponse>(`/cosmetics/br/${id}`);

            if (response.data.status === 200 && response.data.data) {
                return Array.isArray(response.data.data) ? response.data.data[0] : response.data.data;
            }

            return null;
        } catch (error: any) {
            console.error(`[FortniteAPI] Error getting cosmetic by ID "${id}":`, error.message);
            return null;
        }
    }

    /**
     * Obtient un cosmétique aléatoire
     */
    async getRandomCosmetic(type?: 'outfit' | 'backpack' | 'pickaxe' | 'emote'): Promise<FortniteCosmetic | null> {
        try {
            const cosmetics = await this.getAllCosmetics(type);

            if (cosmetics.length === 0) {
                return null;
            }

            const randomIndex = Math.floor(Math.random() * cosmetics.length);
            return cosmetics[randomIndex];
        } catch (error: any) {
            console.error('[FortniteAPI] Error getting random cosmetic:', error.message);
            return null;
        }
    }
}
