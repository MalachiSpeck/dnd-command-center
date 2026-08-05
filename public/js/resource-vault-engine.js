// D&D 5e Kinetic Resource Vault & Tactical Rest Engine
// Consolidates class resources (Sorcery Points, Ki, Superiority Dice, Lay on Hands, Channel Divinity, Rage, Wild Shape, Action Surge, Second Wind, Spell Slots, Custom Pools)
// into an interactive HUD card on tab-vitals with Socket.io real-time sync & IndexedDB persistence.

class ResourceVaultEngine {
    constructor() {
        this.COLOR_THEMES = {
            sorcery_points: '#a78bfa',
            ki_points: '#10b981',
            rage: '#ef4444',
            channel_divinity: '#fbbf24',
            wild_shape: '#34d399',
            action_surge: '#f97316',
            second_wind: '#38bdf8',
            superiority_dice: '#f59e0b',
            lay_on_hands: '#eab308',
            bardic_inspiration: '#ec4899',
            arcane_recovery: '#38bdf8',
            default: '#8b5cf6'
        };

        this.DICE_ICONS = {
            d4: '🎲 d4',
            d6: '🎲 d6',
            d8: '🎲 d8',
            d10: '🎲 d10',
            d12: '🎲 d12',
            d20: '🎲 d20'
        };
    }

    // Main Renderer for the Resource Vault Card on tab-vitals
    renderVaultCard(char, containerId = 'resource-vault-hud-card') {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (!char) {
            container.innerHTML = `<div style="padding:10px; color:var(--text-muted); font-size:0.8rem; text-align:center;">No character loaded</div>`;
            return;
        }

        // Ensure character recalculation has run to populate resource_vault
        if (!char.resource_vault && window.characterEngine) {
            window.character = window.characterEngine.calculate(char);
        }

        const vault = char.resource_vault || {};
        const keys = Object.keys(vault).filter(k => k !== 'custom');
        const customPools = vault.custom || [];

        // Check if there are any active resources to display
        const hasResources = keys.some(k => vault[k] && vault[k].max > 0) || customPools.length > 0;

        let html = `
        <div class="section-card" style="border: 1.5px solid var(--arcane-violet); background: linear-gradient(135deg, rgba(18, 18, 26, 0.95), rgba(30, 27, 75, 0.4)); margin-bottom: 12px; box-shadow: 0 4px 15px rgba(139, 92, 246, 0.15); border-radius: 10px; padding: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(139, 92, 246, 0.25); padding-bottom: 8px; margin-bottom: 10px; flex-wrap: wrap; gap: 6px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="font-size: 1.1rem;">⚡</span>
                    <div class="section-title" style="margin: 0; color: #c4b5fd; font-family: 'Cinzel', serif; font-size: 0.95rem; letter-spacing: 0.5px;">CLASS RESOURCE TRACKER</div>
                </div>
                <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
                    ${this.renderConverterButtons(char)}
                    <button onclick="window.resourceVaultEngine.openRestPreviewModal('short')" style="background: rgba(56, 189, 248, 0.15); border: 1px solid #38bdf8; color: #38bdf8; padding: 4px 8px; border-radius: 6px; font-size: 0.72rem; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 4px; transition: all 0.2s;">☕ Short Rest</button>
                    <button onclick="window.resourceVaultEngine.openRestPreviewModal('long')" style="background: rgba(167, 139, 250, 0.15); border: 1px solid #a78bfa; color: #c4b5fd; padding: 4px 8px; border-radius: 6px; font-size: 0.72rem; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 4px; transition: all 0.2s;">🌙 Long Rest</button>
                    <button onclick="window.resourceVaultEngine.openAddCustomResourceModal()" style="background: rgba(255, 255, 255, 0.08); border: 1px solid var(--border-iron); color: var(--text-muted); padding: 4px 7px; border-radius: 6px; font-size: 0.72rem; cursor: pointer;" title="Add Custom Resource">+ Pool</button>
                </div>
            </div>
        `;

        if (!hasResources) {
            html += `
            <div style="text-align: center; padding: 15px; color: var(--text-muted); font-size: 0.8rem; font-style: italic;">
                No class resource pools unlocked at this level. You can add custom tracking pools above.
            </div>
            `;
        } else {
            html += `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px;">`;

            // Render Standard Class Resources
            keys.forEach(key => {
                const res = vault[key];
                if (res && res.max > 0) {
                    html += this.renderResourceItem(key, res);
                }
            });

            // Render Custom User Pools
            customPools.forEach((res, idx) => {
                html += this.renderResourceItem(`custom_${idx}`, res, true);
            });

            html += `</div>`;
        }

        html += `</div>`;
        container.innerHTML = html;
    }

