import { Client } from 'fnbr';
import {
    CosmeticType,
    CosmeticError,
    CosmeticNotFoundError,
    NoPartyError
} from '../core/errors';
import {
    IFortniteAPIService,
    CosmeticResult,
    CosmeticRemovedResult
} from '../core/interfaces';

/**
 * Mots-clés pour retirer un sac à dos.
 */
const REMOVE_BACKPACK_KEYWORDS = ['none', 'vide', 'aucun', 'sac'] as const;

/**
 * Service gérant les actions cosmétiques pour un bot Fortnite.
 * Permet de modifier l'apparence du bot (skin, sac à dos, pioche, emote) dans un groupe.
 *
 * @example
 * ```typescript
 * const apiService = new FortniteAPIService();
 * const cosmeticsActions = new CosmeticsActions(apiService);
 *
 * try {
 *   const result = await cosmeticsActions.setSkin(client, 'Renegade Raider');
 *   console.log(`Skin appliqué: ${result.cosmetic.name}`);
 * } catch (error) {
 *   if (error instanceof CosmeticNotFoundError) {
 *     console.log('Skin non trouvé');
 *   }
 * }
 * ```
 */
export class CosmeticsActions {
    /**
     * Crée une instance de CosmeticsActions.
     * @param apiService - Service API Fortnite injecté pour la recherche de cosmétiques
     */
    constructor(private readonly apiService: IFortniteAPIService) {}

    /**
     * Vérifie que le client est dans une party.
     * @param client - Instance du client Fortnite
     * @throws {NoPartyError} Si le bot n'est pas dans un groupe
     */
    private assertInParty(client: Client): void {
        if (!client.party) {
            throw new NoPartyError();
        }
    }

    /**
     * Applique un cosmétique générique au bot.
     * Méthode interne factorisée pour éviter la duplication de code.
     *
     * @param client - Client Fortnite connecté
     * @param query - Terme de recherche du cosmétique
     * @param type - Type de cosmétique à appliquer
     * @param applyFn - Fonction d'application spécifique au type
     * @returns Résultat avec le cosmétique appliqué
     * @throws {NoPartyError} Si le bot n'est pas dans un groupe
     * @throws {CosmeticNotFoundError} Si le cosmétique n'est pas trouvé
     * @throws {CosmeticError} Si l'application du cosmétique échoue
     */
    private async applyCosmetic(
        client: Client,
        query: string,
        type: CosmeticType,
        applyFn: (id: string) => Promise<void>
    ): Promise<CosmeticResult> {
        // Vérifier la party en premier pour éviter un appel API inutile
        this.assertInParty(client);

        const item = await this.apiService.searchCosmetic(query, type);
        if (!item) {
            throw new CosmeticNotFoundError(query, type);
        }

        try {
            await applyFn(item.id);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Erreur inconnue';
            throw new CosmeticError(
                `Erreur lors de l'application du ${type}: ${message}`,
                'COSMETIC_APPLY_ERROR',
                error
            );
        }

        return {
            success: true,
            cosmetic: item,
            type
        };
    }

    /**
     * Définit le skin (tenue) du bot.
     *
     * @param client - Instance du client Fortnite connecté
     * @param query - Nom ou terme de recherche du skin souhaité
     * @returns Résultat avec le skin appliqué
     * @throws {NoPartyError} Si le bot n'est pas dans un groupe
     * @throws {CosmeticNotFoundError} Si le skin n'est pas trouvé
     * @throws {CosmeticError} Si l'application échoue
     *
     * @example
     * ```typescript
     * const result = await cosmeticsActions.setSkin(client, 'Peely');
     * console.log(result.cosmetic.name); // "Peely"
     * ```
     */
    async setSkin(client: Client, query: string): Promise<CosmeticResult> {
        return this.applyCosmetic(
            client,
            query,
            'outfit',
            (id) => client.party!.me.setOutfit(id)
        );
    }

    /**
     * Définit le sac à dos du bot.
     * Supporte les mots-clés 'none', 'vide', 'aucun', 'sac' pour retirer le sac à dos.
     *
     * @param client - Instance du client Fortnite connecté
     * @param query - Nom du sac à dos, ou mot-clé pour le retirer
     * @returns Résultat avec le sac appliqué ou confirmation de suppression
     * @throws {NoPartyError} Si le bot n'est pas dans un groupe
     * @throws {CosmeticNotFoundError} Si le sac à dos n'est pas trouvé
     * @throws {CosmeticError} Si l'application échoue
     *
     * @example
     * ```typescript
     * // Appliquer un sac à dos
     * const result = await cosmeticsActions.setBackpack(client, 'Black Shield');
     *
     * // Retirer le sac à dos
     * const removed = await cosmeticsActions.setBackpack(client, 'none');
     * ```
     */
    async setBackpack(client: Client, query: string): Promise<CosmeticResult | CosmeticRemovedResult> {
        this.assertInParty(client);

        // Vérifier si l'utilisateur veut retirer le sac à dos
        if (REMOVE_BACKPACK_KEYWORDS.includes(query.toLowerCase() as typeof REMOVE_BACKPACK_KEYWORDS[number])) {
            try {
                await client.party!.me.setBackpack('');
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Erreur inconnue';
                throw new CosmeticError(
                    `Erreur lors du retrait du sac à dos: ${message}`,
                    'COSMETIC_REMOVE_ERROR',
                    error
                );
            }
            return { success: true, removed: true, type: 'backpack' };
        }

        return this.applyCosmetic(
            client,
            query,
            'backpack',
            (id) => client.party!.me.setBackpack(id)
        );
    }

    /**
     * Définit la pioche du bot.
     *
     * @param client - Instance du client Fortnite connecté
     * @param query - Nom ou terme de recherche de la pioche souhaitée
     * @returns Résultat avec la pioche appliquée
     * @throws {NoPartyError} Si le bot n'est pas dans un groupe
     * @throws {CosmeticNotFoundError} Si la pioche n'est pas trouvée
     * @throws {CosmeticError} Si l'application échoue
     */
    async setPickaxe(client: Client, query: string): Promise<CosmeticResult> {
        return this.applyCosmetic(
            client,
            query,
            'pickaxe',
            (id) => client.party!.me.setPickaxe(id)
        );
    }

    /**
     * Fait jouer une emote au bot.
     *
     * @param client - Instance du client Fortnite connecté
     * @param query - Nom ou terme de recherche de l'emote souhaitée
     * @returns Résultat avec l'emote appliquée
     * @throws {NoPartyError} Si le bot n'est pas dans un groupe
     * @throws {CosmeticNotFoundError} Si l'emote n'est pas trouvée
     * @throws {CosmeticError} Si l'application échoue
     */
    async setEmote(client: Client, query: string): Promise<CosmeticResult> {
        return this.applyCosmetic(
            client,
            query,
            'emote',
            (id) => client.party!.me.setEmote(id)
        );
    }
}
