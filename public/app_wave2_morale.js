// --- MULTI-ATTACK MACRO ENGINE BUILDER ---
window.rollMonsterMultiAttackMacro = function(combatantId, actionName) {
    const com = activeEncounter.find(c => c.id === combatantId);
    if (!com) return;

    // Fetch details dynamically from cached reference
    fetch('/api/monsters')
        .then(res => res.json())
        .then(monsters => {
            const baseMon = monsters.find(m => m.name.toLowerCase() === com.name.replace(/\s[A-Z]$/, '').toLowerCase());
            if (!baseMon) return;

            // Look for matching action entry inside structured array list
            const actions = baseMon.actions || [];
            const targetAction = actions.find(a => a.name.toLowerCase() === actionName.toLowerCase());
            
            if (!targetAction) return;

            // Generate macro math rolls
            const atkBonus = parseInt(targetAction.attack_bonus || 5, 10);
            const dmgDice = targetAction.damage_dice || "1d6+2";
            const dmgType = targetAction.damage_type || "bludgeoning";
            const numAttacks = parseInt(targetAction.num_attacks || 1, 10);

            let logHtml = `<div style="background:#0f0f13; border-top:1px solid #333; padding:8px; margin-top:8px; font-size:0.75rem; border-radius:4px; font-family:monospace;">`;
            logHtml += `<div style="color:var(--gold-amber); font-weight:bold; margin-bottom:4px;">Macro Roll: ${actionName}</div>`;

            // Roll attack sequence loops
            for (let i = 1; i <= numAttacks; i++) {
                const nat20 = Math.floor(Math.random() * 20) + 1;
                const totalAtk = nat20 + atkBonus;
                
                // Roll damage
                const dmgTotal = rollDamageDiceString(dmgDice);
                
                logHtml += `<div style="margin-bottom:2px;">Atk ${i}: rolled ${nat20} + ${atkBonus} = <strong>${totalAtk}</strong> -> Deal <strong>${dmgTotal}</strong> ${dmgType} dmg</div>`;
                logCombatAction(`[Roll Macro] ${com.name} rolled ${actionName} attack ${i}: (${totalAtk} to hit | ${dmgTotal} ${dmgType} damage)`);
            }
            logHtml += `</div>`;

            const cardLogContainer = document.getElementById(`macro-combat-log-container-${combatantId}`);
            if (cardLogContainer) {
                cardLogContainer.innerHTML = logHtml;
            }
        });
};

function rollDamageDiceString(diceStr) {
    const diceMatch = String(diceStr).match(/(\d+)d(\d+)(?:\s*([-+]\d+))?/i);
    if (!diceMatch) return parseInt(diceStr, 10) || 5;

    const qty = parseInt(diceMatch[1], 10);
    const size = parseInt(diceMatch[2], 10);
    const mod = parseInt(diceMatch[3] || 0, 10);

    let total = 0;
    for (let i = 0; i < qty; i++) {
        total += Math.floor(Math.random() * size) + 1;
    }
    return total + mod;
}

// --- MORALE SYSTEM CONSOLE ENGINE ---
window.toggleMoraleSystemGlobally = function() {
    isMoraleSystemEnabled = !isMoraleSystemEnabled;
    const btn = document.getElementById('btn-toggle-morale-system');
    if (btn) {
        btn.innerText = isMoraleSystemEnabled ? "Morale Engine: Active" : "Morale Engine: Disabled";
        btn.style.background = isMoraleSystemEnabled ? "var(--arcane-violet)" : "#4b5563";
    }
};

window.checkNPCGroupMoraleCheck = function(combatantId) {
    if (!isMoraleSystemEnabled) return;
    const com = activeEncounter.find(c => c.id === combatantId);
    if (!com || com.type !== 'monster') return;

    // Fetch baseline morale score values (2 to 12) from bestiary database
    fetch('/api/monsters')
        .then(res => res.json())
        .then(monsters => {
            const baseMon = monsters.find(m => m.name.toLowerCase() === com.name.replace(/\s[A-Z]$/, '').toLowerCase());
            const moraleScore = baseMon ? parseInt(baseMon.morale_score || 7, 10) : 7;

            // Trigger contested 2d6 morale checks
            const d1 = Math.floor(Math.random() * 6) + 1;
            const d2 = Math.floor(Math.random() * 6) + 1;
            const totalRoll = d1 + d2;
            const checkFailed = totalRoll > moraleScore;

            if (checkFailed) {
                pushToUndoStack();
                com.isFleeing = true;
                logCombatAction(`[Morale Failed] ${com.name} failed morale roll (${totalRoll} vs score ${moraleScore}). MARKED FLEEING.`);
                alert(`${com.name} broke morale and is now FLEEING!`);
            } else {
                logCombatAction(`[Morale Passed] ${com.name} held their ground (${totalRoll} vs score ${moraleScore}).`);
            }
            renderCombatTracker();
            broadcastToPlayers();
        });
};
