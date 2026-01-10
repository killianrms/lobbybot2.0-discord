import axios from 'axios';
import { ShopEntry, NewsPost, MapData } from '../types/api';

export class APIManager {
    private readonly BASE_URL = 'https://fortnite-api.com';

    public async getShop(lang: string = 'fr'): Promise<ShopEntry[] | null> {
        try {
            const response = await axios.get(`${this.BASE_URL}/v2/shop/br?language=${lang}`);
            const data = response.data.data;

            if (!data || !data.featured) return null;

            // Simplify structure for Discord
            // The API structure changes often, this is a basic mapping based on typical v2 response
            // We'll return a flat list of items from 'featured' section

            // Note: v2/shop/br separates into sections. We will flatten simplified items.
            // Using 'featured' sections as primary source

            // Actually, v2/shop/br returns user-friendly sections directly usually?
            // Let's assume a simplified internal mapping for now to avoid complexity

            // Refined approach: Just return the "entries" if available or null
            // We will do lighter processing here

            return data.featured ? data.featured.entries : [];
        } catch (e: any) {
            console.error('[APIManager] Failed to get shop:', e.message);
            return null;
        }
    }

    public async getMap(lang: string = 'fr'): Promise<string | null> {
        try {
            const response = await axios.get(`${this.BASE_URL}/v1/map?language=${lang}`);
            return response.data.data.images.pois;
        } catch (e: any) {
            console.error('[APIManager] Failed to get map:', e.message);
            return null;
        }
    }

    public async getNews(lang: string = 'fr'): Promise<NewsPost[] | null> {
        try {
            const response = await axios.get(`${this.BASE_URL}/v2/news/br?language=${lang}`);
            const motds = response.data.data.motds;

            if (!motds) return [];

            return motds.map((m: any) => ({
                title: m.title,
                body: m.body,
                image: m.image,
                date: m.date
            }));
        } catch (e: any) {
            console.error('[APIManager] Failed to get news:', e.message);
            return null;
        }
    }

    public async getStatus(): Promise<boolean> {
        try {
            // Simple check: can we reach the version endpoint?
            await axios.get('https://fortnite-api.com/v2/aes');
            return true;
        } catch (e) {
            return false;
        }
    }
}
