import { ChatInputCommandInteraction } from 'discord.js';
import { DatabaseManager } from '../managers/DatabaseManager';
import { PREMIUM_SKU_ID, premiumButtonRow } from '../config/premium';

/**
 * Renvoie true si l'utilisateur est premium. Sinon répond avec un message
 * d'upsell (éphémère) et renvoie false. À appeler en tête d'une commande premium
 * AVANT tout deferReply.
 */
export async function requirePremium(interaction: ChatInputCommandInteraction, dbManager: DatabaseManager): Promise<boolean> {
    if (await dbManager.isPremium(interaction.user.id)) return true;

    // Fallback : le flag DB peut avoir dérivé si le bot était offline quand
    // Discord a émis entitlementCreate. On vérifie les entitlements live de
    // l'interaction et on réconcilie la DB si un abonnement actif existe.
    if (PREMIUM_SKU_ID) {
        const entitlements = (interaction as any).entitlements;
        const active = entitlements?.find?.((e: any) => {
            if (e.skuId !== PREMIUM_SKU_ID) return false;
            const endsTimestamp = e.endsTimestamp as number | null | undefined;
            return endsTimestamp == null || endsTimestamp > Date.now();
        });
        if (active) {
            const endsTimestamp = (active as any).endsTimestamp as number | null | undefined;
            await dbManager.grantPremium(
                interaction.user.id,
                'discord',
                endsTimestamp ? new Date(endsTimestamp).toISOString() : null
            );
            return true;
        }
    }

    const row = premiumButtonRow();
    interaction.reply({
        content: '🔒 Cette commande est réservée à **LobbyBot Premium**.\nAbonne-toi pour débloquer ta flotte perso, `/squad`, les emotes synchronisées et les presets !',
        components: row ? [row] : [],
        ephemeral: true
    }).catch(() => {});
    return false;
}
