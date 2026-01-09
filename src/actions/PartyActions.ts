import { Client } from 'fnbr';

export class PartyActions {

    async leaveParty(client: Client): Promise<string> {
        if (!client.party) return '❌ Pas dans un groupe';
        try {
            await client.party.leave();
            return '👋 Parti du groupe.';
        } catch (e: any) {
            return `❌ Erreur: ${e.message}`;
        }
    }

    async setPrivacy(client: Client, privacy: string): Promise<string> {
        if (!client.party) return '❌ Pas dans un groupe';

        const privacyMap: any = {
            'public': 'Public',
            'private': 'Private',
            'friends': 'Friends'
        };

        const targetPrivacy = privacyMap[privacy.toLowerCase()];
        if (!targetPrivacy) return 'Usage: !privacy <public|private|friends>';

        try {
            await client.party.setPrivacy(targetPrivacy);
            return `🔒 Confidentialité définie sur : **${targetPrivacy}**`;
        } catch (e: any) {
            return `❌ Erreur: ${e.message}`;
        }
    }

    async promoteMember(client: Client, query: string): Promise<string> {
        if (!query) return 'Usage: !promote <pseudo>';
        if (!client.party) return '❌ Pas dans un groupe';
        
        const member = client.party.members.find((m: any) => m.displayName.toLowerCase().includes(query.toLowerCase()));
        if (!member) return `❌ Joueur "${query}" introuvable.`;

        try {
            await member.promote();
            return `👑 **${member.displayName}** est maintenant chef du groupe.`;
        } catch (e: any) {
            return `❌ Erreur: ${e.message}`;
        }
    }

    async kickMember(client: Client, query: string): Promise<string> {
        if (!query) return 'Usage: !kick <pseudo>';
        if (!client.party) return '❌ Pas dans un groupe';

        const member = client.party.members.find((m: any) => m.displayName.toLowerCase().includes(query.toLowerCase()));
        if (!member) return `❌ Joueur "${query}" introuvable.`;

        if (client.user?.self && member.id === client.user.self.id) return '❌ Je ne peux pas m\'exclure moi-même (utilise !leave).';

        try {
            await member.kick();
            return `👢 **${member.displayName}** a été exclu.`;
        } catch (e: any) {
            return `❌ Erreur: ${e.message}`;
        }
    }
    
    async setReady(client: Client, isReady: boolean): Promise<string> {
        if (!client.party) return '❌ Pas dans un groupe';
        try {
            // @ts-ignore
            if (client.party.me.setReadiness) await client.party.me.setReadiness(isReady);
            return isReady ? '✅ Prêt !' : '❌ Pas prêt.';
        } catch (e: any) {
            return `❌ Erreur: ${e.message}`;
        }
    }
}
