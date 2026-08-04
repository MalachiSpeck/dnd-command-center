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

        // Apply Polymorph or Wild Shape Stat Overrides if active
        if (result.polymorph && result.polymorph.active) {
            // 5e Polymorph: Overrides ALL 6 ability scores (mental + physical)
            this.ABILITY_KEYS.forEach(key => {
                if (result.polymorph[key] !== undefined) {
                    finalScores[key] = parseInt(result.polymorph[key]);
                }
            });

            // Recalculate all 6 modifiers
            this.ABILITY_KEYS.forEach(key => {
                modifiers[key] = Math.floor((finalScores[key] - 10) / 2);
            });

            result.ac_calculated = parseInt(result.polymorph.ac) || 10;
            result.speed = result.polymorph.speed || result.speed || "30 ft";
            result.spellcasting_locked = true;
        } else if (result.wild_shape && result.wild_shape.active) {
            if (result.wild_shape.str !== undefined) finalScores.str = parseInt(result.wild_shape.str);
            if (result.wild_shape.dex !== undefined) finalScores.dex = parseInt(result.wild_shape.dex);
            if (result.wild_shape.con !== undefined) finalScores.con = parseInt(result.wild_shape.con);

            // Recalculate physical modifiers for wild shape
            modifiers.str = Math.floor((finalScores.str - 10) / 2);
            modifiers.dex = Math.floor((finalScores.dex - 10) / 2);
            modifiers.con = Math.floor((finalScores.con - 10) / 2);

            result.ac_calculated = parseInt(result.wild_shape.ac) || 10;
            result.speed = result.wild_shape.speed || result.speed || "30 ft";
        }


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

        // 6. Attunement Slots Calculation (3 default, 4+ for Artificers)
        let artificerLevel = 0;
        classesList.forEach(cls => {
            if (cls.class === 'Artificer') {
                artificerLevel += parseInt(cls.level) || 0;
            }
        });

        let attunementMax = 3;
        if (artificerLevel >= 18) attunementMax = 6;
        else if (artificerLevel >= 14) attunementMax = 5;
        else if (artificerLevel >= 10) attunementMax = 4;
        result.attunement_max = attunementMax;

        // Attuned Items Scan for Passive Bonuses
        const attunedItems = (result.attuned_items || []).concat(
            (result.inventory || []).filter(item => typeof item === 'object' && (item.attuned || item.is_attuned))
        );

        let attunedAcBonus = 0;
        let attunedSaveBonus = 0;
        let attunedAtkBonus = 0;

        attunedItems.forEach(item => {
            const name = (typeof item === 'string' ? item : (item.name || '')).toLowerCase();
            const tags = typeof item === 'object' ? (item.passive_bonuses || item.properties || []) : [];

            if (name.includes('cloak of protection') || name.includes('ring of protection')) {
                attunedAcBonus += 1;
                attunedSaveBonus += 1;
            }
            if (name.includes('stone of good luck') || name.includes('luckstone')) {
                attunedSaveBonus += 1;
            }
            if (name.includes('+1 longsword') || name.includes('+1 weapon')) {
                attunedAtkBonus += 1;
            }

            // Custom tag parser (e.g. ac:+1, saves:+1)
            if (Array.isArray(tags)) {
                tags.forEach(tag => {
                    const str = String(tag).toLowerCase();
                    if (str.startsWith('ac:')) attunedAcBonus += parseInt(str.split(':')[1]) || 0;
                    if (str.startsWith('saves:')) attunedSaveBonus += parseInt(str.split(':')[1]) || 0;
                    if (str.startsWith('atk:')) attunedAtkBonus += parseInt(str.split(':')[1]) || 0;
                });
            }
        });

        result.attuned_bonuses = {
            ac: attunedAcBonus,
            saves: attunedSaveBonus,
            attack: attunedAtkBonus
        };

        // 7. Armor Class (AC) Auto-Calculator
        if (result.ac_override !== undefined && result.ac_override !== null && result.ac_override !== '') {
            result.ac = parseInt(result.ac_override) || 10;
        } else {
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
                    // No Armor: Unarmored Defense / Mage Armor Toggle
                    if (result.class === 'Barbarian' || classesList.some(c => c.class === 'Barbarian')) {
                        baseAc = 10 + modifiers.dex + modifiers.con;
                        dexBonus = 0;
                    } else if (result.class === 'Monk' || classesList.some(c => c.class === 'Monk')) {
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

            // Add Attuned / Magic item AC bonuses
            finalAc += attunedAcBonus;

            magicItems.forEach(item => {
                const itemName = typeof item === 'string' ? item : (item.name || '');
                const lowerName = itemName.toLowerCase();
                if (lowerName.includes('+1 shield')) finalAc += 1;
                else if (lowerName.includes('+1 armor')) finalAc += 1;
            });

            result.ac = finalAc;
        }

        // 8. Passive Perception, Insight, and Investigation
        const isProficient = (skillName) => {
            if (!result.proficiencies?.skills) return false;
            return result.proficiencies.skills.some(s => s.toLowerCase() === skillName.toLowerCase());
        };

        const calcPassive = (abilityMod, skillName) => {
            let score = 10 + abilityMod;
            if (isProficient(skillName)) score += profBonus;
            if (featsList.some(f => f.toLowerCase().includes('observant') && skillName.toLowerCase() === 'perception')) score += 5;
            if (featsList.some(f => f.toLowerCase().includes('observant') && skillName.toLowerCase() === 'investigation')) score += 5;
            score += attunedSaveBonus; // Stone of Good luck / Luckstone / Protection passives
            return score;
        };

        result.passives = {
            perception: calcPassive(modifiers.wis, 'perception'),
            insight: calcPassive(modifiers.wis, 'insight'),
            investigation: calcPassive(modifiers.int, 'investigation')
        };

        // 9. Encumbrance Engine (Toggleable, default OFF)
        const encEnabled = !!(result.encumbrance_enabled || result.encumbrance?.enabled);
        const coins = result.coins || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
        const totalCoins = (parseInt(coins.cp)||0) + (parseInt(coins.sp)||0) + (parseInt(coins.ep)||0) + (parseInt(coins.gp)||0) + (parseInt(coins.pp)||0);
        const coinWeight = totalCoins / 50;

        let itemWeight = 0;
        if (Array.isArray(result.inventory)) {
            result.inventory.forEach(item => {
                if (typeof item === 'object') {
                    itemWeight += (parseFloat(item.weight) || 0) * (parseInt(item.quantity) || 1);
                }
            });
        }

        const totalWeight = parseFloat((coinWeight + itemWeight).toFixed(1));
        const maxCapacity = finalScores.str * 15;

        result.encumbrance = {
            enabled: encEnabled,
            coin_weight: parseFloat(coinWeight.toFixed(1)),
            item_weight: parseFloat(itemWeight.toFixed(1)),
            total_weight: totalWeight,
            max_capacity: maxCapacity,
            is_encumbered: encEnabled && (totalWeight > maxCapacity)
        };

        // 10. Homebrew Exhaustion Engine (-1 to -5 roll penalty, Lvl 6 Dead)
        const exLvl = Math.max(0, Math.min(6, parseInt(result.exhaustion_level !== undefined ? result.exhaustion_level : (result.exhaustion || 0))));
        result.exhaustion = exLvl;
        result.exhaustion_level = exLvl;
        result.exhaustion_penalty = exLvl >= 6 ? -999 : (-1 * exLvl);
        result.is_dead = exLvl >= 6 || !!result.is_dead;

        // 11. Spellcasting Save DC & Attack Bonus
        const spellcastingAbilities = {
            'Wizard': 'int', 'Artificer': 'int',
            'Cleric': 'wis', 'Druid': 'wis', 'Ranger': 'wis',
            'Bard': 'cha', 'Sorcerer': 'cha', 'Warlock': 'cha', 'Paladin': 'cha'
        };

        let mainCastingAbility = 'cha';
        for (const cls of classesList) {
            if (spellcastingAbilities[cls.class]) {
                mainCastingAbility = spellcastingAbilities[cls.class];
                break;
            }
        }

        const castingMod = modifiers[mainCastingAbility] || 0;
        let finalDc = 8 + profBonus + castingMod + attunedSaveBonus;
        let finalAtk = profBonus + castingMod + attunedAtkBonus;

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

        // 12. Spell Slots (Multiclass-Aware Calculation)
        const slotData = this.calculateSpellSlots(classesList);
        result.spell_slots = slotData.standard;
        result.pact_slots = slotData.pact;

        if (!Array.isArray(result.spell_slots_current)) {
            result.spell_slots_current = [...result.spell_slots];
        }

        // 13. Kinetic Resource Vault Auto-Calculation
        this.calculateResourceVault(result, classesList);

        return result;
    }

    // Calculates and maintains class resources in resource_vault while preserving spent states
    calculateResourceVault(result, classesList) {
        if (!result.resource_vault) {
            result.resource_vault = {};
        }

        const existingVault = result.resource_vault || {};
        const newVault = { ...existingVault };
        if (!Array.isArray(newVault.custom)) {
            newVault.custom = existingVault.custom || [];
        }

        const setResource = (key, name, max, type = 'pips', rest = 'long', color = '#8b5cf6', die = null) => {
            if (max <= 0) {
                delete newVault[key];
                return;
            }
            const prev = existingVault[key] || {};
            const current = (prev.current !== undefined && prev.current !== null) 
                ? Math.min(max, Math.max(0, parseInt(prev.current))) 
                : max;

            newVault[key] = {
                name,
                current,
                max,
                type,
                rest,
                color,
                ...(die ? { die } : {})
            };
        };

        let sorcererLvl = 0;
        let monkLvl = 0;
        let barbarianLvl = 0;
        let paladinLvl = 0;
        let clericLvl = 0;
        let fighterLvl = 0;
        let druidLvl = 0;
        let isBattleMaster = false;
        let subclassNames = (result.subclasses || []).map(s => (typeof s === 'string' ? s : (s.name || '')).toLowerCase());
        if (result.subclass) subclassNames.push(String(result.subclass).toLowerCase());

        classesList.forEach(cls => {
            const name = cls.class;
            const lvl = parseInt(cls.level) || 0;
            if (name === 'Sorcerer') sorcererLvl += lvl;
            if (name === 'Monk') monkLvl += lvl;
            if (name === 'Barbarian') barbarianLvl += lvl;
            if (name === 'Paladin') paladinLvl += lvl;
            if (name === 'Cleric') clericLvl += lvl;
            if (name === 'Fighter') fighterLvl += lvl;
            if (name === 'Druid') druidLvl += lvl;
            if (subclassNames.some(s => s.includes('battle master') || s.includes('battlemaster'))) isBattleMaster = true;
        });

        if (sorcererLvl >= 2) {
            setResource('sorcery_points', 'Sorcery Points', sorcererLvl, 'pips', 'long', '#a78bfa');
        } else {
            delete newVault.sorcery_points;
        }

        if (monkLvl >= 2) {
            setResource('ki_points', 'Ki Points', monkLvl, 'pips', 'short', '#10b981');
        } else {
            delete newVault.ki_points;
        }

        if (barbarianLvl >= 1) {
            let rageMax = 2;
            if (barbarianLvl >= 20) rageMax = 99;
            else if (barbarianLvl >= 17) rageMax = 6;
            else if (barbarianLvl >= 12) rageMax = 5;
            else if (barbarianLvl >= 6) rageMax = 4;
            else if (barbarianLvl >= 3) rageMax = 3;
            setResource('rage', 'Rage', rageMax, 'pips', 'long', '#ef4444');
        } else {
            delete newVault.rage;
        }

        if (paladinLvl >= 1) {
            setResource('lay_on_hands', 'Lay on Hands', paladinLvl * 5, 'battery', 'long', '#eab308');
        } else {
            delete newVault.lay_on_hands;
        }

        let channelDivinityMax = 0;
        if (clericLvl >= 2) {
            if (clericLvl >= 18) channelDivinityMax = 3;
            else if (clericLvl >= 6) channelDivinityMax = 2;
            else channelDivinityMax = 1;
        }
        if (paladinLvl >= 3) {
            channelDivinityMax += 1;
        }
        if (channelDivinityMax > 0) {
            setResource('channel_divinity', 'Channel Divinity', channelDivinityMax, 'pips', 'short', '#fbbf24');
        } else {
            delete newVault.channel_divinity;
        }

        if (fighterLvl >= 1) {
            setResource('second_wind', 'Second Wind', 1, 'pips', 'short', '#38bdf8');
            if (fighterLvl >= 2) {
                const actionSurgeMax = fighterLvl >= 17 ? 2 : 1;
                setResource('action_surge', 'Action Surge', actionSurgeMax, 'pips', 'short', '#f97316');
            } else {
                delete newVault.action_surge;
            }

            if (isBattleMaster) {
                let supDiceCount = 4;
                let supDieType = 'd8';
                if (fighterLvl >= 15) { supDiceCount = 6; supDieType = 'd10'; }
                else if (fighterLvl >= 7) { supDiceCount = 5; supDieType = 'd8'; }
                setResource('superiority_dice', 'Superiority Dice', supDiceCount, 'dice', 'short', '#f59e0b', supDieType);
            }
        } else {
            delete newVault.second_wind;
            delete newVault.action_surge;
            if (!isBattleMaster) delete newVault.superiority_dice;
        }

        if (druidLvl >= 2) {
            setResource('wild_shape', 'Wild Shape', 2, 'pips', 'short', '#34d399');
        } else {
            delete newVault.wild_shape;
        }

        result.resource_vault = newVault;
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
            } else if (['Eldritch Knight', 'Arcane Trickster'].includes(name)) {
                casterLevel += Math.floor(lvl / 3);
            } else if (name === 'Warlock') {
                hasPactMagic = true;
                pactMagicLevel = lvl;
            }
        });

        const slotsTable = [
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

        // Isolated Warlock Pact Magic slots
        let pactSlots = { count: 0, level: 0 };
        if (hasPactMagic) {
            if (pactMagicLevel === 1) { pactSlots = { count: 1, level: 1 }; }
            else if (pactMagicLevel === 2) { pactSlots = { count: 2, level: 1 }; }
            else if (pactMagicLevel >= 3 && pactMagicLevel <= 4) { pactSlots = { count: 2, level: 2 }; }
            else if (pactMagicLevel >= 5 && pactMagicLevel <= 6) { pactSlots = { count: 2, level: 3 }; }
            else if (pactMagicLevel >= 7 && pactMagicLevel <= 8) { pactSlots = { count: 2, level: 4 }; }
            else if (pactMagicLevel >= 9 && pactMagicLevel <= 10) { pactSlots = { count: 2, level: 5 }; }
            else if (pactMagicLevel >= 11 && pactMagicLevel <= 16) { pactSlots = { count: 3, level: 5 }; }
            else if (pactMagicLevel >= 17) { pactSlots = { count: 4, level: 5 }; }
        }

        return {
            standard: finalSlots,
            pact: pactSlots
        };
    }

    applyDamageToWildShape(char, damageAmount) {
        if (!char) return { spilledOver: false, overflowDamage: 0 };
        const dmg = Math.max(0, parseInt(damageAmount) || 0);

        // Check for active Polymorph first, then Wild Shape
        const activeForm = (char.polymorph && char.polymorph.active) ? char.polymorph : ((char.wild_shape && char.wild_shape.active) ? char.wild_shape : null);

        if (!activeForm) {
            // Apply straight to player HP
            char.hp_current = Math.max(0, (parseInt(char.hp_current) || 0) - dmg);
            return { spilledOver: false, overflowDamage: 0 };
        }

        const currentShapeHp = parseInt(activeForm.hp) || 0;
        if (dmg <= currentShapeHp) {
            activeForm.hp = currentShapeHp - dmg;
            return { spilledOver: false, overflowDamage: 0 };
        } else {
            const overflow = dmg - currentShapeHp;
            activeForm.hp = 0;
            activeForm.active = false;
            char.hp_current = Math.max(0, (parseInt(char.hp_current) || 0) - overflow);
            return { spilledOver: true, overflowDamage: overflow };
        }
    }

}


// Attach to window
window.characterEngine = new CharacterEngine();
