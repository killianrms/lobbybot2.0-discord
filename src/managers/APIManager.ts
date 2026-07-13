import axios from 'axios';
import { ShopEntry, NewsPost, MapData } from '../types/api';

export class APIManager {
    private readonly BASE_URL = 'https://fortnite-api.com';
    private cache: Map<string, { data: any; expires: number }> = new Map();
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    private getFromCache(key: string): any | null {
        const cached = this.cache.get(key);
        if (cached && Date.now() < cached.expires) {
            return cached.data;
        }
        this.cache.delete(key);
        return null;
    }

    private setCache(key: string, data: any): void {
        this.cache.set(key, {
            data,
            expires: Date.now() + this.CACHE_TTL
        });
    }

    public async getShop(lang: string = 'fr'): Promise<ShopEntry[] | null> {
        const cacheKey = `shop_${lang}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        try {
            // NB: /v2/shop/br est déprécié (410 Gone) depuis 2026 — remplacé par /v2/shop,
            // qui renvoie un schéma différent (entries[].brItems au lieu de items, layout au lieu de section).
            const response = await axios.get(`${this.BASE_URL}/v2/shop?language=${lang}`);
            const data = response.data.data;

            if (!data || !data.entries) return null;

            const result = data.entries;
            this.setCache(cacheKey, result);
            return result;
        } catch (e: any) {
            console.error('[APIManager] Failed to get shop:', e.message);
            return null;
        }
    }

    public async getMap(lang: string = 'fr'): Promise<string | null> {
        const cacheKey = `map_${lang}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        try {
            const response = await axios.get(`${this.BASE_URL}/v1/map?language=${lang}`);
            const result = response.data.data.images.pois;
            this.setCache(cacheKey, result);
            return result;
        } catch (e: any) {
            console.error('[APIManager] Failed to get map:', e.message);
            return null;
        }
    }

    public async getNews(lang: string = 'fr'): Promise<NewsPost[] | null> {
        const cacheKey = `news_${lang}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        try {
            const response = await axios.get(`${this.BASE_URL}/v2/news/br?language=${lang}`);
            const motds = response.data.data.motds;

            if (!motds) return [];

            const result = motds.map((m: any) => ({
                title: m.title,
                body: m.body,
                image: m.image,
                date: m.date
            }));
            this.setCache(cacheKey, result);
            return result;
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
