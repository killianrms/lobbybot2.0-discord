import { AppError } from './AppError';

/**
 * Type des cosmétiques supportés.
 */
export type CosmeticType = 'outfit' | 'backpack' | 'pickaxe' | 'emote';

/**
 * Erreur de base pour les opérations cosmétiques.
 */
export class CosmeticError extends AppError {
    constructor(
        message: string,
        code: string = 'COSMETIC_ERROR',
        public readonly originalError?: unknown
    ) {
        super(message, code, 500);
    }
}

/**
 * Erreur lorsqu'un cosmétique n'est pas trouvé.
 */
export class CosmeticNotFoundError extends CosmeticError {
    constructor(
        public readonly query: string,
        public readonly cosmeticType: CosmeticType
    ) {
        super(
            `Cosmétique "${query}" de type "${cosmeticType}" introuvable`,
            'COSMETIC_NOT_FOUND'
        );
    }
}


