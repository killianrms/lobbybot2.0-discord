import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command, CommandContext } from './Command';
import { getTranslation } from '../utils/locales';

export const SetLanguageCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('setlangage')
        .setDescription('Changer la langue (Persistant)')
        .addStringOption(option =>
            option.setName('lang')
                .setDescription('Langue (fr/en/es/de)')
                .setRequired(true)
                .addChoices(
                    { name: 'Français', value: 'fr' },
                    { name: 'English', value: 'en' },
                    { name: 'Español', value: 'es' },
                    { name: 'Deutsch', value: 'de' }
                )),

    ephemeral: true,

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        const lang = interaction.options.getString('lang');
        if (lang) {
            await context.userManager.setLanguage(interaction.user.id, lang);
            await interaction.editReply(`✅ ${getTranslation(lang, 'LANG_SET')} **${lang}** (Sauvegardé).`);
        }
    }
};
