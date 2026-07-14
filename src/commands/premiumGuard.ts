import { ChatInputCommandInteraction } from 'discord.js';
import { DatabaseManager } from '../managers/DatabaseManager';

/**
 * Renvoie true si l'utilisateur est premium. Sinon répond avec un message
 * d'upsell (éphémère) et renvoie false. À appeler en tête d'une commande premium
 * AVANT tout deferReply.
 */
export function requirePremium(interaction: ChatInputCommandInteraction, dbManager: DatabaseManager): boolean {
    if (dbManager.isPremium(interaction.user.id)) return true;
    interaction.reply({
        content: '🔒 Cette commande est réservée à **LobbyBot Premium**.\nAbonne-toi pour débloquer ta flotte perso, `/squad`, les emotes synchronisées et les presets !',
        ephemeral: true
    }).catch(() => {});
    return false;
}
