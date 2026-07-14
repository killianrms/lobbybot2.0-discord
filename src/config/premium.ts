/** Constantes centrales de l'offre premium. */
export const FREE_BOT_QUOTA = 1;
export const PREMIUM_BOT_QUOTA = parseInt(process.env.PREMIUM_BOT_QUOTA || '3', 10);

/** Rôle Discord attribué aux membres premium (facultatif tant que non configuré). */
export const PREMIUM_ROLE_ID = process.env.PREMIUM_ROLE_ID;

/** SKU de l'abonnement premium (Discord App Subscription). */
export const PREMIUM_SKU_ID = process.env.PREMIUM_SKU_ID;

export function botQuotaFor(isPremium: boolean): number {
    return isPremium ? PREMIUM_BOT_QUOTA : FREE_BOT_QUOTA;
}
