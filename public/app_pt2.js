// Level up submit modal wizard helper
window.openLevelUpModal = function(id, name) {
    const modal = document.getElementById('levelup-modal');
    modal.classList.remove('hidden');
    document.getElementById('levelup-title').innerText = `Level Up ${name}`;
    window.activeLevelUpId = id;
};

window.submitLevelUp = async function() {
    const id = window.activeLevelUpId;
    const hpIncrease = parseInt(document.getElementById('levelup-hp-add').value) || 0;
    const featInput = document.getElementById('levelup-feat-select');
    const newFeat = featInput ? featInput.value : '';
    const asiStat = document.getElementById('levelup-asi-stat').value;
    const asiVal = document.getElementById('levelup-asi-val').value;

    try {
        const response = await fetch('/api/party/levelup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id,
                hpIncrease,
                newFeat,
                increaseStatKey: asiStat,
                increaseStatVal: asiVal
            })
        });
        const data = await response.json();
        alert(data.message || "Character leveled up!");
        document.getElementById('levelup-modal').classList.add('hidden');
        loadPartyMatrix();
    } catch (err) {
        console.error("Failed level up character:", err);
    }
};

// --- DOSSIER DRAWER TAB SWITCHING & HELPERS ---
window.switchDossierTab = function(tabName) {
    const tabs = ['combat', 'spells', 'features', 'secrets'];
    tabs.forEach(t => {
        const btn = document.getElementById('dossier-btn-' + t);
        const content = document.getElementById('dossier-tab-' + t);
        if (btn) btn.classList.toggle('active', t === tabName);
        if (content) {
            if (t === tabName) {
                content.classList.remove('hidden');
                content.style.display = 'block';
            } else {
                content.classList.add('hidden');
                content.style.display = 'none';
            }
        }
    });
};

window.closeDossierSpellPopover = function() {
    const popover = document.getElementById('dossier-spell-popover');
    if (popover) {
        popover.classList.add('hidden');
        popover.style.display = 'none';
    }
};

window.viewPreparedSpellDetail = async function(spellName) {
    const popover = document.getElementById('dossier-spell-popover');
    const titleEl = document.getElementById('dossier-popover-title');
    const bodyEl = document.getElementById('dossier-popover-body');
    if (!popover || !titleEl || !bodyEl) return;

    popover.classList.remove('hidden');
    popover.style.display = 'block';
    titleEl.textContent = spellName;
    bodyEl.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 20px;">Fetching spell grimoire details...</div>';

    try {
        let spell = null;
        if (window.localGrimoireSpells && window.localGrimoireSpells.length > 0) {
            spell = window.localGrimoireSpells.find(s => s.name && s.name.toLowerCase() === spellName.toLowerCase());
        }
        if (!spell) {
            const res = await fetch(`/api/spells/${encodeURIComponent(spellName)}`);
            if (res.ok) spell = await res.json();
        }

        if (!spell) {
            bodyEl.innerHTML = `<div style="color: #f87171; padding: 10px;">Spell details for "${spellName}" were not found in the 5e database compendium.</div>`;
            return;
        }

        const formattedDesc = (spell.description || spell.desc || '')
            .split('\n')
            .map(p => p.trim())
            .filter(p => p.length > 0)
            .map(p => `<p style="margin-bottom: 10px; line-height: 1.5; color: #e5e7eb;">${p}</p>`)
            .join('');

        bodyEl.innerHTML = `
            <div style="font-style: italic; color: #a78bfa; font-size: 0.85rem; border-bottom: 1px solid #374151; padding-bottom: 6px; margin-bottom: 10px; display: flex; justify-content: space-between;">
                <span>Level ${spell.level !== undefined ? spell.level : 1} • ${spell.school || 'Magic'}</span>
            </div>
            <div style="font-size: 0.8rem; color: #cbd5e1; margin-bottom: 12px; background: #1e1b2e; padding: 8px 10px; border-radius: 6px; border: 1px solid #374151; display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                <div><strong>Casting Time:</strong> ${spell.casting_time || '1 action'}</div>
                <div><strong>Range:</strong> ${spell.range || 'Self'}</div>
                <div style="grid-column: span 2;"><strong>Components:</strong> ${spell.components || 'V, S'}</div>
                <div style="grid-column: span 2;"><strong>Duration:</strong> ${spell.duration || 'Instantaneous'}</div>
            </div>
            <div style="font-size: 0.85rem; font-family: 'Inter', sans-serif;">
                ${formattedDesc || '<p style="color: var(--text-muted);">No description available.</p>'}
            </div>
        `;
    } catch(err) {
        console.error("Error loading spell details:", err);
        bodyEl.innerHTML = `<div style="color: #f87171;">Failed to load spell details.</div>`;
    }
};

