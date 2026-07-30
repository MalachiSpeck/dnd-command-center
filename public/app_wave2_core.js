/* ========================================================
   DM COMMAND CENTER - ADVANCED MECHANICS WAVE 2 SPLIT MODS
   ======================================================== */

// --- GLOBAL FLAGS & SYSTEM DATA BASES ---
let isMoraleSystemEnabled = true;
let readiedActionsQueue = []; // { id, combatantId, triggerText, name }
let combatHistoryLogs = []; // Array of string actions for active session log
let lastEncounterStats = null; // cached metrics
let activeHandoutPath = null; // tracking active pushed player view graphic handout

// --- ADVANCED LAIR ACTION AUTO-INJECTOR ---
function checkAndInjectLairAction() {
    const hasBossWithLair = activeEncounter.some(c => c.type === 'monster' && c.hasLairActions);
    const lairExists = activeEncounter.some(c => c.id === 'lair_action_pseudo');
    
    if (hasBossWithLair && !lairExists) {
        pushToUndoStack();
        activeEncounter.push({
            id: 'lair_action_pseudo',
            name: 'LAIR ACTION',
            maxHp: 1,
            ac: 99,
            currentDamage: 0,
            initiative: 20, // acts on initiative count 20 (losing ties)
            type: 'lair_action',
            isDefeated: false,
            conditions: []
        });
        sortInitiative();
    } else if (!hasBossWithLair && lairExists) {
        pushToUndoStack();
        activeEncounter = activeEncounter.filter(c => c.id !== 'lair_action_pseudo');
        renderCombatTracker();
    }
}

// --- READIED ACTION SIDEBAR CONTROLLER ---
window.toggleReadiedActionPrompt = function(combatantId) {
    const com = activeEncounter.find(c => c.id === combatantId);
    if (!com) return;

    pushToUndoStack();
    if (com.readiedAction?.active) {
        // Dismiss and restore
        com.readiedAction = { active: false, trigger: '' };
        readiedActionsQueue = readiedActionsQueue.filter(q => q.combatantId !== combatantId);
    } else {
        const triggerPhrase = prompt("Enter trigger condition for Readied Action (e.g. 'When the door opens'):");
        if (triggerPhrase) {
            com.readiedAction = { active: true, trigger: triggerPhrase };
            readiedActionsQueue.push({
                id: 'ready_' + Date.now(),
                combatantId: com.id,
                triggerText: triggerPhrase,
                name: com.name
            });
            logCombatAction(`[Ready Action] ${com.name} readied an action: "${triggerPhrase}"`);
        }
    }
    renderCombatTracker();
    renderReadiedActionsSidebar();
    broadcastToPlayers();
};

window.triggerReadiedAction = function(combatantId) {
    const com = activeEncounter.find(c => c.id === combatantId);
    if (!com) return;

    pushToUndoStack();
    com.readiedAction = { active: false, trigger: '' };
    readiedActionsQueue = readiedActionsQueue.filter(q => q.combatantId !== combatantId);

    // Resolution injects them to active index immediately
    const targetIdx = activeEncounter.findIndex(c => c.id === combatantId);
    if (targetIdx !== -1) {
        activeCombatIndex = targetIdx;
    }
    
    logCombatAction(`[Trigger Action] ${com.name} triggered their readied action!`);
    renderCombatTracker();
    renderReadiedActionsSidebar();
    broadcastToPlayers();
};

function renderReadiedActionsSidebar() {
    const container = document.getElementById('readied-actions-container');
    if (!container) return;

    if (readiedActionsQueue.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted); font-size:0.75rem; text-align:center;">No readied actions queued.</div>';
        return;
    }

    container.innerHTML = '';
    readiedActionsQueue.forEach(item => {
        const block = document.createElement('div');
        block.style.cssText = "background: var(--shadow-card); border: 1px dashed var(--arcane-violet); border-radius: 4px; padding: 6px 10px; margin-bottom: 6px; font-size:0.75rem;";
        block.innerHTML = `
            <div style="font-weight:bold; color:var(--text-main);">${item.name}</div>
            <div style="color:var(--gold-amber); font-style:italic; margin-top:2px; font-size:0.7rem;">"${item.triggerText}"</div>
            <div style="display:flex; justify-content:flex-end; gap:5px; margin-top:4px;">
                <button class="btn-primary" style="padding:1px 5px; font-size:0.65rem;" onclick="triggerReadiedAction('${item.combatantId}')">Trigger!</button>
                <button class="btn-danger" style="padding:1px 5px; font-size:0.65rem;" onclick="toggleReadiedActionPrompt('${item.combatantId}')">Dismiss</button>
            </div>
        `;
        container.appendChild(block);
    });
}

// --- REACTIONS ROUND MONITOR ---
window.toggleReactionUsed = function(combatantId) {
    const com = activeEncounter.find(c => c.id === combatantId);
    if (!com) return;

    pushToUndoStack();
    com.reactionUsed = !com.reactionUsed;

    if (com.reactionUsed) {
        logCombatAction(`[Reaction Used] ${com.name} spent their reaction.`);
    } else {
        logCombatAction(`[Reaction Restored] ${com.name} reaction marked available.`);
    }

    renderCombatTracker();
    broadcastToPlayers();
};

function checkReactionAlert(combatant) {
    if (combatant.reactionUsed) {
        flashReactionSpentWarning(combatant.name);
    }
}

function flashReactionSpentWarning(name) {
    const banner = document.createElement('div');
    banner.style.cssText = "position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); background: #2a1111; color: var(--crimson-rage); padding: 12px 25px; border-radius: 6px; font-family: 'Inter', sans-serif; font-size: 0.95rem; border: 1.5px solid var(--crimson-rage); box-shadow: 0 0 10px rgba(0,0,0,0.5); z-index: 99999; pointer-events: none;";
    banner.innerHTML = ` <strong>REACTION ALREADY SPENT!</strong> ${name} has no reaction left this round.`;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 3000);
}

// --- COMBAT LOG ACTION ENGINE ---
function logCombatAction(actionText) {
    const timestamp = new Date().toLocaleTimeString();
    const entry = `[${timestamp}] ${actionText}`;
    combatHistoryLogs.push(entry);
    if (combatHistoryLogs.length > 50) combatHistoryLogs.shift();

    renderConsoleCombatHistoryLog();
}

function renderConsoleCombatHistoryLog() {
    const container = document.getElementById('console-combat-log-stream');
    if (!container) return;

    container.innerHTML = combatHistoryLogs.slice().reverse().map(log => `
        <div style="font-size:0.75rem; color:#cbd5e1; border-bottom:1px solid #1a1a24; padding:3px 0; font-family:monospace; line-height:1.35;">${log}</div>
    `).join('');
}
