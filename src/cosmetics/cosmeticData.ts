/**
 * Mapping des noms de cosmétiques pour faciliter l'utilisation
 * Format: { nomSimple: 'CID_xxx_Athena_Commando_...' }
 */

export const OUTFITS: Record<string, string> = {
    // Skins populaires
    'renegade': 'CID_028_Athena_Commando_F',
    'renegade raider': 'CID_028_Athena_Commando_F',
    'rr': 'CID_028_Athena_Commando_F',
    'ghoul': 'CID_029_Athena_Commando_F_Halloween',
    'ghoul trooper': 'CID_029_Athena_Commando_F_Halloween',
    'skull': 'CID_030_Athena_Commando_M_Halloween',
    'skull trooper': 'CID_030_Athena_Commando_M_Halloween',
    'merry': 'CID_051_Athena_Commando_M_HolidayElf',
    'nog': 'CID_046_Athena_Commando_F_HolidaySweater',
    'aerial': 'CID_175_Athena_Commando_F_PurpleSkull',
    'purple': 'CID_175_Athena_Commando_F_PurpleSkull',
    'galaxy': 'CID_175_Athena_Commando_M_Celestial',
    'ikonik': 'CID_313_Athena_Commando_M_KpopFashion',
    'wonder': 'CID_342_Athena_Commando_F_StreetFashionEclipse',
    'reflex': 'CID_342_Athena_Commando_M_StreetFashionEclipse',
    'default': 'CID_001_Athena_Commando_F_Default',
    'ramirez': 'CID_001_Athena_Commando_F_Default',
    'jonesy': 'CID_002_Athena_Commando_M_Default',
   'drift': 'CID_165_Athena_Commando_M',
    'calamity': 'CID_164_Athena_Commando_F',
    'lynx': 'CID_315_Athena_Commando_F_StreetRacer',
    'omega': 'CID_139_Athena_Commando_M_Celestial',
    'carbide': 'CID_116_Athena_Commando_M_CarbideWhite',
    'ragnarok': 'CID_114_Athena_Commando_M_RagsToRiches',
    'visitor': 'CID_105_Athena_Commando_M_TorquiseWalker',
    'scientist': 'CID_478_Athena_Commando_M_Scientist',
};

export const BACKPACKS: Record<string, string> = {
    'wings': 'BID_044_Halloween',
    'angel': 'BID_044_Halloween',
    'love': 'BID_005_TealDragon',
    'dragon': 'BID_005_TealDragon',
    'ghost': 'BID_029_Halloween',
    'raven': 'BID_030_RavenWings',
    'drift': 'BID_141_DriftNeoLightning',
    'catalyst': 'BID_408_DriftFemale',
};

export const PICKAXES: Record<string, string> = {
    'reaper': 'Pickaxe_ID_018_Halloween',
    'scythe': 'Pickaxe_ID_018_Halloween',
    'rainbow': 'Pickaxe_ID_017_Rainbow',
    'party': 'Pickaxe_ID_017_Rainbow',
    'raider': 'Pickaxe_ID_027_Silver',
    'ac/dc': 'Pickaxe_ID_011_Assassin',
    'acdc': 'Pickaxe_ID_011_Assassin',
    'axeroni': 'Pickaxe_ID_032_Pizza',
    'vision': 'Pickaxe_ID_029_Dragon',
    'default': 'DefaultPickaxe',
};

export const EMOTES: Record<string, string> = {
    // Danses
    'floss': 'EID_Floss',
    'hype': 'EID_Hype',
    'orange': 'EID_OrangeJustice',
    'orange justice': 'EID_OrangeJustice',
    'take the l': 'EID_TakeTheL',
    'l': 'EID_TakeTheL',
    'electro': 'EID_ElectroShuffle',
    'electro shuffle': 'EID_ElectroShuffle',
    'default': 'EID_DanceMoves',
    'dance': 'EID_DanceMoves',
    'best mates': 'EID_BestMates',
    'fresh': 'EID_Fresh',
    'dab': 'EID_Dab',
    'rocket': 'EID_RocketRodeo',
    'ninja': 'EID_CallMeTheNinja',
    'scenario': 'EID_Scenario',
    'tidy': 'EID_Tidy',
    'clean': 'EID_Tidy',
    'boogie': 'EID_BoogieDown',
    'boogie down': 'EID_BoogieDown',
    'groove': 'EID_GrooveJam',
    'clean groove': 'EID_Jammin',
    'renegade': 'EID_RenegadeDance',
    'never gonna': 'EID_NeverGonna',
    'rickroll': 'EID_NeverGonna',
    'laugh': 'EID_Laugh',
    'cringe': 'EID_Cringe',
    'wave': 'EID_Wave',
    'salute': 'EID_Salute',
};

// Variants communs pour les skins
export const VARIANTS: Record<string, Array<{ channel: string; variant: string }>> = {
    // Drift stages
    drift: [
        { channel: 'Progressive', variant: 'Stage1' },
        { channel: 'Progressive', variant: 'Stage2' },
        { channel: 'Progressive', variant: 'Stage3' },
        { channel: 'Progressive', variant: 'Stage4' },
        { channel: 'Progressive', variant: 'Stage5' },
        { channel: 'Progressive', variant: 'Stage6' },
    ],
    // Calamity stages
    calamity: [
        { channel: 'Progressive', variant: 'Stage1' },
        { channel: 'Progressive', variant: 'Stage2' },
        { channel: 'Progressive', variant: 'Stage3' },
        { channel: 'Progressive', variant: 'Stage4' },
        { channel: 'Progressive', variant: 'Stage5' },
        { channel: 'Progressive', variant: 'Stage6' },
    ],
    // Lynx colors
    lynx: [
        { channel: 'Material', variant: 'Mat1' },
        { channel: 'Material', variant: 'Mat2' },
        { channel: 'Material', variant: 'Mat3' },
        { channel: 'Material', variant: 'Mat4' },
    ],
};