    // Renders Font of Magic / Harness Divine Power converter triggers if class warrants it
    renderConverterButtons(char) {
        let buttons = '';
        const classes = char.classes || [{ class: char.class, level: char.level }];
        const isSorcerer = classes.some(c => c.class === 'Sorcerer' && parseInt(c.level) >= 2);
        const isClericOrPaladin = classes.some(c => (c.class === 'Cleric' && parseInt(c.level) >= 2) || (c.class === 'Paladin' && parseInt(c.level) >= 3));

        if (isSorcerer || isClericOrPaladin) {
            buttons += `
                <button onclick="window.resourceVaultEngine.openFontOfMagicModal()" style="background: rgba(236, 72, 153, 0.2); border: 1px solid #ec4899; color: #f472b6; padding: 4px 8px; border-radius: 6px; font-size: 0.72rem; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                    🔄 Converters
                </button>
            `;
        }
        return buttons;
    }

    // Renders single resource card item (Pips, Dice, or Battery)
    renderResourceItem(key, res, isCustom = false) {
        const color = res.color || this.COLOR_THEMES[key] || this.COLOR_THEMES.default;
        const current = parseInt(res.current) || 0;
        const max = parseInt(res.max) || 1;

        let contentHtml = '';

        if (res.type === 'battery') {
            // Liquid Battery Gauge (e.g. Lay on Hands)
            const pct = Math.min(100, Math.max(0, Math.round((current / max) * 100)));
            contentHtml = `
                <div style="margin-top: 6px;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 4px; color: ${color}; font-weight: bold;">
                        <span>Pool: ${current} / ${max} HP</span>
                        <span>${pct}%</span>
                    </div>
                    <div style="width: 100%; height: 12px; background: rgba(0,0,0,0.5); border: 1px solid ${color}66; border-radius: 6px; overflow: hidden; position: relative;">
                        <div style="width: ${pct}%; height: 100%; background: linear-gradient(90deg, ${color}aa, ${color}); border-radius: 5px; transition: width 0.3s ease-out; box-shadow: 0 0 8px ${color}aa;"></div>
                    </div>
                    <div style="display: flex; gap: 4px; margin-top: 8px;">
                        <button onclick="window.resourceVaultEngine.quickHealLayOnHands(1)" style="flex: 1; padding: 3px; background: rgba(234, 179, 8, 0.15); border: 1px solid ${color}aa; color: ${color}; border-radius: 4px; font-size: 0.68rem; font-weight: bold; cursor: pointer;">-1 HP</button>
                        <button onclick="window.resourceVaultEngine.quickHealLayOnHands(5)" style="flex: 1; padding: 3px; background: rgba(234, 179, 8, 0.2); border: 1px solid ${color}; color: ${color}; border-radius: 4px; font-size: 0.68rem; font-weight: bold; cursor: pointer;">-5 HP</button>
                        <button onclick="window.resourceVaultEngine.promptLayOnHandsTarget()" style="flex: 2; padding: 3px; background: ${color}; color: #000; border: none; border-radius: 4px; font-size: 0.68rem; font-weight: bold; cursor: pointer;">💚 Heal Target</button>
                    </div>
                </div>
            `;
        } else if (res.type === 'dice') {
            // Visual Dice Pool Chips (e.g. Superiority Dice)
            const dieLabel = res.die || 'd8';
            let diceHtml = '';
            for (let i = 0; i < max; i++) {
                const isSpent = i >= current;
                const dieBg = isSpent ? 'rgba(255,255,255,0.05)' : `rgba(245, 158, 11, 0.25)`;
                const dieBorder = isSpent ? 'var(--border-iron)' : color;
                const dieColor = isSpent ? 'var(--text-muted)' : color;
                const shadow = isSpent ? 'none' : `0 0 6px ${color}88`;

                diceHtml += `
                    <button onclick="window.resourceVaultEngine.rollDicePool('${key}', ${i}, '${dieLabel}')" 
                            style="padding: 4px 8px; background: ${dieBg}; border: 1px solid ${dieBorder}; color: ${dieColor}; border-radius: 6px; font-size: 0.75rem; font-weight: bold; cursor: pointer; box-shadow: ${shadow}; transition: all 0.2s;"
                            title="${isSpent ? 'Spent die (Tap to restore)' : `Tap to roll ${dieLabel} & expend`}">
                        🎲 ${dieLabel.toUpperCase()} ${isSpent ? '✖' : '✔'}
                    </button>
                `;
            }
            contentHtml = `<div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;">${diceHtml}</div>`;
        } else {
            // Interactive Pips [●][●][○]
            let pipsHtml = '';
            const isUnlimited = max >= 99;
            const displayMax = isUnlimited ? Math.max(current + 1, 5) : max;

            for (let i = 0; i < displayMax; i++) {
                const isActive = i < current;
                const pipColor = isActive ? color : 'transparent';
                const borderColor = isActive ? color : 'rgba(255,255,255,0.3)';
                const glow = isActive ? `box-shadow: 0 0 6px ${color}aa;` : '';

                pipsHtml += `
                    <div onclick="window.resourceVaultEngine.togglePip('${key}', ${i})"
                         style="width: 20px; height: 20px; border-radius: 50%; border: 2px solid ${borderColor}; background-color: ${pipColor}; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; justify-content: center; ${glow}"
                         title="Tap to toggle state (${i + 1}/${max})">
                    </div>
                `;
            }

            contentHtml = `
                <div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 6px;">
                    ${pipsHtml}
                    ${isUnlimited ? `<span style="font-size:0.7rem; color:${color}; font-weight:bold;">(Unlimited)</span>` : ''}
                </div>
            `;
        }

        const deleteBtn = isCustom ? `
            <button onclick="window.resourceVaultEngine.deleteCustomResource('${key}')" style="background:none; border:none; color:#ef4444; font-size:0.75rem; cursor:pointer; padding:0 2px;" title="Delete Pool">✕</button>
        ` : '';

        return `
            <div style="background: rgba(10, 10, 15, 0.6); border: 1px solid ${color}44; border-left: 3px solid ${color}; border-radius: 8px; padding: 8px 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: bold; color: ${color}; font-size: 0.8rem; font-family: 'Cinzel', serif;">${res.name}</span>
                    <div style="display:flex; align-items:center; gap:4px;">
                        <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600;">${res.type === 'battery' ? '' : `${current} / ${max}`}</span>
                        <span style="font-size: 0.62rem; padding: 1px 4px; border-radius: 3px; background: rgba(255,255,255,0.06); color: var(--text-muted); text-transform: uppercase;">${res.rest || 'long'} rest</span>
                        ${deleteBtn}
                    </div>
                </div>
                ${contentHtml}
            </div>
        `;
    }

