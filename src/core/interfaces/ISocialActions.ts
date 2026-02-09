/**
 * Types d'actions sociales disponibles.
 */
export type SocialActionType = 'add' | 'remove';

/**
 * Résultat d'une opération sociale réussie.
 */
export interface SocialActionResult {
    success: true;
    action: SocialActionType;
    target: string;
}

/**
 * Résultat d'un ajout d'ami.
 */
export interface FriendAddResult extends SocialActionResult {
    action: 'add';
}

/**
 * Résultat d'une suppression d'ami.
 */
export interface FriendRemoveResult extends SocialActionResult {
    action: 'remove';
    friendId: string;
}

