// --- PLAYER SHEET ENGINE V2 ---
// Integrates automated AC calculations, inventory/attunement tracking, condition-integrated dice rolling,
// custom homebrew action builder with DM approval workflow, and multiclassing/subclass feature automation.

(function() {
    'use strict';

    // State for interactive dice roller modal
    window.diceRollerState = {
        title: 'd20 Roll',
        notation: '1d20',
        modifier: 0,
        mode: 'normal', // 'advantage', 'normal', 'disadvantage'
        statName: '',
        rollType: 'check', // 'attack', 'damage', 'check', 'save'
        baseDice: '1d20'
    };

    // Preset 5e Subclasses Map
    window.SUBCLASS_DATABASE = {
        'Fighter': ['Champion', 'Battle Master', 'Eldritch Knight', 'Arcane Archer', 'Rune Knight', 'Psi Warrior'],
        'Rogue': ['Thief', 'Assassin', 'Arcane Trickster', 'Swashbuckler', 'Inquisitive', 'Phantom'],
        'Wizard': ['School of Evocation', 'School of Abjuration', 'School of Divination', 'School of Necromancy', 'Bladesinging'],
        'Cleric': ['Life Domain', 'War Domain', 'Tempest Domain', 'Light Domain', 'Trickery Domain', 'Knowledge Domain', 'Death Domain'],
        'Paladin': ['Oath of Devotion', 'Oath of Vengeance', 'Oath of Ancients', 'Oath of Conquest', 'Oathbreaker'],
        'Warlock': ['The Fiend', 'The Great Old One', 'The Archfey', 'The Hexblade', 'The Celestial'],
        'Sorcerer': ['Draconic Bloodline', 'Wild Magic', 'Shadow Magic', 'Divine Soul', 'Aberrant Mind'],
        'Druid': ['Circle of the Land', 'Circle of the Moon', 'Circle of Stars', 'Circle of Spores'],
        'Bard': ['College of Lore', 'College of Valor', 'College of Swords', 'College of Eloquence'],
        'Barbarian': ['Path of the Berserker', 'Path of the Totem Warrior', 'Path of Zealot', 'Path of Wild Magic'],
        'Monk': ['Way of the Open Hand', 'Way of Shadow', 'Way of the Four Elements', 'Way of Kensei', 'Way of Mercy'],
        'Ranger': ['Hunter', 'Gloom Stalker', 'Beast Master', 'Horizon Walker', 'Fey Wanderer'],
        'Artificer': ['Alchemist', 'Armorer', 'Artillerist', 'Battle Smith']
    };

    // --- 1. DICE ROLLER ENGINE & MODAL OVERLAY ---

    window.openDiceRollerModal = function(config = {}) {
        const modal = document.getElementById('dice-roller-modal');
        if (!modal) return;

        const char = window.character || {};
        const conditions = char.conditions || [];
        const isPoisoned = conditions.some(c => c.toLowerCase() === 'poisoned');
        const isFrightened = conditions.some(c => c.toLowerCase() === 'frightened');
        const exhaustionLvl = Math.max(0, parseInt(char.exhaustion_level || char.exhaustion || 0));

        // Auto pre-select disadvantage if poisoned or frightened
        let defaultMode = config.mode || 'normal';
        if ((isPoisoned || isFrightened) && (config.rollType === 'attack' || config.rollType === 'check' || config.rollType === 'skill' || config.rollType === 'stat')) {
            defaultMode = 'disadvantage';
        }

        window.diceRollerState = {
            title: config.title || 'd20 Roll',
            notation: config.notation || '1d20',
            modifier: parseInt(config.modifier) || 0,
            mode: defaultMode,
            statName: config.statName || '',
            rollType: config.rollType || 'check',
            baseDice: config.baseDice || '1d20',
            formula: config.formula || ''
        };

        // Render target selector options sorted: Skills -> Saves -> Stats -> Attacks
        const targetSelect = document.getElementById('roller-target-select');
        if (targetSelect) {
            targetSelect.innerHTML = window.buildRollerDropdownOptions();
            // Try to auto-select matching title if launched from inline button
            const options = Array.from(targetSelect.options);
            const match = options.find(o => o.text.toLowerCase().includes((config.title || '').toLowerCase()));
            if (match) {
                targetSelect.value = match.value;
            } else {
                targetSelect.selectedIndex = 0;
            }
        }

        // Render modal content
        document.getElementById('roller-modal-title').textContent = window.diceRollerState.title;
        updateRollerModeButtons();
        renderConditionBanners(conditions, exhaustionLvl);

        modal.style.display = 'flex';
        executeDiceRoll();
    };

    window.buildRollerDropdownOptions = function() {
        const char = window.character || {};
        const stats = char.stats || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
        const modifiers = {};
        ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(k => {
            modifiers[k] = Math.floor(((parseInt(stats[k]) || 10) - 10) / 2);
        });

        const profBonus = char.proficiency_bonus || (char.level >= 17 ? 6 : (char.level >= 13 ? 5 : (char.level >= 9 ? 4 : (char.level >= 5 ? 3 : 2))));

        const isProf = (skillName) => {
            if (!char.proficiencies?.skills) return false;
            return char.proficiencies.skills.some(s => s.toLowerCase() === skillName.toLowerCase());
        };

        const isSaveProf = (statKey) => {
            if (!char.proficiencies?.saving_throws) return false;
            return char.proficiencies.saving_throws.some(s => s.toLowerCase() === statKey.toLowerCase());
        };

        let html = '<option value="raw|0|d20 Roll|">-- Select What You Are Rolling --</option>';

        // 1. SKILLS (First category)
        const skillsList = [
            { name: 'Acrobatics', stat: 'dex' },
            { name: 'Animal Handling', stat: 'wis' },
            { name: 'Arcana', stat: 'int' },
            { name: 'Athletics', stat: 'str' },
            { name: 'Deception', stat: 'cha' },
            { name: 'History', stat: 'int' },
            { name: 'Insight', stat: 'wis' },
            { name: 'Intimidation', stat: 'cha' },
            { name: 'Investigation', stat: 'int' },
            { name: 'Medicine', stat: 'wis' },
            { name: 'Nature', stat: 'int' },
            { name: 'Perception', stat: 'wis' },
            { name: 'Performance', stat: 'cha' },
            { name: 'Persuasion', stat: 'cha' },
            { name: 'Religion', stat: 'int' },
            { name: 'Sleight of Hand', stat: 'dex' },
            { name: 'Stealth', stat: 'dex' },
            { name: 'Survival', stat: 'wis' }
        ];

        html += '<optgroup label="📋 Skills">';
        skillsList.forEach(sk => {
            let mod = modifiers[sk.stat] || 0;
            if (isProf(sk.name)) mod += profBonus;
            const sign = mod >= 0 ? '+' : '';
            html += `<option value="skill|${mod}|${sk.name} Check|${sk.stat}">${sk.name} (${sk.stat.toUpperCase()}) ${sign}${mod}</option>`;
        });
        html += '</optgroup>';

        // 2. SAVES (Second category)
        html += '<optgroup label="🛡️ Saving Throws">';
        ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(st => {
            const statName = st.toUpperCase();
            let mod = modifiers[st] || 0;
            if (isSaveProf(st)) mod += profBonus;
            const sign = mod >= 0 ? '+' : '';
            html += `<option value="save|${mod}|${statName} Saving Throw|${st}">${statName} Save ${sign}${mod}</option>`;
        });
        html += '</optgroup>';

        // 3. STATS (Ability Checks - Third category)
        html += '<optgroup label="💪 Stats / Ability Checks">';
        ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(st => {
            const statName = st.toUpperCase();
            const mod = modifiers[st] || 0;
            const sign = mod >= 0 ? '+' : '';
            html += `<option value="stat|${mod}|${statName} Check|${st}">${statName} Check ${sign}${mod}</option>`;
        });
        const initBonus = char.initiative_bonus !== undefined ? char.initiative_bonus : modifiers.dex;
        const initSign = initBonus >= 0 ? '+' : '';
        html += `<option value="stat|${initBonus}|Initiative Roll|dex">Initiative Roll ${initSign}${initBonus}</option>`;
        html += '</optgroup>';

        // 4. ATTACKS (Fourth category)
        html += '<optgroup label="⚔️ Weapons & Attacks">';
        const weapons = char.weapons || [
            { id: 'w1', name: 'Scimitar', attribute: 'dex', bonus: 0, proficient: true },
            { id: 'w2', name: 'Shortbow', attribute: 'dex', bonus: 0, proficient: true }
        ];
        weapons.forEach(w => {
            const statMod = modifiers[w.attribute] || 0;
            const atkBonus = statMod + (w.proficient !== false ? profBonus : 0) + (parseInt(w.bonus) || 0);
            const sign = atkBonus >= 0 ? '+' : '';
            html += `<option value="attack|${atkBonus}|${w.name} Attack|${w.attribute}">${w.name} Attack ${sign}${atkBonus}</option>`;
        });

        const homebrewItems = (char.homebrew_proposals || []).concat(char.inventory || []).filter(i => typeof i === 'object' && i.is_homebrew);
        homebrewItems.forEach(hb => {
            const attr = hb.attribute || 'str';
            const statMod = modifiers[attr] || 0;
            const atkBonus = statMod + profBonus;
            const sign = atkBonus >= 0 ? '+' : '';
            html += `<option value="attack|${atkBonus}|${hb.name} (Homebrew)|${attr}">${hb.name} ${sign}${atkBonus}</option>`;
        });
        html += '</optgroup>';

        return html;
    };

    window.onRollerTargetChange = function(selectEl) {
        if (!selectEl || !selectEl.value) return;
        const parts = selectEl.value.split('|');
        if (parts.length >= 3) {
            const rollType = parts[0];
            const modifier = parseInt(parts[1]) || 0;
            const title = parts[2];
            const statName = parts[3] || '';

            const char = window.character || {};
            const conditions = char.conditions || [];
            const isPoisoned = conditions.some(c => c.toLowerCase() === 'poisoned');
            const isFrightened = conditions.some(c => c.toLowerCase() === 'frightened');

            let mode = window.diceRollerState.mode || 'normal';
            if ((isPoisoned || isFrightened) && (rollType === 'attack' || rollType === 'skill' || rollType === 'stat')) {
                mode = 'disadvantage';
            }

            window.diceRollerState = {
                title: title,
                notation: '1d20',
                modifier: modifier,
                mode: mode,
                statName: statName,
                rollType: rollType,
                baseDice: '1d20'
            };

            document.getElementById('roller-modal-title').textContent = title;
            if (window.updateRollerModeButtons) window.updateRollerModeButtons();
            if (window.executeDiceRoll) window.executeDiceRoll();
        }
    };

    window.closeDiceRollerModal = function() {
        const modal = document.getElementById('dice-roller-modal');
        if (modal) modal.style.display = 'none';
    };

    window.setRollerMode = function(mode) {
        window.diceRollerState.mode = mode;
        updateRollerModeButtons();
        executeDiceRoll();
    };

    function updateRollerModeButtons() {
        const mode = window.diceRollerState.mode;
        ['adv', 'norm', 'dis'].forEach(m => {
            const btn = document.getElementById(`roller-btn-${m}`);
            if (btn) {
                const isActive = (m === 'adv' && mode === 'advantage') ||
                                 (m === 'norm' && mode === 'normal') ||
                                 (m === 'dis' && mode === 'disadvantage');
                btn.style.background = isActive ? 'var(--gold-amber)' : 'rgba(255,255,255,0.05)';
                btn.style.color = isActive ? '#000' : 'var(--text-main)';
                btn.style.borderColor = isActive ? 'var(--gold-amber)' : 'var(--border-iron)';
                btn.style.fontWeight = isActive ? 'bold' : 'normal';
            }
        });
    }

    function renderConditionBanners(conditions, exhaustionLvl) {
        const container = document.getElementById('roller-condition-warnings');
        if (!container) return;
        container.innerHTML = '';

        if (exhaustionLvl >= 6) {
            container.innerHTML = `
                <div style="background: rgba(239,68,68,0.2); border: 1px solid #ef4444; color: #ef4444; padding: 8px; border-radius: 4px; font-weight: bold; text-align: center;">
                    💀 CHARACTER IS DEAD (Exhaustion Level 6)
                </div>
            `;
            return;
        }

        const warnings = [];
        if (exhaustionLvl > 0) {
            warnings.push(`🩸 Exhaustion Level ${exhaustionLvl} (-${exhaustionLvl} to all rolls)`);
        }
        conditions.forEach(c => {
            const cLower = c.toLowerCase();
            if (cLower === 'poisoned') warnings.push('🧪 Poisoned (Disadvantage on Attack Rolls & Ability Checks)');
            else if (cLower === 'frightened') warnings.push('😱 Frightened (Disadvantage on Attack Rolls & Ability Checks)');
        });

        if (warnings.length > 0) {
            container.innerHTML = `
                <div style="background: rgba(245,158,11,0.15); border: 1px solid #f59e0b; color: #fbbf24; padding: 6px 10px; border-radius: 4px; font-size: 0.75rem; display: flex; flex-direction: column; gap: 2px;">
                    ${warnings.map(w => `<div>${w}</div>`).join('')}
                </div>
            `;
        }
    }

    window.executeDiceRoll = function() {
        const state = window.diceRollerState;
        const char = window.character || {};
        const exhaustionLvl = Math.max(0, parseInt(char.exhaustion_level || char.exhaustion || 0));
        const exhaustionPenalty = exhaustionLvl >= 6 ? -999 : (-1 * exhaustionLvl);

        let d20_1 = Math.floor(Math.random() * 20) + 1;
        let d20_2 = Math.floor(Math.random() * 20) + 1;
        let chosenD20 = d20_1;

        if (state.mode === 'advantage') {
            chosenD20 = Math.max(d20_1, d20_2);
        } else if (state.mode === 'disadvantage') {
            chosenD20 = Math.min(d20_1, d20_2);
        }

        const modifier = state.modifier;
        const total = chosenD20 + modifier + exhaustionPenalty;

        const isNat20 = chosenD20 === 20;
        const isNat1 = chosenD20 === 1;

        const diceDisplay = document.getElementById('roller-dice-display');
        const breakdownDisplay = document.getElementById('roller-breakdown-display');
        const totalDisplay = document.getElementById('roller-total-display');

        if (diceDisplay) {
            if (state.mode === 'normal') {
                diceDisplay.innerHTML = `<span style="font-size: 2.2rem; font-weight: bold; color: ${isNat20 ? '#10b981' : (isNat1 ? '#ef4444' : 'var(--gold-amber)')}">${d20_1}</span>`;
            } else {
                diceDisplay.innerHTML = `
                    <div style="display: flex; gap: 12px; align-items: center; justify-content: center;">
                        <span style="font-size: 1.5rem; opacity: ${chosenD20 === d20_1 ? '1' : '0.4'}; text-decoration: ${chosenD20 === d20_1 ? 'none' : 'line-through'}; color: ${d20_1 === 20 ? '#10b981' : (d20_1 === 1 ? '#ef4444' : 'var(--text-main)')}">${d20_1}</span>
                        <span style="color: var(--text-muted); font-size: 0.8rem;">vs</span>
                        <span style="font-size: 1.5rem; opacity: ${chosenD20 === d20_2 ? '1' : '0.4'}; text-decoration: ${chosenD20 === d20_2 ? 'none' : 'line-through'}; color: ${d20_2 === 20 ? '#10b981' : (d20_2 === 1 ? '#ef4444' : 'var(--text-main)')}">${d20_2}</span>
                    </div>
                `;
            }
        }

        if (breakdownDisplay) {
            let bd = `d20 (${chosenD20}) + Mod (${modifier >= 0 ? '+' + modifier : modifier})`;
            if (exhaustionLvl > 0) bd += ` - Exhaustion (${exhaustionLvl})`;
            breakdownDisplay.textContent = bd;
        }

        if (totalDisplay) {
            totalDisplay.innerHTML = `
                <div style="font-size: 2.8rem; font-weight: bold; color: ${isNat20 ? '#10b981' : (isNat1 ? '#ef4444' : '#fff')}">
                    ${total}
                </div>
                ${isNat20 ? '<div style="color: #10b981; font-weight: bold; font-size: 0.9rem;">⭐ CRITICAL HIT!</div>' : ''}
                ${isNat1 ? '<div style="color: #ef4444; font-weight: bold; font-size: 0.9rem;">💀 CRITICAL MISS!</div>' : ''}
            `;
        }

        // Broadcast roll result to DM via socket if connected
        if (window.socket && window.socket.connected) {
            const charId = window.charId || char.id;
            const modeText = state.mode === 'advantage' ? ' (ADV)' : (state.mode === 'disadvantage' ? ' (DIS)' : '');
            window.socket.emit('whisper-to-dm', {
                characterId: charId,
                characterName: char.name || 'Player',
                message: `🎲 ${state.title}${modeText}: Total ${total} [d20: ${chosenD20}, mod: ${modifier}, ex: ${exhaustionPenalty}]`
            });
            window.socket.emit('dice:roll', {
                characterId: charId,
                title: state.title,
                result: total,
                d20: chosenD20,
                modifier: modifier,
                isNat20,
                isNat1
            });
        }
    };

    // --- 2. INVENTORY & ATTUNEMENT TRACKER ---

    window.toggleEncumbrance = function() {
        if (!window.character) return;
        window.character.encumbrance_enabled = !window.character.encumbrance_enabled;
        window.recalculateAndSaveSheet();
    };

    window.updateCoinValue = function(coinType, value) {
        if (!window.character) return;
        if (!window.character.coins) window.character.coins = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
        window.character.coins[coinType] = Math.max(0, parseInt(value) || 0);
        window.recalculateAndSaveSheet();
    };

    window.toggleItemAttunement = function(itemId) {
        if (!window.character || !window.character.inventory) return;
        const item = window.character.inventory.find(i => i.id === itemId || i.name === itemId);
        if (!item) return;

        const maxAttunement = window.character.attunement_max || 3;
        const currentAttuned = window.character.inventory.filter(i => i.attuned || i.is_attuned);

        if (!item.attuned && !item.is_attuned && currentAttuned.length >= maxAttunement) {
            alert(`⚠️ Attunement Limit Reached! You can only attune up to ${maxAttunement} items.`);
            return;
        }

        item.attuned = !item.attuned;
        item.is_attuned = item.attuned;
        window.recalculateAndSaveSheet();
    };

    window.toggleMageArmor = function() {
        if (!window.character) return;
        window.character.mage_armor_active = !window.character.mage_armor_active;
        window.recalculateAndSaveSheet();
    };

    // --- 3. CUSTOM HOMEBREW ACTION & WEAPON BUILDER ---

    window.openHomebrewModal = function() {
        const modal = document.getElementById('homebrew-builder-modal');
        if (modal) modal.style.display = 'flex';
    };

    window.closeHomebrewModal = function() {
        const modal = document.getElementById('homebrew-builder-modal');
        if (modal) modal.style.display = 'none';
    };

    window.submitCustomHomebrewItem = function() {
        const nameInput = document.getElementById('hb-name-input');
        const typeInput = document.getElementById('hb-type-input');
        const formulaInput = document.getElementById('hb-formula-input');
        const attrInput = document.getElementById('hb-attr-input');
        const notesInput = document.getElementById('hb-notes-input');

        if (!nameInput || !nameInput.value.trim()) {
            alert('Please enter an item/action name.');
            return;
        }

        const newItem = {
            id: 'hb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            name: nameInput.value.trim(),
            type: typeInput ? typeInput.value : 'weapon',
            damage: formulaInput ? formulaInput.value.trim() : '1d6',
            attribute: attrInput ? attrInput.value : 'str',
            notes: notesInput ? notesInput.value.trim() : '',
            status: 'pending',
            is_homebrew: true,
            createdAt: new Date().toISOString()
        };

        const char = window.character || {};
        if (!char.homebrew_proposals) char.homebrew_proposals = [];
        char.homebrew_proposals.push(newItem);

        // Send to server via socket
        if (window.socket && window.socket.connected) {
            window.socket.emit('propose-homebrew-item', {
                charId: window.charId || char.id,
                item: newItem
            });
        }

        closeHomebrewModal();
        window.recalculateAndSaveSheet();
        alert(`⚔️ "${newItem.name}" created! Submitted for DM approval. It is now usable on your sheet in provisional mode.`);
    };

    // --- 4. MULTICLASSING & SUBCLASS FEATURE AUTOMATION ---

    window.openLevelUpModal = function() {
        const modal = document.getElementById('level-up-modal');
        if (!modal) return;

        const char = window.character || {};
        const classes = char.classes || [{ class: char.class || 'Fighter', level: char.level || 1 }];

        // Populate current classes
        const listContainer = document.getElementById('levelup-class-list');
        if (listContainer) {
            listContainer.innerHTML = classes.map((c, idx) => `
                <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); padding:8px 12px; border-radius:4px; border:1px solid var(--border-iron);">
                    <div>
                        <strong style="color:var(--gold-amber);">${c.class}</strong>
                        ${c.subclass ? `<span style="font-size:0.75rem; color:#10b981; margin-left:6px;">(${c.subclass})</span>` : ''}
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:0.85rem;">Lvl ${c.level}</span>
                        <button class="btn-primary" onclick="addLevelToExistingClass(${idx})" style="padding:2px 8px; font-size:0.75rem; background:#3b82f6;">+ Level</button>
                    </div>
                </div>
            `).join('');
        }

        modal.style.display = 'flex';
    };

    window.closeLevelUpModal = function() {
        const modal = document.getElementById('level-up-modal');
        if (modal) modal.style.display = 'none';
    };

    window.addLevelToExistingClass = function(classIdx) {
        const char = window.character || {};
        if (!char.classes || !char.classes[classIdx]) return;

        char.classes[classIdx].level = (parseInt(char.classes[classIdx].level) || 0) + 1;
        checkSubclassRequirement(char.classes[classIdx]);

        window.recalculateAndSaveSheet();
        openLevelUpModal(); // refresh UI
    };

    window.addNewMulticlass = function() {
        const select = document.getElementById('levelup-new-class-select');
        if (!select || !select.value) return;

        const className = select.value;
        const char = window.character || {};
        if (!char.classes) char.classes = [{ class: char.class || 'Fighter', level: char.level || 1 }];

        const existing = char.classes.find(c => c.class === className);
        if (existing) {
            existing.level = (parseInt(existing.level) || 0) + 1;
            checkSubclassRequirement(existing);
        } else {
            const newCls = { class: className, level: 1 };
            checkSubclassRequirement(newCls);
            char.classes.push(newCls);
        }

        window.recalculateAndSaveSheet();
        openLevelUpModal(); // refresh UI
    };

    function checkSubclassRequirement(clsObj) {
        const className = clsObj.class;
        const lvl = parseInt(clsObj.level) || 1;

        // Subclass levels: 1 (Cleric, Sorcerer, Warlock), 2 (Wizard, Druid), 3 (Others)
        let reqLvl = 3;
        if (['Cleric', 'Sorcerer', 'Warlock'].includes(className)) reqLvl = 1;
        else if (['Wizard', 'Druid'].includes(className)) reqLvl = 2;

        if (lvl >= reqLvl && !clsObj.subclass) {
            promptSubclassSelection(clsObj);
        }
    }

    function promptSubclassSelection(clsObj) {
        const options = window.SUBCLASS_DATABASE[clsObj.class] || [];
        let promptMsg = `🎉 You hit Level ${clsObj.level} in ${clsObj.class}! Select a subclass:\n\n`;
        options.forEach((opt, idx) => {
            promptMsg += `${idx + 1}. ${opt}\n`;
        });
        promptMsg += `\nType number (1-${options.length}) or enter a Custom Subclass name:`;

        const choice = prompt(promptMsg);
        if (choice) {
            const num = parseInt(choice);
            if (!isNaN(num) && options[num - 1]) {
                clsObj.subclass = options[num - 1];
            } else {
                clsObj.subclass = choice.trim();
            }
        }
    }

    // --- RECALCULATE & SAVE HELPER ---

    window.recalculateAndSaveSheet = function() {
        if (!window.character) return;
        if (window.characterEngine) {
            window.character = window.characterEngine.calculate(window.character);
        }
        if (window.renderCharacterSheet) {
            window.renderCharacterSheet();
        }
        if (window.saveCharacter) {
            window.saveCharacter();
        }
    };

    // --- 5. DRAGGABLE FLOATING QUICK DICE BUTTON ---

    window.initDraggableDiceButton = function() {
        const btn = document.getElementById('floating-dice-roller-btn');
        if (!btn) return;

        // Restore position from localStorage if saved
        const savedPos = localStorage.getItem('dice_roller_btn_pos');
        if (savedPos) {
            try {
                const pos = JSON.parse(savedPos);
                btn.style.left = pos.left;
                btn.style.top = pos.top;
                btn.style.right = 'auto';
                btn.style.bottom = 'auto';
            } catch (e) {}
        }

        let isDragging = false;
        let hasMoved = false;
        let startX = 0, startY = 0;
        let initialLeft = 0, initialTop = 0;

        function onStart(e) {
            isDragging = true;
            hasMoved = false;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            startX = clientX;
            startY = clientY;

            const rect = btn.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;

            btn.style.cursor = 'grabbing';
            btn.style.transition = 'none';
        }

        function onMove(e) {
            if (!isDragging) return;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            const dx = clientX - startX;
            const dy = clientY - startY;

            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                hasMoved = true;
            }

            const newLeft = Math.max(10, Math.min(window.innerWidth - btn.offsetWidth - 10, initialLeft + dx));
            const newTop = Math.max(10, Math.min(window.innerHeight - btn.offsetHeight - 10, initialTop + dy));

            btn.style.left = newLeft + 'px';
            btn.style.top = newTop + 'px';
            btn.style.right = 'auto';
            btn.style.bottom = 'auto';
        }

        function onEnd() {
            if (!isDragging) return;
            isDragging = false;
            btn.style.cursor = 'pointer';
            btn.style.transition = 'transform 0.15s ease';

            if (hasMoved) {
                localStorage.setItem('dice_roller_btn_pos', JSON.stringify({
                    left: btn.style.left,
                    top: btn.style.top
                }));
            }
        }

        btn.addEventListener('mousedown', onStart);
        btn.addEventListener('touchstart', onStart, { passive: true });

        window.addEventListener('mousemove', onMove);
        window.addEventListener('touchmove', onMove, { passive: true });

        window.addEventListener('mouseup', onEnd);
        window.addEventListener('touchend', onEnd);

        btn.addEventListener('click', function(e) {
            if (hasMoved) {
                e.stopImmediatePropagation();
                e.preventDefault();
                hasMoved = false;
            }
        }, true);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(window.initDraggableDiceButton, 100));
    } else {
        setTimeout(window.initDraggableDiceButton, 100);
    }

})();