    // Toggle Pip Active/Spent State
    togglePip(key, index) {
        if (!window.character || !window.character.resource_vault) return;

        let res = null;
        if (key.startsWith('custom_')) {
            const idx = parseInt(key.replace('custom_', ''));
            res = window.character.resource_vault.custom[idx];
        } else {
            res = window.character.resource_vault[key];
        }

        if (!res) return;

        const current = parseInt(res.current) || 0;

        if (index < current) {
            res.current = index;
        } else {
            res.current = index + 1;
        }

        res.current = Math.max(0, Math.min(res.max, res.current));

        this.saveAndUpdate(key, res.name, res.current, res.max);
    }

    // Dice Pool Roll Handler
    rollDicePool(key, dieIndex, dieType) {
        if (!window.character || !window.character.resource_vault) return;

        const res = window.character.resource_vault[key];
        if (!res) return;

        const current = parseInt(res.current) || 0;

        if (dieIndex >= current) {
            res.current = Math.min(res.max, current + 1);
            this.saveAndUpdate(key, res.name, res.current, res.max);
            return;
        }

        res.current = Math.max(0, current - 1);
        this.saveAndUpdate(key, res.name, res.current, res.max);

        if (typeof window.openDiceRollerModal === 'function') {
            window.openDiceRollerModal(dieType, `Expend ${res.name} (${dieType})`);
        } else if (typeof window.rollDice === 'function') {
            window.rollDice(dieType, `Expend ${res.name}`);
        } else {
            const sides = parseInt(dieType.replace('d', '')) || 8;
            const rollVal = Math.floor(Math.random() * sides) + 1;
            alert(`🎲 Rolled ${res.name} (${dieType}): ${rollVal}`);
        }
    }

