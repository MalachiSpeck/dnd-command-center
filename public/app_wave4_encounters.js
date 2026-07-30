// --- RANDOM ENCOUNTER GENERATOR (WAVE 4 SUBSYSTEM) ---
// Scoped around C:\Users\mattm\Desktop\dnd-command-center\data\encounters.json

window.loadedEncountersRef = null;
window.currentEncounterResultCreatures = [];

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    loadEncountersDatabase();
});

// Load the encounters reference database from the API reference router
window.loadEncountersDatabase = async function() {
    try {
        const response = await fetch('/api/reference/encounters');
        const data = await response.json();
        
        // Structure from encounters.json: { "encounter": [ { "name": "Arctic", ... } ] }
        if (data && data.encounter) {
            window.loadedEncountersRef = data.encounter;
            populateEncounterAreaDropdown();
        } else {
            console.error("Encounters data structure invalid or empty.");
        }
    } catch (e) {
        console.error("Failed to load encounters.json reference:", e);
    }
};

// Populate the Area (Environment) dropdown
function populateEncounterAreaDropdown() {
    const areaSelect = document.getElementById('encounter-area-select');
    if (!areaSelect || !window.loadedEncountersRef) return;

    // Clear and keep first option
    areaSelect.innerHTML = '<option value="">-- Select Environment --</option>';

    // Sort alphabetically
    const sortedAreas = [...window.loadedEncountersRef].sort((a, b) => a.name.localeCompare(b.name));

    sortedAreas.forEach(area => {
        const option = document.createElement('option');
        option.value = area.name;
        option.innerText = area.name;
        areaSelect.appendChild(option);
    });
}

// Triggered when Environment / Area changes
window.onEncounterAreaChange = function() {
    const areaSelect = document.getElementById('encounter-area-select');
    const minLvlSelect = document.getElementById('encounter-minlvl-select');
    const maxLvlSelect = document.getElementById('encounter-maxlvl-select');
    
    if (!areaSelect || !minLvlSelect || !maxLvlSelect) return;

    // Reset dropdowns
    minLvlSelect.innerHTML = '<option value="">-- Min Lvl --</option>';
    maxLvlSelect.innerHTML = '<option value="">-- Max Lvl --</option>';

    const areaName = areaSelect.value;
    if (!areaName || !window.loadedEncountersRef) return;

    const areaData = window.loadedEncountersRef.find(a => a.name === areaName);
    if (!areaData || !areaData.tables) return;

    // Gather unique minlvl and maxlvl from tables
    const minLvls = new Set();
    const maxLvls = new Set();

    areaData.tables.forEach(t => {
        if (t.minlvl !== undefined) minLvls.add(t.minlvl);
        if (t.maxlvl !== undefined) maxLvls.add(t.maxlvl);
    });

    // Populate min lvl
    Array.from(minLvls).sort((a, b) => a - b).forEach(lvl => {
        const opt = document.createElement('option');
        opt.value = lvl;
        opt.innerText = `Level ${lvl}`;
        minLvlSelect.appendChild(opt);
    });

    // Populate max lvl
    Array.from(maxLvls).sort((a, b) => a - b).forEach(lvl => {
        const opt = document.createElement('option');
        opt.value = lvl;
        opt.innerText = `Level ${lvl}`;
        maxLvlSelect.appendChild(opt);
    });

    // Auto-select first available tier to be helpful
    if (areaData.tables.length > 0) {
        const firstTable = areaData.tables[0];
        minLvlSelect.value = firstTable.minlvl;
        maxLvlSelect.value = firstTable.maxlvl;
    }
};

// Triggered when manual level selections are edited
window.onEncounterLevelChange = function() {
    // We can validate if a matching table exists, or warn the user.
    const areaSelect = document.getElementById('encounter-area-select');
    const minLvlSelect = document.getElementById('encounter-minlvl-select');
    const maxLvlSelect = document.getElementById('encounter-maxlvl-select');

    if (!areaSelect || !minLvlSelect || !maxLvlSelect || !window.loadedEncountersRef) return;

    const areaName = areaSelect.value;
    if (!areaName) return;

    const areaData = window.loadedEncountersRef.find(a => a.name === areaName);
    if (!areaData) return;

    const minlvl = parseInt(minLvlSelect.value, 10);
    const maxlvl = parseInt(maxLvlSelect.value, 10);

    if (isNaN(minlvl) || isNaN(maxlvl)) return;

    // Check if matching level-tier table exists
    const exactMatch = areaData.tables.find(t => t.minlvl === minlvl && t.maxlvl === maxlvl);
    if (!exactMatch) {
        // If not found, highlight in subtle warning border but don't force restrict, let's look for partial overlap
        minLvlSelect.style.borderColor = '#ef4444';
        maxLvlSelect.style.borderColor = '#ef4444';
    } else {
        minLvlSelect.style.borderColor = 'var(--border-iron)';
        maxLvlSelect.style.borderColor = 'var(--border-iron)';
    }
};