// --- COMPENDIUM POPOUT HANDLERS FOR SUBCLASSES, FEATS, & MAGIC ITEMS ---
window.viewSubclassDetail = async function(subclassName, className) {
    const popover = document.getElementById('dossier-spell-popover');
    const titleEl = document.getElementById('dossier-popover-title');
    const bodyEl = document.getElementById('dossier-popover-body');
    if (!popover || !titleEl || !bodyEl) return;

    popover.classList.remove('hidden');
    popover.style.display = 'block';
    titleEl.textContent = `${subclassName} (${className || 'Archetype'})`;
    bodyEl.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 20px;">Fetching subclass details...</div>';

    try {
        let matchedSub = null;
        let matchedClass = null;

        const resSub = await fetch('/api/subclasses');
        if (resSub.ok) {
            const subs = await resSub.json();
            matchedSub = subs.find(s => s.name && s.name.toLowerCase() === subclassName.toLowerCase());
        }

        const resCls = await fetch('/api/classes');
        if (resCls.ok) {
            const classesObj = await resCls.json();
            if (className && classesObj[className]) {
                matchedClass = classesObj[className];
            } else if (classesObj) {
                matchedClass = Object.values(classesObj).find(c => c.name && c.name.toLowerCase() === (className || '').toLowerCase());
            }
        }

        let description = matchedSub?.description || matchedSub?.desc || matchedClass?.description || `The ${subclassName} is a specialized archetype for ${className || 'adventurers'}.`;
        if (Array.isArray(description)) description = description.join('\n\n');

        let featuresHtml = '';
        if (matchedSub?.features && Array.isArray(matchedSub.features)) {
            featuresHtml = matchedSub.features.map(f => `
                <div style="background:#1e1b2e; border:1px solid #374151; border-radius:6px; padding:8px; margin-bottom:8px;">
                    <strong style="color:#a78bfa; font-size:0.85rem; display:block;">${f.name || 'Feature'}</strong>
                    <div style="font-size:0.8rem; color:#d1d5db; margin-top:4px;">${Array.isArray(f.description) ? f.description.join(' ') : (f.description || f.entries?.join(' ') || '')}</div>
                </div>
            `).join('');
        }

        bodyEl.innerHTML = `
            <div style="font-style: italic; color: #a78bfa; font-size: 0.85rem; border-bottom: 1px solid #374151; padding-bottom: 6px; margin-bottom: 10px;">
                Archetype Path for ${className || 'Class'}
            </div>
            <div style="font-size: 0.85rem; line-height: 1.5; color: #e5e7eb; margin-bottom: 12px;">
                ${description.split('\n').map(p => `<p style="margin-bottom:8px;">${p}</p>`).join('')}
            </div>
            ${featuresHtml ? `
                <strong style="color:#a78bfa; font-family:'Cinzel', serif; font-size:0.8rem; display:block; margin-bottom:6px;">Subclass Features:</strong>
                ${featuresHtml}
            ` : ''}
        `;
    } catch(err) {
        console.error("Error loading subclass details:", err);
        bodyEl.innerHTML = `<div style="color: #f87171;">Failed to load subclass details.</div>`;
    }
};

window.viewFeatDetail = async function(featName) {
    const popover = document.getElementById('dossier-spell-popover');
    const titleEl = document.getElementById('dossier-popover-title');
    const bodyEl = document.getElementById('dossier-popover-body');
    if (!popover || !titleEl || !bodyEl) return;

    popover.classList.remove('hidden');
    popover.style.display = 'block';
    titleEl.textContent = `Feat: ${featName}`;
    bodyEl.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 20px;">Fetching feat details...</div>';

    try {
        let feat = null;
        const res = await fetch('/api/feats');
        if (res.ok) {
            const feats = await res.json();
            feat = feats.find(f => f.name && f.name.toLowerCase() === featName.toLowerCase());
        }

        if (!feat) {
            bodyEl.innerHTML = `<div style="color: #cbd5e1; padding: 10px;">
                <strong style="color:#a78bfa;">${featName}</strong>
                <p style="font-size:0.85rem; margin-top:6px; color:#9ca3af;">A special feat/trait chosen by the player. Grants specialized abilities during combat or exploration.</p>
            </div>`;
            return;
        }

        let descText = feat.description || feat.entries || feat.text || '';
        if (Array.isArray(descText)) descText = descText.join('\n\n');

        bodyEl.innerHTML = `
            <div style="font-style: italic; color: #a78bfa; font-size: 0.85rem; border-bottom: 1px solid #374151; padding-bottom: 6px; margin-bottom: 10px;">
                ${feat.prerequisites ? `Prerequisite: ${feat.prerequisites}` : 'General Feat'}
            </div>
            <div style="font-size: 0.85rem; line-height: 1.5; color: #e5e7eb;">
                ${descText.split('\n').map(p => `<p style="margin-bottom:8px;">${p}</p>`).join('')}
            </div>
        `;
    } catch(err) {
        console.error("Error loading feat details:", err);
        bodyEl.innerHTML = `<div style="color: #f87171;">Failed to load feat details.</div>`;
    }
};