    // Quick Lay on Hands Deduction
    quickHealLayOnHands(amount) {
        if (!window.character || !window.character.resource_vault || !window.character.resource_vault.lay_on_hands) return;

        const res = window.character.resource_vault.lay_on_hands;
        const current = parseInt(res.current) || 0;

        if (current < amount) {
            alert(`Not enough Lay on Hands points remaining! (Current: ${current})`);
            return;
        }

        res.current = current - amount;
        this.saveAndUpdate('lay_on_hands', res.name, res.current, res.max);

        if (window.character.hp_current < window.character.hp_max) {
            window.character.hp_current = Math.min(window.character.hp_max, window.character.hp_current + amount);
            if (typeof window.updateHPDisplay === 'function') window.updateHPDisplay();
        }
    }

    // Target Healing Lay on Hands Modal
    promptLayOnHandsTarget() {
        if (!window.character || !window.character.resource_vault || !window.character.resource_vault.lay_on_hands) return;

        const res = window.character.resource_vault.lay_on_hands;
        const current = parseInt(res.current) || 0;

        if (current <= 0) {
            alert("Your Lay on Hands pool is empty!");
            return;
        }

        const healAmtStr = prompt(`Lay on Hands Pool: ${current} HP remaining.\nEnter HP to spend on healing:`, "5");
        if (!healAmtStr) return;

        const healAmt = parseInt(healAmtStr);
        if (isNaN(healAmt) || healAmt <= 0) return;

        if (healAmt > current) {
            alert(`Cannot spend ${healAmt} HP. Only ${current} HP remaining in pool.`);
            return;
        }

        res.current = current - healAmt;
        this.saveAndUpdate('lay_on_hands', res.name, res.current, res.max);

        if (window.character.hp_current < window.character.hp_max) {
            const oldHp = window.character.hp_current;
            window.character.hp_current = Math.min(window.character.hp_max, window.character.hp_current + healAmt);
            const healed = window.character.hp_current - oldHp;
            alert(`✨ Healed yourself for ${healed} HP! (Current HP: ${window.character.hp_current}/${window.character.hp_max})`);
            if (typeof window.updateHPDisplay === 'function') window.updateHPDisplay();
        } else {
            alert(`✨ Expended ${healAmt} Lay on Hands HP on target!`);
        }
    }

    // Open Font of Magic / Harness Divine Power Modal
    openFontOfMagicModal() {
        if (!window.character) return;

        const char = window.character;
        const vault = char.resource_vault || {};
        const sorcPts = vault.sorcery_points || { current: 0, max: 0 };
        const chanDiv = vault.channel_divinity || { current: 0, max: 0 };
        const spellSlots = char.spell_slots || [0,0,0,0,0,0,0,0,0];
        const spellSlotsCurrent = char.spell_slots_current || [...spellSlots];

        const slotCreationCosts = { 1: 2, 2: 3, 3: 5, 4: 6, 5: 7 };

        let modal = document.getElementById('converter-modal-overlay');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'converter-modal-overlay';
            modal.className = 'modal-overlay';
            modal.style.cssText = `position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.75); display:flex; justify-content:center; align-items:center; z-index:10005; backdrop-filter:blur(3px);`;
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div style="background:#121218; border:1.5px solid var(--arcane-violet); border-radius:12px; width:92%; max-width:480px; padding:18px; color:white; box-shadow:0 8px 30px rgba(0,0,0,0.8);">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-iron); padding-bottom:10px; margin-bottom:12px;">
                    <div style="font-weight:bold; font-family:'Cinzel', serif; font-size:1rem; color:#c4b5fd;">🔄 Class Resource Converters</div>
                    <button onclick="document.getElementById('converter-modal-overlay').style.display='none'" style="background:none; border:none; color:var(--text-muted); font-size:1.2rem; cursor:pointer;">✕</button>
                </div>