// Roll the random d100 encounter behind the scenes and highlight the matching result
window.rollRandomEncounter = function() {
    const areaSelect = document.getElementById('encounter-area-select');
    const minLvlSelect = document.getElementById('encounter-minlvl-select');
    const maxLvlSelect = document.getElementById('encounter-maxlvl-select');
    const resultBox = document.getElementById('encounter-roll-result-box');
    const rollBadge = document.getElementById('encounter-roll-badge');
    const rollRange = document.getElementById('encounter-roll-range');
    const rollText = document.getElementById('encounter-roll-text');
    const spawnContainer = document.getElementById('encounter-spawn-action-container');

    if (!areaSelect || !minLvlSelect || !maxLvlSelect || !resultBox || !rollBadge || !rollRange || !rollText || !spawnContainer) return;

    const areaName = areaSelect.value;
    if (!areaName) {
        alert("Please select an Environment / Area first.");
        return;
    }

    const minlvl = parseInt(minLvlSelect.value, 10);
    const maxlvl = parseInt(maxLvlSelect.value, 10);

    if (isNaN(minlvl) || isNaN(maxlvl)) {
        alert("Please select level ranges to filter the tables.");
        return;
    }

    const areaData = window.loadedEncountersRef.find(a => a.name === areaName);
    if (!areaData) return;

    // Find the closest level tier table if exact match is not found
    let targetTable = areaData.tables.find(t => t.minlvl === minlvl && t.maxlvl === maxlvl);
    if (!targetTable) {
        // Find overlaps or exact minlvl
        targetTable = areaData.tables.find(t => t.minlvl === minlvl) || areaData.tables[0];
    }

    if (!targetTable || !targetTable.table || targetTable.table.length === 0) {
        alert(`No encounter table found for ${areaName} at Levels ${minlvl}-${maxlvl}.`);
        return;
    }

    // Roll d100 behind the scenes
    const roll = Math.floor(Math.random() * 100) + 1;

    // Find matching encounter row in the table
    const encounterItem = targetTable.table.find(item => roll >= item.min && roll <= item.max);
    if (!encounterItem) {
        alert(`Could not find a table entry matching d100 roll of ${roll}.`);
        return;
    }

    // Display the results with animation
    resultBox.style.display = 'flex';
    resultBox.style.animation = 'pulse 0.3s ease-in-out';
    rollBadge.innerText = `Rolled: ${roll}`;
    rollRange.innerText = `Range: ${encounterItem.min} - ${encounterItem.max}`;

    // Parse links to bestiary inside the rolled result
    const rawResultText = encounterItem.result || '';
    const parsedHtml = parseEncounterResultCreatures(rawResultText);
    rollText.innerHTML = parsedHtml;

    // Extract creatures with quantities to spawn
    window.currentEncounterResultCreatures = getCreaturesWithQuantities(rawResultText);

    // Build spawn action buttons
    spawnContainer.innerHTML = '';
    if (window.currentEncounterResultCreatures.length > 0) {
        const creaturesSummary = window.currentEncounterResultCreatures.map(c => `${c.qtyFormula}x ${c.name}`).join(', ');
        
        const btn = document.createElement('button');
        btn.className = 'btn-primary';
        btn.style.cssText = 'background: #10b981; color: white; width: 100%; padding: 8px; font-weight: bold; font-size: 0.85rem; margin-top: 6px;';
        btn.innerHTML = ` Spawn Into Initiative (${creaturesSummary})`;
        btn.onclick = () => spawnEncounterMonstersToTracker();
        spawnContainer.appendChild(btn);
    } else {
        // Pure narrative event
        const notice = document.createElement('div');
        notice.style.cssText = 'color: var(--text-muted); font-size: 0.8rem; text-align: center; font-style: italic; margin-top: 4px;';
        notice.innerText = "No monsters detected. (Narrative / Flavor Event)";
        spawnContainer.appendChild(notice);
    }

    logCombatAction(`[Random Encounter] Rolled d100 on ${areaName} (Lvls ${targetTable.minlvl}-${targetTable.maxlvl}): got ${roll} (${rawResultText.substring(0, 60)}...)`);
};

