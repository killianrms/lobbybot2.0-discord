import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { Command, CommandContext } from './Command';

export const ShopCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Voir la boutique du jour'),

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        const shop = await context.apiManager.getShop(userLang);

        if (shop && shop.length > 0) {
            const embed = new EmbedBuilder()
                .setTitle(`🛒 Boutique Fortnite du ${new Date().toLocaleDateString()}`)
                .setColor('#D400FF') // Epic Purple
                .setThumbnail('https://upload.wikimedia.org/wikipedia/commons/7/7c/Fortnite_F_lettermark_logo.png');

            // Group by section if possible?
            // The API response structure flat list usually has 'section' in item attributes
            // But here we might just list top items.

            const daily = shop.filter((i: any) => i.section?.name === 'Daily' || i.section?.name === 'Quotidien').slice(0, 5);
            const others = shop.filter((i: any) => i.section?.name !== 'Daily' && i.section?.name !== 'Quotidien').slice(0, 10);

            if (daily.length > 0) {
                const dailyList = daily.map((i: any) => `• **${i.items[0]?.name}** (${i.finalPrice} V)`).join('\n');
                embed.addFields({ name: '📅 Daily', value: dailyList, inline: true });
            }

            const featuredList = others.map((i: any) => `• **${i.items[0]?.name}** (${i.finalPrice} V)`).join('\n');
            embed.addFields({ name: '✨ Featured (Extraits)', value: featuredList || 'Aucun', inline: true });

            await interaction.editReply({ embeds: [embed] });
        } else {
            await interaction.editReply('❌ Impossible de récupérer la boutique.');
        }
    }
};