                ${sorcPts.max > 0 ? `
                <div style="background:rgba(167,139,250,0.06); border:1px solid #a78bfaaa; border-radius:8px; padding:10px; margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <span style="font-weight:bold; color:#a78bfa; font-size:0.85rem;">✨ Font of Magic (Sorcerer)</span>
                        <span style="font-size:0.8rem; font-weight:bold; color:#c4b5fd;">${sorcPts.current} / ${sorcPts.max} Points</span>
                    </div>

                    <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:8px;">Create Spell Slots from Sorcery Points:</div>
                    <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; margin-bottom:10px;">
                        ${[1,2,3,4,5].map(lvl => {
                            const cost = slotCreationCosts[lvl];
                            const canAfford = sorcPts.current >= cost;
                            return `
                                <button onclick="window.resourceVaultEngine.convertPointsToSlot(${lvl}, ${cost})" 
                                        style="padding:6px 4px; background:${canAfford ? 'rgba(167, 139, 250, 0.2)' : 'rgba(255,255,255,0.04)'}; border:1px solid ${canAfford ? '#a78bfa' : 'var(--border-iron)'}; color:${canAfford ? 'white' : 'var(--text-muted)'}; border-radius:6px; font-size:0.72rem; font-weight:bold; cursor:${canAfford ? 'pointer' : 'not-allowed'};"
                                        ${canAfford ? '' : 'disabled'}>
                                    ${lvl}${this.getOrdinal(lvl)} Slot (${cost} pts)
                                </button>
                            `;
                        }).join('')}
                    </div>

                    <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:8px;">Convert Spent Spell Slot to Sorcery Points (+1 pt / level):</div>
                    <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:6px;">
                        ${[1,2,3,4,5].map(lvl => {
                            const avail = spellSlotsCurrent[lvl - 1] > 0;
                            const isNotFull = sorcPts.current < sorcPts.max;
                            const canConvert = avail && isNotFull;
                            return `
                                <button onclick="window.resourceVaultEngine.convertSlotToPoints(${lvl})" 
                                        style="padding:6px 4px; background:${canConvert ? 'rgba(236, 72, 153, 0.2)' : 'rgba(255,255,255,0.04)'}; border:1px solid ${canConvert ? '#ec4899' : 'var(--border-iron)'}; color:${canConvert ? 'white' : 'var(--text-muted)'}; border-radius:6px; font-size:0.72rem; font-weight:bold; cursor:${canConvert ? 'pointer' : 'not-allowed'};"
                                        ${canConvert ? '' : 'disabled'}>
                                    Spend Lvl ${lvl} (+${lvl} pt)
                                </button>
                            `;
                        }).join('')}
                    </div>
                </div>
                ` : ''}

                ${chanDiv.max > 0 ? `
                <div style="background:rgba(251,191,36,0.06); border:1px solid #fbbf24aa; border-radius:8px; padding:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <span style="font-weight:bold; color:#fbbf24; font-size:0.85rem;">⚡ Harness Divine Power</span>
                        <span style="font-size:0.8rem; font-weight:bold; color:#fef08a;">${chanDiv.current} / ${chanDiv.max} Channel</span>
                    </div>
                    <p style="font-size:0.72rem; color:var(--text-muted); margin-bottom:8px;">Expend 1 Channel Divinity to regain 1 spent spell slot (up to half proficiency bonus, max Lvl 3):</p>
                    
                    <div style="display:flex; gap:6px;">
                        ${[1,2,3].map(lvl => {
                            const isSpent = (spellSlots[lvl-1] > 0) && (spellSlotsCurrent[lvl-1] < spellSlots[lvl-1]);
                            const canHarness = chanDiv.current > 0 && isSpent;
                            return `
                                <button onclick="window.resourceVaultEngine.harnessDivinePower(${lvl})" 
                                        style="flex:1; padding:6px; background:${canHarness ? 'rgba(251, 191, 36, 0.25)' : 'rgba(255,255,255,0.04)'}; border:1px solid ${canHarness ? '#fbbf24' : 'var(--border-iron)'}; color:${canHarness ? 'white' : 'var(--text-muted)'}; border-radius:6px; font-size:0.72rem; font-weight:bold; cursor:${canHarness ? 'pointer' : 'not-allowed'};"
                                        ${canHarness ? '' : 'disabled'}>
                                    Regain Lvl ${lvl} Slot
                                </button>
                            `;
                        }).join('')}
                    </div>
                </div>
                ` : ''}

