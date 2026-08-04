// --- LEGACY SOUND TRIGGER NO-OP STUB ---
window.triggerSound = function() {};

// --- PROCEDURAL HAZARDS/TRAPS ROLLER ---
window.generateRandomHazard = async function() {
    const container = document.getElementById('trap-display-box');
    if (!container) return;

    try {
        const response = await fetch('/api/hazards/generate');
        const data = await response.json();
        lastRolledHazardRef = data;

        container.innerHTML = `
            <div style="font-weight: bold; color: var(--crimson-rage); font-size: 0.85rem; border-bottom: 1px dashed var(--border-iron); padding-bottom: 3px; margin-bottom: 5px;">${data.name} (DC ${data.dc})</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 3px;"><strong>Trigger:</strong> ${data.trigger}</div>
            <div style="font-size: 0.75rem; color: var(--text-main); line-height: 1.3;"><strong>Effect:</strong> ${data.effect}</div>
            <button class="btn-primary" style="margin-top: 6px; padding: 2px 6px; font-size: 0.7rem; background: var(--arcane-violet);" onclick="addHazardToCombatBoard()">Add to Initiative</button>
        `;
    } catch (err) {
        container.innerHTML = '<span class="empty-state">Failed to roll hazard trap block.</span>';
    }
};

window.addHazardToCombatBoard = function() {
    if (!lastRolledHazardRef) return;

    pushToUndoStack();
    const hazard = {
        id: 'hazard_' + Date.now(),
        name: lastRolledHazardRef.name,
        maxHp: 1, // Hazards have negligible flat HP blocks
        ac: 10,
        currentDamage: 0,
        isFuckedUp: false,
        isDefeated: false,
        initiative: 10, // Default active hazard initiative tier
        art: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?q=80&w=200",
        type: "hazard"
    };

    activeEncounter.push(hazard);
    renderCombatTracker();
    broadcastToPlayers();
};

// --- RULES QUICK-REFERENCE SEARCH PANEL ---
window.openImprovCheatSheet = async function() {
    const modal = document.getElementById('improv-modal');
    modal.classList.remove('hidden');
    
    // Fetch rules references dynamically
    try {
        const response = await fetch('/api/reference/rules_reference');
        const data = await response.json();
        window.loadedRulesRef = data;
        filterRulesReferenceList();
    } catch(e) {}

    // Fetch improvised damage severity table matrix
    try {
        const response = await fetch('/api/improv');
        const matrix = await response.json();
        const tbody = document.getElementById('improv-table-body');
        if (tbody) {
            tbody.innerHTML = matrix.map(row => `
                <tr style="border-bottom: 1px solid var(--border-iron);">
                    <td style="padding: 8px; color: var(--arcane-violet); font-weight: bold;">${row.level}</td>
                    <td style="padding: 8px; color: var(--text-main);">${row.setback}</td>
                    <td style="padding: 8px; color: var(--gold-amber);">${row.moderate}</td>
                    <td style="padding: 8px; color: #f97316;">${row.dangerous}</td>
                    <td style="padding: 8px; color: var(--crimson-rage); font-weight: bold;">${row.deadly}</td>
                </tr>
            `).join('');
        }
    } catch(e) {
        console.error("Failed to load improvised damage table.", e);
    }
};

window.filterRulesReferenceList = function() {
    const query = document.getElementById('rules-search-input').value.toLowerCase().trim();
    const container = document.getElementById('rules-search-results');
    if (!container || !window.loadedRulesRef) return;

    container.innerHTML = '';
    Object.keys(window.loadedRulesRef).forEach(key => {
        const item = window.loadedRulesRef[key];
        if (!query || item.title.toLowerCase().includes(query) || item.description.toLowerCase().includes(query)) {
            const block = document.createElement('div');
            block.style.cssText = "background: var(--bg-abyss); border: 1px solid var(--border-iron); border-radius: 6px; padding: 12px; margin-bottom: 10px;";
            
            // Render basic markdown formatting inside reference bodies
            const formattedDesc = item.description
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br>');

            block.innerHTML = `
                <h3 style="font-family:'Cinzel', serif; color: var(--arcane-violet); font-size: 1.1rem; margin: 0 0 6px 0; border-bottom: 1px solid var(--border-iron); padding-bottom: 2px;">${item.title}</h3>
                <div style="font-size: 0.85rem; line-height: 1.45; color: var(--text-main);">${formattedDesc}</div>
            `;
            container.appendChild(block);
        }
    });
};
