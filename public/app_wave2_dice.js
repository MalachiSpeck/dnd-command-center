// --- PERSISTENT QUICK DICE ROLLER WITH ADVANCED FORMULA PARSER ---
let diceHistory = [];

window.rollCustomDiceFormulaNotation = function() {
    const formula = document.getElementById('dice-formula-input').value.trim();
    if (!formula) return;

    const isSecret = document.getElementById('chk-secret-dice-roll').checked;

    // Standard notation parser regex: e.g. 2d6+3, 1d20adv, 1d20dis
    const match = formula.match(/^(\d+)d(\d+)(kh\d+|adv|dis)?\s*([+-]\s*\d+)?$/i);
    let resultsText = '';
    let total = 0;

    if (match) {
        const qty = parseInt(match[1], 10);
        const size = parseInt(match[2], 10);
        const mode = match[3] ? match[3].toLowerCase() : '';
        const mod = match[4] ? parseInt(match[4].replace(/\s+/g, ''), 10) : 0;

        let rolls = [];
        for (let i = 0; i < qty; i++) {
            rolls.push(Math.floor(Math.random() * size) + 1);
        }

        if (mode === 'adv' && qty === 1 && size === 20) {
            const second = Math.floor(Math.random() * 20) + 1;
            const finalRoll = Math.max(rolls[0], second);
            total = finalRoll + mod;
            resultsText = `rolled [${rolls[0]}, ${second}] Keep High -> ${finalRoll} + ${mod} = **${total}**`;
        } else if (mode === 'dis' && qty === 1 && size === 20) {
            const second = Math.floor(Math.random() * 20) + 1;
            const finalRoll = Math.min(rolls[0], second);
            total = finalRoll + mod;
            resultsText = `rolled [${rolls[0]}, ${second}] Keep Low -> ${finalRoll} + ${mod} = **${total}**`;
        } else {
            const sumRolls = rolls.reduce((a, b) => a + b, 0);
            total = sumRolls + mod;
            resultsText = `rolled [${rolls.join(', ')}] = ${sumRolls} + ${mod} = **${total}**`;
        }
    } else {
        // Absolute fallback evaluating simple arithmetic
        try {
            total = eval(formula.replace(/[^0-9+\-*/().]/g, ''));
            resultsText = `Evaluated formula to **${total}**`;
        } catch (e) {
            resultsText = 'Invalid Dice Expression. (Use: 2d6+3, 1d20adv, 1d20dis)';
        }
    }

    const output = `${formula}: ${resultsText}`;
    diceHistory.unshift(output);
    if (diceHistory.length > 15) diceHistory.pop();

    document.getElementById('dice-results-history-box').innerHTML = diceHistory.map(h => `
        <div style="font-size:0.75rem; color:#cbd5e1; border-bottom:1px solid #1a1a24; padding:3px 0; font-family:monospace; line-height:1.35;">${h}</div>
    `).join('');

    if (!isSecret) {
        logCombatAction(`[Dice Roll] Sunk roll ${output}`);
    }
};
