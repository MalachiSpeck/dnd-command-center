// D&D 5e Character Stats & Rules Engine (Wave 4 App Supercharged Edition)
// Dynamically calculates derived stats, HP, AC, Spell slots, and handles multiclassing rules offline-first.

class CharacterEngine {
    constructor() {
        this.CLASS_HIT_DICE = {
            'Wizard': 6, 'Sorcerer': 6,
            'Bard': 8, 'Cleric': 8, 'Druid': 8, 'Monk': 8, 'Rogue': 8, 'Warlock': 8, 'Artificer': 8,
            'Fighter': 10, 'Paladin': 10, 'Ranger': 10,
            'Barbarian': 12
        };

        this.ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
    }

    // Main recalculate function: takes raw character data and returns fully calculated data
    calculate(char) {
        if (!char) return null;

        // Clone character to avoid side effects
        const result = JSON.parse(JSON.stringify(char));

        // Dynamically apply local proposals onto core fields so the player sees and plays with whatever they changed
        // while the DM dashboard decides if they are permanently approved in the master database.
        if (result.proposals) {
            Object.keys(result.proposals).forEach(field => {
                result[field] = result.proposals[field];
            });
        }

        // 1. Determine level and classes list
        let totalLevel = 0;
        let classesList = [];

        if (result.classes && Array.isArray(result.classes)) {
            classesList = result.classes;
            totalLevel = classesList.reduce((sum, c) => sum + (parseInt(c.level) || 0), 0);
        } else {
            // Fallback for flat structure
            totalLevel = parseInt(result.level) || 1;
            classesList = [{ class: result.class || 'Fighter', level: totalLevel }];
            result.classes = classesList;
        }
        result.level = totalLevel;

        // 2. Proficiency Bonus
        const profBonus = Math.ceil(totalLevel / 4) + 1;
        result.proficiency_bonus = profBonus;

        // 3. Equipment & Magic Items Scan for Score Overrides
        const magicItems = result.magic_items || [];
        const base = result.stats || result.ability_scores?.base || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
        const racial = result.ability_scores?.racial || {};
        const asi = result.ability_scores?.asi || {};
        const overrides = result.ability_scores?.overrides || {};

        const finalScores = {};
        const modifiers = {};

        // Calculate raw ability scores first (base + racial + asi)
        this.ABILITY_KEYS.forEach(key => {
            if (overrides[key] !== undefined) {
                finalScores[key] = overrides[key];
            } else {
                const bScore = parseInt(base[key]) || 10;
                const rBonus = parseInt(racial[key]) || 0;
                const aBonus = parseInt(asi[key]) || 0;
                finalScores[key] = bScore + rBonus + aBonus;
            }
        });

        // Apply Magic Item Overrides to Ability Scores (e.g. Belt of Hill Giant Strength overrides Str to 21)
        magicItems.forEach(item => {
            const itemName = typeof item === 'string' ? item : (item.name || '');
            const lowerName = itemName.toLowerCase();

            if (lowerName.includes('belt of hill giant strength')) {
                finalScores.str = Math.max(finalScores.str, 21);
            } else if (lowerName.includes('gauntlets of ogre power')) {
                finalScores.str = Math.max(finalScores.str, 19);
            } else if (lowerName.includes('headband of intellect')) {
                finalScores.int = Math.max(finalScores.int, 19);
            } else if (lowerName.includes('amulet of health')) {
                finalScores.con = Math.max(finalScores.con, 19);
            }
        });

        // Calculate Modifiers from final ability scores
        this.ABILITY_KEYS.forEach(key => {
            modifiers[key] = Math.floor((finalScores[key] - 10) / 2);
        });

        result.ability_scores_calculated = finalScores;
        result.ability_modifiers = modifiers;

        // Backward compatibility for flat stats
        result.stats = finalScores;

        // 4. Hit Points (Max HP)
        let maxHp = 0;
        let conMod = modifiers.con;

        classesList.forEach((cls, idx) => {
            const clsName = cls.class;
            const clsLvl = parseInt(cls.level) || 0;
            const hitDie = this.CLASS_HIT_DICE[clsName] || 8;

            if (clsLvl > 0) {
                if (idx === 0) {
                    // First level: max hit die + Con mod
                    maxHp += hitDie + conMod;
                    // Subsequent levels of first class: average hit die + Con mod
                    maxHp += (clsLvl - 1) * (Math.floor(hitDie / 2) + 1 + conMod);
                } else {
                    // Multiclass subsequent levels: average hit die + Con mod
                    maxHp += clsLvl * (Math.floor(hitDie / 2) + 1 + conMod);
                }
            }
        });

        // Racial HP Bonuses (e.g. Hill Dwarf: +1 HP per level)
        if (result.race?.toLowerCase().includes('hill dwarf') || result.race?.toLowerCase().includes('dwarf')) {
            maxHp += totalLevel;
        }

        // Feat HP Bonuses (e.g. Tough Feat: +2 HP per level)
        const featsList = result.feats || [];
        if (featsList.some(f => f.toLowerCase().includes('tough'))) {
            maxHp += (totalLevel * 2);
        }

        result.hp_max = Math.max(1, maxHp);
        if (result.hp_current === undefined || result.hp_current > result.hp_max) {
            result.hp_current = result.hp_max;
        }
        result.hp = result.hp_max; // Sync legacy flat HP

        // 5. Initiative Bonus
        let initBonus = modifiers.dex;
        if (featsList.some(f => f.toLowerCase().includes('alert'))) {
            initBonus += 5;
        }
        // Stone of Good Luck adds +1 to all ability checks (which includes initiative)
        if (magicItems.some(i => i.toLowerCase().includes('stone of good luck'))) {
            initBonus += 1;
        }
        result.initiative_bonus = initBonus;

        // 6. Armor Class (AC)
        let baseAc = 10;
        let dexBonus = modifiers.dex;
        const armor = result.equipped_armor || result.equipment?.armor || 'none';
        const hasShield = result.equipped_shield !== undefined ? result.equipped_shield : !!result.equipment?.shield;

        switch (armor.toLowerCase()) {
            // Light Armors (Full Dex modifier)
            case 'padded': baseAc = 11; break;
            case 'leather': baseAc = 11; break;
            case 'studded leather': baseAc = 12; break;
            // Medium Armors (Dex capped at +2)
            case 'hide': baseAc = 12; dexBonus = Math.min(2, dexBonus); break;
            case 'chain shirt': baseAc = 13; dexBonus = Math.min(2, dexBonus); break;
            case 'scale mail': baseAc = 14; dexBonus = Math.min(2, dexBonus); break;
            case 'breastplate': baseAc = 14; dexBonus = Math.min(2, dexBonus); break;
            case 'half plate': baseAc = 15; dexBonus = Math.min(2, dexBonus); break;
            // Heavy Armors (No Dex bonus)
            case 'ring mail': baseAc = 14; dexBonus = 0; break;
            case 'chain mail': baseAc = 16; dexBonus = 0; break;
            case 'splint': baseAc = 17; dexBonus = 0; break;
            case 'plate': baseAc = 18; dexBonus = 0; break;
            default:
                // No Armor: Unarmored Defense / Mage Armor Checks
                if (result.class === 'Barbarian') {
                    baseAc = 10 + modifiers.dex + modifiers.con;
                    dexBonus = 0;
                } else if (result.class === 'Monk') {
                    baseAc = 10 + modifiers.dex + modifiers.wis;
                    dexBonus = 0;
                } else if (result.mage_armor_active) {
                    baseAc = 13;
                } else {
                    baseAc = 10;
                }
                break;
        }

        let finalAc = baseAc + dexBonus;
        if (hasShield) {
            finalAc += 2;
        }

        // Magic Items AC bonus (Cloak/Ring of Protection, +1 Armor, +1 Shield, etc.)
        magicItems.forEach(item => {
            const itemName = typeof item === 'string' ? item : (item.name || '');
            const lowerName = itemName.toLowerCase();

            if (lowerName.includes('cloak of protection') || lowerName.includes('ring of protection')) {
                finalAc += 1;
            } else if (lowerName.includes('+1 shield')) {
                finalAc += 1;
            } else if (lowerName.includes('+1 armor') || lowerName.includes('+1 longsword')) {
                // If they have +1 armor or shields in their magic items, add standard 1
                if (lowerName.includes('armor')) finalAc += 1;
            }
        });

        result.ac = finalAc;

        // 7. Passive Perception, Insight, and Investigation
        const isProficient = (skillName) => {
            if (!result.proficiencies?.skills) return false;
            return result.proficiencies.skills.some(s => s.toLowerCase() === skillName.toLowerCase());
        };

        const calcPassive = (abilityMod, skillName) => {
            let score = 10 + abilityMod;
            if (isProficient(skillName)) {
                score += profBonus;
            }
            if (featsList.some(f => f.toLowerCase().includes('observant') && skillName.toLowerCase() === 'perception')) {
                score += 5;
            }
            if (featsList.some(f => f.toLowerCase().includes('observant') && skillName.toLowerCase() === 'investigation')) {
                score += 5;
            }
            // Cloak/Ring of Protection or Luckstone adds +1 to all ability checks
            if (magicItems.some(i => i.toLowerCase().includes('stone of good luck') || i.toLowerCase().includes('cloak of protection') || i.toLowerCase().includes('ring of protection'))) {
                score += 1;
            }
            return score;
        };

        result.passives = {
            perception: calcPassive(modifiers.wis, 'perception'),
            insight: calcPassive(modifiers.wis, 'insight'),
            investigation: calcPassive(modifiers.int, 'investigation')
        };

        // 8. Spellcasting Save DC & Attack Bonus
        // Class-specific spellcasting ability
        const spellcastingAbilities = {
            'Wizard': 'int', 'Artificer': 'int',
            'Cleric': 'wis', 'Druid': 'wis', 'Ranger': 'wis',
            'Bard': 'cha', 'Sorcerer': 'cha', 'Warlock': 'cha', 'Paladin': 'cha'
        };

        // Find primary casting ability (defaulting to the first casting class found, or Cha)
        let mainCastingAbility = 'cha';
        for (const cls of classesList) {
            if (spellcastingAbilities[cls.class]) {
                mainCastingAbility = spellcastingAbilities[cls.class];
                break;
            }
        }

        const castingMod = modifiers[mainCastingAbility] || 0;
        let finalDc = 8 + profBonus + castingMod;
        let finalAtk = profBonus + castingMod;

        // Apply Magic Items Spell Casting bonuses (e.g. Amulet of the Devout, Moon Sickle, etc.)
        magicItems.forEach(item => {
            const itemName = typeof item === 'string' ? item : (item.name || '');
            const lowerName = itemName.toLowerCase();

            if (lowerName.includes('amulet of the devout') || lowerName.includes('moon sickle')) {
                finalDc += 1;
                finalAtk += 1;
            }
        });

        result.spell_save_dc = finalDc;
        result.spell_attack_bonus = finalAtk;

        // 9. Spell Slots (Multiclass-Aware Calculation)
        result.spell_slots = this.calculateSpellSlots(classesList);
        if (result.spell_slots_current === undefined) {
            result.spell_slots_current = [...result.spell_slots];
        }

        return result;
    }

