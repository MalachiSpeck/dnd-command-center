// --- SPELLS GRIMOIRE COMPENDIUM SEARCH PIN SYSTEM ---
window.togglePinSpell = function(spellName) {
    if (pinnedSpells.has(spellName)) {
        pinnedSpells.delete(spellName);
    } else {
        pinnedSpells.add(spellName);
    }
    renderPinnedSpellsSidebar();
};

function renderPinnedSpellsSidebar() {
    const container = document.getElementById('pinned-spells-container');
    if (!container) return;

    if (pinnedSpells.size === 0) {
        container.innerHTML = '<div style="color:var(--text-muted); font-size:0.75rem; text-align:center;">No pinned spells.</div>';
        return;
    }

    container.innerHTML = '';
    pinnedSpells.forEach(spellName => {
        const spell = localGrimoireSpells.find(s => s.name === spellName);
        if (!spell) return;

        const block = document.createElement('div');
        block.style.cssText = "background: var(--shadow-card); border: 1px solid var(--border-iron); border-radius: 4px; padding: 6px 10px; margin-bottom: 6px; display:flex; justify-content:space-between; align-items:center; font-size:0.75rem;";
        block.innerHTML = `
            <span style="font-weight:bold; color:var(--text-main); cursor:pointer;" onclick="openSpellDetailModalByName('${spell.name}')">${spell.name}</span>
            <button class="btn-danger" style="padding:2px 4px; font-size:0.65rem;" onclick="togglePinSpell('${spell.name}')">Unpin</button>
        `;
        container.appendChild(block);
    });
}

window.openSpellDetailModal = function(spell) {
    const modal = document.getElementById('spell-detail-modal');
    const titleEl = document.getElementById('spell-modal-title');
    const bodyEl = document.getElementById('spell-modal-body');

    if (!modal || !titleEl || !bodyEl) return;

    titleEl.textContent = spell.name;
    
    // Format description text to have line breaks or paragraphs if it has newlines
    const formattedDesc = (spell.description || '')
        .split('\n')
        .map(p => p.trim())
        .filter(p => p.length > 0)
        .map(p => `<p style="margin-bottom: 12px;">${p}</p>`)
        .join('');

    bodyEl.innerHTML = `
        <div style="font-style: italic; color: #8e6c43; font-size: 1rem; border-bottom: 1px solid #d3bca2; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between;">
            <span>${spell.level || 'Cantrip'} | ${spell.school || 'Evocation'}</span>
        </div>
        <div style="font-size: 0.9rem; color: #5c442d; margin-bottom: 15px; background: #ebdcb9; padding: 10px; border-radius: 4px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div><strong>Casting Time:</strong> ${spell.casting_time || '1 action'}</div>
            <div><strong>Range:</strong> ${spell.range || 'Self'}</div>
            <div style="grid-column: span 2;"><strong>Components:</strong> ${spell.components || 'V, S'}</div>
            <div style="grid-column: span 2;"><strong>Duration:</strong> ${spell.duration || 'Instantaneous'}</div>
        </div>
        <div style="font-size: 0.95rem; line-height: 1.5; color: #2d1c0b; font-family: Georgia, serif;">
            ${formattedDesc || '<p>No description available.</p>'}
        </div>
    `;

    modal.classList.remove('hidden');
};

const openSpellDetailModal = window.openSpellDetailModal;

window.openSpellDetailModalByName = function(spellName) {
    const spell = localGrimoireSpells.find(s => s.name === spellName);
    if (spell) openSpellDetailModal(spell);
};


// --- COMBAT BEASTIARY AUTO-SUFFIX MONSTER SPAWNING ---
window.spawnMultiMonsters = async function(baseName, count) {
    // Find matching base monster from reference cache
    let refMonster = null;
    if (window.loadedMonstersRef) {
        refMonster = window.loadedMonstersRef.find(m => m.name.toLowerCase() === baseName.toLowerCase());
    }

    if (!refMonster) {
        try {
            const res = await fetch('/api/monsters');
            const monsters = await res.json();
            window.loadedMonstersRef = monsters;
            refMonster = monsters.find(m => m.name.toLowerCase() === baseName.toLowerCase());
        } catch(e) {}
    }

    const hpStr = refMonster ? refMonster.hp : "10";
    const ac = refMonster ? refMonster.ac : 10;
    const art = refMonster ? (refMonster.art || refMonster.img_url) : "https://images.unsplash.com/photo-1555685812-4b943f1cb0eb?q=80&w=200";

    // Alphabet array suffixes
    const suffixes = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

    for (let i = 0; i < count; i++) {
        const finalName = count > 1 ? `${baseName} ${suffixes[i] || i}` : baseName;
        
        // Parse individual rolled HP hit dice if present
        let rolledHp = parseInt(hpStr, 10) || 10;
        const diceMatch = String(hpStr).match(/(\d+)d(\d+)(?:\s*([-+]\d+))?/i);
        if (diceMatch) {
            const qty = parseInt(diceMatch[1], 10);
            const size = parseInt(diceMatch[2], 10);
            const mod = parseInt(diceMatch[3] || 0, 10);
            
            let diceRoll = 0;
            for (let d = 0; d < qty; d++) {
                diceRoll += Math.floor(Math.random() * size) + 1;
            }
            rolledHp = diceRoll + mod;
        }

        const newCombatant = {
            id: 'mon_' + Date.now() + Math.floor(Math.random() * 1000),
            name: finalName,
            maxHp: rolledHp,
            ac: parseInt(ac, 10) || 10,
            currentDamage: 0,
            isFuckedUp: false,
            isDefeated: false,
            initiative: 0,
            art: art,
            type: "monster",
            conditions: [],
            legendary_actions: refMonster?.legendary_actions || 0,
            legendary_resistances: refMonster?.legendary_resistances || 0
        };

        activeEncounter.push(newCombatant);
    }
};

