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
        
        let friendId = '';
        // Cast to any to access internal friends map if types are missing
        const friendsList = (client as any).friends;
        
        if (friendsList) {
            friendsList.forEach((friend: any) => {
                if (friend.displayName.toLowerCase() === query.toLowerCase()) {
                    friendId = friend.id;
                }
            });
        }

        if (!friendId) return `❌ Ami "${query}" introuvable.`;

        try {
            await client.friend.remove(friendId);
            return `🗑️ **${query}** retiré des amis.`;
        } catch (e: any) {
            return `❌ Erreur: ${e.message}`;
        }
    }
}
