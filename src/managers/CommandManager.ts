import { Client } from 'fnbr';
import { CosmeticsActions } from '../actions/CosmeticsActions';
import { PartyActions } from '../actions/PartyActions';
import { SocialActions } from '../actions/SocialActions';
import { FortniteAPIService } from '../services/FortniteAPIService';
import {
    IFortniteAPIService,
    CosmeticResult,
    CosmeticRemovedResult,
    PartyActionResult,
    PartyMemberResult,
    PartyPrivacyResult,
    PartyReadyResult,
    FriendAddResult,
    FriendRemoveResult
} from '../core/interfaces';
import {
    CosmeticError,
    CosmeticNotFoundError,
    NoPartyError,
    PartyError,
    MemberNotFoundError,
    InvalidPrivacyError,
    SelfActionError,
    MissingParameterError,
    SocialError,
    FriendNotFoundError,
    MissingSocialParameterError,
    FriendRequestError,
    FriendRemoveError
} from '../core/errors';

/**
 * Gestionnaire de commandes chat in-game pour les bots Fortnite.
 * Traite les commandes préfixées par '!' envoyées dans le chat du groupe.
 */
export class CommandManager {
    private readonly cosmetics: CosmeticsActions;
    private readonly party: PartyActions;
    private readonly social: SocialActions;
    /** Liste des administrateurs autorisés */
    private readonly admins: string[] = ['DepInfo'];

    /**
     * Crée une instance de CommandManager.
     * @param apiService - Service API Fortnite (optionnel, créé par défaut)
     */
    constructor(apiService?: IFortniteAPIService) {
        const fortniteAPI = apiService ?? new FortniteAPIService();
        this.cosmetics = new CosmeticsActions(fortniteAPI);
        this.party = new PartyActions();
        this.social = new SocialActions();
    }

    /**
     * Traite un message de chat et exécute la commande correspondante.
     * @param client - Client Fortnite connecté
     * @param message - Message de chat reçu
     */
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
                    response = this.formatCosmeticResponse(
                        await this.cosmetics.setSkin(client, query),
                        'Skin'
                    );
                    break;
                case 'bag':
                case 'backpack':
                case 'sac':
                    response = this.formatCosmeticResponse(
                        await this.cosmetics.setBackpack(client, query),
                        'Sac à dos'
                    );
                    break;
                case 'pickaxe':
                case 'pioche':
                    response = this.formatCosmeticResponse(
                        await this.cosmetics.setPickaxe(client, query),
                        'Pioche'
                    );
                    break;
                case 'emote':
                case 'dance':
                    response = this.formatCosmeticResponse(
                        await this.cosmetics.setEmote(client, query),
                        'Emote'
                    );
                    break;
                
                // PARTY
                case 'ready':
                case 'pret':
                    response = this.formatPartyResponse(
                        await this.party.setReady(client, true)
                    );
                    break;
                case 'unready':
                case 'paspret':
                    response = this.formatPartyResponse(
                        await this.party.setReady(client, false)
                    );
                    break;
                case 'leave':
                case 'quit':
                    if (this.isAdmin(author)) {
                        response = this.formatPartyResponse(
                            await this.party.leaveParty(client)
                        );
                    }
                    break;
                case 'kick':
                    if (this.isAdmin(author)) {
                        response = this.formatPartyResponse(
                            await this.party.kickMember(client, query)
                        );
                    }
                    break;
                case 'promote':
                    if (this.isAdmin(author)) {
                        response = this.formatPartyResponse(
                            await this.party.promoteMember(client, query)
                        );
                    }
                    break;
                case 'privacy':
                    if (this.isAdmin(author)) {
                        response = this.formatPartyResponse(
                            await this.party.setPrivacy(client, query)
                        );
                    }
                    break;

