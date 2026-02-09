import { Client, Friend } from 'fnbr';
import {
    SocialError,
    FriendNotFoundError,
    MissingSocialParameterError,
    FriendRequestError,
    FriendRemoveError
} from '../core/errors';
import {
    FriendAddResult,
    FriendRemoveResult
} from '../core/interfaces';

/**
 * Service gérant les actions sociales (amis) pour un bot Fortnite.
 * Permet d'ajouter et supprimer des amis.
 *
 * @example
 * ```typescript
 * const socialActions = new SocialActions();
 *
 * try {
 *   const result = await socialActions.addFriend(client, 'PlayerName');
 *   console.log(`Demande envoyée à ${result.target}`);
 * } catch (error) {
 *   if (error instanceof FriendRequestError) {
 *     console.log('Impossible d\'envoyer la demande');
 *   }
 * }
 * ```
 */
export class SocialActions {
    /**
     * Envoie une demande d'ami à un joueur.
     *
     * @param client - Instance du client Fortnite connecté
     * @param query - Pseudo Epic Games du joueur cible
     * @returns Résultat avec le pseudo du joueur ciblé
     * @throws {MissingSocialParameterError} Si le pseudo n'est pas fourni
     * @throws {FriendRequestError} Si l'envoi de la demande échoue
     *
     * @example
     * ```typescript
     * const result = await socialActions.addFriend(client, 'EpicPlayer123');
     * console.log(result.target); // "EpicPlayer123"
     * ```
     */
    async addFriend(client: Client, query: string): Promise<FriendAddResult> {
        if (!query || query.trim() === '') {
            throw new MissingSocialParameterError('pseudo', '!add <pseudo>');
        }

        try {
            await client.friend.add(query);
        } catch (error) {
            throw new FriendRequestError(query, error);
        }

        return {
            success: true,
            action: 'add',
            target: query
        };
    }

    /**
     * Retire un joueur de la liste d'amis.
     *
     * @param client - Instance du client Fortnite connecté
     * @param query - Pseudo Epic Games de l'ami à retirer
     * @returns Résultat avec les informations de l'ami retiré
     * @throws {MissingSocialParameterError} Si le pseudo n'est pas fourni
     * @throws {FriendNotFoundError} Si l'ami n'est pas trouvé
     * @throws {FriendRemoveError} Si la suppression échoue
     *
     * @example
     * ```typescript
     * const result = await socialActions.removeFriend(client, 'EpicPlayer123');
     * console.log(`${result.target} retiré des amis`);
     * ```
     */
    async removeFriend(client: Client, query: string): Promise<FriendRemoveResult> {
        if (!query || query.trim() === '') {
            throw new MissingSocialParameterError('pseudo', '!remove <pseudo>');
        }

        // Recherche de l'ami par nom (insensible à la casse)
        const friend = this.findFriendByName(client, query);

        if (!friend) {
            throw new FriendNotFoundError(query);
        }

        try {
            await client.friend.remove(friend.id);
        } catch (error) {
            throw new FriendRemoveError(query, error);
        }

        return {
            success: true,
            action: 'remove',
            target: friend.displayName ?? query,
            friendId: friend.id
        };
    }

    /**
     * Recherche un ami par son nom d'affichage.
     *
     * @param client - Instance du client Fortnite
     * @param query - Nom à rechercher
     * @returns L'ami trouvé ou undefined
     */
    private findFriendByName(client: Client, query: string): Friend | undefined {
        // Utilise la méthode resolve du FriendManager qui accepte un id ou displayName
        return client.friend.resolve(query);
    }
}
