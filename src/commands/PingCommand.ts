import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { Command, CommandContext } from './Command';

export const PingCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check bot latency / Vérifier la latence du bot'),

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        const start = Date.now();
        await interaction.deferReply();
        const latency = Date.now() - start;

        const embed = new EmbedBuilder()
            .setTitle('🏓 Pong!')
            .setColor(0x57F287)
            .addFields(
                { name: '⏱️ Bot Latency', value: `${latency}ms`, inline: true },
                { name: '💓 API Latency', value: `${Math.round(interaction.client.ws.ping)}ms`, inline: true }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
};
