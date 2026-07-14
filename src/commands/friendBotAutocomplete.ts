import { AutocompleteInteraction } from 'discord.js';
import { CommandContext } from './Command';

/**
 * Alimente une liste déroulante (autocomplete) avec les bots dont l'utilisateur
 * Discord est ami côté Fortnite. Nécessite que l'utilisateur soit connecté via
 * /login (on a besoin de son accountId Epic pour croiser les listes d'amis des bots).
 *
 * Renvoie une liste vide si l'utilisateur n'est pas connecté ou n'a aucun bot en ami
 * — Discord affiche alors « Aucune option », ce qui pousse l'utilisateur à faire
 * /login puis /add.
 */
export async function respondFriendedBots(
    interaction: AutocompleteInteraction,
    context: CommandContext
): Promise<void> {
    const focused = interaction.options.getFocused().toString().toLowerCase();

    const user = await context.dbManager.getUser(interaction.user.id);
    if (!user?.deviceAuth?.accountId) {
        await interaction.respond([]);
        return;
    }

    const bots = context.botManager
        .getBotsFriendedBy(user.deviceAuth.accountId)
        .filter(name => name.toLowerCase().includes(focused))
        .slice(0, 25) // limite Discord
        .map(name => ({ name, value: name }));

    await interaction.respond(bots);
}
