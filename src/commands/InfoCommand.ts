import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command, CommandContext } from './Command';

export const InfoCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('info')
        .setDescription('Afficher les statistiques des bots'),

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        await interaction.deferReply();

        const bots = context.botManager.getActiveBots();
        const totalBots = bots.length;
        const onlineBots = bots.filter(b => b.isConnected).length;

        let totalFriends = 0;
        let maxFriends = totalBots * 1000; // Approx

        bots.forEach(b => {
            if (b.client && b.client.friend?.list) {
                totalFriends += b.client.friend.list.size;
            }
        });

        const content = [
            `📊 **Statistiques LobbyBot**`,
            `- **Bots Totaux**: ${totalBots}`,
            `- **En Ligne**: ${onlineBots} 🟢 / ${totalBots - onlineBots} 🔴`,
            `- **Amis Totaux**: ${totalFriends} / ${maxFriends}`,
            `- **Places Restantes**: ${maxFriends - totalFriends}`
        ].join('\n');

        await interaction.editReply(content);
    }
};
