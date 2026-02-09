import { PartyPrivacy } from '../errors/PartyError';

/**
 * Types de confidentialité pour l'affichage.
 */
export type PartyPrivacyType = 'Public' | 'Private' | 'Friends';

/**
 * Résultat d'une opération de groupe réussie.
 */
export interface PartyActionResult {
    success: true;
    action: PartyActionType;
}

/**
 * Résultat d'une action sur un membre du groupe.
 */
export interface PartyMemberResult extends PartyActionResult {
    member: {
        id: string;
        displayName: string;
    };
}

/**
 * Résultat d'un changement de confidentialité.
 */
export interface PartyPrivacyResult extends PartyActionResult {
    privacy: PartyPrivacyType;
}

/**
 * Résultat d'un changement d'état de préparation.
 */
export interface PartyReadyResult extends PartyActionResult {
    isReady: boolean;
}

/**
 * Types d'actions de groupe disponibles.
 */
export type PartyActionType = 'leave' | 'kick' | 'promote' | 'privacy' | 'ready';

