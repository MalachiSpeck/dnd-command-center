// --- COMBAT CARD RENDER LOGIC WITH STATUS BADGES & LEGENDARY PIP TRACKER ---
function renderCombatTracker() {
    const initList = document.getElementById('initiative-list');
    if (!initList) return;

    if (activeEncounter.length === 0) {
        initList.innerHTML = '<p class="empty-state">The battlefield is quiet.</p>';
        return;
    }
    initList.innerHTML = ''; 
    
    activeEncounter.forEach((combatant, idx) => {
        const card = document.createElement('div');
        card.style.cssText = 'background-color: #1a1a24; border: 1px solid var(--border-iron); border-radius: 6px; padding: 12px; margin-bottom: 8px; display: flex; flex-direction: column; transition: all 0.3s;';
        
        if (idx === activeCombatIndex) {
            card.style.borderColor = 'var(--arcane-violet)';
            card.style.backgroundColor = '#1e1b2e';
            card.style.transform = 'scale(1.01)';
        }
        
        let statusTag = '';
        if (combatant.isDefeated) {
            statusTag = `<span style="color: #6b7280; font-weight: bold; font-size: 0.75rem; margin-left: 8px; border: 1px solid #4b5563; padding: 1px 4px; border-radius: 3px;">DEFEATED</span>`;
            card.style.opacity = '0.45';
            card.style.borderColor = 'var(--border-iron)';
        } else if (combatant.isFuckedUp) {
            statusTag = `<span style="color: var(--crimson-rage); font-weight: bold; font-size: 0.75rem; margin-left: 8px; border: 1px solid var(--crimson-rage); padding: 1px 4px; border-radius: 3px;">FUCKED UP</span>`;
            card.style.borderColor = 'var(--crimson-rage)';
        }
        
        // Render Active Conditions badges on cards
        let conditionBadgesHtml = '';
        const standardConditions = ['Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious'];
        
        conditionBadgesHtml += `<div style="display:flex; gap: 4px; flex-wrap:wrap; margin-top: 6px;">`;
        standardConditions.forEach(cond => {
            const hasCond = combatant.conditions?.includes(cond);
            const foundRef = window.conditionsReferenceCache ? window.conditionsReferenceCache.find(r => r.name.toLowerCase() === cond.toLowerCase()) : null;
            const desc = foundRef ? foundRef.description : '';
            conditionBadgesHtml += `
                <span title="${desc}" style="font-size: 0.65rem; padding: 1px 5px; border-radius: 3px; cursor: pointer; border: 1px solid; border-color: ${hasCond ? 'var(--arcane-violet)' : '#444'}; color: ${hasCond ? 'white' : '#777'}; background: ${hasCond ? 'var(--arcane-violet)' : '#0f0f13'}; transition: all 0.2s;" onclick="toggleConditionBadge('${combatant.id}', '${cond}')">${cond}</span>
            `;
        });
        conditionBadgesHtml += `</div>`;

        // Render Boss legendary actions/resistances pip rows
        let legendaryPipsHtml = '';
        if (combatant.type === 'monster') {
            const lrCount = combatant.legendary_resistances || 0;
            const laCount = combatant.legendary_actions || 0;
            
            if (lrCount > 0 || laCount > 0) {
                legendaryPipsHtml += `<div style="display:flex; gap:12px; margin-top: 8px; font-size: 0.75rem; border-top: 1px solid #333; padding-top: 6px;">`;
                if (lrCount > 0) {
                    legendaryPipsHtml += `<div><strong>Resistances:</strong> `;
                    for (let i = 1; i <= lrCount; i++) {
                        legendaryPipsHtml += `<span style="cursor:pointer; color:#ef4444;" onclick="toggleBossPip('${combatant.id}', 'resistance', ${i})">●</span>`;
                    }
                    legendaryPipsHtml += `</div>`;
                }
                if (laCount > 0) {
                    legendaryPipsHtml += `<div><strong>Actions:</strong> `;
                    for (let i = 1; i <= laCount; i++) {
                        legendaryPipsHtml += `<span style="cursor:pointer; color:#fbbf24;" onclick="toggleBossPip('${combatant.id}', 'action', ${i})">●</span>`;
                    }
                    legendaryPipsHtml += `</div>`;
                }
                legendaryPipsHtml += `</div>`;
            }
        }

        // Render Death saves tracking checkbox grids for downed PCs
        let deathSavesHtml = '';
        if (combatant.type === 'player' && combatant.isDefeated) {
            const successes = combatant.deathSaves?.successes || 0;
            const failures = combatant.deathSaves?.failures || 0;
            
            deathSavesHtml += `
                <div style="background: #2a1111; border: 1px solid var(--crimson-rage); padding: 8px; border-radius: 4px; margin-top: 8px; font-size: 0.75rem;">
                    <div style="font-weight:bold; color:var(--crimson-rage); margin-bottom: 4px;">DOWNED / DEATH SAVES:</div>
                    <div style="display:flex; gap:15px;">
                        <div>
                            Successes: 
                            <span style="cursor:pointer; color:${successes >= 1 ? '#22c55e' : '#666'}" onclick="togglePCDeathSave('${combatant.id}', 'success', 1)">●</span>
                            <span style="cursor:pointer; color:${successes >= 2 ? '#22c55e' : '#666'}" onclick="togglePCDeathSave('${combatant.id}', 'success', 2)">●</span>
                            <span style="cursor:pointer; color:${successes >= 3 ? '#22c55e' : '#666'}" onclick="togglePCDeathSave('${combatant.id}', 'success', 3)">●</span>
                        </div>
                        <div>
                            Failures: 
                            <span style="cursor:pointer; color:${failures >= 1 ? '#ef4444' : '#666'}" onclick="togglePCDeathSave('${combatant.id}', 'failure', 1)">●</span>
                            <span style="cursor:pointer; color:${failures >= 2 ? '#ef4444' : '#666'}" onclick="togglePCDeathSave('${combatant.id}', 'failure', 2)">●</span>
                            <span style="cursor:pointer; color:${failures >= 3 ? '#ef4444' : '#666'}" onclick="togglePCDeathSave('${combatant.id}', 'failure', 3)">●</span>
                        </div>
                    </div>
                </div>
            `;
        }

        // Render concentration toggles status
        const isConcentrating = combatant.concentratingSpell;

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <div style="display: flex; align-items: center; gap: 10px; cursor: pointer; flex: 1;" onclick="openMonsterStatBlockModal('${combatant.id}', '${combatant.name}', '${combatant.type}')">
                    <input type="number" placeholder="Init" value="${combatant.initiative || ''}" onchange="updateInitiative('${combatant.id}', this.value)" onclick="event.stopPropagation()" style="width: 45px; padding: 4px; background: var(--shadow-card); color: #fbbf24; font-weight: bold; text-align: center; border: 1px solid var(--border-iron); border-radius: 4px; font-size: 0.85rem;">
                    <div>
                        <h3 style="margin: 0; color: var(--arcane-violet); font-family: 'Inter', sans-serif; font-size: 0.95rem;">${combatant.name} ${statusTag}</h3>
                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 3px;">HP: <span style="color: white; font-weight: bold;">${Math.max(0, (parseInt(combatant.maxHp,10) || 10) - combatant.currentDamage)}</span> / ${combatant.maxHp} (AC: ${combatant.ac || '--'})</div>
                    </div>
                </div>
                <div style="display: flex; gap: 5px; align-items: center;">
                    <button class="btn-primary" style="padding: 4px 6px; font-size: 0.7rem; background: ${isConcentrating ? 'var(--gold-amber)' : '#4b5563'}; color: ${isConcentrating ? 'black' : 'white'};" onclick="toggleConcentration('${combatant.id}')">Conc</button>
                    <input type="number" id="dmg-input-${combatant.id}" placeholder="Amt" style="width: 50px; padding: 4px; background: var(--bg-abyss); color: white; border: 1px solid var(--border-iron); border-radius: 4px; font-size: 0.8rem;">
                    <button class="btn-danger" style="padding: 4px 8px; font-size: 0.75rem;" onclick="applyDamage('${combatant.id}')">Hit</button>
                    <button class="btn-primary" style="padding: 4px 8px; font-size: 0.75rem; background:#22c55e;" onclick="applyHealing('${combatant.id}')">Heal</button>
                    <button class="btn-danger" style="padding: 4px 8px; font-size: 0.75rem; background:#ef4444;" onclick="removeCombatant('${combatant.id}')">X</button>
                </div>
            </div>
            ${deathSavesHtml}
            ${legendaryPipsHtml}
            ${conditionBadgesHtml}
        `;
        initList.appendChild(card);
    });
}

window.updateInitiative = function(id, val) {
    const combatant = activeEncounter.find(m => m.id === id);
    if (combatant) {
        combatant.initiative = parseInt(val) || 0;
        broadcastToPlayers();
    }
};

window.sortInitiative = function() {
    activeEncounter.sort((a, b) => b.initiative - a.initiative);
    renderCombatTracker();
    broadcastToPlayers();
};

window.conditionsReferenceCache = [];

window.loadConditionsReference = async function() {
    try {
        const response = await fetch('/api/reference/conditions');
        window.conditionsReferenceCache = await response.json();
    } catch(e) {
        console.error("Failed to load conditions list.", e);
    }
};

window.openConditionsCompendium = async function() {
    const modal = document.getElementById('conditions-compendium-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    
    if (!window.conditionsReferenceCache || window.conditionsReferenceCache.length === 0) {
        await window.loadConditionsReference();
    }
    
    window.filterConditionsCompendiumList();
};

window.filterConditionsCompendiumList = function() {
    const query = document.getElementById('conditions-search-input').value.toLowerCase().trim();
    const container = document.getElementById('conditions-search-results');
    if (!container || !window.conditionsReferenceCache) return;

    container.innerHTML = '';
    window.conditionsReferenceCache.forEach(cond => {
        if (!query || cond.name.toLowerCase().includes(query) || cond.description.toLowerCase().includes(query)) {
            const block = document.createElement('div');
            block.style.cssText = "background: var(--bg-abyss); border: 1px solid var(--border-iron); border-radius: 6px; padding: 12px;";
            block.innerHTML = `
                <h3 style="font-family:'Cinzel', serif; color: var(--arcane-violet); font-size: 1.1rem; margin: 0 0 6px 0; border-bottom: 1px solid var(--border-iron); padding-bottom: 2px;">${cond.name}</h3>
                <div style="font-size: 0.85rem; line-height: 1.45; color: var(--text-main);">${cond.description}</div>
            `;
            container.appendChild(block);
        }
    });
};