window.openSpawnMonsterMenu = async function() {
    const modal = document.getElementById('spawn-monster-modal');
    if (!modal) return;
    
    modal.classList.remove('hidden');
    const select = document.getElementById('spawn-monster-select');
    const searchInput = document.getElementById('spawn-monster-search');
    if (searchInput) searchInput.value = '';

    if (!window.loadedMonstersRef) {
        try {
            const res = await fetch('/api/monsters');
            window.loadedMonstersRef = await res.json();
        } catch(e) {
            console.error("Failed to load monsters for spawn menu:", e);
            window.loadedMonstersRef = [];
        }
    }
    
    populateMonsterSelect(window.loadedMonstersRef);
};

function populateMonsterSelect(monsters) {
    const select = document.getElementById('spawn-monster-select');
    if (!select) return;
    select.innerHTML = '<option value="">-- Select Monster --</option>';
    
    const sorted = [...monsters].sort((a, b) => a.name.localeCompare(b.name));
    
    sorted.forEach(m => {
        const option = document.createElement('option');
        option.value = m.id || m.name;
        const crDisplay = m.challengeRating || m.cr || m.Challenge || "0";
        option.innerText = `${m.name} (CR ${crDisplay}, AC ${m.ac || m.armorClass || 10}, HP ${m.hp || m.hitPoints || 10})`;
        select.appendChild(option);
    });
}

window.filterSpawnMonsterSelect = function() {
    const searchVal = document.getElementById('spawn-monster-search').value.toLowerCase();
    if (!window.loadedMonstersRef) return;
    
    const filtered = window.loadedMonstersRef.filter(m => 
        m.name.toLowerCase().includes(searchVal)
    );
    
    populateMonsterSelect(filtered);
};

window.spawnSelectedMonster = async function() {
    const select = document.getElementById('spawn-monster-select');
    const selectedVal = select.value;
    const multVal = parseInt(document.getElementById('spawn-monster-count')?.value || 1) || 1;

    let baseName = '';
    let hp = 10;
    let ac = 10;

    if (selectedVal && window.loadedMonstersRef) {
        const baseMon = window.loadedMonstersRef.find(m => m.id === selectedVal || m.name === selectedVal);
        if (baseMon) {
            baseName = baseMon.name;
            await spawnMultiMonsters(baseName, multVal);
        }
    } else {
        baseName = document.getElementById('custom-mon-name').value.trim();
        hp = parseInt(document.getElementById('custom-mon-hp').value) || 10;
        ac = parseInt(document.getElementById('custom-mon-ac').value) || 10;

        if (baseName) {
            for (let i = 0; i < multVal; i++) {
                const finalName = multVal > 1 ? `${baseName} ${['A', 'B', 'C', 'D', 'E'][i] || i}` : baseName;
                activeEncounter.push({
                    id: 'mon_' + Date.now() + Math.floor(Math.random() * 1000),
                    name: finalName,
                    maxHp: hp,
                    ac: ac,
                    currentDamage: 0,
                    isFuckedUp: false,
                    isDefeated: false,
                    initiative: 0,
                    art: "https://images.unsplash.com/photo-1555685812-4b943f1cb0eb?q=80&w=200",
                    type: "monster",
                    conditions: []
                });
            }
        }
    }

    document.getElementById('custom-mon-name').value = '';
    document.getElementById('custom-mon-hp').value = '';
    document.getElementById('custom-mon-ac').value = '';
    document.getElementById('spawn-monster-modal').classList.add('hidden');
    
    renderCombatTracker();
    broadcastToPlayers();
};
