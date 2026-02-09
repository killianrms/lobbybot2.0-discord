import { FortniteCosmetic } from '../../services/FortniteAPIService';
import { CosmeticType } from '../errors/CosmeticError';

/**
 * Interface pour le service API Fortnite.
 * Permet l'injection de dépendances et facilite les tests.
 */
export interface IFortniteAPIService {
    /**
     * Recherche un cosmétique par nom.
     * @param name - Terme de recherche
     * @param type - Type de cosmétique (optionnel)
     * @returns Le cosmétique trouvé ou null
     */
    searchCosmetic(name: string, type?: CosmeticType): Promise<FortniteCosmetic | null>;
}

/**
 * Résultat d'une opération cosmétique réussie.
 */
export interface CosmeticResult {
    success: true;
    cosmetic: FortniteCosmetic;
    type: CosmeticType;
}

/**
 * Résultat de suppression d'un cosmétique (ex: retirer sac à dos).
 */
export interface CosmeticRemovedResult {
    success: true;
    removed: true;
    type: CosmeticType;
}

