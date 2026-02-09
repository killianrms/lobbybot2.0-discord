import { AppError } from './AppError';

/**
 * Erreur de base pour les opérations sociales (amis).
 */
export class SocialError extends AppError {
    constructor(
        message: string,
        code: string = 'SOCIAL_ERROR',
        public readonly originalError?: unknown
    ) {
        super(message, code, 500);
    }
}

/**
 * Erreur lorsqu'un ami n'est pas trouvé.
 */
export class FriendNotFoundError extends SocialError {
    constructor(public readonly query: string) {
        super(`Ami "${query}" introuvable`, 'FRIEND_NOT_FOUND');
    }
}

/**
 * Erreur lorsqu'un paramètre requis est manquant pour une action sociale.
 */
export class MissingSocialParameterError extends SocialError {
    constructor(parameter: string, usage: string) {
        super(`Paramètre "${parameter}" requis. Usage: ${usage}`, 'MISSING_SOCIAL_PARAMETER');
    }
}

/**
 * Erreur lors de l'envoi d'une demande d'ami.
 */
export class FriendRequestError extends SocialError {
    constructor(
        public readonly target: string,
        originalError?: unknown
    ) {
        super(`Impossible d'envoyer une demande d'ami à "${target}"`, 'FRIEND_REQUEST_ERROR', originalError);
    }
}

/**
 * Erreur lors de la suppression d'un ami.
 */
export class FriendRemoveError extends SocialError {
    constructor(
        public readonly target: string,
        originalError?: unknown
    ) {
        super(`Impossible de retirer "${target}" des amis`, 'FRIEND_REMOVE_ERROR', originalError);
    }
}