    // Calculates spell slots based on levels of different casting classes
    calculateSpellSlots(classesList) {
        let casterLevel = 0;
        let hasPactMagic = false;
        let pactMagicLevel = 0;

        classesList.forEach(cls => {
            const name = cls.class;
            const lvl = parseInt(cls.level) || 0;

            if (['Wizard', 'Sorcerer', 'Bard', 'Cleric', 'Druid'].includes(name)) {
                casterLevel += lvl;
            } else if (['Artificer', 'Paladin', 'Ranger'].includes(name)) {
                casterLevel += Math.floor(lvl / 2);
            } else if (name === 'Warlock') {
                hasPactMagic = true;
                pactMagicLevel = lvl;
            }
        });

        // Basic Multiclass/Full-caster Spell Slot Grid
        const slotsTable = [
            // [lvl 1, 2, 3, 4, 5, 6, 7, 8, 9]
            [0, 0, 0, 0, 0, 0, 0, 0, 0], // Lvl 0
            [2, 0, 0, 0, 0, 0, 0, 0, 0], // Lvl 1
            [3, 0, 0, 0, 0, 0, 0, 0, 0], // Lvl 2
            [4, 2, 0, 0, 0, 0, 0, 0, 0], // Lvl 3
            [4, 3, 0, 0, 0, 0, 0, 0, 0], // Lvl 4
            [4, 3, 2, 0, 0, 0, 0, 0, 0], // Lvl 5
            [4, 3, 3, 0, 0, 0, 0, 0, 0], // Lvl 6
            [4, 3, 3, 1, 0, 0, 0, 0, 0], // Lvl 7
            [4, 3, 3, 2, 0, 0, 0, 0, 0], // Lvl 8
            [4, 3, 3, 3, 1, 0, 0, 0, 0], // Lvl 9
            [4, 3, 3, 3, 2, 0, 0, 0, 0], // Lvl 10
            [4, 3, 3, 3, 2, 1, 0, 0, 0], // Lvl 11
            [4, 3, 3, 3, 2, 1, 0, 0, 0], // Lvl 12
            [4, 3, 3, 3, 2, 1, 1, 0, 0], // Lvl 13
            [4, 3, 3, 3, 2, 1, 1, 1, 0], // Lvl 14
            [4, 3, 3, 3, 2, 1, 1, 1, 1], // Lvl 15
            [4, 3, 3, 3, 2, 1, 1, 1, 1], // Lvl 16
            [4, 3, 3, 3, 2, 1, 1, 1, 1], // Lvl 17
            [4, 3, 3, 3, 3, 1, 1, 1, 1], // Lvl 18
            [4, 3, 3, 3, 3, 2, 1, 1, 1], // Lvl 19
            [4, 3, 3, 3, 3, 2, 2, 1, 1]  // Lvl 20
        ];

        let finalSlots = [...slotsTable[Math.min(20, Math.floor(casterLevel))]];

        // If they have Warlock Pact Magic, add Pact slots
        if (hasPactMagic) {
            let pactSlotsCount = 0;
            let pactSlotsLvl = 0;

            if (pactMagicLevel === 1) { pactSlotsCount = 1; pactSlotsLvl = 1; }
            else if (pactMagicLevel === 2) { pactSlotsCount = 2; pactSlotsLvl = 1; }
            else if (pactMagicLevel >= 3 && pactMagicLevel <= 4) { pactSlotsCount = 2; pactSlotsLvl = 2; }
            else if (pactMagicLevel >= 5 && pactMagicLevel <= 6) { pactSlotsCount = 2; pactSlotsLvl = 3; }
            else if (pactMagicLevel >= 7 && pactMagicLevel <= 8) { pactSlotsCount = 2; pactSlotsLvl = 4; }
            else if (pactMagicLevel >= 9 && pactMagicLevel <= 10) { pactSlotsCount = 2; pactSlotsLvl = 5; }
            else if (pactMagicLevel >= 11 && pactMagicLevel <= 16) { pactSlotsCount = 3; pactSlotsLvl = 5; }
            else if (pactMagicLevel >= 17) { pactSlotsCount = 4; pactSlotsLvl = 5; }

            if (pactSlotsLvl > 0) {
                finalSlots[pactSlotsLvl - 1] += pactSlotsCount;
            }
        }

        return finalSlots;
    }
}

// Attach to window
window.characterEngine = new CharacterEngine();