                <div style="margin-top:14px; text-align:right;">
                    <button onclick="document.getElementById('converter-modal-overlay').style.display='none'" style="padding:6px 14px; background:#374151; color:white; border:none; border-radius:6px; font-size:0.8rem; cursor:pointer; font-weight:bold;">Close</button>
                </div>
            </div>
        `;

        modal.style.display = 'flex';
    }

    getOrdinal(n) {
        return ['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : (n % 10 < 4 ? n % 10 : 0)];
    }

    // Convert Sorcery Points to Spell Slot
    convertPointsToSlot(slotLevel, pointCost) {
        if (!window.character || !window.character.resource_vault || !window.character.resource_vault.sorcery_points) return;

        const sorcPts = window.character.resource_vault.sorcery_points;
        if (sorcPts.current < pointCost) {
            alert(`Not enough Sorcery Points! Required: ${pointCost}, Current: ${sorcPts.current}`);
            return;
        }

        sorcPts.current -= pointCost;
        if (!window.character.spell_slots_current) {
            window.character.spell_slots_current = [...(window.character.spell_slots || [0,0,0,0,0,0,0,0,0])];
        }

        window.character.spell_slots_current[slotLevel - 1] = (window.character.spell_slots_current[slotLevel - 1] || 0) + 1;

        this.saveAndUpdate('sorcery_points', sorcPts.name, sorcPts.current, sorcPts.max);
        alert(`✨ Created 1 Lvl ${slotLevel} Spell Slot! (-${pointCost} Sorcery Points)`);
        this.openFontOfMagicModal();
    }

    // Convert Spent Spell Slot to Sorcery Points
    convertSlotToPoints(slotLevel) {
        if (!window.character || !window.character.resource_vault || !window.character.resource_vault.sorcery_points) return;

        const sorcPts = window.character.resource_vault.sorcery_points;
        if (sorcPts.current >= sorcPts.max) {
            alert("Sorcery Points pool is already full!");
            return;
        }

        const currentSlots = window.character.spell_slots_current || [];
        if (!currentSlots[slotLevel - 1] || currentSlots[slotLevel - 1] <= 0) {
            alert(`No Level ${slotLevel} spell slots available to convert!`);
            return;
        }

        currentSlots[slotLevel - 1] -= 1;
        sorcPts.current = Math.min(sorcPts.max, sorcPts.current + slotLevel);

        this.saveAndUpdate('sorcery_points', sorcPts.name, sorcPts.current, sorcPts.max);
        alert(`✨ Converted Level ${slotLevel} Spell Slot into +${slotLevel} Sorcery Points!`);
        this.openFontOfMagicModal();
    }

    // Harness Divine Power
    harnessDivinePower(slotLevel) {
        if (!window.character || !window.character.resource_vault || !window.character.resource_vault.channel_divinity) return;

        const chanDiv = window.character.resource_vault.channel_divinity;
        if (chanDiv.current <= 0) {
            alert("No Channel Divinity charges remaining!");
            return;
        }

        chanDiv.current -= 1;
        if (!window.character.spell_slots_current) {
            window.character.spell_slots_current = [...(window.character.spell_slots || [0,0,0,0,0,0,0,0,0])];
        }

        window.character.spell_slots_current[slotLevel - 1] = (window.character.spell_slots_current[slotLevel - 1] || 0) + 1;

        this.saveAndUpdate('channel_divinity', chanDiv.name, chanDiv.current, chanDiv.max);
        alert(`⚡ Expended 1 Channel Divinity to regain 1 Level ${slotLevel} Spell Slot!`);
        this.openFontOfMagicModal();
    }

    // Open Rest Engine Preview Modal (Short or Long Rest)
    openRestPreviewModal(restType = 'short') {
        if (!window.character) return;

        const char = window.character;
        const conMod = char.ability_modifiers?.con || 0;
        const totalHp = char.hp_max || 1;
        const currentHp = char.hp_current || 0;
        const missingHp = totalHp - currentHp;

        const hitDiceMax = char.level || 1;
        const hitDiceCurrent = char.hit_dice_current !== undefined ? char.hit_dice_current : hitDiceMax;
        const hitDieType = char.hit_die || (window.characterEngine ? `d${window.characterEngine.CLASS_HIT_DICE[char.class] || 8}` : 'd8');

        let modal = document.getElementById('rest-engine-modal-overlay');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'rest-engine-modal-overlay';
            modal.className = 'modal-overlay';
            modal.style.cssText = `position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; justify-content:center; align-items:center; z-index:10005; backdrop-filter:blur(4px);`;
            document.body.appendChild(modal);
        }

        const isShort = restType === 'short';

        modal.innerHTML = `
            <div style="background:#121218; border:1.5px solid ${isShort ? '#38bdf8' : '#a78bfa'}; border-radius:12px; width:92%; max-width:500px; padding:18px; color:white; box-shadow:0 8px 32px rgba(0,0,0,0.85);">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-iron); padding-bottom:10px; margin-bottom:12px;">
                    <div style="font-weight:bold; font-family:'Cinzel', serif; font-size:1.05rem; color:${isShort ? '#38bdf8' : '#c4b5fd'};">
                        ${isShort ? '☕ SHORT REST RECOVERY PREVIEW' : '🌙 LONG REST RECOVERY PREVIEW'}
                    </div>
                    <button onclick="document.getElementById('rest-engine-modal-overlay').style.display='none'" style="background:none; border:none; color:var(--text-muted); font-size:1.2rem; cursor:pointer;">✕</button>
                </div>

                <div style="background:rgba(255,255,255,0.04); border-radius:8px; padding:10px; margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; font-size:0.85rem; font-weight:bold; margin-bottom:4px;">
                        <span>Current HP: ${currentHp} / ${totalHp}</span>
                        <span style="color:${missingHp > 0 ? '#ef4444' : '#10b981'};">${missingHp > 0 ? `Missing ${missingHp} HP` : 'Full HP'}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-muted);">
                        <span>Available Hit Dice: <strong style="color:white;">${hitDiceCurrent} / ${hitDiceMax} (${hitDieType})</strong></span>
                        <span>CON Mod: <strong style="color:white;">${conMod >= 0 ? '+' + conMod : conMod}</strong></span>
                    </div>
                </div>

                ${isShort ? `
                <div style="background:rgba(56,189,248,0.06); border:1px solid #38bdf8aa; border-radius:8px; padding:10px; margin-bottom:12px;">
                    <div style="font-size:0.8rem; font-weight:bold; color:#38bdf8; margin-bottom:6px;">🎲 Roll Hit Die to Heal (${hitDieType} + ${conMod})</div>
                    <div style="display:flex; gap:8px;">
                        <button onclick="window.resourceVaultEngine.rollHitDieForShortRest('${hitDieType}', ${conMod})" 
                                style="flex:1; padding:8px; background:#0284c7; color:white; border:none; border-radius:6px; font-weight:bold; font-size:0.8rem; cursor:${hitDiceCurrent > 0 ? 'pointer' : 'not-allowed'};"
                                ${hitDiceCurrent > 0 ? '' : 'disabled'}>
                            🎲 Roll 1 Hit Die
                        </button>
                    </div>
                </div>
                ` : ''}

                <div style="background:rgba(0,0,0,0.4); border:1px solid var(--border-iron); border-radius:8px; padding:10px; margin-bottom:14px; max-height:160px; overflow-y:auto;">
                    <div style="font-size:0.75rem; font-weight:bold; color:var(--text-muted); margin-bottom:6px; text-transform:uppercase;">Resources Recovered on ${isShort ? 'Short' : 'Long'} Rest:</div>
                    ${this.getRestRecoveryListHtml(char, restType)}
                </div>

                <div style="display:flex; justify-content:flex-end; gap:8px;">
                    <button onclick="document.getElementById('rest-engine-modal-overlay').style.display='none'" style="padding:6px 12px; background:#374151; color:white; border:none; border-radius:6px; font-size:0.8rem; cursor:pointer;">Cancel</button>
                    <button onclick="window.resourceVaultEngine.confirmRestExecution('${restType}')" style="padding:6px 16px; background:${isShort ? '#0284c7' : '#7c3aed'}; color:white; border:none; border-radius:6px; font-weight:bold; font-size:0.8rem; cursor:pointer;">
                        Confirm ${isShort ? 'Short Rest' : 'Long Rest'}
                    </button>
                </div>
            </div>
        `;

        modal.style.display = 'flex';
    }

    getRestRecoveryListHtml(char, restType) {
        const isLong = restType === 'long';
        const vault = char.resource_vault || {};
        const items = [];

        if (isLong) {
            items.push('❤️ Full HP restored to Max (' + char.hp_max + ')');
            items.push('✨ All Standard & Pact Spell Slots restored');
            items.push('🎲 Hit Dice recovered (up to half total: +' + Math.max(1, Math.floor((char.level || 1) / 2)) + ')');
            if ((char.exhaustion || 0) > 0) items.push('💤 Exhaustion reduced by 1 level');
        }

        Object.keys(vault).forEach(key => {
            if (key === 'custom') return;
            const res = vault[key];
            if (res && res.max > 0) {
                if (isLong || res.rest === 'short') {
                    items.push(`⚡ ${res.name}: Reset to ${res.max} / ${res.max}`);
                }
            }
        });

        (vault.custom || []).forEach(res => {
            if (isLong || res.rest === 'short') {
                items.push(`⚡ ${res.name}: Reset to ${res.max} / ${res.max}`);
            }
        });

        if (items.length === 0) {
            return `<div style="font-size:0.75rem; color:var(--text-muted);">No active resources affect this rest.</div>`;
        }

        return items.map(item => `<div style="font-size:0.75rem; color:#e2e8f0; padding:2px 0;">${item}</div>`).join('');
    }

    rollHitDieForShortRest(dieType, conMod) {
        if (!window.character) return;

        const char = window.character;
        const hitDiceCurrent = char.hit_dice_current !== undefined ? char.hit_dice_current : (char.level || 1);

        if (hitDiceCurrent <= 0) {
            alert("No Hit Dice remaining!");
            return;
        }

        char.hit_dice_current = hitDiceCurrent - 1;
        const sides = parseInt(dieType.replace('d', '')) || 8;
        const roll = Math.floor(Math.random() * sides) + 1;
        const healed = Math.max(1, roll + conMod);

        char.hp_current = Math.min(char.hp_max, (char.hp_current || 0) + healed);

        alert(`🎲 Rolled ${dieType} (${roll}) + CON (${conMod}) = Healed ${healed} HP!\nRemaining Hit Dice: ${char.hit_dice_current}`);

        if (typeof window.renderCharacterSheet === 'function') {
            window.renderCharacterSheet();
        }
        if (typeof window.queueUpdateAndSync === 'function') {
            window.queueUpdateAndSync();
        }

        this.openRestPreviewModal('short');
    }

    confirmRestExecution(restType) {
        if (!window.character) return;

        const char = window.character;
        const isLong = restType === 'long';
        const vault = char.resource_vault || {};

        if (isLong) {
            char.hp_current = char.hp_max;

            if (char.spell_slots) {
                char.spell_slots_current = [...char.spell_slots];
            }

            const maxHd = char.level || 1;
            const currentHd = char.hit_dice_current !== undefined ? char.hit_dice_current : maxHd;
            const recoverHd = Math.max(1, Math.floor(maxHd / 2));
            char.hit_dice_current = Math.min(maxHd, currentHd + recoverHd);

            if (char.exhaustion && char.exhaustion > 0) {
                char.exhaustion = Math.max(0, char.exhaustion - 1);
                char.exhaustion_level = char.exhaustion;
            }
        }

        Object.keys(vault).forEach(key => {
            if (key === 'custom') return;
            const res = vault[key];
            if (res && (isLong || res.rest === 'short')) {
                res.current = res.max;
            }
        });

        (vault.custom || []).forEach(res => {
            if (isLong || res.rest === 'short') {
                res.current = res.max;
            }
        });

        const modal = document.getElementById('rest-engine-modal-overlay');
        if (modal) modal.style.display = 'none';

        this.saveAndUpdate('all_resources', `${isLong ? 'Long' : 'Short'} Rest`, 0, 0);

        if (typeof window.renderCharacterSheet === 'function') {
            window.renderCharacterSheet();
        }
        if (typeof window.queueUpdateAndSync === 'function') {
            window.queueUpdateAndSync();
        }

        alert(`✨ ${isLong ? 'Long' : 'Short'} Rest complete! Resources and HP updated.`);
    }

    openAddCustomResourceModal() {
        const name = prompt("Custom Resource Name (e.g. Wand Charges, Lucky Feat):", "Lucky Feat");
        if (!name) return;

        const maxStr = prompt("Maximum uses/charges:", "3");
        if (!maxStr) return;

        const max = parseInt(maxStr) || 1;
        const rest = confirm("Restores on Short Rest? (Click OK for Short Rest, Cancel for Long Rest)") ? 'short' : 'long';

        if (!window.character) return;
        if (!window.character.resource_vault) window.character.resource_vault = {};
        if (!Array.isArray(window.character.resource_vault.custom)) window.character.resource_vault.custom = [];

        window.character.resource_vault.custom.push({
            name,
            current: max,
            max,
            type: 'pips',
            color: '#6366f1',
            rest
        });

        this.saveAndUpdate('custom', name, max, max);
    }

    deleteCustomResource(key) {
        if (!window.character || !window.character.resource_vault || !Array.isArray(window.character.resource_vault.custom)) return;
        const idx = parseInt(key.replace('custom_', ''));
        if (isNaN(idx)) return;

        window.character.resource_vault.custom.splice(idx, 1);
        this.saveAndUpdate('custom_delete', 'Custom Pool', 0, 0);
    }

    saveAndUpdate(key, name, current, max) {
        if (window.characterEngine) {
            window.character = window.characterEngine.calculate(window.character);
        }

        this.renderVaultCard(window.character);

        if (typeof window.saveCharacterSheetLocal === 'function') {
            window.saveCharacterSheetLocal();
        }

        if (window.socket && window.character) {
            window.socket.emit('update-resource-vault', {
                characterId: window.character.id || window.character._id,
                characterName: window.character.name,
                resourceKey: key,
                resourceName: name,
                current,
                max,
                resource_vault: window.character.resource_vault
            });
        }
    }
}

window.resourceVaultEngine = new ResourceVaultEngine();
