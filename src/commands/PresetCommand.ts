import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { Command, CommandContext } from './Command';
import { requirePremium } from './premiumGuard';
import { FortniteAPIService } from '../services/FortniteAPIService';

const api = new FortniteAPIService();

export const PresetCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('preset')
        .setDescription('[Premium] Gère tes presets de loadout')
        .addSubcommand(sc => sc.setName('save').setDescription('Enregistre un preset')
            .addStringOption(o => o.setName('nom').setDescription('Nom du preset').setRequired(true))
            .addStringOption(o => o.setName('skin').setDescription('Skin').setRequired(false))
            .addStringOption(o => o.setName('sac').setDescription('Sac à dos').setRequired(false))
            .addStringOption(o => o.setName('pioche').setDescription('Pioche').setRequired(false))
            .addStringOption(o => o.setName('emote').setDescription('Emote').setRequired(false)))
        .addSubcommand(sc => sc.setName('apply').setDescription('Applique un preset à tes bots (et le rend actif)')
            .addStringOption(o => o.setName('nom').setDescription('Nom du preset').setRequired(true)))
        .addSubcommand(sc => sc.setName('list').setDescription('Liste tes presets')),

    async execute(interaction: ChatInputCommandInteraction, context: CommandContext, userLang: string) {
        if (!requirePremium(interaction, context.dbManager)) return;
        const sub = interaction.options.getSubcommand();
        await interaction.deferReply({ ephemeral: true });

        if (sub === 'list') {
            const presets = context.dbManager.listPresets(interaction.user.id);
            if (presets.length === 0) { await interaction.editReply('Aucun preset. Crée-en un avec `/preset save`.'); return; }
            await interaction.editReply('🎭 Tes presets :\n' + presets.map(p => `• **${p.name}**${p.isActive ? ' (actif)' : ''}`).join('\n'));
            return;
        }

        if (sub === 'save') {
            const name = interaction.options.getString('nom', true);
            const resolve = async (q: string | null, type: 'outfit' | 'backpack' | 'pickaxe' | 'emote') => {
                if (!q) return undefined;
                const item = await api.searchCosmetic(q, type);
                return item?.id;
            };
            const preset = {
                name,
                outfit: await resolve(interaction.options.getString('skin'), 'outfit'),
                backpack: await resolve(interaction.options.getString('sac'), 'backpack'),
                pickaxe: await resolve(interaction.options.getString('pioche'), 'pickaxe'),
                emote: await resolve(interaction.options.getString('emote'), 'emote'),
            };
            context.dbManager.savePreset(interaction.user.id, preset);
            await interaction.editReply(`✅ Preset **${name}** enregistré. Applique-le avec \`/preset apply nom:${name}\`.`);
            return;
        }

        // apply
        const name = interaction.options.getString('nom', true);
        if (!context.dbManager.setActivePreset(interaction.user.id, name)) {
            await interaction.editReply(`❌ Preset "${name}" introuvable.`);
            return;
        }
        const preset = context.dbManager.getActivePreset(interaction.user.id)!;
        const count = await context.botManager.applyLoadoutToOwned(interaction.user.id, preset);
        await interaction.editReply(
            count > 0
                ? `✅ Preset **${name}** appliqué à ${count} bot(s). Il sera aussi appliqué automatiquement à ta prochaine \`/squad\`.`
                : `✅ Preset **${name}** activé. Aucun bot en ligne pour l'instant — il s'appliquera au prochain \`/squad\`.`
        );
    }
};
