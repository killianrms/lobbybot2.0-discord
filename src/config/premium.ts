import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

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

/**
 * Rangée contenant le bouton d'achat natif Discord (ouvre la modale d'abonnement).
 * Les boutons Premium n'acceptent ni label ni custom_id : Discord affiche le nom
 * et le prix du SKU. Renvoie null tant que PREMIUM_SKU_ID n'est pas configuré,
 * pour que les appelants puissent omettre proprement le composant.
 */
export function premiumButtonRow(): ActionRowBuilder<ButtonBuilder> | null {
    if (!PREMIUM_SKU_ID) return null;
    const button = new ButtonBuilder()
        .setStyle(ButtonStyle.Premium)
        .setSKUId(PREMIUM_SKU_ID);
    return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
}
