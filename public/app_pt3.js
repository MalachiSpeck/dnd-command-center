// --- COMBAT ENCOUNTER TRACKER ---
window.clearEncounter = async function() {
    pushToUndoStack();
    activeEncounter = [];
    activeCombatIndex = 0;
    try {
        await fetch('/api/combat/reset-round', { method: 'POST' });
    } catch(e) {}
    renderCombatTracker();
    broadcastToPlayers();
};

function pushToUndoStack() {
    undoStack.push(JSON.stringify(activeEncounter));
    if (undoStack.length > 10) {
        undoStack.shift();
    }
}

window.triggerUndoAction = function() {
    if (undoStack.length === 0) {
        alert("No actions available to undo.");
        return;
    }
    const previousState = undoStack.pop();
    activeEncounter = JSON.parse(previousState);
    renderCombatTracker();
    broadcastToPlayers();
};

function addDamage(combatantId, damageAmount) {
    const combatant = activeEncounter.find(m => m.id === combatantId);
    if (!combatant || isNaN(damageAmount) || damageAmount <= 0) return;
    
    pushToUndoStack();
    combatant.currentDamage += damageAmount;
    
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

    // Concentration Check trigger warning
    if (combatant.concentratingSpell) {
        const dc = Math.max(10, Math.floor(damageAmount / 2));
        flashConcentrationWarning(combatant.name, combatant.concentratingSpell, dc);
    }
    
    renderCombatTracker();
    broadcastToPlayers(); 
}

function healDamage(combatantId, healAmount) {
    const combatant = activeEncounter.find(m => m.id === combatantId);
    if (!combatant || isNaN(healAmount) || healAmount <= 0) return;

    pushToUndoStack();
    combatant.currentDamage = Math.max(0, combatant.currentDamage - healAmount);

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

    renderCombatTracker();
    broadcastToPlayers();
}

window.applyDamage = function(id) {
    const input = document.getElementById(`dmg-input-${id}`);
    const damage = parseInt(input.value);
    addDamage(id, damage);
    if (input) input.value = '';
};

window.applyHealing = function(id) {
    const input = document.getElementById(`dmg-input-${id}`);
    const heal = parseInt(input.value);
    healDamage(id, heal);
    if (input) input.value = '';
};

window.removeCombatant = function(id) {
    pushToUndoStack();
    activeEncounter = activeEncounter.filter(c => c.id !== id);
    renderCombatTracker();
    broadcastToPlayers();
};

window.togglePCDeathSave = function(id, type, index) {
    const pc = activeEncounter.find(c => c.id === id);
    if (!pc) return;
    pushToUndoStack();
    if (!pc.deathSaves) pc.deathSaves = { successes: 0, failures: 0 };
    
    if (type === 'success') {
        pc.deathSaves.successes = pc.deathSaves.successes >= index ? index - 1 : index;
        if (pc.deathSaves.successes >= 3) {
            // Stabilized
            pc.currentDamage = pc.maxHp - 1; // Stabilize at 0 hp equivalent or 1 hp
            pc.isDefeated = false;
            pc.isFuckedUp = true;
            pc.deathSaves = { successes: 0, failures: 0 };
        }
    } else {
        pc.deathSaves.failures = pc.deathSaves.failures >= index ? index - 1 : index;
        if (pc.deathSaves.failures >= 3) {
            alert(`${pc.name} HAS DIED.`);
        }
    }
    renderCombatTracker();
    broadcastToPlayers();
};

window.toggleConcentration = function(id) {
    const com = activeEncounter.find(c => c.id === id);
    if (!com) return;
    pushToUndoStack();
    if (com.concentratingSpell) {
        delete com.concentratingSpell;
    } else {
        const spellName = prompt("Enter spell name currently concentrating on:");
        if (spellName) {
            com.concentratingSpell = spellName;
        }
    }
    renderCombatTracker();
    broadcastToPlayers();
};

window.toggleConditionBadge = function(combatantId, condition) {
    const com = activeEncounter.find(c => c.id === combatantId);
    if (!com) return;
    pushToUndoStack();
    if (!com.conditions) com.conditions = [];
    
    if (com.conditions.includes(condition)) {
        com.conditions = com.conditions.filter(c => c !== condition);
    } else {
        com.conditions.push(condition);
    }
    renderCombatTracker();
    broadcastToPlayers();
};

window.toggleBossPip = function(id, type, index) {
    const com = activeEncounter.find(c => c.id === id);
    if (!com) return;
    pushToUndoStack();
    
    if (type === 'resistance') {
        com.legendary_resistances = com.legendary_resistances >= index ? index - 1 : index;
        if (com.legendary_resistances < index) {
            triggerLegendaryResistanceBanner(com.name);
            if (window.socket) {
                window.socket.emit('trigger-legendary-resistance', com.name);
            }
        }
    } else {
        com.legendary_actions = com.legendary_actions >= index ? index - 1 : index;
    }
    renderCombatTracker();
    broadcastToPlayers();
};

function triggerLegendaryResistanceBanner(bossName) {
    const banner = document.createElement('div');
    banner.style.cssText = "position: fixed; top: 10%; left: 50%; transform: translate(-50%, -50%); background: var(--crimson-rage); color: white; padding: 20px 40px; border-radius: 10px; font-family: 'Cinzel', serif; font-size: 1.8rem; border: 3px solid #fbbf24; box-shadow: 0 0 20px rgba(0,0,0,0.8); z-index: 99999; pointer-events: none; animation: popFlash 2.5s forwards;";
    banner.innerText = `${bossName.toUpperCase()} USED LEGENDARY RESISTANCE!`;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 2500);
}

function flashConcentrationWarning(name, spellName, dc) {
    const banner = document.createElement('div');
    banner.style.cssText = "position: fixed; top: 20%; left: 50%; transform: translate(-50%, -50%); background: #1e1b2e; color: #fbbf24; padding: 15px 30px; border-radius: 8px; font-family: 'Inter', sans-serif; font-size: 1.2rem; border: 2px solid var(--arcane-violet); box-shadow: 0 0 15px rgba(139,92,246,0.6); z-index: 99999; text-align: center; pointer-events: none;";
    banner.innerHTML = ` <strong>CONCENTRATION CHECK Required for ${name}</strong><br><span style="color: white; font-size: 0.95rem;">Spell: ${spellName} | <strong>DC: ${dc}</strong></span>`;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 4000);
}

function triggerEndOfTurnReminders() {
    const active = activeEncounter[activeCombatIndex];
    if (!active || !active.conditions || active.conditions.length === 0) return;

    active.conditions.forEach(cond => {
        // Highlighting standard end of turn saving throw mechanical conditions
        if (['poisoned', 'paralyzed', 'stunned', 'restrained', 'frightened', 'blinded'].includes(cond.toLowerCase())) {
            const reminder = document.createElement('div');
            reminder.style.cssText = "position: fixed; bottom: 40px; right: 40px; background: #0f0f13; border: 2px solid var(--gold-amber); padding: 15px; border-radius: 6px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); z-index: 10000; font-size: 0.9rem; max-width: 300px;";
            reminder.innerHTML = `⏳ <strong>Turn Reminder for ${active.name}</strong><br>Check if they can make a saving throw to end the <strong>${cond}</strong> condition!`;
            document.body.appendChild(reminder);
            setTimeout(() => reminder.remove(), 5000);
        }
    });
}
