import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from 'discord.js';
import { Command, CommandContext } from './Command';
import { getTranslation } from '../utils/locales';

// Passe par le login Epic d'abord → redirige vers la page du code auth
const EPIC_AUTH_URL =
    'https://www.epicgames.com/id/login?lang=en&noHostRedirect=true&redirectUrl=https%3A%2F%2Fwww.epicgames.com%2Fid%2Fapi%2Fredirect%3FclientId%3D3f69e56c7649492c8cc29f1af08a8a12%26responseType%3Dcode';

export const LoginCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('login')
        .setDescription('Connect your Epic Games account / Connecter votre compte Epic Games'),

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        await interaction.deferReply({ ephemeral: true });

        const t = (key: string) => getTranslation(userLang, key);

        const embed = new EmbedBuilder()
            .setTitle(t('LOGIN_TITLE'))
            .setColor(0x5865F2)
            .setDescription(t('LOGIN_FALLBACK_DESC'))
            .setFooter({ text: t('LOGIN_FOOTER') });

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setLabel(t('LOGIN_GET_CODE_BTN'))
                .setStyle(ButtonStyle.Link)
                .setURL(EPIC_AUTH_URL),
            new ButtonBuilder()
                .setCustomId('login_enter_code')
                .setLabel(t('LOGIN_ENTER_CODE_BTN'))
                .setStyle(ButtonStyle.Success)
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
    },
};
