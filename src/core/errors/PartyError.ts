import { AppError } from './AppError';

/**
 * Types de confidentialité pour un groupe Fortnite.
 */
export type PartyPrivacy = 'Public' | 'Private' | 'Friends';

/**
 * Erreur de base pour les opérations de groupe/party.
 */
export class PartyError extends AppError {
    constructor(
        message: string,
        code: string = 'PARTY_ERROR',
        public readonly originalError?: unknown
    ) {
        super(message, code, 500);
    }
}

/**
 * Erreur lorsque le bot n'est pas dans un groupe.
 */
export class NoPartyError extends PartyError {
    constructor() {
        super('Le bot n\'est pas dans un groupe', 'NO_PARTY');
    }
}

/**
 * Erreur lorsqu'un membre n'est pas trouvé dans le groupe.
 */
export class MemberNotFoundError extends PartyError {
    constructor(public readonly query: string) {
        super(`Membre "${query}" introuvable dans le groupe`, 'MEMBER_NOT_FOUND');
    }
}

/**
 * Erreur lorsqu'une valeur de confidentialité est invalide.
 */
export class InvalidPrivacyError extends PartyError {
    constructor(public readonly value: string) {
        super(
            `Valeur de confidentialité "${value}" invalide. Valeurs acceptées: public, private, friends`,
            'INVALID_PRIVACY'
        );
    }
}

/**
 * Erreur lorsqu'on tente une action interdite sur soi-même.
 */
export class SelfActionError extends PartyError {
    constructor(action: string) {
        super(`Impossible d'effectuer l'action "${action}" sur soi-même`, 'SELF_ACTION');
    }
}

/**
 * Erreur lorsqu'un paramètre requis est manquant.
 */
export class MissingParameterError extends PartyError {
    constructor(parameter: string, usage: string) {
        super(`Paramètre "${parameter}" requis. Usage: ${usage}`, 'MISSING_PARAMETER');
    }
}

