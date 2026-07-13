import { Client } from 'fnbr';

export class SocialActions {

    async addFriend(client: Client, query: string): Promise<string> {
        if (!query) return 'Usage: !add <pseudo>';

        try {
            await client.friend.add(query);
            return `✅ Demande d'ami envoyée à **${query}**.`;
        } catch (e: any) {
            return `❌ Erreur: ${e.message}`;
        }
    }

    async removeFriend(client: Client, query: string): Promise<string> {
        if (!query) return 'Usage: !remove <pseudo>';
        
        const friend = client.friend.list.find((f: any) => f.displayName?.toLowerCase() === query.toLowerCase());
        if (!friend) return `❌ Ami "${query}" introuvable.`;
        const friendId = friend.id;

        try {
            await client.friend.remove(friendId);
            return `🗑️ **${query}** retiré des amis.`;
        } catch (e: any) {
            return `❌ Erreur: ${e.message}`;
        }
    }
}