window.viewMagicItemDetail = async function(itemName) {
    const popover = document.getElementById('dossier-spell-popover');
    const titleEl = document.getElementById('dossier-popover-title');
    const bodyEl = document.getElementById('dossier-popover-body');
    if (!popover || !titleEl || !bodyEl) return;

    popover.classList.remove('hidden');
    popover.style.display = 'block';
    titleEl.textContent = itemName;
    bodyEl.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 20px;">Fetching magic item details...</div>';

    try {
        let item = null;

        const resBazaar = await fetch('/api/bazaar');
        if (resBazaar.ok) {
            const items = await resBazaar.json();
            item = items.find(i => i.name && i.name.toLowerCase() === itemName.toLowerCase());
        }

        if (!item) {
            const resHb = await fetch('/api/homebrew/items');
            if (resHb.ok) {
                const hbItems = await resHb.json();
                item = hbItems.find(i => i.name && i.name.toLowerCase() === itemName.toLowerCase());
            }
        }

        if (!item) {
            bodyEl.innerHTML = `<div style="color: #cbd5e1; padding: 10px;">
                <strong style="color:#f59e0b;">🔮 ${itemName}</strong>
                <p style="font-size:0.85rem; margin-top:6px; color:#9ca3af;">Magic Item / Wondrous Gear carried by the adventurer.</p>
            </div>`;
            return;
        }

        let descText = item.description || item.desc || item.text || item.entries || '';
        if (Array.isArray(descText)) descText = descText.join('\n\n');

        bodyEl.innerHTML = `
            <div style="font-style: italic; color: #f59e0b; font-size: 0.85rem; border-bottom: 1px solid #374151; padding-bottom: 6px; margin-bottom: 10px; display:flex; justify-content:space-between;">
                <span>${item.type || 'Magic Item'}</span>
                <span>${item.rarity || 'Uncommon'}</span>
            </div>
            <div style="font-size: 0.8rem; color: #cbd5e1; margin-bottom: 10px; background: #1e1b2e; padding: 6px 10px; border-radius: 4px; border: 1px solid #374151;">
                <strong>Attunement:</strong> ${item.reqAttune || item.attunement ? 'Requires Attunement' : 'No Attunement Required'}
            </div>
            <div style="font-size: 0.85rem; line-height: 1.5; color: #e5e7eb;">
                ${descText ? descText.split('\n').map(p => `<p style="margin-bottom:8px;">${p}</p>`).join('') : '<p>No additional description provided.</p>'}
            </div>
        `;
    } catch(err) {
        console.error("Error loading magic item details:", err);
        bodyEl.innerHTML = `<div style="color: #f87171;">Failed to load magic item details.</div>`;
    }
};

window.rollDossierSave = function(charName, statKey, modValue) {
    const d20 = Math.floor(Math.random() * 20) + 1;
    const total = d20 + modValue;
    const sign = modValue >= 0 ? '+' : '';
    const msg = `${charName} rolled ${statKey.toUpperCase()} Saving Throw: [d20 (${d20}) ${sign}${modValue}] = ${total}`;
    if (typeof window.addSystemLog === 'function') {
        window.addSystemLog(msg);
    }
    alert(`🎲 ${msg}`);
};

window.rollDossierSkill = function(charName, skillName, modValue) {
    const d20 = Math.floor(Math.random() * 20) + 1;
    const total = d20 + modValue;
    const sign = modValue >= 0 ? '+' : '';
    const msg = `${charName} rolled ${skillName} Check: [d20 (${d20}) ${sign}${modValue}] = ${total}`;
    if (typeof window.addSystemLog === 'function') {
        window.addSystemLog(msg);
    }
    alert(`🎲 ${msg}`);
};

function getClassSaveProficiencies(className) {
    if (!className) return [];
    const cls = className.toLowerCase();
    if (cls.includes('barbarian')) return ['str', 'con'];
    if (cls.includes('bard')) return ['dex', 'cha'];
    if (cls.includes('cleric')) return ['wis', 'cha'];
    if (cls.includes('druid')) return ['int', 'wis'];
    if (cls.includes('fighter')) return ['str', 'con'];
    if (cls.includes('monk')) return ['str', 'dex'];
    if (cls.includes('paladin')) return ['wis', 'cha'];
    if (cls.includes('ranger')) return ['str', 'dex'];
    if (cls.includes('rogue')) return ['dex', 'int'];
    if (cls.includes('sorcerer')) return ['con', 'cha'];
    if (cls.includes('warlock')) return ['wis', 'cha'];
    if (cls.includes('wizard')) return ['int', 'wis'];
    if (cls.includes('artificer')) return ['con', 'int'];
    return [];
}

const ALL_5E_SKILLS = [
    { name: 'Athletics', stat: 'str' },
    { name: 'Acrobatics', stat: 'dex' },
    { name: 'Sleight of Hand', stat: 'dex' },
    { name: 'Stealth', stat: 'dex' },
    { name: 'Arcana', stat: 'int' },
    { name: 'History', stat: 'int' },
    { name: 'Investigation', stat: 'int' },
    { name: 'Nature', stat: 'int' },
    { name: 'Religion', stat: 'int' },
    { name: 'Animal Handling', stat: 'wis' },
    { name: 'Insight', stat: 'wis' },
    { name: 'Medicine', stat: 'wis' },
    { name: 'Perception', stat: 'wis' },
    { name: 'Survival', stat: 'wis' },
    { name: 'Deception', stat: 'cha' },
    { name: 'Intimidation', stat: 'cha' },
    { name: 'Performance', stat: 'cha' },
    { name: 'Persuasion', stat: 'cha' }
];

