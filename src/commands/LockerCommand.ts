import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { Command, CommandContext } from './Command';

export const LockerCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('locker')
        .setDescription('Affiche un résumé de votre casier Fortnite'),

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        await interaction.deferReply({ ephemeral: true });
        const locker = await context.userManager.getLocker(interaction.user.id);

        if (!locker) {
            await interaction.editReply('❌ Impossible de récupérer le casier (Non connecté ou erreur).');
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle('📦 Votre Casier Fortnite')
            .setColor('#FFD700') // Gold
            .addFields(
                { name: 'Skins', value: locker.skins.toString(), inline: true },
                { name: 'Sacs à dos', value: locker.backpacks.toString(), inline: true },
                { name: 'Pioches', value: locker.pickaxes.toString(), inline: true },
                { name: 'Danses / Emotes', value: locker.emotes.toString(), inline: true },
                { name: '🌟 Légendaires', value: locker.legendary.toString(), inline: true }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
};
