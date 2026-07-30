// --- UTILITY CALCULATORS ---

// 1. Encounter Difficulty Calculator
window.calculateEncounterDifficulty = function() {
    const partySize = parseInt(document.getElementById('calc-party-size').value) || 4;
    const avgLevel = parseInt(document.getElementById('calc-avg-level').value) || 1;

    // Standard DMG thresholds per level
    const thresholds = {
        1: { easy: 25, medium: 50, hard: 75, deadly: 100 },
        2: { easy: 50, medium: 100, hard: 150, deadly: 200 },
        3: { easy: 75, medium: 150, hard: 225, deadly: 400 },
        4: { easy: 125, medium: 250, hard: 375, deadly: 500 },
        5: { easy: 250, medium: 500, hard: 750, deadly: 1100 },
        6: { easy: 300, medium: 600, hard: 900, deadly: 1400 },
        7: { easy: 350, medium: 750, hard: 1100, deadly: 1700 },
        8: { easy: 450, medium: 900, hard: 1400, deadly: 2100 },
        9: { easy: 550, medium: 1100, hard: 1600, deadly: 2400 },
        10: { easy: 600, medium: 1200, hard: 1900, deadly: 2800 },
        11: { easy: 800, medium: 1600, hard: 2400, deadly: 3600 },
        12: { easy: 1000, medium: 2000, hard: 3000, deadly: 4500 }
    };

    const levelThreshold = thresholds[avgLevel] || thresholds[12];
    const partyEasy = levelThreshold.easy * partySize;
    const partyMedium = levelThreshold.medium * partySize;
    const partyHard = levelThreshold.hard * partySize;
    const partyDeadly = levelThreshold.deadly * partySize;

    // Calculate monster budget
    let totalMonsterXp = 0;
    let monsterCount = 0;
    activeEncounter.forEach(c => {
        if (c.type === 'monster') {
            monsterCount++;
            // Extract standard XP value from CR or default
            totalMonsterXp += 200; // General medium baseline fallback
        }
    });

    let multiplier = 1;
    if (monsterCount === 1) multiplier = 1;
    else if (monsterCount === 2) multiplier = 1.5;
    else if (monsterCount >= 3 && monsterCount <= 6) multiplier = 2;
    else if (monsterCount >= 7 && monsterCount <= 10) multiplier = 2.5;
    else if (monsterCount >= 11 && monsterCount <= 14) multiplier = 3;
    else multiplier = 4;

    const adjustedXp = totalMonsterXp * multiplier;

    let rating = 'Trivial';
    let color = '#94a3b8';
    if (adjustedXp >= partyDeadly) {
        rating = 'DEADLY';
        color = 'var(--crimson-rage)';
    } else if (adjustedXp >= partyHard) {
        rating = 'HARD';
        color = '#f97316';
    } else if (adjustedXp >= partyMedium) {
        rating = 'MEDIUM';
        color = 'var(--gold-amber)';
    } else if (adjustedXp >= partyEasy) {
        rating = 'EASY';
        color = '#22c55e';
    }

    const badge = document.getElementById('difficulty-rating-badge');
    if (badge) {
        badge.innerText = rating;
        badge.style.backgroundColor = color;
    }
};

// 2. Passive Perception Radar
window.runPassivePerceptionRadar = function() {
    const stealthVal = parseInt(document.getElementById('stealth-check-input').value) || 10;
    const container = document.getElementById('passive-perception-radar-results');
    if (!container) return;

    container.innerHTML = '';
    localPartyData.forEach(pc => {
        const perception = pc.passives?.perception || 10;
        const noticed = perception >= stealthVal;
        
        const div = document.createElement('div');
        div.style.cssText = "display: flex; justify-content: space-between; padding: 4px 8px; font-size: 0.8rem; background: var(--bg-abyss); margin-bottom: 4px; border-radius: 4px; border-left: 3px solid;";
        div.style.borderLeftColor = noticed ? '#22c55e' : 'var(--crimson-rage)';
        div.innerHTML = `
            <span>${pc.name} (PP: ${perception})</span>
            <span style="font-weight: bold; color: ${noticed ? '#22c55e' : 'var(--crimson-rage)'};">${noticed ? 'NOTICED' : 'SURPRISED'}</span>
        `;
        container.appendChild(div);
    });
};

// 3. Wild Magic Surge Trigger Tracker
window.rollWildMagicSurgeTracker = async function() {
    const d20 = Math.floor(Math.random() * 20) + 1;
    const display = document.getElementById('wild-magic-display-box');
    if (!display) return;

    if (d20 === 1) {
        try {
            const res = await fetch('/api/reference/wild_magic');
            const table = await res.json();
            const result = table[Math.floor(Math.random() * table.length)];
            display.innerHTML = `
                <div style="color:var(--crimson-rage); font-weight:bold; font-size:0.95rem; margin-bottom:4px;">WILD MAGIC SURGE TRIGGERED (Rolled 1!)</div>
                <div style="color:var(--text-main); font-style:italic; font-family:'Cinzel', serif;">${result}</div>
            `;
            // Trigger sound cast
            triggerSound('spell-cast.mp3');
        } catch (e) {
            display.innerHTML = '<span style="color:var(--crimson-rage);">Wild Magic Surge triggered! Roll on wild_magic.json.</span>';
        }
    } else {
        display.innerHTML = `<span style="color: #22c55e;">Quiet magical currents... (Rolled ${d20})</span>`;
    }
};

// 4. Mob Combat Calculator
window.runMobCombatCalculator = function() {
    const mobCount = parseInt(document.getElementById('mob-calc-count').value) || 1;
    const bonus = parseInt(document.getElementById('mob-calc-bonus').value) || 0;
    const ac = parseInt(document.getElementById('mob-calc-ac').value) || 10;

    const diffNeeded = ac - bonus;
    let autoHitsRatio = 0; // 1 in X attacks hit

    if (diffNeeded <= 10) autoHitsRatio = 1;
    else if (diffNeeded <= 12) autoHitsRatio = 2;
    else if (diffNeeded <= 14) autoHitsRatio = 3;
    else if (diffNeeded <= 16) autoHitsRatio = 4;
    else if (diffNeeded <= 18) autoHitsRatio = 5;
    else if (diffNeeded <= 20) autoHitsRatio = 10;
    else autoHitsRatio = 20;

    const hitCount = Math.floor(mobCount / autoHitsRatio);
    const display = document.getElementById('mob-calc-results');
    if (display) {
        display.innerHTML = `
            <div style="color: var(--gold-amber); font-weight: bold;">Mob Results:</div>
            <div>Of ${mobCount} attackers, <strong>${hitCount} automatically hit</strong> targeting AC ${ac} (No rolls needed!).</div>
        `;
    }
};
