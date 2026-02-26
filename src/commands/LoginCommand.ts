import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { Command, CommandContext } from './Command';

const EPIC_AUTH_URL = 'https://www.epicgames.com/id/api/redirect?clientId=3f69e56c7649492c8cc29f1af08a8a12&responseType=code';

export const LoginCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('login')
        .setDescription('Connecter votre compte Epic Games pour l\'auto-add'),

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        const embed = new EmbedBuilder()
            .setColor(0x00D4FF)
            .setTitle('🎮 Connexion Epic Games')
            .setDescription(
                '**Étapes pour vous connecter :**\n\n' +
                '1️⃣ Cliquez sur **"Obtenir le code"** ci-dessous\n' +
                '2️⃣ Si vous n\'êtes pas connecté : **connectez-vous** sur Epic Games\n' +
                '3️⃣ La page affiche un JSON avec `"authorizationCode"` → **copiez la valeur**\n' +
                '4️⃣ Cliquez sur **"Entrer mon code"** et collez-le\n\n' +
                '> ⚡ Si vous êtes déjà connecté, le code apparaît **instantanément** !'
            )
            .setFooter({ text: 'Le code expire rapidement, utilisez-le immédiatement.' });

        const linkButton = new ButtonBuilder()
            .setLabel('Obtenir le code Epic Games')
            .setURL(EPIC_AUTH_URL)
            .setStyle(ButtonStyle.Link);

        const codeButton = new ButtonBuilder()
            .setCustomId('login_enter_code')
            .setLabel('✏️ Entrer mon code')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(linkButton, codeButton);

        await interaction.reply({
            embeds: [embed],
            components: [row],
            flags: 64 // ephemeral
        });
    }
};
