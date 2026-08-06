// --- PERSISTENT QUICK DICE ROLLER WITH ADVANCED FORMULA PARSER ---
let diceHistory = [];

window.rollCustomDiceFormulaNotation = function() {
    const inputEl = document.getElementById('dice-formula-input');
    if (!inputEl) return;
    const formula = inputEl.value.trim();
    if (!formula) return;

    const isSecretEl = document.getElementById('chk-secret-dice-roll');
    const isSecret = isSecretEl ? isSecretEl.checked : false;

    let rollResult;
    if (window.DiceParser && typeof window.DiceParser.parseAndRoll === 'function') {
        rollResult = window.DiceParser.parseAndRoll(formula);
    } else {
        rollResult = { total: 0, breakdownText: 'DiceParser module unavailable' };
    }

    const resultsText = rollResult.breakdownText || `Total: **${rollResult.total}**`;
    const output = `${formula}: ${resultsText}`;

    diceHistory.unshift(output);
    if (diceHistory.length > 15) diceHistory.pop();

    const box = document.getElementById('dice-results-history-box');
    if (box) {
        box.innerHTML = diceHistory.map(h => `
            <div style="font-size:0.75rem; color:#cbd5e1; border-bottom:1px solid #1a1a24; padding:3px 0; font-family:monospace; line-height:1.35;">${h}</div>
        `).join('');
    }

    // Trigger optional 2D Canvas animation if DiceParser supports it
    if (window.DiceParser && typeof window.DiceParser.show2DDiceAnimation === 'function') {
        window.DiceParser.show2DDiceAnimation(document.body, rollResult);
    }

    if (!isSecret && typeof logCombatAction === 'function') {
        logCombatAction(`[Dice Roll] ${output}`);
    }
};
