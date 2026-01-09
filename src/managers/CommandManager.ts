import { Client } from 'fnbr';
import { CosmeticsActions } from '../actions/CosmeticsActions';
import { PartyActions } from '../actions/PartyActions';
import { SocialActions } from '../actions/SocialActions';

export class CommandManager {
    private cosmetics: CosmeticsActions;
    private party: PartyActions;
    private social: SocialActions;
    // Simple admin list for now, ideally passed via config
    private admins: string[] = ['DepInfo']; 

    constructor() {
        this.cosmetics = new CosmeticsActions();
        this.party = new PartyActions();
        this.social = new SocialActions();
    }

    public async handleMessage(client: Client, message: any): Promise<void> {
        if (!message.content.startsWith('!')) return;

        const args = message.content.slice(1).split(' ');
        const command = args.shift()?.toLowerCase();
        const query = args.join(' ');
        const author = message.author.displayName;

        console.log(`[${client.user?.self?.displayName}] 📩 Command: ${command} "${query}" from ${author}`);

        let response = '';

        try {
            switch (command) {
                // COSMETICS
                case 'skin':
                case 'outfit':
                    response = await this.cosmetics.setSkin(client, query);
                    break;
                case 'bag':
                case 'backpack':
                case 'sac':
                    response = await this.cosmetics.setBackpack(client, query);
                    break;
                case 'pickaxe':
                case 'pioche':
                    response = await this.cosmetics.setPickaxe(client, query);
                    break;
                case 'emote':
                case 'dance':
                    response = await this.cosmetics.setEmote(client, query);
                    break;
                
                // PARTY
                case 'ready':
                case 'pret':
                    response = await this.party.setReady(client, true);
                    break;
                case 'unready':
                case 'paspret':
                    response = await this.party.setReady(client, false);
                    break;
                case 'leave':
                case 'quit':
                    if (this.isAdmin(author)) response = await this.party.leaveParty(client);
                    break;
                case 'kick':
                    if (this.isAdmin(author)) response = await this.party.kickMember(client, query);
                    break;
                case 'promote':
                    if (this.isAdmin(author)) response = await this.party.promoteMember(client, query);
                    break;
                case 'privacy':
                    if (this.isAdmin(author)) response = await this.party.setPrivacy(client, query);
                    break;

                // SOCIAL
                case 'add':
                    if (this.isAdmin(author)) response = await this.social.addFriend(client, query);
                    break;
            }
        } catch (e: any) {
            response = `❌ Erreur interne: ${e.message}`;
        }

        if (response) {
            try {
                 await message.reply(response);
            } catch (e) {
                // Cannot reply?
            }
        }
    }

    private isAdmin(username: string): boolean {
        // TODO: Load admins from central config
        return true; // For now allow all for testing, or restrict
    }
}
