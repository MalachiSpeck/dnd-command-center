// --- ATTENDANCE TRACKER & COMBAT ANALYTICS ---
let encounterAttendanceList = {}; // charID -> true/false

window.openAttendanceTrackerModal = function() {
    const modal = document.getElementById('attendance-tracker-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    renderAttendanceCheckboxes();
};

function renderAttendanceCheckboxes() {
    const container = document.getElementById('attendance-checkboxes-rows');
    if (!container) return;

    container.innerHTML = '';
    localPartyData.forEach(pc => {
        // Initialize default true
        if (encounterAttendanceList[pc.id] === undefined) {
            encounterAttendanceList[pc.id] = true;
        }

        const div = document.createElement('div');
        div.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border-iron); font-size:0.9rem;";
        div.innerHTML = `
            <span>${pc.name} (Lvl ${pc.level})</span>
            <input type="checkbox" ${encounterAttendanceList[pc.id] ? 'checked' : ''} onchange="togglePlayerAttendanceStatus('${pc.id}')" style="cursor:pointer; scale:1.2;">
        `;
        container.appendChild(div);
    });
}

window.togglePlayerAttendanceStatus = function(charId) {
    encounterAttendanceList[charId] = !encounterAttendanceList[charId];
    logCombatAction(`[Attendance] Player attendance changed: ${charId} set to ${encounterAttendanceList[charId]}`);
};

// Override addPartyToCombat block to respect attendance checks
function applyAttendanceFilterToCombatSpawning() {
    pushToUndoStack();
    activeEncounter = [];
    localPartyData.forEach(char => {
        const isPresent = encounterAttendanceList[char.id] !== false;
        if (isPresent) {
            activeEncounter.push({
                id: char.id,
                name: char.name,
                maxHp: char.hp,
                ac: char.ac,
                currentDamage: 0,
                isFuckedUp: false,
                isDefeated: false,
                initiative: 0,
                art: char.art,
                type: "player",
                conditions: [],
                deathSaves: { successes: 0, failures: 0 }
            });
        }
    });
    renderCombatTracker();
    broadcastToPlayers();
}

// --- RANDOM REGIONAL ENCOUNTERS TABLE ENGINE ---
window.rollRegionalDesertDesertRandomEncounter = function() {
    const container = document.getElementById('random-enc-roll-output');
    if (!container) return;

    fetch('/api/reference/random_tables')
        .then(res => res.json())
        .then(data => {
            const region = data[0]; // Desert region weighted array entries
            if (!region) return;

            const weightedList = [];
            region.entries.forEach(e => {
                for (let i = 0; i < e.weight; i++) {
                    weightedList.push(e.result);
                }
            });

            const rolledMonster = weightedList[Math.floor(Math.random() * weightedList.length)];
            container.innerHTML = `
                <div style="font-weight:bold; color:var(--crimson-rage);">Desert Danger Alert!</div>
                <div>Rolled: <strong>${rolledMonster}</strong></div>
                <button class="btn-primary" style="margin-top:6px; padding:3px 8px; font-size:0.75rem; background:var(--crimson-rage);" onclick="spawnMultiMonsters('${rolledMonster}', 1)">Spawn into Combat</button>
            `;
            logCombatAction(`[Random Encounter] Rolled Desert Table: Spawned ${rolledMonster}`);
        });
};