// Formats result strings by translating 5etools creature tags into beautiful, clickable links
function parseEncounterResultCreatures(text) {
    if (!text) return '';

    // Convert generic {@dice ...} formulas to styled items
    text = text.replace(/\{@dice ([^}]+)\}/g, (match, formula) => {
        const parts = formula.split('|');
        return `<strong style="color: #fbbf24; font-family: monospace;">${parts[0]}</strong>`;
    });

    // Parse {@creature canonical_name|source|display_name} or {@creature canonical_name||display_name}
    return text.replace(/\{@creature ([^}]+)\}/g, (match, contents) => {
        const parts = contents.split('|');
        const canonicalName = parts[0].trim();
        
        let displayName = canonicalName;
        if (parts.length > 2 && parts[2]) {
            displayName = parts[2].trim();
        }
        
        const doublePipeMatch = contents.match(/^([^|]+)\|\|([^|]+)$/);
        if (doublePipeMatch) {
            displayName = doublePipeMatch[2].trim();
        }

        const escapedCanonicalName = canonicalName.replace(/'/g, "\\'");
        // Return a clickable link that opens the statblock directly
        return `<a href="#" class="creature-compendium-link" onclick="event.preventDefault(); openMonsterByName('${escapedCanonicalName}')" style="color: #a78bfa; font-weight: bold; text-decoration: underline; cursor: pointer; transition: color 0.15s ease;">${displayName}</a>`;
    });
}

// Global click helper to bind directly to links in HTML strings
window.openMonsterByName = function(name) {
    if (typeof openMonsterStatBlockModal === 'function') {
        openMonsterStatBlockModal(null, name, 'monster');
    } else {
        alert(`Stat Block view for ${name} not available in this window context.`);
    }
};

// Extract creatures and quantity strings preceding them
function getCreaturesWithQuantities(text) {
    const list = [];
    const creatureRegex = /\{@creature ([^}]+)\}/g;
    let match;
    const matches = [];

    while ((match = creatureRegex.exec(text)) !== null) {
        matches.push({
            content: match[1],
            index: match.index,
            fullMatch: match[0]
        });
    }

    for (let i = 0; i < matches.length; i++) {
        const m = matches[i];
        const canonicalName = m.content.split('|')[0].trim();

        // Get preceding text up to the start of this block or the end of the previous block
        const start = i === 0 ? 0 : matches[i-1].index + matches[i-1].fullMatch.length;
        const precedingText = text.substring(start, m.index).trim();

        let qtyStr = "1"; // Default quantity fallback

        // Look for dice patterns like "2d8", "1d3", "1", "3d4", "1d4+3"
        // Also support standard {@dice 1d4} patterns
        const diceMatch = precedingText.match(/(?:\{@dice\s+)?(\d+d\d+(?:\s*[-+]\d+)?|\d+)(?:\s*\})?/i);
        if (diceMatch) {
            qtyStr = diceMatch[1].trim();
        }

        list.push({
            name: canonicalName,
            qtyFormula: qtyStr
        });
    }

    return list;
}

// Helper rolls dice formulas like "1d6+3", "2d8", etc. and returns integer quantity
function rollQuantityFormula(formula) {
    formula = formula.trim().toLowerCase();
    
    // Raw integer
    if (/^\d+$/.test(formula)) {
        return parseInt(formula, 10);
    }

    // Dice syntax
    const match = formula.match(/(\d+)d(\d+)(?:\s*([-+]\d+))?/);
    if (match) {
        const qty = parseInt(match[1], 10);
        const size = parseInt(match[2], 10);
        const mod = parseInt(match[3] || 0, 10);

        let sum = 0;
        for (let i = 0; i < qty; i++) {
            sum += Math.floor(Math.random() * size) + 1;
        }
        return sum + mod;
    }

    return 1; // Default fallback
}

// Roll quantities for detected monsters and add them to the initiative tracker
window.spawnEncounterMonstersToTracker = async function() {
    if (!window.currentEncounterResultCreatures || window.currentEncounterResultCreatures.length === 0) {
        alert("No creatures detected in this encounter result to spawn.");
        return;
    }

    if (typeof pushToUndoStack === 'function') pushToUndoStack();

    let totalSpawned = 0;

    for (const creature of window.currentEncounterResultCreatures) {
        const finalQty = rollQuantityFormula(creature.qtyFormula);
        
        if (finalQty > 0) {
            if (typeof spawnMultiMonsters === 'function') {
                await spawnMultiMonsters(creature.name, finalQty);
                totalSpawned += finalQty;
            } else {
                console.error("spawnMultiMonsters function is not accessible globally.");
                alert("Initiative tracker spawn engine not loaded.");
                return;
            }
        }
    }

    if (totalSpawned > 0) {
        // Redraw active encounter combat lists
        if (typeof renderCombatTracker === 'function') renderCombatTracker();
        if (typeof broadcastToPlayers === 'function') broadcastToPlayers();

        // Notify DM
        alert(`Successfully rolled quantities & spawned ${totalSpawned} monster(s) into the initiative tracker!`);
    }
};
