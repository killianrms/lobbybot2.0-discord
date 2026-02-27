import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command, CommandContext } from './Command';

export const RemoveCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Retirer un ami')
        .addStringOption(option =>
            option.setName('pseudo')
                .setDescription('Pseudo à retirer')
                .setRequired(true)),

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        const target = interaction.options.getString('pseudo');
        if (!target) return;
        const removed = await context.botManager.removeFriend(target);
        await interaction.editReply(removed ? `✅ Ami **${target}** retiré.` : `❌ Ami **${target}** non trouvé.`);
    }
};
