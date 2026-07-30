// --- MAGICAL SPELLS GRIMOIRE COMPENDIUM & HOVER LOOKUP ENGINE ---
let localGrimoireSpells = [];
let localSpellSlotsCache = {}; // id -> { lvl1, lvl2, ... }

async function loadGrimoireSpellsList() {
    const listContainer = document.getElementById('spells-grimoire-list');
    if (!listContainer) return;

    try {
        const response = await fetch('/api/spells');
        localGrimoireSpells = await response.json();
        renderGrimoireSpells(localGrimoireSpells);
    } catch(err) {
        console.error("Failed to fetch spells.", err);
        listContainer.innerHTML = '<div style="color: #ef4444; font-size:0.8rem; text-align:center;">Failed to fetch spell grimoire.</div>';
    }
}

function renderGrimoireSpells(spells) {
    const listContainer = document.getElementById('spells-grimoire-list');
    if (!listContainer) return;

    if (spells.length === 0) {
        listContainer.innerHTML = '<div style="color: var(--text-muted); font-size:0.8rem; text-align:center;">No spells loaded.</div>';
        return;
    }

    listContainer.innerHTML = '';
    spells.forEach(spell => {
        const card = document.createElement('div');
        card.className = 'spell-book-card';
        
        // Add Pin toggle listener & stop propagation
        const isPinned = pinnedSpells.has(spell.name);

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h4 style="color:#5c2c16; margin:0;" onclick="openSpellDetailModalByName('${spell.name}')">${spell.name}</h4>
                <button class="btn-primary" style="padding:2px 6px; font-size:0.65rem; background:${isPinned ? '#ef4444':'#10b981'}" onclick="event.stopPropagation(); togglePinSpell('${spell.name}')">${isPinned ? 'Unpin':'Pin'}</button>
            </div>
            <div style="display:flex; justify-content:space-between; font-size: 0.75rem; color:#6b4d32; margin-top:4px;" onclick="openSpellDetailModalByName('${spell.name}')">
                <span>${spell.school || 'Evocation'}</span>
                <strong>Level ${spell.level || 'Cantrip'}</strong>
            </div>
            <div style="font-size:0.7rem; color:#5c442d; margin-top:4px; font-style:italic;" onclick="openSpellDetailModalByName('${spell.name}')">
                Casting: ${spell.casting_time || '1 action'} | Range: ${spell.range || '60ft'}
            </div>
        `;
        listContainer.appendChild(card);
    });
}

window.filterSpellsList = function() {
    const searchInput = document.getElementById('spell-search-input');
    const schoolFilter = document.getElementById('spell-school-filter');
    
    const query = (searchInput ? searchInput.value : '').toLowerCase().trim();
    const school = (schoolFilter ? schoolFilter.value : '').toLowerCase();

    let filtered = localGrimoireSpells || [];
    if (query) {
        filtered = filtered.filter(s => {
            const sName = (s.name || '').toLowerCase();
            const sDesc = (s.description || s.desc || '').toLowerCase();
            return sName.includes(query) || sDesc.includes(query);
        });
    }
    if (school) {
        filtered = filtered.filter(s => {
            const sSchool = (s.school || '').toLowerCase();
            return sSchool.includes(school);
        });
    }
    renderGrimoireSpells(filtered);
};

function formatTextWithSpellTooltips(rawText) {
    if (!rawText || typeof rawText !== 'string') return '';
    
    const commonSpells = ["fireball", "cure wounds", "web", "shield", "bless", "fly", "magic missile", "misty step", "sand blast", "shatter", "haste", "slow", "banishment", "counterspell"];
    
    let processedText = rawText;
    commonSpells.forEach(spell => {
        const regex = new RegExp(`\\b(${spell})\\b`, 'gi');
        processedText = processedText.replace(regex, (match) => {
            const id = 'tooltip_' + Math.random().toString(36).substr(2, 5);
            return `<span class="spell-tooltip-link" onmouseover="asyncLoadSpellTooltipDetails('${spell.replace(/'/g, "\\'")}', '${id}')">${match}<span class="spell-hover-tooltip" id="${id}">Gathering arcane secrets...</span></span>`;
        });
    });

    return processedText;
}