window.openSecretsDrawer = function(character) {
    const drawer = document.getElementById('secrets-drawer');
    if (!drawer) return;

    document.getElementById('secrets-drawer-char-name').innerText = `${character.name}'s Dossier`;
    document.getElementById('secrets-text-input').value = character.secrets || "";
    closeDossierSpellPopover();
    switchDossierTab('combat');

    const profBonus = character.proficiency_bonus || (character.level ? Math.ceil(1 + (character.level / 4)) : 2);
    const subclass = character.subclass || (character.classes && character.classes[0] && character.classes[0].subclass) || 'None Spec';
    const charClass = character.class || 'Adventurer';
    const armorClass = character.ac || 10;
    const currentHp = character.hp_current !== undefined ? character.hp_current : (character.hp || character.hp_max || 10);
    const maxHp = character.hp_max || character.hp || 10;
    const tempHp = character.hp_temp || 0;
    const speed = character.speed || 30;
    const initBonus = character.initiative_bonus !== undefined ? character.initiative_bonus : Math.floor(((character.stats?.dex || 10) - 10) / 2);
    const initSign = initBonus >= 0 ? '+' : '';

    const safeCharName = (character.name || 'Character').replace(/'/g, "\\'");
    const safeSubclass = subclass.replace(/'/g, "\\'");
    const safeClass = charClass.replace(/'/g, "\\'");

    // Ability scores & Modifiers
    const statsKeys = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
    const abilityMods = {};
    statsKeys.forEach(k => {
        const score = character.stats?.[k] !== undefined ? character.stats[k] : (character.ability_scores_calculated?.[k] || 10);
        abilityMods[k] = character.ability_modifiers?.[k] !== undefined ? character.ability_modifiers[k] : Math.floor((score - 10) / 2);
    });

    // Determine saving throw proficiencies
    let saveProfs = [];
    if (Array.isArray(character.saving_throws)) {
        saveProfs = character.saving_throws.map(s => s.toLowerCase());
    } else if (character.saves && typeof character.saves === 'object') {
        saveProfs = Object.keys(character.saves).filter(k => character.saves[k]);
    } else {
        saveProfs = getClassSaveProficiencies(character.class);
    }

    const saveBonusExtra = character.attuned_bonuses?.saves || 0;

    // --- TAB 1: COMBAT & STATS HTML ---
    const combatStatsContainer = document.getElementById('secrets-dossier-stats');
    if (combatStatsContainer) {
        let statsBoxesHtml = statsKeys.map(k => {
            const score = character.stats?.[k] || 10;
            const mod = abilityMods[k];
            const sign = mod >= 0 ? '+' : '';
            return `
                <div style="background:#111827; border:1px solid #374151; border-radius:4px; padding:6px; text-align:center;">
                    <div style="font-size:0.7rem; color:#9ca3af; font-weight:bold;">${k.toUpperCase()}</div>
                    <div style="font-size:1rem; font-weight:bold; color:#f3f4f6;">${score}</div>
                    <div style="font-size:0.75rem; color:#a78bfa;">${sign}${mod}</div>
                </div>
            `;
        }).join('');

        let savesHtml = statsKeys.map(k => {
            const isProf = saveProfs.includes(k.toLowerCase());
            const saveMod = abilityMods[k] + (isProf ? profBonus : 0) + saveBonusExtra;
            const sign = saveMod >= 0 ? '+' : '';
            return `
                <div style="display:flex; justify-content:space-between; align-items:center; background:#181824; border:1px solid #2d2d3a; border-radius:4px; padding:4px 8px; font-size:0.8rem;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span style="font-weight:bold; width:32px;">${k.toUpperCase()}</span>
                        ${isProf ? '<span style="background:#7c3aed; color:white; font-size:0.6rem; padding:1px 4px; border-radius:3px; font-weight:bold;">PROF</span>' : ''}
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <strong style="color:#a78bfa;">${sign}${saveMod}</strong>
                        <button class="save-roll-btn" onclick="rollDossierSave('${safeCharName}', '${k}', ${saveMod})">🎲 Roll</button>
                    </div>
                </div>
            `;
        }).join('');

        // 18 Skills Calculation
        const isBardJack = (charClass || '').toLowerCase().includes('bard') && (character.level || 1) >= 2;
        const jackBonus = Math.floor(profBonus / 2);

        let skillsGridHtml = ALL_5E_SKILLS.map(sk => {
            const sNameLower = sk.name.toLowerCase();
            const statMod = abilityMods[sk.stat] || 0;
            
            let profLevel = 0; // 0=none, 1=prof, 2=expertise
            if (character.skills && typeof character.skills === 'object' && !Array.isArray(character.skills)) {
                const val = character.skills[sNameLower] || character.skills[sk.name];
                if (val === 2 || val === 'expertise') profLevel = 2;
                else if (val === 1 || val === true || val === 'proficient') profLevel = 1;
            } else {
                const profArray = Array.isArray(character.skills) ? character.skills : (character.skill_proficiencies || character.skills_proficient || []);
                const expArray = character.expertise_skills || character.skills_expertise || [];
                if (expArray.map(e => String(e).toLowerCase()).includes(sNameLower)) profLevel = 2;
                else if (profArray.map(p => String(p).toLowerCase()).includes(sNameLower)) profLevel = 1;
            }

            let skillMod = statMod;
            let badgeHtml = '';
            if (profLevel === 2) {
                skillMod += (profBonus * 2);
                badgeHtml = '<span style="background:#b91c1c; color:white; font-size:0.55rem; padding:1px 3px; border-radius:3px; font-weight:bold;">EXP</span>';
            } else if (profLevel === 1) {
                skillMod += profBonus;
                badgeHtml = '<span style="background:#7c3aed; color:white; font-size:0.55rem; padding:1px 3px; border-radius:3px; font-weight:bold;">PROF</span>';
            } else if (isBardJack) {
                skillMod += jackBonus;
                badgeHtml = '<span style="background:#2563eb; color:white; font-size:0.55rem; padding:1px 3px; border-radius:3px; font-weight:bold;">JACK</span>';
            }

            const sign = skillMod >= 0 ? '+' : '';
            const safeSkill = sk.name.replace(/'/g, "\\'");

            return `
                <div style="display:flex; justify-content:space-between; align-items:center; background:#181824; border:1px solid #2d2d3a; border-radius:4px; padding:3px 6px; font-size:0.75rem;">
                    <div style="display:flex; align-items:center; gap:4px; overflow:hidden;">
                        <span style="color:#9ca3af; font-size:0.65rem; width:26px; text-transform:uppercase; font-weight:bold;">${sk.stat}</span>
                        <span style="font-weight:600; color:#e5e7eb; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${sk.name}</span>
                        ${badgeHtml}
                    </div>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <strong style="color:#a78bfa;">${sign}${skillMod}</strong>
                        <button class="save-roll-btn" style="padding:1px 5px; font-size:0.7rem;" onclick="rollDossierSkill('${safeCharName}', '${safeSkill}', ${skillMod})">🎲</button>
                    </div>
                </div>
            `;
        }).join('');

        const passivePerception = character.passives?.perception || (10 + abilityMods.wis + (saveProfs.includes('wis') ? profBonus : 0));
        const passiveInsight = character.passives?.insight || (10 + abilityMods.wis);
        const passiveInvest = character.passives?.investigation || (10 + abilityMods.int);

        const conditionsBadges = (character.conditions && character.conditions.length > 0)
            ? character.conditions.map(c => `<span style="background:#ef4444; color:white; padding:2px 6px; border-radius:4px; font-size:0.75rem; font-weight:bold;">${c}</span>`).join(' ')
            : '<span style="color:#9ca3af; font-style:italic; font-size:0.8rem;">Normal (No Active Conditions)</span>';

        const deathSaves = character.death_saves || character.deathSaves || { successes: 0, failures: 0 };
        const exhaustion = character.exhaustion_level !== undefined ? character.exhaustion_level : (character.exhaustion || 0);

        combatStatsContainer.innerHTML = `
            <!-- Overview Banner -->
            <div style="display:flex; gap:12px; align-items:center; background:#181824; border:1px solid var(--border-iron); border-radius:6px; padding:10px; margin-bottom:12px;">
                ${character.art ? `<img src="${character.art}" style="width:52px; height:52px; border-radius:50%; object-fit:cover; border:2px solid #a78bfa;">` : ''}
                <div style="flex:1;">
                    <div style="font-weight:bold; font-size:1rem; color:#f3f4f6;">${character.name}</div>
                    <div style="font-size:0.8rem; color:#a78bfa;">
                        Lvl ${character.level} ${character.race || ''} 
                        <span style="cursor:pointer; text-decoration:underline;" onclick="viewSubclassDetail('${safeSubclass}', '${safeClass}')">${charClass}</span>
                    </div>
                    <div style="font-size:0.75rem; color:#9ca3af;">
                        Subclass: <strong style="color:#a78bfa; cursor:pointer; text-decoration:underline;" onclick="viewSubclassDetail('${safeSubclass}', '${safeClass}')">${subclass}</strong>
                    </div>
                </div>
            </div>

            <!-- Core Defense & Vitals Grid -->
            <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:6px; text-align:center; margin-bottom:12px;">
                <div style="background:#111; border:1px solid #374151; padding:6px; border-radius:4px;">
                    <div style="font-size:0.65rem; color:#9ca3af; font-weight:bold;">ARMOR CLASS</div>
                    <div style="font-size:1.1rem; font-weight:bold; color:#10b981;">🛡️ ${armorClass}</div>
                </div>
                <div style="background:#111; border:1px solid #374151; padding:6px; border-radius:4px;">
                    <div style="font-size:0.65rem; color:#9ca3af; font-weight:bold;">HIT POINTS</div>
                    <div style="font-size:0.95rem; font-weight:bold; color:#ef4444;">❤️ ${currentHp}/${maxHp}</div>
                    ${tempHp > 0 ? `<div style="font-size:0.65rem; color:#3b82f6;">+${tempHp} Temp</div>` : ''}
                </div>
                <div style="background:#111; border:1px solid #374151; padding:6px; border-radius:4px;">
                    <div style="font-size:0.65rem; color:#9ca3af; font-weight:bold;">INITIATIVE</div>
                    <div style="font-size:1.1rem; font-weight:bold; color:#f59e0b;">⚡ ${initSign}${initBonus}</div>
                </div>
                <div style="background:#111; border:1px solid #374151; padding:6px; border-radius:4px;">
                    <div style="font-size:0.65rem; color:#9ca3af; font-weight:bold;">SPEED</div>
                    <div style="font-size:1.1rem; font-weight:bold; color:#60a5fa;">🏃 ${speed}ft</div>
                </div>
            </div>

            <!-- Passives Bar -->
            <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:6px; text-align:center; background:#0f0f18; border:1px solid #27273a; border-radius:4px; padding:6px; margin-bottom:12px; font-size:0.75rem;">
                <div><span style="color:#9ca3af;">Passive Perc:</span> <strong style="color:#f3f4f6;">${passivePerception}</strong></div>
                <div><span style="color:#9ca3af;">Passive Ins:</span> <strong style="color:#f3f4f6;">${passiveInsight}</strong></div>
                <div><span style="color:#9ca3af;">Passive Inv:</span> <strong style="color:#f3f4f6;">${passiveInvest}</strong></div>
            </div>

            <!-- Ability Scores Grid -->
            <strong style="color:#a78bfa; font-family:'Cinzel', serif; font-size:0.8rem; display:block; margin-bottom:6px;">Ability Scores & Modifiers:</strong>
            <div style="display:grid; grid-template-columns: repeat(6, 1fr); gap:4px; margin-bottom:12px;">
                ${statsBoxesHtml}
            </div>

            <!-- Saving Throws Section -->
            <strong style="color:#a78bfa; font-family:'Cinzel', serif; font-size:0.8rem; display:block; margin-bottom:6px;">Saving Throws (Click to Roll):</strong>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px; margin-bottom:12px;">
                ${savesHtml}
            </div>

            <!-- 18 Character Skills Section -->
            <strong style="color:#a78bfa; font-family:'Cinzel', serif; font-size:0.8rem; display:block; margin-bottom:6px;">Character Skills (Click 🎲 to Roll):</strong>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px; margin-bottom:12px;">
                ${skillsGridHtml}
            </div>

            <!-- Vitality & Conditions -->
            <div style="background:#111827; border:1px solid #374151; border-radius:6px; padding:8px; font-size:0.8rem;">
                <div style="margin-bottom:6px;"><strong>Active Conditions:</strong> ${conditionsBadges}</div>
                <div style="display:flex; justify-content:space-between; color:#9ca3af; font-size:0.75rem; border-top:1px solid #1f2937; padding-top:6px; margin-top:6px;">
                    <span>Exhaustion: <strong style="color:${exhaustion > 0 ? '#ef4444':'#f3f4f6'};">${exhaustion}</strong></span>
                    <span>Death Saves: <strong style="color:#10b981;">${deathSaves.successes || 0}S</strong> / <strong style="color:#ef4444;">${deathSaves.failures || 0}F</strong></span>
                </div>
            </div>
        `;
    }

    // --- TAB 2: SPELLS & MAGIC HTML ---
    const spellsContainer = document.getElementById('secrets-dossier-spells');
    if (spellsContainer) {
        const spellSaveDc = character.spell_save_dc || (8 + profBonus + (abilityMods[character.spellcasting_ability || 'cha'] || abilityMods.cha));
        const spellAttack = character.spell_attack_bonus !== undefined ? character.spell_attack_bonus : (profBonus + (abilityMods[character.spellcasting_ability || 'cha'] || abilityMods.cha));
        const attackSign = spellAttack >= 0 ? '+' : '';

        // Spell Slots
        const slotsMax = character.spell_slots || [0,0,0,0,0,0,0,0,0];
        const slotsCurr = character.spell_slots_current || slotsMax;
        let slotsHtml = '';
        for (let i = 0; i < 9; i++) {
            if (slotsMax[i] > 0) {
                slotsHtml += `
                    <div style="background:#111827; border:1px solid #374151; border-radius:4px; padding:4px 6px; text-align:center; font-size:0.75rem;">
                        <div style="color:#9ca3af; font-weight:bold;">Lvl ${i+1}</div>
                        <div style="color:#a78bfa; font-weight:bold;">${slotsCurr[i]}/${slotsMax[i]}</div>
                    </div>
                `;
            }
        }
        if (!slotsHtml) {
            slotsHtml = '<div style="color:#9ca3af; font-style:italic; font-size:0.8rem; grid-column:span 4;">No spell slots for this character.</div>';
        }

        // Prepared Spells
        const prepSpells = character.prepared_spells || [];
        let prepSpellsHtml = '';
        if (prepSpells.length > 0) {
            prepSpellsHtml = prepSpells.map(sName => {
                const safeSpell = sName.replace(/'/g, "\\'");
                return `
                    <button style="background:#1e1b2e; border:1px solid #a78bfa; color:#e5e7eb; border-radius:4px; padding:5px 8px; font-size:0.8rem; text-align:left; cursor:pointer; transition:all 0.15s;" 
                            onclick="viewPreparedSpellDetail('${safeSpell}')"
                            onmouseover="this.style.background='#2e264f'" 
                            onmouseout="this.style.background='#1e1b2e'">
                        ✨ ${sName}
                    </button>
                `;
            }).join('');
        } else {
            prepSpellsHtml = '<div style="color:#9ca3af; font-style:italic; font-size:0.8rem;">No prepared spells currently tracked on player sheet.</div>';
        }

        // Known Spells
        const knownSpells = character.known_spells || [];
        let knownSpellsHtml = '';
        if (knownSpells.length > 0) {
            knownSpellsHtml = knownSpells.map(sName => {
                const safeSpell = sName.replace(/'/g, "\\'");
                return `
                    <button style="background:#111827; border:1px solid #374151; color:#9ca3af; border-radius:4px; padding:4px 6px; font-size:0.75rem; text-align:left; cursor:pointer;" 
                            onclick="viewPreparedSpellDetail('${safeSpell}')">
                        📖 ${sName}
                    </button>
                `;
            }).join('');
        }

        spellsContainer.innerHTML = `
            <div style="display:flex; justify-content:space-around; background:#181824; border:1px solid var(--border-iron); border-radius:6px; padding:10px; margin-bottom:12px; text-align:center;">
                <div>
                    <div style="font-size:0.7rem; color:#9ca3af; font-weight:bold;">SPELL SAVE DC</div>
                    <div style="font-size:1.2rem; font-weight:bold; color:#a78bfa;">🎯 ${spellSaveDc}</div>
                </div>
                <div>
                    <div style="font-size:0.7rem; color:#9ca3af; font-weight:bold;">SPELL ATTACK BONUS</div>
                    <div style="font-size:1.2rem; font-weight:bold; color:#10b981;">💥 ${attackSign}${spellAttack}</div>
                </div>
            </div>

            <strong style="color:#a78bfa; font-family:'Cinzel', serif; font-size:0.8rem; display:block; margin-bottom:6px;">Spell Slots Tracker:</strong>
            <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:6px; margin-bottom:12px;">
                ${slotsHtml}
            </div>

            <strong style="color:#a78bfa; font-family:'Cinzel', serif; font-size:0.8rem; display:block; margin-bottom:6px;">Prepared Spells (Click to view details):</strong>
            <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:12px;">
                ${prepSpellsHtml}
            </div>

            ${knownSpells.length > 0 ? `
                <strong style="color:#9ca3af; font-family:'Cinzel', serif; font-size:0.8rem; display:block; margin-bottom:6px;">Other Known Spells:</strong>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px;">
                    ${knownSpellsHtml}
                </div>
            ` : ''}
        `;
    }

    // --- TAB 3: FEATURES & SUBCLASS HTML ---
    const featuresContainer = document.getElementById('secrets-dossier-features');
    if (featuresContainer) {
        const featsList = (character.feats && character.feats.length > 0)
            ? character.feats.map(f => {
                const safeFeat = String(f).replace(/'/g, "\\'");
                return `<li style="margin-bottom:4px; color:#e5e7eb; cursor:pointer;" onclick="viewFeatDetail('${safeFeat}')">✨ <u>${f}</u></li>`;
              }).join('')
            : '<li style="color:#9ca3af; font-style:italic;">No feats selected.</li>';

        const magicItemsList = (character.magic_items && character.magic_items.length > 0)
            ? character.magic_items.map(m => {
                const safeItem = String(m).replace(/'/g, "\\'");
                return `<li style="margin-bottom:4px; color:#f59e0b; cursor:pointer;" onclick="viewMagicItemDetail('${safeItem}')">🔮 <u>${m}</u></li>`;
              }).join('')
            : '<li style="color:#9ca3af; font-style:italic;">No magic items listed.</li>';

        const classResources = character.class_resources
            ? `<div><strong>${character.class_resources.name || 'Class Resource'}:</strong> ${character.class_resources.current !== undefined ? character.class_resources.current : 'Available'}</div>`
            : '<div style="color:#9ca3af; font-style:italic;">No specific class resource pool tracked.</div>';

        featuresContainer.innerHTML = `
            <div style="background:#181824; border:1px solid var(--border-iron); border-radius:6px; padding:10px; margin-bottom:12px; cursor:pointer;" onclick="viewSubclassDetail('${safeSubclass}', '${safeClass}')">
                <div style="font-size:0.75rem; color:#9ca3af; font-weight:bold; text-transform:uppercase;">Subclass Specialization (Click for info)</div>
                <div style="font-size:1.1rem; font-weight:bold; color:#a78bfa; margin-top:2px;">${subclass}</div>
                <div style="font-size:0.8rem; color:#d1d5db; margin-top:4px;">Class: ${charClass} (Level ${character.level})</div>
            </div>

            <div style="background:#111827; border:1px solid #374151; border-radius:6px; padding:10px; margin-bottom:12px; font-size:0.85rem;">
                <strong style="color:#a78bfa; font-family:'Cinzel', serif; font-size:0.8rem; display:block; margin-bottom:6px;">Class Special Resources:</strong>
                ${classResources}
            </div>

            <div style="background:#111827; border:1px solid #374151; border-radius:6px; padding:10px; margin-bottom:12px;">
                <strong style="color:#a78bfa; font-family:'Cinzel', serif; font-size:0.8rem; display:block; margin-bottom:6px;">Feats & Traits (Click for details):</strong>
                <ul style="margin:0; padding-left:18px; font-size:0.85rem;">
                    ${featsList}
                </ul>
            </div>

            <div style="background:#111827; border:1px solid #374151; border-radius:6px; padding:10px;">
                <strong style="color:#f59e0b; font-family:'Cinzel', serif; font-size:0.8rem; display:block; margin-bottom:6px;">Magic Items & Gear (Click for details):</strong>
                <ul style="margin:0; padding-left:18px; font-size:0.85rem;">
                    ${magicItemsList}
                </ul>
            </div>
        `;
    }

    // --- TAB 4: DOSSIER WISHLIST ---
    const wishlistContainer = document.getElementById('secrets-dossier-wishlist');
    if (wishlistContainer) {
        const wishlistItems = character.wishlist && character.wishlist.length > 0 
            ? character.wishlist.map(w => `<li style="margin-bottom: 4px; color: var(--gold-amber, #f59e0b);">${w}</li>`).join('') 
            : '<li style="color: var(--text-muted); font-style: italic;">No wishlist items submitted yet.</li>';

        wishlistContainer.innerHTML = `
            <strong style="color: #a78bfa; font-family: 'Cinzel', serif; font-size: 0.85rem; display: block; margin-bottom: 6px;">Secret Adventure Wish List (From Player Sheet):</strong>
            <ul style="margin: 0; padding-left: 18px; font-size: 0.85rem; background:#111827; border:1px solid #374151; border-radius:6px; padding:10px 10px 10px 28px;">
                ${wishlistItems}
            </ul>
        `;
    }

    drawer.classList.add('open');
    window.activeSecretsCharId = character.id;
};

window.closeSecretsDrawer = function() {
    const drawer = document.getElementById('secrets-drawer');
    if (drawer) drawer.classList.remove('open');
};

async function saveActiveSecrets() {
    const id = window.activeSecretsCharId;
    const text = document.getElementById('secrets-text-input').value;
    if (!id) return;

    try {
        await fetch('/api/party/secrets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, secrets: text })
        });
        alert("Dossier secrets saved successfully.");
        closeSecretsDrawer();
        loadPartyMatrix();
    } catch(err) {
        console.error("Failed to save character secrets:", err);
    }
}

// --- PERSISTENT SESSION SCRATCHPAD LOGS ---
window.saveScratchpadNote = async function() {
    const text = document.getElementById('scratchpad-textarea').value.trim();
    if (!text) return;
    try {
        const response = await fetch('/api/session-scratchpad/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                round: currentRound
            })
        });
        const data = await response.json();
        document.getElementById('scratchpad-textarea').value = '';
        renderScratchpadNotes(data.notes);
    } catch(e) {
        console.error("Failed saving note:", e);
    }
};

async function loadScratchpadNotes() {
    try {
        const res = await fetch('/api/session-scratchpad');
        const notes = await res.json();
        renderScratchpadNotes(notes);
    } catch (e) {}
}

function renderScratchpadNotes(notes) {
    const container = document.getElementById('scratchpad-list');
    if (!container) return;
    if (!notes || notes.length === 0) {
        container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; text-align: center; padding: 10px;">Scratchpad empty.</div>';
        return;
    }
    container.innerHTML = notes.map(n => `
        <div style="background: var(--bg-abyss); border: 1px solid var(--border-iron); border-radius: 4px; padding: 8px; margin-bottom: 6px; font-size: 0.8rem;">
            <div style="display:flex; justify-content:space-between; color: var(--gold-amber); font-weight:bold; font-size: 0.75rem; margin-bottom: 4px;">
                <span>${n.date} ${n.timestamp}</span>
                <span>Round ${n.round}</span>
            </div>
            <div style="line-height:1.4; color: var(--text-main); white-space: pre-wrap;">${n.text}</div>
        </div>
    `).join('');
}
