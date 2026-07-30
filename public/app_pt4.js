// --- ENCOUNTER PREP & SAVED ENCOUNTERS ---
async function loadSavedEncountersList() {
    const select = document.getElementById('bazaar-preset-select'); // Use existing select box if any, or separate dropdown
    // Let's draw saved encounters selector in top panel header or combat header
    try {
        const response = await fetch('/api/saved-encounters');
        const encounters = await response.json();
        const container = document.getElementById('saved-encounters-dropdown-container');
        if (!container) return;

        if (encounters.length === 0) {
            container.innerHTML = '<select disabled style="background:var(--bg-abyss); color:white; border:1px solid var(--border-iron); padding:4px; font-size:0.8rem; border-radius:4px;"><option>No Saved Encounters</option></select>';
            return;
        }

        let html = `<select id="saved-encounters-loader-select" style="background:var(--bg-abyss); color:white; border:1px solid var(--border-iron); padding:6px; font-size:0.8rem; border-radius:4px;" onchange="loadSavedEncounter(this.value)">`;
        html += '<option value="">-- Load Saved Encounter --</option>';
        encounters.forEach(enc => {
            html += `<option value="${enc.id}">${enc.name}</option>`;
        });
        html += '</select>';
        container.innerHTML = html;
    } catch(e) {}
}

window.loadSavedEncounter = async function(encounterId) {
    if (!encounterId) return;
    try {
        const response = await fetch('/api/saved-encounters');
        const encounters = await response.json();
        const target = encounters.find(e => e.id === encounterId);
        if (!target) return;

        pushToUndoStack();
        activeEncounter = [];

        // Spawn monsters individually from saved configuration
        for (const entry of target.monsters) {
            const monName = entry.name;
            const count = entry.count || 1;
            await spawnMultiMonsters(monName, count);
        }

        document.getElementById('saved-encounters-loader-select').value = '';
        renderCombatTracker();
        broadcastToPlayers();
    } catch (e) {
        console.error("Failed to load saved encounter:", e);
    }
};

window.saveCurrentEncounterPrep = async function() {
    const name = prompt("Enter a unique name for this Saved Encounter:");
    if (!name) return;

    // Build configuration schema
    const monsterSummary = {};
    activeEncounter.forEach(c => {
        if (c.type === 'monster') {
            const baseName = c.name.replace(/\s[A-Z]$/, ''); // strip alphabetical suffixes
            monsterSummary[baseName] = (monsterSummary[baseName] || 0) + 1;
        }
    });

    const monsters = Object.keys(monsterSummary).map(m => ({
        name: m,
        count: monsterSummary[m]
    }));

    if (monsters.length === 0) {
        alert("Encounter prep must contain at least one monster.");
        return;
    }

    try {
        await fetch('/api/saved-encounters/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, monsters })
        });
        alert("Encounter saved to campaign database successfully!");
        loadSavedEncountersList();
    } catch(e) {
        console.error(e);
    }
};

// --- MULTI-TARGET AOE DAMAGE ALLOCATOR ---
window.openAoEDamageAllocatorModal = function() {
    const modal = document.getElementById('aoe-allocator-modal');
    if (!modal) return;
    
    const container = document.getElementById('aoe-allocator-list');
    container.innerHTML = '';

    if (activeEncounter.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem; text-align:center;">No combatants on the field.</div>';
        modal.classList.remove('hidden');
        return;
    }

    activeEncounter.forEach(com => {
        const div = document.createElement('div');
        div.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 6px; border-bottom: 1px solid var(--border-iron); font-size: 0.85rem;";
        div.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px;">
                <input type="checkbox" class="aoe-allocator-check" data-id="${com.id}" checked style="cursor:pointer;">
                <span>${com.name}</span>
            </div>
            <div style="display:flex; gap:8px;">
                <label style="cursor:pointer;"><input type="radio" name="save-fail-${com.id}" value="fail" checked style="cursor:pointer;"> Hit</label>
                <label style="cursor:pointer;"><input type="radio" name="save-fail-${com.id}" value="save" style="cursor:pointer;"> Saved (Half)</label>
            </div>
        `;
        container.appendChild(div);
    });

    modal.classList.remove('hidden');
};

window.applyAoEDamageBatch = function() {
    const damageAmt = parseInt(document.getElementById('aoe-allocator-damage').value) || 0;
    if (damageAmt <= 0) {
        alert("Please enter a valid damage amount.");
        return;
    }

    pushToUndoStack();

    const checkboxes = document.querySelectorAll('.aoe-allocator-check');
    checkboxes.forEach(cb => {
        if (cb.checked) {
            const id = cb.getAttribute('data-id');
            const saveRadio = document.querySelector(`input[name="save-fail-${id}"]:checked`);
            const isSaved = saveRadio ? saveRadio.value === 'save' : false;
            const finalDamage = isSaved ? Math.floor(damageAmt / 2) : damageAmt;
            
            const combatant = activeEncounter.find(c => c.id === id);
            if (combatant) {
                combatant.currentDamage += finalDamage;
                const maxHpNum = parseInt(combatant.maxHp, 10) || 10;
                
                if (combatant.currentDamage >= maxHpNum) {
                    combatant.isFuckedUp = false;
                    combatant.isDefeated = true;
                } else if (combatant.currentDamage >= (maxHpNum / 2)) {
                    combatant.isFuckedUp = true;
                    combatant.isDefeated = false;
                } else {
                    combatant.isFuckedUp = false;
                    combatant.isDefeated = false;
                }
            }
        }
    });

    document.getElementById('aoe-allocator-damage').value = '';
    document.getElementById('aoe-allocator-modal').classList.add('hidden');
    renderCombatTracker();
    broadcastToPlayers();
};