window.asyncLoadSpellTooltipDetails = async function(spellName, elementId) {
    const tooltip = document.getElementById(elementId);
    if (!tooltip || tooltip.dataset.loaded === 'true') return;

    try {
        const response = await fetch(`/api/spells/lookup/${encodeURIComponent(spellName)}`);
        const spell = await response.json();

        tooltip.dataset.loaded = 'true';
        tooltip.innerHTML = `
            <strong style="color: #fbbf24; font-family:'Cinzel'; display:block; margin-bottom:4px; font-size:0.95rem;">${spell.name}</strong>
            <span style="font-style:italic; font-size:0.75rem; color:#a78bfa; display:block; margin-bottom:6px;">${spell.level} | ${spell.school}</span>
            <div style="font-size:0.75rem; line-height:1.3; color:#cbd5e1; margin-bottom:6px;">
                <strong>Casting:</strong> ${spell.casting_time}<br>
                <strong>Range:</strong> ${spell.range}<br>
                <strong>Components:</strong> ${spell.components}
            </div>
            <div style="font-size:0.75rem; line-height:1.3; color:#94a3b8; border-top:1px solid #4a5568; padding-top:4px; overflow-y:auto; max-height:90px;">
                ${spell.description.length > 200 ? spell.description.substr(0, 190) + '...' : spell.description}
            </div>
        `;
    } catch(err) {
        tooltip.innerHTML = `<span style="color:#ef4444;">Could not summon details.</span>`;
    }
};

function renderSpellSlotsTrackerGrid(charId, level) {
    if (!localSpellSlotsCache[charId]) {
        localSpellSlotsCache[charId] = {
            1: Math.min(4, level >= 1 ? (level >= 3 ? 4 : (level >= 2 ? 3 : 2)) : 0),
            2: Math.min(3, level >= 3 ? (level >= 4 ? 3 : 2) : 0),
            3: Math.min(3, level >= 5 ? (level >= 6 ? 3 : 2) : 0),
            4: Math.min(3, level >= 7 ? (level >= 9 ? 3 : (level >= 8 ? 2 : 1)) : 0),
            5: Math.min(3, level >= 9 ? (level >= 10 ? 2 : 1) : 0)
        };
    }

    const slots = localSpellSlotsCache[charId];
    let gridHtml = `<div class="spell-slots-grid" onclick="event.stopPropagation()">`;

    for (let lvl = 1; lvl <= 5; lvl++) {
        const remaining = slots[lvl] || 0;
        gridHtml += `
            <div class="slot-pill ${remaining > 0 ? 'active' : ''}">
                <span style="font-weight:bold; color: #a78bfa;">L${lvl}</span>
                <span style="color:white; font-size:0.8rem; margin:1px 0;">${remaining}</span>
                <div class="slot-counter-btns">
                    <button class="slot-btn" onclick="adjustSpellSlotLocal('${charId}', ${lvl}, 1)">+</button>
                    <button class="slot-btn" style="background:#ef4444;" onclick="adjustSpellSlotLocal('${charId}', ${lvl}, -1)">-</button>
                </div>
            </div>
        `;
    }

    gridHtml += `</div>`;
    return gridHtml;
}

window.adjustSpellSlotLocal = function(charId, slotLevel, delta) {
    if (!localSpellSlotsCache[charId]) return;
    let currentVal = localSpellSlotsCache[charId][slotLevel] || 0;
    currentVal = Math.max(0, currentVal + delta);
    localSpellSlotsCache[charId][slotLevel] = currentVal;
    
    // Sync to the server & players sheet in real-time!
    if (window.socket) {
        window.socket.emit('player-update', {
            charId: charId,
            updatedData: { spell_slots: localSpellSlotsCache[charId] }
        });
    }
    
    loadPartyMatrix();
};
