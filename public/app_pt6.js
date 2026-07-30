// --- KEYBOARD SHORTCUTS & SYSTEM HOTKEYS ---
function setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
        const inInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.contentEditable === 'true';
        
        // Space advances active combat turn index
        if (e.code === 'Space' && !inInput) {
            e.preventDefault();
            advanceTurnIndex();
        }
        // Escape closes any active visible modal or popout drawer
        if (e.key === 'Escape') {
            const modals = document.querySelectorAll('.modal-overlay');
            modals.forEach(m => m.classList.add('hidden'));
            
            const drawers = document.querySelectorAll('.drawer');
            drawers.forEach(d => d.classList.remove('open'));
        }
        // Ctrl+K opens rules search compendium
        if (e.ctrlKey && e.key === 'k') {
            e.preventDefault();
            openImprovCheatSheet();
        }
        // Ctrl+Z triggers undo stack action
        if (e.ctrlKey && e.key === 'z') {
            e.preventDefault();
            triggerUndoAction();
        }
        // N opens spawn monster modal
        if (e.key.toLowerCase() === 'n' && !inInput && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            openSpawnMonsterMenu();
        }
        // S sorts initiative
        if (e.key.toLowerCase() === 's' && !inInput && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            if (window.sortInitiative) window.sortInitiative();
        }
        // ? toggles shortcuts modal
        if (e.key === '?' && !inInput) {
            e.preventDefault();
            toggleShortcutsHelpModal();
        }
    });

    // Create floating help button and modal dynamically
    createFloatingHelpButtonAndModal();
}

function toggleShortcutsHelpModal() {
    const modal = document.getElementById('shortcuts-help-modal');
    if (modal) {
        modal.classList.toggle('hidden');
    }
}

function createFloatingHelpButtonAndModal() {
    // Floating Help Button
    const btn = document.createElement('div');
    btn.id = 'shortcuts-help-floating-btn';
    btn.style.cssText = "position: fixed; bottom: 20px; left: 20px; width: 36px; height: 36px; border-radius: 50%; background: var(--arcane-violet); color: white; display: flex; align-items: center; justify-content: center; font-family: 'Cinzel', serif; font-size: 1.2rem; font-weight: bold; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.5); z-index: 9999; border: 1px solid var(--border-iron); user-select: none; transition: transform 0.2s;";
    btn.innerText = "?";
    btn.onclick = toggleShortcutsHelpModal;
    btn.onmouseover = () => btn.style.transform = 'scale(1.1)';
    btn.onmouseout = () => btn.style.transform = 'scale(1)';
    document.body.appendChild(btn);

    // Help Modal Overlay
    const modal = document.createElement('div');
    modal.id = 'shortcuts-help-modal';
    modal.className = 'modal-overlay hidden';
    modal.style.cssText = "z-index: 10000;";
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px; background: #14141d; border: 2px solid var(--border-iron); border-radius: 8px; padding: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.8); position: relative;">
            <h2 style="font-family: 'Cinzel', serif; color: var(--arcane-violet); font-size: 1.4rem; margin-top: 0; border-bottom: 1px solid var(--border-iron); padding-bottom: 8px; margin-bottom: 15px;">Keyboard Shortcuts</h2>
            <div style="display: flex; flex-direction: column; gap: 10px; font-size: 0.9rem; color: var(--text-main);">
                <div style="display:flex; justify-content:space-between;"><span style="color:#fbbf24; font-weight:bold;">Space</span> <span>Next Turn</span></div>
                <div style="display:flex; justify-content:space-between;"><span style="color:#fbbf24; font-weight:bold;">Escape</span> <span>Close Modal / Drawer</span></div>
                <div style="display:flex; justify-content:space-between;"><span style="color:#fbbf24; font-weight:bold;">Ctrl + K</span> <span>Open Rules Reference</span></div>
                <div style="display:flex; justify-content:space-between;"><span style="color:#fbbf24; font-weight:bold;">Ctrl + Z</span> <span>Undo Last Damage/Action</span></div>
                <div style="display:flex; justify-content:space-between;"><span style="color:#fbbf24; font-weight:bold;">N</span> <span>Spawn Monster Menu</span></div>
                <div style="display:flex; justify-content:space-between;"><span style="color:#fbbf24; font-weight:bold;">S</span> <span>Sort Initiative List</span></div>
                <div style="display:flex; justify-content:space-between;"><span style="color:#fbbf24; font-weight:bold;">?</span> <span>Toggle This Cheat Sheet</span></div>
            </div>
            <button class="btn-danger" style="margin-top: 20px; width: 100%; font-family: 'Cinzel';" onclick="document.getElementById('shortcuts-help-modal').classList.add('hidden')">Close</button>
        </div>
    `;
    document.body.appendChild(modal);
}

// --- NPC GENERATOR SOURCED FROM npc_tables.json ---
window.generateRandomNPC = async function() {
    const container = document.getElementById('npc-display-box');
    if (!container) return;

    try {
        const res = await fetch('/api/reference/npc_tables');
        const data = await res.json();

        // Roll names from nested tables
        const families = ['A', 'B', 'C'];
        const familyLetter = families[Math.floor(Math.random() * families.length)];
        const nameList = data[familyLetter];
        const name = nameList[Math.floor(Math.random() * nameList.length)];

        const quirk = data.quirks[Math.floor(Math.random() * data.quirks.length)];
        const voice = data.voices[Math.floor(Math.random() * data.voices.length)];
        const motivation = data.motivations[Math.floor(Math.random() * data.motivations.length)];

        container.innerHTML = `
            <div style="font-weight: bold; color: var(--arcane-violet); font-size: 0.95rem; font-family: 'Cinzel', serif;">${name}</div>
            <div style="font-size: 0.8rem; margin-top: 4px; color: var(--text-main); line-height: 1.35;">
                <strong>Voice:</strong> ${voice}<br>
                <strong>Quirk:</strong> ${quirk}<br>
                <strong>Motivation:</strong> ${motivation}
            </div>
        `;
    } catch (e) {
        container.innerHTML = '<span style="color:var(--crimson-rage);">Failed to load NPC generation tables.</span>';
    }
};

// --- LOOT & TREASURE GENERATOR SOURCED FROM DMG ---
window.rollRandomTreasure = async function() {
    const tier = document.getElementById('treasure-tier-select').value;
    const isHoard = document.getElementById('treasure-type-select').value === 'hoard';
    const container = document.getElementById('treasure-results-box');
    if (!container) return;

    try {
        const res = await fetch('/api/reference/treasure_tables');
        const tables = await res.json();

        const tableGroup = isHoard ? tables.hoards : tables.individual;
        const rolls = tableGroup[tier];
        
        if (!rolls) {
            container.innerHTML = '<span style="color: var(--text-muted);">No tables defined for this range yet.</span>';
            return;
        }

        const rolledOutcome = rolls[Math.floor(Math.random() * rolls.length)];
        container.innerHTML = `
            <div style="font-weight: bold; color: var(--gold-amber); font-size: 0.85rem; text-transform: uppercase;">Rolled ${rolledOutcome.roll}:</div>
            <div style="font-size: 0.8rem; margin-top: 4px; line-height: 1.4; color: var(--text-main);">${rolledOutcome.loot}</div>
        `;
    } catch (e) {
        container.innerHTML = '<span style="color:var(--crimson-rage);">Failed to roll treasure charts.</span>';
    }
};

// --- DATA EXPORT BACKUP ARCHIVE STREAM ---
window.triggerCampaignDataBackup = function() {
    window.location.href = '/api/campaign/export';
};