                // SOCIAL
                case 'add':
                    if (this.isAdmin(author)) {
                        response = this.formatSocialResponse(
                            await this.social.addFriend(client, query)
                        );
                    }
                    break;
            }
        } catch (error) {
            response = this.formatErrorResponse(error);
        }

        if (response) {
            try {
                 await message.reply(response);
            } catch {
                // Cannot reply - silently ignore
            }
        }
    }

    /**
     * Formate la réponse d'une opération cosmétique réussie.
     * @param result - Résultat de l'opération cosmétique
     * @param label - Label à afficher (ex: "Skin", "Pioche")
     * @returns Message formaté pour le chat
     */
    private formatCosmeticResponse(
        result: CosmeticResult | CosmeticRemovedResult,
        label: string
    ): string {
        if ('removed' in result && result.removed) {
            return `✅ ${label} retiré.`;
        }

        if ('cosmetic' in result) {
            const emoji = result.type === 'emote' ? '💃' : '✅';
            return `${emoji} ${label} défini sur : **${result.cosmetic.name}**`;
        }

        return `✅ ${label} appliqué.`;
    }

    /**
     * Formate la réponse d'une opération de groupe réussie.
     * @param result - Résultat de l'opération de groupe
     * @returns Message formaté pour le chat
     */
    private formatPartyResponse(
        result: PartyActionResult | PartyMemberResult | PartyPrivacyResult | PartyReadyResult
    ): string {
        switch (result.action) {
            case 'leave':
                return '👋 Parti du groupe.';

            case 'kick':
                if ('member' in result) {
                    return `👢 **${result.member.displayName}** a été exclu.`;
                }
                return '👢 Membre exclu.';

            case 'promote':
                if ('member' in result) {
                    return `👑 **${result.member.displayName}** est maintenant chef du groupe.`;
                }
                return '👑 Membre promu.';

            case 'privacy':
                if ('privacy' in result) {
                    return `🔒 Confidentialité définie sur : **${result.privacy}**`;
                }
                return '🔒 Confidentialité modifiée.';

            case 'ready':
                if ('isReady' in result) {
                    return result.isReady ? '✅ Prêt !' : '❌ Pas prêt.';
                }
                return '✅ État modifié.';

            default:
                return '✅ Action effectuée.';
        }
    }

    /**
     * Formate la réponse d'une opération sociale réussie.
     * @param result - Résultat de l'opération sociale
     * @returns Message formaté pour le chat
     */
    private formatSocialResponse(result: FriendAddResult | FriendRemoveResult): string {
        switch (result.action) {
            case 'add':
                return `✅ Demande d'ami envoyée à **${result.target}**.`;

            case 'remove':
                return `🗑️ **${result.target}** retiré des amis.`;

            default:
                return '✅ Action effectuée.';
        }
    }

    /**
     * Formate une erreur en message lisible pour le chat.
     * @param error - Erreur capturée
     * @returns Message d'erreur formaté
     */
    private formatErrorResponse(error: unknown): string {
        // Erreurs cosmétiques
        if (error instanceof CosmeticNotFoundError) {
            return `❌ "${error.query}" introuvable.`;
        }

        if (error instanceof CosmeticError) {
            return `❌ Erreur cosmétique: ${error.message}`;
        }

        // Erreurs de groupe
        if (error instanceof NoPartyError) {
            return '❌ Le bot n\'est pas dans un groupe.';
        }

        if (error instanceof MemberNotFoundError) {
            return `❌ Joueur "${error.query}" introuvable.`;
        }

        if (error instanceof InvalidPrivacyError) {
            return `❌ Valeur invalide "${error.value}". Utilisez: public, private, friends`;
        }

        if (error instanceof SelfActionError) {
            return '❌ Impossible d\'effectuer cette action sur soi-même.';
        }

        if (error instanceof MissingParameterError) {
            return `❌ ${error.message}`;
        }

        if (error instanceof PartyError) {
            return `❌ Erreur groupe: ${error.message}`;
        }

        // Erreurs sociales
        if (error instanceof FriendNotFoundError) {
            return `❌ Ami "${error.query}" introuvable.`;
        }

        if (error instanceof FriendRequestError) {
            return `❌ Impossible d'envoyer une demande d'ami à "${error.target}".`;
        }

        if (error instanceof FriendRemoveError) {
            return `❌ Impossible de retirer "${error.target}" des amis.`;
        }

        if (error instanceof MissingSocialParameterError) {
            return `❌ ${error.message}`;
        }

        if (error instanceof SocialError) {
            return `❌ Erreur sociale: ${error.message}`;
        }

        // Erreur générique
        const message = error instanceof Error ? error.message : 'Erreur inconnue';
        return `❌ Erreur interne: ${message}`;
    }

    /**
     * Vérifie si un utilisateur est administrateur.
     * @param username - Nom d'utilisateur à vérifier
     * @returns true si l'utilisateur est admin
     */
    private isAdmin(username: string): boolean {
        // TODO: Charger les admins depuis la configuration centrale
        return true; // Pour les tests, autoriser tous les utilisateurs
    }
}
