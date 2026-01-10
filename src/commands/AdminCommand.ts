import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command, CommandContext } from './Command';

export const AdminCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Commandes administrateur')
        .addSubcommand(subcommand =>
            subcommand
                .setName('addbot')
                .setDescription('Ajouter un nouveau bot Fortnite')
                .addStringOption(option => option.setName('pseudo').setDescription('Pseudo').setRequired(true))
                .addStringOption(option => option.setName('email').setDescription('Email').setRequired(true))
                .addStringOption(option => option.setName('password').setDescription('Mot de passe').setRequired(true))
                .addStringOption(option => option.setName('device_id').setDescription('Device ID').setRequired(true))
                .addStringOption(option => option.setName('account_id').setDescription('Account ID').setRequired(true))
                .addStringOption(option => option.setName('secret').setDescription('Secret').setRequired(true))
        ) as any,

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        if (interaction.user.id !== '335755692134891520') {
            await interaction.reply({ content: '⛔ Accès refusé.', ephemeral: true });
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'addbot') {
            await interaction.deferReply({ ephemeral: true });

            const newBot = {
                pseudo: interaction.options.getString('pseudo', true),
                email: interaction.options.getString('email', true),
                password: interaction.options.getString('password', true),
                deviceAuth: {
                    deviceId: interaction.options.getString('device_id', true),
                    accountId: interaction.options.getString('account_id', true),
                    secret: interaction.options.getString('secret', true)
                }
            };

            try {
                await context.botManager.addNewBot(newBot);
                await interaction.editReply(`✅ Bot **${newBot.pseudo}** ajouté et lancé avec succès !`);
            } catch (e: any) {
                await interaction.editReply(`❌ Erreur lors de l'ajout du bot: ${e.message}`);
            }
        }
    }
};
