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

let activeDmGrimoireFilters = {
    schools: [],
    castingTimes: [],
    ranges: [],
    durations: []
};

function getDmSpellLevelNumber(spellOrName) {
    if (!spellOrName) return 0;
    let lvlStr = typeof spellOrName === 'object' && spellOrName.level !== undefined ? String(spellOrName.level) : '';
    let nameStr = typeof spellOrName === 'string' ? spellOrName : (spellOrName.name || '');

    const knownCantripNames = ['acid splash', 'blade ward', 'chill touch', 'dancing lights', 'druidcraft', 'eldritch blast', 'fire bolt', 'guidance', 'light', 'mage hand', 'mending', 'message', 'minor illusion', 'poison spray', 'prestidigitation', 'produce flame', 'ray of frost', 'resistance', 'sacred flame', 'shillelagh', 'shocking grasp', 'spare the dying', 'thaumaturgy', 'thorn whip', 'true strike', 'vicious mockery'];

    if (lvlStr) {
        const cleanLvl = lvlStr.toLowerCase();
        if (cleanLvl === '0' || cleanLvl === 'cantrip' || cleanLvl.includes('cantrip')) return 0;
    }
    if (knownCantripNames.includes(nameStr.toLowerCase()) || nameStr.toLowerCase().includes('cantrip')) return 0;

    const match = lvlStr.match(/\d+/);
    return match ? parseInt(match[0], 10) : 1;
}

function getDmOrdinalSuffix(i) {
    const j = i % 10, k = i % 100;
    if (j === 1 && k !== 11) return i + "st";
    if (j === 2 && k !== 12) return i + "nd";
    if (j === 3 && k !== 13) return i + "rd";
    return i + "th";
}

function renderGrimoireSpells(spells) {
    const listContainer = document.getElementById('spells-grimoire-list');
    if (!listContainer) return;

    if (!spells || spells.length === 0) {
        listContainer.innerHTML = '<div style="color: var(--text-muted); font-size:0.8rem; text-align:center; padding:20px;">No matching spells found.</div>';
        return;
    }

    listContainer.innerHTML = '';

    // Group by Level (Cantrips Lvl 0 first, then 1, 2, 3...)
    const groups = {};
    spells.forEach(s => {
        const lvl = getDmSpellLevelNumber(s);
        if (!groups[lvl]) groups[lvl] = [];
        groups[lvl].push(s);
    });

    const sortedLevels = Object.keys(groups).map(Number).sort((a, b) => a - b);

    sortedLevels.forEach(lvl => {
        // Sort spells within level group alphabetically by Name
        groups[lvl].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        const levelHeader = document.createElement('div');
        levelHeader.style = "font-family: 'Cinzel', serif; font-size: 0.8rem; color: var(--gold-amber); font-weight: bold; border-bottom: 1px solid var(--border-iron); padding-bottom: 4px; margin-top: 10px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;";
        
        const titleText = lvl === 0 ? "✨ Cantrips (Level 0)" : `🔮 ${getDmOrdinalSuffix(lvl)} Level Spells`;
        levelHeader.innerHTML = `
            <span>${titleText}</span>
            <span style="font-size: 0.65rem; color: var(--text-muted); font-family: sans-serif;">(${groups[lvl].length})</span>
        `;
        listContainer.appendChild(levelHeader);

        groups[lvl].forEach(spell => {
            const card = document.createElement('div');
            card.className = 'spell-book-card';
            
            const isPinned = pinnedSpells.has(spell.name);
            const lvlNum = getDmSpellLevelNumber(spell);
            const levelLabel = lvlNum === 0 ? 'Cantrip' : `Lvl ${lvlNum}`;
            const safeName = (spell.name || '').replace(/'/g, "\\'");

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h4 style="color:#5c2c16; margin:0; cursor:pointer;" onclick="openSpellDetailModalByName('${safeName}')">${spell.name}</h4>
                    <button class="btn-primary" style="padding:2px 6px; font-size:0.65rem; background:${isPinned ? '#ef4444':'#10b981'}" onclick="event.stopPropagation(); togglePinSpell('${safeName}')">${isPinned ? 'Unpin':'Pin'}</button>
                </div>
                <div style="display:flex; justify-content:space-between; font-size: 0.75rem; color:#6b4d32; margin-top:4px; cursor:pointer;" onclick="openSpellDetailModalByName('${safeName}')">
                    <span>${spell.school || 'Evocation'}</span>
                    <strong>${levelLabel}</strong>
                </div>
                <div style="font-size:0.7rem; color:#5c442d; margin-top:4px; font-style:italic; cursor:pointer;" onclick="openSpellDetailModalByName('${safeName}')">
                    Casting: ${spell.casting_time || '1 action'} | Range: ${spell.range || 'Self'}
                </div>
            `;
            listContainer.appendChild(card);
        });
    });
}

window.filterSpellsList = function() {
    const searchInput = document.getElementById('spell-search-input');
    const query = (searchInput ? searchInput.value : '').toLowerCase().trim();

    let filtered = localGrimoireSpells || [];

    // STRICT NAME SEARCH ONLY
    if (query) {
        filtered = filtered.filter(s => (s.name || '').toLowerCase().includes(query));
    }

    // Multi-option Modal Filters
    if (activeDmGrimoireFilters.schools.length > 0) {
        filtered = filtered.filter(s => s.school && activeDmGrimoireFilters.schools.includes(s.school.toLowerCase()));
    }
    if (activeDmGrimoireFilters.castingTimes.length > 0) {
        filtered = filtered.filter(s => {
            const ct = (s.casting_time || '').toLowerCase();
            return activeDmGrimoireFilters.castingTimes.some(f => ct.includes(f));
        });
    }
    if (activeDmGrimoireFilters.ranges.length > 0) {
        filtered = filtered.filter(s => {
            const r = (s.range || '').toLowerCase();
            return activeDmGrimoireFilters.ranges.some(f => r.includes(f));
        });
    }
    if (activeDmGrimoireFilters.durations.length > 0) {
        filtered = filtered.filter(s => {
            const d = (s.duration || '').toLowerCase();
            return activeDmGrimoireFilters.durations.some(f => d.includes(f));
        });
    }

    renderGrimoireSpells(filtered);
};

window.openDmGrimoireFilterModal = function() {
    populateDmFilterOptionsDOM();
    const modal = document.getElementById('dm-grimoire-filter-modal');
    if (modal) modal.style.display = 'flex';
};

window.closeDmGrimoireFilterModal = function() {
    const modal = document.getElementById('dm-grimoire-filter-modal');
    if (modal) modal.style.display = 'none';
};

window.toggleDmSpellFilterChip = function(category, value) {
    const arr = activeDmGrimoireFilters[category];
    const idx = arr.indexOf(value);
    if (idx === -1) {
        arr.push(value);
    } else {
        arr.splice(idx, 1);
    }
    populateDmFilterOptionsDOM();
};

window.resetDmGrimoireFilters = function() {
    activeDmGrimoireFilters = { schools: [], castingTimes: [], ranges: [], durations: [] };
    populateDmFilterOptionsDOM();
    updateDmActiveFilterBadge();
    filterSpellsList();
};

window.applyDmGrimoireFilters = function() {
    closeDmGrimoireFilterModal();
    updateDmActiveFilterBadge();
    filterSpellsList();
};

function updateDmActiveFilterBadge() {
    const count = activeDmGrimoireFilters.schools.length + activeDmGrimoireFilters.castingTimes.length + activeDmGrimoireFilters.ranges.length + activeDmGrimoireFilters.durations.length;
    const badge = document.getElementById('dm-grimoire-filter-count');
    if (badge) {
        if (count > 0) {
            badge.innerText = count;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }
}

function populateDmFilterOptionsDOM() {
    const schoolsList = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'];
    const castingList = ['1 action', '1 bonus action', '1 reaction', '1 minute', '10 minutes', '1 hour', '8 hours'];
    const rangeList = ['Self', 'Touch', '30 feet', '60 feet', '90 feet', '120 feet', '150 feet', '500 feet', 'Sight', 'Special'];
    const durationList = ['Instantaneous', '1 round', '1 minute', '10 minutes', '1 hour', '8 hours', '24 hours', 'Concentration'];

    const renderCategoryChips = (containerId, items, categoryKey) => {
        const el = document.getElementById(containerId);
        if (!el) return;
        el.innerHTML = '';
        items.forEach(item => {
            const itemLower = item.toLowerCase();
            const isActive = activeDmGrimoireFilters[categoryKey].includes(itemLower);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `filter-chip ${isActive ? 'active' : ''}`;
            btn.innerText = item;
            btn.onclick = () => toggleDmSpellFilterChip(categoryKey, itemLower);
            el.appendChild(btn);
        });
    };

    renderCategoryChips('dm-filter-school-options', schoolsList, 'schools');
    renderCategoryChips('dm-filter-casting-options', castingList, 'castingTimes');
    renderCategoryChips('dm-filter-range-options', rangeList, 'ranges');
    renderCategoryChips('dm-filter-duration-options', durationList, 'durations');
}

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

// ====================================================
// WORLDBUILDING & PREP TOOLKIT DRAWER ENGINE
// ====================================================

window.openWorldbuildingDrawer = function() {
    const drawer = document.getElementById('worldbuilding-drawer');
    if (drawer) drawer.style.right = '0px';
};

window.closeWorldbuildingDrawer = function() {
    const drawer = document.getElementById('worldbuilding-drawer');
    if (drawer) drawer.style.right = '-550px';
};

window.switchWorldbuildingTab = function(tabName) {
    const tabs = ['shops', 'treasure', 'encounters', 'npcs', 'hazards', 'homebrew', 'pdf'];
    tabs.forEach(t => {
        const tabBtn = document.getElementById(`wb-tab-${t}`);
        const panel = document.getElementById(`wb-panel-${t}`);
        if (tabBtn) tabBtn.classList.toggle('active', t === tabName);
        if (panel) panel.style.display = (t === tabName) ? 'block' : 'none';
    });
    if (tabName === 'homebrew') {
        if (typeof window.loadHomebrewLibrary === 'function') {
            window.loadHomebrewLibrary();
        }
    }
};

// --- 1. SETTLEMENT SHOP GENERATOR ENGINE ---
window.generateSettlementShop = function() {
    const settlement = document.getElementById('wb-shop-settlement-select')?.value || 'town';
    const shopType = document.getElementById('wb-shop-type-select')?.value || 'blacksmith';
    const container = document.getElementById('wb-shop-results-container');
    if (!container) return;

    const adjectives = ['Prancing', 'Gilded', 'Copper', 'Iron', 'Rusty', 'Dancing', 'Silent', 'Golden', 'Silver', 'Shattered', 'Whispering', 'Roaring'];
    const nouns = ['Pony', 'Anvil', 'Dragon', 'Raven', 'Cauldron', 'Shield', 'Vault', 'Goblet', 'Falcon', 'Griffin', 'Lantern', 'Wand'];
    const storeName = adjectives[Math.floor(Math.random() * adjectives.length)] + ' ' + nouns[Math.floor(Math.random() * nouns.length)];

    const firstNames = ['Thorin', 'Eldrin', 'Lyra', 'Grumsh', 'Maeve', 'Gideon', 'Vesper', 'Balthazar', 'Fiona', 'Corvus'];
    const merchantName = firstNames[Math.floor(Math.random() * firstNames.length)];

    const attitudes = ['suspicious but fair', 'overly friendly and talkative', 'grumpy and impatient', 'keen haggler', 'mysterious and soft-spoken'];
    const merchantAttitude = attitudes[Math.floor(Math.random() * attitudes.length)];

    // Price multiplier based on settlement tier
    let mult = 1.0;
    if (settlement === 'village') mult = 1.15;
    else if (settlement === 'city') mult = 0.95;
    else if (settlement === 'metropolis') mult = 0.9;

    const inventories = {
        tavern: [
            { name: 'Common Ale (Gallon)', price: 2, unit: 'sp', desc: 'Hearty local brew' },
            { name: 'Fine Elven Wine (Bottle)', price: 10, unit: 'gp', desc: 'Aged 50 years' },
            { name: 'Hot Stew & Bread (Per Person)', price: 3, unit: 'cp', desc: 'Warm savory venison' },
            { name: 'Private Room (Per Night)', price: 8, unit: 'sp', desc: 'Clean bed & fireplace' },
            { name: 'Common Suite (Per Night)', price: 2, unit: 'sp', desc: 'Bunk room' },
            { name: 'Spiced Dwarven Brandy', price: 2, unit: 'gp', desc: 'Burns clean & strong' }
        ],
        blacksmith: [
            { name: 'Longsword (+0)', price: 15, unit: 'gp', desc: '1d8 versatile slashing' },
            { name: 'Shield (+2 AC)', price: 10, unit: 'gp', desc: 'Steel-rimmed wood' },
            { name: 'Chain Shirt (13+DEX AC)', price: 50, unit: 'gp', desc: 'Medium armor' },
            { name: 'Plate Armor (18 AC)', price: 1500, unit: 'gp', desc: 'Heavy full plate' },
            { name: 'Dagger (+0)', price: 2, unit: 'gp', desc: '1d4 finesse light' },
            { name: 'Crossbow, Light', price: 25, unit: 'gp', desc: '1d8 piercing' },
            { name: 'Crossbow Bolts (20)', price: 1, unit: 'gp', desc: 'Standard steel tips' }
        ],
        alchemist: [
            { name: 'Potion of Healing (2d4+2)', price: 50, unit: 'gp', desc: 'Standard red elixir' },
            { name: 'Antitoxin (Adv vs Poison)', price: 50, unit: 'gp', desc: 'Vial of bitter herbal tonic' },
            { name: 'Alchemist’s Fire (Vial)', price: 50, unit: 'gp', desc: '1d4 fire damage per turn' },
            { name: 'Acid (Vial)', price: 25, unit: 'gp', desc: '2d6 acid splash damage' },
            { name: 'Healer’s Kit (10 uses)', price: 5, unit: 'gp', desc: 'Stabilize dying allies' },
            { name: 'Potion of Greater Healing (4d4+4)', price: 150, unit: 'gp', desc: 'High potency potion' }
        ],
        arcane: [
            { name: 'Spell Scroll (1st Level)', price: 75, unit: 'gp', desc: 'Shield / Magic Missile' },
            { name: 'Spell Scroll (2nd Level)', price: 200, unit: 'gp', desc: 'Misty Step / Shatter' },
            { name: 'Component Pouch', price: 25, unit: 'gp', desc: 'Contains essential spell reagents' },
            { name: 'Arcane Focus (Crystal/Staff)', price: 10, unit: 'gp', desc: 'Channels spellcraft' },
            { name: 'Bag of Holding', price: 500, unit: 'gp', desc: 'Holds 500 lbs in extradimensional pocket' },
            { name: 'Wand of Magic Detection', price: 300, unit: 'gp', desc: '3 charges per day' }
        ],
        general: [
            { name: 'Ration (1 day)', price: 5, unit: 'sp', desc: 'Dried meat & hardtack' },
            { name: 'Rope, Hempen (50 ft)', price: 1, unit: 'gp', desc: 'Holds up to 300 lbs' },
            { name: 'Torch (10)', price: 1, unit: 'sp', desc: 'Shed 20ft bright light' },
            { name: 'Tinderbox', price: 5, unit: 'sp', desc: 'Flint, steel & tinder' },
            { name: 'Bedroll', price: 1, unit: 'gp', desc: 'Warm canvas blanket' },
            { name: 'Crowbar (+2 Str Check)', price: 2, unit: 'gp', desc: 'Leverage tool' }
        ]
    };

    const items = inventories[shopType] || inventories.general;

    let itemsHtml = '';
    items.forEach(item => {
        const finalPrice = Math.max(1, Math.round(item.price * mult));
        itemsHtml += `
            <div style="display:flex; justify-content:space-between; align-items:center; background:#0d0d12; border:1px solid var(--border-iron); border-radius:4px; padding:6px 10px; margin-bottom:6px;">
                <div>
                    <strong style="color:var(--text-main); font-size:0.8rem;">${item.name}</strong>
                    <div style="font-size:0.7rem; color:var(--text-muted);">${item.desc}</div>
                </div>
                <span style="font-weight:bold; color:var(--gold-amber); font-size:0.85rem; white-space:nowrap;">${finalPrice} ${item.unit}</span>
            </div>
        `;
    });

    container.innerHTML = `
        <div style="background:#141221; border:1.5px solid var(--gold-amber); border-radius:6px; padding:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-iron); padding-bottom:6px; margin-bottom:8px;">
                <h4 style="font-family:'Cinzel', serif; color:var(--gold-amber); margin:0;">${storeName}</h4>
                <span style="font-size:0.7rem; color:var(--arcane-violet); font-weight:bold; text-transform:uppercase;">${settlement}</span>
            </div>
            <div style="font-size:0.75rem; color:#cbd5e1; margin-bottom:10px; font-style:italic;">
                Merchant: <strong>${merchantName}</strong> (${merchantAttitude})
            </div>
            <div style="max-height:260px; overflow-y:auto;">
                ${itemsHtml}
            </div>
        </div>
    `;
};

// --- 2. 5e TREASURE & LOOT HOARD ENGINE ---
window.generateTreasureLoot = async function() {
    const crTier = document.getElementById('wb-treasure-cr-select')?.value || '5-10';
    const type = document.getElementById('wb-treasure-type-select')?.value || 'hoard';
    const container = document.getElementById('wb-treasure-results-container');
    if (!container) return;

    let cp = 0, sp = 0, gp = 0, pp = 0;
    let gems = [];
    let magicItems = [];

    // Helper random choice
    const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const rollDice = (count, sides) => {
        let total = 0;
        for (let i = 0; i < count; i++) total += Math.floor(Math.random() * sides) + 1;
        return total;
    };

    // Gem & Art Object Tables by Tier
    const gemTables = {
        '0-4': [
            '10gp Blue quartz', '10gp Eye agate', '10gp Lapis lazuli', '10gp Malachite', '10gp Moss agate',
            '10gp Obsidian', '10gp Tiger eye', '10gp Turquoise', '50gp Bloodstone', '50gp Carnelian',
            '50gp Chalcedony', '50gp Moonstone', '50gp Onyx', '50gp Quartz star', '50gp Zircon',
            '25gp Silvered Carved Goblet', '25gp Cloth-of-Gold Vestment'
        ],
        '5-10': [
            '100gp Amber', '100gp Amethyst', '100gp Chrysoberyl', '100gp Coral', '100gp Garnet',
            '100gp Jade', '100gp Pearl', '100gp Spinel', '100gp Tourmaline',
            '250gp Carved Bone Statuette', '250gp Small Gold Idol', '250gp Brass Ring with Inlaid Rubies',
            '250gp Silver Chalice with Emerald Inlay'
        ],
        '11-16': [
            '500gp Alexandrite', '500gp Aquamarine', '500gp Black pearl', '500gp Blue topaz', '500gp Peridot',
            '500gp Topaz', '750gp Silver Chalice with Rubies', '750gp Carved Ivory Statuette of a Dragon',
            '750gp Gold Music Box with Fine Filigree', '1000gp Black opal', '1000gp Blue sapphire', '1000gp Diamond', '1000gp Ruby'
        ],
        '17+': [
            '1000gp Black opal', '1000gp Blue sapphire', '1000gp Diamond', '1000gp Emerald', '1000gp Fire opal', '1000gp Ruby',
            '2500gp Fine Gold Chain Set with Rubies', '2500gp Platinum Crown Set with Diamonds', '2500gp Carved Jade Dragon Statue',
            '7500gp Jeweled Gold Crown of an Ancient Monarch', '7500gp Platinum Scepter set with Star Sapphires'
        ]
    };

    // Fetch dynamic items from bazaar / items.json if cached or available
    let allItems = [];
    try {
        if (window.bazaarItems && window.bazaarItems.length > 0) {
            allItems = window.bazaarItems;
        } else {
            const res = await fetch('/api/bazaar');
            if (res.ok) {
                allItems = await res.json();
                window.bazaarItems = allItems;
            }
        }
    } catch(e) {}

    // Fallback magic items per tier if bazaar API unavailable
    const fallbackMagic = {
        '0-4': ['Potion of Healing', 'Spell Scroll (1st Level)', 'Bag of Holding', '+1 Weapon', 'Driftglobe', 'Wand of Magic Detection', 'Ring of Swimming', 'Cloak of Elvenkind'],
        '5-10': ['+1 Armor', '+1 Shield', '+1 Longsword', 'Potion of Greater Healing', 'Wand of Fireballs', 'Ring of Protection', 'Cloak of Protection', 'Boots of Speed', 'Winged Boots', 'Weapon of Warning'],
        '11-16': ['+2 Weapon', '+2 Shield', '+2 Armor', 'Potion of Superior Healing', 'Staff of Power', 'Ring of Spell Storing', 'Wand of Polymorph', 'Amulet of Health', 'Flame Tongue Longsword'],
        '17+': ['+3 Weapon', '+3 Shield', '+3 Armor', 'Staff of the Magi', 'Cloak of Invisibility', 'Ring of Three Wishes', 'Vorpal Sword', 'Potion of Supreme Healing', 'Tome of Clear Thought']
    };

    // Helper to get random magic items for tier
    const getMagicItemForTier = (tier) => {
        if (allItems.length > 0) {
            let targetRarity = 'Common';
            if (tier === '0-4') targetRarity = pickRandom(['Common', 'Uncommon']);
            else if (tier === '5-10') targetRarity = pickRandom(['Uncommon', 'Rare']);
            else if (tier === '11-16') targetRarity = pickRandom(['Rare', 'Very Rare']);
            else targetRarity = pickRandom(['Very Rare', 'Legendary']);

            const filtered = allItems.filter(i => (i.rarity || '').toLowerCase().includes(targetRarity.toLowerCase()));
            if (filtered.length > 0) {
                const item = pickRandom(filtered);
                const price = item.price ? ` (${item.price} gp)` : '';
                return `${item.name}${price}`;
            }
        }
        return pickRandom(fallbackMagic[tier] || fallbackMagic['5-10']);
    };

    if (type === 'individual') {
        if (crTier === '0-4') {
            cp = rollDice(5, 6);
            sp = rollDice(3, 6);
            gp = rollDice(2, 6);
        } else if (crTier === '5-10') {
            cp = rollDice(4, 6) * 100;
            sp = rollDice(3, 6) * 10;
            gp = rollDice(2, 6) * 10;
            pp = rollDice(1, 6) * 2;
        } else if (crTier === '11-16') {
            gp = rollDice(4, 6) * 100;
            pp = rollDice(1, 6) * 10;
        } else {
            gp = rollDice(12, 6) * 100;
            pp = rollDice(8, 6) * 10;
        }
    } else {
        // Hoard
        if (crTier === '0-4') {
            cp = rollDice(6, 6) * 100;
            sp = rollDice(3, 6) * 100;
            gp = rollDice(2, 6) * 10;
            const gemCount = rollDice(2, 4);
            for (let i = 0; i < gemCount; i++) gems.push(pickRandom(gemTables['0-4']));
            const magicCount = Math.random() < 0.5 ? 1 : 2;
            for (let i = 0; i < magicCount; i++) magicItems.push(getMagicItemForTier('0-4'));
        } else if (crTier === '5-10') {
            cp = rollDice(2, 6) * 100;
            sp = rollDice(2, 6) * 1000;
            gp = rollDice(6, 6) * 100;
            pp = rollDice(3, 6) * 10;
            const gemCount = rollDice(3, 6);
            for (let i = 0; i < gemCount; i++) gems.push(pickRandom(gemTables['5-10']));
            const magicCount = rollDice(1, 4);
            for (let i = 0; i < magicCount; i++) magicItems.push(getMagicItemForTier('5-10'));
        } else if (crTier === '11-16') {
            gp = rollDice(4, 6) * 1000;
            pp = rollDice(5, 6) * 100;
            const gemCount = rollDice(3, 6);
            for (let i = 0; i < gemCount; i++) gems.push(pickRandom(gemTables['11-16']));
            const magicCount = rollDice(1, 4);
            for (let i = 0; i < magicCount; i++) magicItems.push(getMagicItemForTier('11-16'));
        } else {
            gp = rollDice(12, 6) * 1000;
            pp = rollDice(8, 6) * 1000;
            const gemCount = rollDice(3, 8);
            for (let i = 0; i < gemCount; i++) gems.push(pickRandom(gemTables['17+']));
            const magicCount = rollDice(1, 6);
            for (let i = 0; i < magicCount; i++) magicItems.push(getMagicItemForTier('17+'));
        }
    }

    let coinStr = [];
    if (cp > 0) coinStr.push(`<span style="color:#b45309;">${cp.toLocaleString()} CP</span>`);
    if (sp > 0) coinStr.push(`<span style="color:#94a3b8;">${sp.toLocaleString()} SP</span>`);
    if (gp > 0) coinStr.push(`<span style="color:#fbbf24;">${gp.toLocaleString()} GP</span>`);
    if (pp > 0) coinStr.push(`<span style="color:#a78bfa;">${pp.toLocaleString()} PP</span>`);

    let gemsHtml = gems.length > 0 ? gems.map(g => `<li style="color:#f472b6;">${g}</li>`).join('') : '<li style="color:var(--text-muted);">None</li>';
    let magicHtml = magicItems.length > 0 ? magicItems.map(m => `<li style="color:#38bdf8; font-weight:bold;">${m}</li>`).join('') : '<li style="color:var(--text-muted);">None</li>';

    const totalGpApprox = gp + (pp * 10) + Math.floor(sp / 10) + Math.floor(cp / 100);

    container.innerHTML = `
        <div style="background:#0c0c12; border:1.5px solid var(--gold-amber); border-radius:6px; padding:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-iron); padding-bottom:6px; margin-bottom:8px;">
                <h4 style="font-family:'Cinzel', serif; color:var(--gold-amber); margin:0;">${type === 'hoard' ? '🏆 Hoard Treasure' : '💰 Individual Loot'}</h4>
                <span style="font-size:0.75rem; background:rgba(245,158,11,0.15); color:var(--gold-amber); border:1px solid var(--gold-amber); padding:2px 8px; border-radius:4px; font-weight:bold;">CR ${crTier} (Est. ${totalGpApprox.toLocaleString()} GP)</span>
            </div>
            
            <div style="margin-bottom:10px;">
                <strong style="font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:4px;">Coins & Currency:</strong>
                <div style="font-size:0.95rem; font-weight:bold; display:flex; gap:10px; flex-wrap:wrap;">
                    ${coinStr.join(' | ') || 'No coins'}
                </div>
            </div>

            ${type === 'hoard' ? `
            <div style="margin-bottom:8px; border-top:1px solid var(--border-iron); padding-top:6px;">
                <strong style="font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:4px;">Gems & Art Objects (${gems.length}):</strong>
                <ul style="font-size:0.8rem; margin:0; padding-left:18px; max-height:120px; overflow-y:auto;">${gemsHtml}</ul>
            </div>
            <div style="border-top:1px solid var(--border-iron); padding-top:6px;">
                <strong style="font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:4px;">Magic Items (${magicItems.length}):</strong>
                <ul style="font-size:0.8rem; margin:0; padding-left:18px; max-height:120px; overflow-y:auto;">${magicHtml}</ul>
            </div>
            ` : ''}

            <div style="display:flex; gap:6px; margin-top:10px; border-top:1px solid var(--border-iron); padding-top:8px;">
                <button class="btn-primary" style="flex:1; background:var(--gold-amber); color:black; font-size:0.75rem; font-weight:bold; padding:6px;" onclick="generateTreasureLoot()">🎲 Roll Again</button>
                ${window.dividePartyGoldTreasureEvenly ? `<button class="btn-primary" style="flex:1; background:#10b981; color:white; font-size:0.75rem; padding:6px;" onclick="dividePartyGoldTreasureEvenly()">💰 Split Gold</button>` : ''}
            </div>
        </div>
    `;
};

// --- 3. BIOME ENCOUNTER & WEATHER GENERATOR ENGINE ---
window.generateBiomeEncounter = function() {
    const biome = document.getElementById('wb-encounter-biome-select')?.value || 'dungeon';
    const partyLvl = document.getElementById('wb-encounter-party-lvl-select')?.value || '5-10';
    const container = document.getElementById('wb-encounter-results-container');
    if (!container) return;

    const tables = {
        forest: [
            { text: '1x Owlbear & 2x Dire Wolves', monsters: [{ name: 'Owlbear', count: 1 }, { name: 'Dire Wolf', count: 2 }], weather: 'Heavy Rain' },
            { text: '1x Green Hag & 4x Goblins', monsters: [{ name: 'Green Hag', count: 1 }, { name: 'Goblin', count: 4 }], weather: 'Clear' },
            { text: '1x Treant (Corrupted)', monsters: [{ name: 'Treant', count: 1 }], weather: 'Heavy Snow' }
        ],
        dungeon: [
            { text: '1x Gelatinous Cube & 3x Skeleton Archers', monsters: [{ name: 'Gelatinous Cube', count: 1 }, { name: 'Skeleton', count: 3 }], weather: 'Clear' },
            { text: '1x Vampire Spawn & 4x Ghoul Minions', monsters: [{ name: 'Vampire Spawn', count: 1 }, { name: 'Ghoul', count: 4 }], weather: 'Clear' },
            { text: '1x Minotaur in Narrow Passage', monsters: [{ name: 'Minotaur', count: 1 }], weather: 'Clear' }
        ],
        mountain: [
            { text: '1x Young Red Dragon on Peak', monsters: [{ name: 'Young Red Dragon', count: 1 }], weather: 'Heavy Snow' },
            { text: '2x Hill Giants throwing boulders', monsters: [{ name: 'Hill Giant', count: 2 }], weather: 'Clear' },
            { text: '4x Griffins defending nest', monsters: [{ name: 'Griffin', count: 4 }], weather: 'Clear' }
        ],
        underdark: [
            { text: '1x Mind Flayer & 2x Intellect Devourers', monsters: [{ name: 'Mind Flayer', count: 1 }, { name: 'Intellect Devourer', count: 2 }], weather: 'Clear' },
            { text: '1x Duergar Squad (4x Duergar)', monsters: [{ name: 'Duergar', count: 4 }], weather: 'Clear' },
            { text: '1x Phase Spider ambush', monsters: [{ name: 'Phase Spider', count: 1 }], weather: 'Clear' }
        ],
        coastal: [
            { text: '1x Sahuagin Baron & 4x Sahuagin Warriors', monsters: [{ name: 'Sahuagin Baron', count: 1 }, { name: 'Sahuagin', count: 4 }], weather: 'Heavy Rain' },
            { text: '1x Sea Hag & 2x Merrow', monsters: [{ name: 'Sea Hag', count: 1 }, { name: 'Merrow', count: 2 }], weather: 'Heavy Rain' }
        ],
        desert: [
            { text: '1x Young Blue Dragon in Sandstorm', monsters: [{ name: 'Young Blue Dragon', count: 1 }], weather: 'Sandstorm' },
            { text: '3x Yuan-ti Purebloods', monsters: [{ name: 'Yuan-ti Pureblood', count: 3 }], weather: 'Clear' }
        ]
    };

    const options = tables[biome] || tables.dungeon;
    const selected = options[Math.floor(Math.random() * options.length)];
    const d100Roll = Math.floor(Math.random() * 100) + 1;

    container.innerHTML = `
        <div style="background:#0c0c12; border:1.5px solid var(--crimson-rage); border-radius:6px; padding:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-iron); padding-bottom:6px; margin-bottom:8px;">
                <span style="background:var(--crimson-rage); color:white; font-weight:bold; font-family:monospace; font-size:0.8rem; padding:2px 6px; border-radius:4px;">d100 Roll: ${d100Roll}</span>
                <span style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">${biome}</span>
            </div>

            <div style="font-size:0.95rem; font-weight:bold; color:var(--gold-amber); font-family:'Cinzel', serif; margin-bottom:8px;">
                ⚔️ ${selected.text}
            </div>

            <div style="font-size:0.75rem; color:#cbd5e1; margin-bottom:12px;">
                Environmental FX: <strong style="color:#38bdf8;">${selected.weather}</strong>
            </div>

            <div style="display:flex; gap:6px;">
                <button class="btn-primary" style="background:#ef4444; flex:1; font-size:0.75rem; font-weight:bold;" onclick="loadEncounterMonstersToTracker(${JSON.stringify(selected.monsters).replace(/"/g, '&quot;')})">⚔️ Load Monsters to Combat Tracker</button>
                <button class="btn-primary" style="background:#3b82f6; font-size:0.75rem;" onclick="broadcastEncounterWeatherToProjector('${selected.weather}')">📺 Set Projector Weather</button>
            </div>
        </div>
    `;
};

window.loadEncounterMonstersToTracker = function(monstersList) {
    if (!monstersList || !Array.isArray(monstersList)) return;
    monstersList.forEach(m => {
        if (typeof window.spawnMultiMonsters === 'function') {
            window.spawnMultiMonsters(m.name, m.count);
        }
    });
    alert(`Loaded ${monstersList.map(m => `${m.count}x ${m.name}`).join(', ')} into Initiative Tracker!`);
};

window.broadcastEncounterWeatherToProjector = function(weatherType) {
    if (window.socket) {
        window.socket.emit('update-projector-state', { weatherMode: weatherType });
        alert(`Projector weather mode updated to: ${weatherType}`);
    }
};

// --- 4. RICH NPC & RUMOR GENERATOR ENGINE ---
window.generateRichNPCProfile = function() {
    const container = document.getElementById('wb-npc-results-container');
    if (!container) return;

    const races = ['Human', 'Elf', 'Dwarf', 'Halfling', 'Gnome', 'Half-Orc', 'Tiefling', 'Dragonborn'];
    const alignments = ['Lawful Good', 'Neutral Good', 'Chaotic Good', 'Lawful Neutral', 'True Neutral', 'Chaotic Neutral', 'Lawful Evil'];
    
    const names = ['Alden Vane', 'Brimstone Kael', 'Celeste Moonflower', 'Dorn Ironfist', 'Elara Swift', 'Fargus Stout', 'Grynn Shadowhand', 'Hespera Drake'];
    const appearances = ['Flamboyant silk doublet with missing tooth', 'Braided beard tucked into iron belt', 'Deep facial scar across left eye', 'Constant nervous twitch & silver ring', 'Intense green eyes & raven cloak'];
    const traits = ['Fidgets with a copper coin', 'Speaks in a low, conspiratorial whisper', 'Uses big academic words incorrectly', 'Constantly glances over shoulder'];
    const secrets = ['Owes a massive gambling debt to the Zhentarim', 'Secretly of disgraced noble blood', 'Carries a pocketbook of blackmailed councilors', 'Guards a cursed bloodstone relic'];
    const rumors = ['The blacksmith apprentice went missing near the old mill...', 'Red lights were seen flickering atop the Sunless Spire last midnight...', 'The Guard Captain has been accepting bribes from the Crimson Guild...'];

    const pick = arr => arr[Math.floor(Math.random() * arr.length)];

    const npc = {
        name: pick(names),
        race: pick(races),
        alignment: pick(alignments),
        appearance: pick(appearances),
        trait: pick(traits),
        secret: pick(secrets),
        rumor: pick(rumors)
    };

    container.innerHTML = `
        <div style="background:#0c0c12; border:1.5px solid #10b981; border-radius:6px; padding:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-iron); padding-bottom:6px; margin-bottom:8px;">
                <h4 style="font-family:'Cinzel', serif; color:#10b981; margin:0;">${npc.name}</h4>
                <span style="font-size:0.7rem; color:var(--text-muted);">${npc.race} | ${npc.alignment}</span>
            </div>

            <div style="font-size:0.75rem; color:#cbd5e1; display:flex; flex-direction:column; gap:4px; margin-bottom:10px;">
                <div><strong>Look:</strong> ${npc.appearance}</div>
                <div><strong>Mannerism:</strong> ${npc.trait}</div>
                <div><strong>Secret:</strong> <span style="color:#f472b6;">${npc.secret}</span></div>
                <div><strong>Rumor:</strong> <span style="color:#fbbf24; font-style:italic;">"${npc.rumor}"</span></div>
            </div>

            <button class="btn-primary" style="background:#10b981; width:100%; font-size:0.75rem; font-weight:bold;" onclick="pinNpcToNotes('${npc.name.replace(/'/g, "\\'")}', '${npc.race}', '${npc.rumor.replace(/'/g, "\\'")}')">📌 Pin NPC & Rumor to Session Notes</button>
        </div>
    `;
};

window.pinNpcToNotes = function(name, race, rumor) {
    const text = `[NPC] ${name} (${race}) - Rumor: "${rumor}"`;
    const textarea = document.getElementById('scratchpad-textarea');
    if (textarea) {
        textarea.value = text;
        if (typeof window.saveScratchpadNote === 'function') {
            window.saveScratchpadNote();
        }
    }
    alert(`Pinned ${name} to Session Notes!`);
};

// --- 5. DUNGEON HAZARD & TRAP ENGINE ---
window.generateDungeonHazard = function() {
    const container = document.getElementById('wb-hazard-results-container');
    if (!container) return;

    const traps = [
        { name: 'Poison Dart Wall Trigger', trigger: 'Pressure Plate on 3rd floor tile', percDC: 'DC 14 Perception', saveDC: 'DC 13 CON Save', dmg: '2d6 Poison Damage & Poisoned 1 Hour', fix: 'Thieves Tools (DC 13) to wedge pressure plate' },
        { name: 'Crushing Stone Ceiling', trigger: 'Pulling false golden lever', percDC: 'DC 16 Investigation', saveDC: 'DC 15 DEX Save', dmg: '4d10 Bludgeoning & Trapped', fix: 'Athletics (DC 16) to jam gear teeth' },
        { name: 'Arcane Flame Scythe', trigger: 'Crossing tripwire rune', percDC: 'DC 15 Arcana', saveDC: 'DC 14 DEX Save', dmg: '3d8 Fire Damage', fix: 'Dispel Magic or Arcana (DC 14) to erase rune' }
    ];

    const trap = traps[Math.floor(Math.random() * traps.length)];

    container.innerHTML = `
        <div style="background:#0c0c12; border:1.5px solid #ec4899; border-radius:6px; padding:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-iron); padding-bottom:6px; margin-bottom:8px;">
                <h4 style="font-family:'Cinzel', serif; color:#ec4899; margin:0;">⚡ ${trap.name}</h4>
                <span style="font-size:0.7rem; color:var(--gold-amber); font-weight:bold;">${trap.percDC}</span>
            </div>

            <div style="font-size:0.75rem; color:#cbd5e1; display:flex; flex-direction:column; gap:4px;">
                <div><strong>Trigger:</strong> ${trap.trigger}</div>
                <div><strong>Save / Check:</strong> ${trap.saveDC}</div>
                <div><strong>Lethal Impact:</strong> <span style="color:#ef4444; font-weight:bold;">${trap.dmg}</span></div>
                <div><strong>Countermeasure:</strong> <span style="color:#38bdf8;">${trap.fix}</span></div>
            </div>
        </div>
    `;
};

// ====================================================
// --- 6. HOMEBREW ITEM FORGE & POPOUT CREATOR ENGINE ---
// ====================================================

let currentEditingHomebrewItemId = null;
let isHomebrewRawJsonMode = false;

window.openHomebrewItemCreator = async function(itemToEdit = null) {
    const modal = document.getElementById('homebrew-item-creator-modal');
    if (!modal) return;

    isHomebrewRawJsonMode = false;
    const formView = document.getElementById('hb-creator-form-view');
    const jsonView = document.getElementById('hb-creator-json-view');
    const toggleBtn = document.getElementById('hb-toggle-view-btn');
    if (formView) formView.style.display = 'flex';
    if (jsonView) jsonView.style.display = 'none';
    if (toggleBtn) toggleBtn.innerText = '📝 Switch to Raw JSON';

    // Populate player character target dropdown
    await populateHomebrewPlayerDropdown();

    if (itemToEdit) {
        currentEditingHomebrewItemId = itemToEdit.id || null;
        populateFormFromHomebrewItem(itemToEdit);
    } else {
        currentEditingHomebrewItemId = null;
        resetHomebrewItemForm();
    }

    modal.classList.remove('hidden');
};

window.closeHomebrewItemCreator = function() {
    const modal = document.getElementById('homebrew-item-creator-modal');
    if (modal) modal.classList.add('hidden');
};

window.onHomebrewTypeChange = function() {
    const type = document.getElementById('hb-item-type')?.value || 'M';
    const weaponFields = document.getElementById('hb-weapon-fields');
    const armorFields = document.getElementById('hb-armor-fields');
    const combatSection = document.getElementById('hb-section-combat');

    const isWeapon = (type === 'M' || type === 'R');
    const isArmor = (type === 'LA' || type === 'MA' || type === 'HA' || type === 'S');

    if (weaponFields) weaponFields.style.display = isWeapon ? 'flex' : 'none';
    if (armorFields) armorFields.style.display = isArmor ? 'grid' : 'none';
    if (combatSection) combatSection.style.display = (isWeapon || isArmor) ? 'block' : 'none';
};

window.onHomebrewAttunementChange = function() {
    const select = document.getElementById('hb-item-attunement-select')?.value || 'none';
    const textInput = document.getElementById('hb-item-attunement-text');
    if (!textInput) return;

    if (select === 'custom') {
        textInput.disabled = false;
        textInput.placeholder = 'e.g. by a spellcaster, by a Paladin';
    } else if (select === 'yes') {
        textInput.disabled = true;
        textInput.value = 'Requires Attunement';
    } else {
        textInput.disabled = true;
        textInput.value = '';
    }
};

window.toggleHomebrewCreatorView = function() {
    const formView = document.getElementById('hb-creator-form-view');
    const jsonView = document.getElementById('hb-creator-json-view');
    const toggleBtn = document.getElementById('hb-toggle-view-btn');
    const rawTextarea = document.getElementById('hb-raw-json-textarea');

    if (!isHomebrewRawJsonMode) {
        // Form -> JSON
        const itemObj = getHomebrewItemFromForm();
        if (rawTextarea) rawTextarea.value = JSON.stringify(itemObj, null, 2);
        if (formView) formView.style.display = 'none';
        if (jsonView) jsonView.style.display = 'flex';
        if (toggleBtn) toggleBtn.innerText = '👁️ Switch to Form View';
        isHomebrewRawJsonMode = true;
    } else {
        // JSON -> Form
        try {
            if (rawTextarea && rawTextarea.value.trim()) {
                const parsed = JSON.parse(rawTextarea.value);
                populateFormFromHomebrewItem(parsed);
            }
        } catch (e) {
            alert("Invalid JSON format in raw editor. Please fix syntax errors before switching views.");
            return;
        }
        if (formView) formView.style.display = 'flex';
        if (jsonView) jsonView.style.display = 'none';
        if (toggleBtn) toggleBtn.innerText = '📝 Switch to Raw JSON';
        isHomebrewRawJsonMode = false;
    }
};

window.addHomebrewAbilityModifierRow = function(statKey = 'int', val = 1) {
    const container = document.getElementById('hb-ability-modifiers-container');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'hb-ability-modifier-row';
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.alignItems = 'center';

    row.innerHTML = `
        <select class="hb-mod-stat-select" style="flex: 2; background: #090a10; color: #fff; border: 1px solid var(--border-iron); padding: 6px; border-radius: 6px; font-size: 0.8rem;">
            <option value="str">💪 Strength (STR)</option>
            <option value="dex">🏃 Dexterity (DEX)</option>
            <option value="con">🛡️ Constitution (CON)</option>
            <option value="int">🧠 Intelligence (INT)</option>
            <option value="wis">🦉 Wisdom (WIS)</option>
            <option value="cha">👑 Charisma (CHA)</option>
        </select>
        <input type="number" class="hb-mod-val-input" value="${val}" placeholder="Modifier e.g. 1" style="flex: 1; background: #090a10; color: #fff; border: 1px solid var(--border-iron); padding: 6px; border-radius: 6px; font-size: 0.8rem;">
        <button class="btn-danger" type="button" onclick="this.parentElement.remove()" style="padding: 4px 8px; font-size: 0.8rem;">✕</button>
    `;

    container.appendChild(row);
    const sel = row.querySelector('.hb-mod-stat-select');
    if (sel) sel.value = statKey;
};

function resetHomebrewItemForm() {
    document.getElementById('hb-item-name').value = '';
    document.getElementById('hb-item-type').value = 'M';
    document.getElementById('hb-item-rarity').value = 'Rare';
    document.getElementById('hb-item-value').value = '500';
    document.getElementById('hb-item-weight').value = '3';
    document.getElementById('hb-item-source').value = 'Homebrew';
    document.getElementById('hb-item-weapon-cat').value = 'Martial';
    document.getElementById('hb-item-dmg1').value = '1d8';
    document.getElementById('hb-item-dmg2').value = '';
    document.getElementById('hb-item-dmgtype').value = 'S';
    document.getElementById('hb-item-ac').value = '';
    document.getElementById('hb-item-ac-bonus').value = '';
    document.getElementById('hb-item-attunement-select').value = 'none';
    document.getElementById('hb-item-attunement-text').value = '';
    document.getElementById('hb-item-attunement-text').disabled = true;
    document.getElementById('hb-item-description').value = '';

    const checkboxes = document.querySelectorAll('.hb-property-cb');
    checkboxes.forEach(cb => cb.checked = false);

    const modContainer = document.getElementById('hb-ability-modifiers-container');
    if (modContainer) modContainer.innerHTML = '';

    window.onHomebrewTypeChange();
}

function getHomebrewItemFromForm() {
    if (isHomebrewRawJsonMode) {
        const rawTextarea = document.getElementById('hb-raw-json-textarea');
        try {
            if (rawTextarea && rawTextarea.value.trim()) {
                return JSON.parse(rawTextarea.value);
            }
        } catch (e) {}
    }

    const name = document.getElementById('hb-item-name')?.value.trim() || 'Unnamed Custom Item';
    const type = document.getElementById('hb-item-type')?.value || 'G';
    const rarity = document.getElementById('hb-item-rarity')?.value || 'None';
    const value = parseFloat(document.getElementById('hb-item-value')?.value) || 0;
    const weight = parseFloat(document.getElementById('hb-item-weight')?.value) || 0;
    const source = document.getElementById('hb-item-source')?.value.trim() || 'Homebrew';
    const descText = document.getElementById('hb-item-description')?.value.trim() || '';

    const item = {
        id: currentEditingHomebrewItemId || ('hb_item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)),
        name: name,
        type: type,
        rarity: rarity,
        value: value * 100, // Value in copper pieces for standard 5e format (1 gp = 100 cp)
        weight: weight,
        source: source,
        isHomebrew: true
    };

    // Attunement
    const attuneSelect = document.getElementById('hb-item-attunement-select')?.value || 'none';
    if (attuneSelect === 'yes') {
        item.reqAttune = true;
    } else if (attuneSelect === 'custom') {
        const customText = document.getElementById('hb-item-attunement-text')?.value.trim();
        item.reqAttune = customText || true;
    }

    // Ability Score Modifiers
    const abilityMods = {};
    document.querySelectorAll('.hb-ability-modifier-row').forEach(row => {
        const stat = row.querySelector('.hb-mod-stat-select')?.value;
        const modVal = parseInt(row.querySelector('.hb-mod-val-input')?.value);
        if (stat && !isNaN(modVal) && modVal !== 0) {
            abilityMods[stat] = modVal;
        }
    });
    if (Object.keys(abilityMods).length > 0) {
        item.ability = abilityMods;
    }

    // Weapons
    if (type === 'M' || type === 'R') {
        item.weaponCategory = document.getElementById('hb-item-weapon-cat')?.value || 'Martial';
        const dmg1 = document.getElementById('hb-item-dmg1')?.value.trim();
        const dmg2 = document.getElementById('hb-item-dmg2')?.value.trim();
        const dmgType = document.getElementById('hb-item-dmgtype')?.value || 'S';
        if (dmg1) item.dmg1 = dmg1;
        if (dmg2) item.dmg2 = dmg2;
        item.dmgType = dmgType;

        const props = [];
        document.querySelectorAll('.hb-property-cb:checked').forEach(cb => props.push(cb.value));
        if (props.length > 0) item.property = props;
    }

    // Armor / Shield
    if (type === 'LA' || type === 'MA' || type === 'HA' || type === 'S') {
        const ac = parseInt(document.getElementById('hb-item-ac')?.value);
        const acBonus = parseInt(document.getElementById('hb-item-ac-bonus')?.value);
        if (!isNaN(ac)) item.ac = ac;
        if (!isNaN(acBonus)) item.acBonus = acBonus;
    }

    // Description Entries
    if (descText) {
        item.entries = descText.split('\n\n').filter(p => p.trim() !== '');
    }

    return item;
}

function populateFormFromHomebrewItem(item) {
    if (!item) return;

    document.getElementById('hb-item-name').value = item.name || '';
    document.getElementById('hb-item-type').value = item.type || 'G';
    document.getElementById('hb-item-rarity').value = item.rarity || 'None';
    
    // Value in GP (stored in CP in 5e format)
    const gpValue = (item.value !== undefined) ? (typeof item.value === 'number' ? item.value / 100 : item.value) : 0;
    document.getElementById('hb-item-value').value = gpValue;
    document.getElementById('hb-item-weight').value = item.weight || 0;
    document.getElementById('hb-item-source').value = item.source || 'Homebrew';

    // Weapons
    if (item.weaponCategory) document.getElementById('hb-item-weapon-cat').value = item.weaponCategory;
    document.getElementById('hb-item-dmg1').value = item.dmg1 || '';
    document.getElementById('hb-item-dmg2').value = item.dmg2 || '';
    if (item.dmgType) document.getElementById('hb-item-dmgtype').value = item.dmgType;

    const props = item.property || [];
    document.querySelectorAll('.hb-property-cb').forEach(cb => {
        cb.checked = props.includes(cb.value);
    });

    // Armor
    document.getElementById('hb-item-ac').value = item.ac || '';
    document.getElementById('hb-item-ac-bonus').value = item.acBonus || '';

    // Attunement
    const attuneSelect = document.getElementById('hb-item-attunement-select');
    const attuneText = document.getElementById('hb-item-attunement-text');
    if (item.reqAttune === true) {
        attuneSelect.value = 'yes';
        attuneText.disabled = true;
        attuneText.value = 'Requires Attunement';
    } else if (typeof item.reqAttune === 'string') {
        attuneSelect.value = 'custom';
        attuneText.disabled = false;
        attuneText.value = item.reqAttune;
    } else {
        attuneSelect.value = 'none';
        attuneText.disabled = true;
        attuneText.value = '';
    }

    // Ability Modifiers
    const modContainer = document.getElementById('hb-ability-modifiers-container');
    if (modContainer) modContainer.innerHTML = '';
    const abObj = item.ability || item.abilityBonus || item.bonusAbility;
    if (abObj && typeof abObj === 'object') {
        Object.keys(abObj).forEach(statKey => {
            window.addHomebrewAbilityModifierRow(statKey.toLowerCase(), abObj[statKey]);
        });
    }

    // Entries / Description
    if (Array.isArray(item.entries)) {
        document.getElementById('hb-item-description').value = item.entries.map(e => (typeof e === 'string' ? e : (e.entries ? e.entries.join('\n') : JSON.stringify(e)))).join('\n\n');
    } else if (typeof item.entries === 'string') {
        document.getElementById('hb-item-description').value = item.entries;
    } else {
        document.getElementById('hb-item-description').value = '';
    }

    window.onHomebrewTypeChange();
}

async function populateHomebrewPlayerDropdown() {
    const select = document.getElementById('hb-send-target-char');
    if (!select) return;

    select.innerHTML = '<option value="">-- Select Player Character --</option>';

    let party = window.localPartyData || [];
    if (!party || party.length === 0) {
        try {
            const res = await fetch('/api/party');
            party = await res.json();
            window.localPartyData = party;
        } catch (e) {}
    }

    if (party && Array.isArray(party)) {
        party.forEach(char => {
            const opt = document.createElement('option');
            opt.value = char.id;
            opt.textContent = `${char.name} (${char.race || ''} ${char.class || ''} Lvl ${char.level || 1})`;
            select.appendChild(opt);
        });
    }
}

window.loadHomebrewLibrary = async function() {
    const container = document.getElementById('wb-homebrew-library-container');
    if (!container) return;

    try {
        const res = await fetch('/api/homebrew/items');
        const items = await res.json();

        if (!items || items.length === 0) {
            container.innerHTML = `
                <div style="color: var(--text-muted); font-size: 0.8rem; text-align: center; padding: 30px; font-style: italic; background: rgba(0,0,0,0.2); border: 1px dashed var(--border-iron); border-radius: 8px;">
                    No homebrew items created yet. Click "+ Create New Item" above to craft your first custom artifact!
                </div>
            `;
            return;
        }

        let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
        items.forEach(item => {
            const gpVal = (item.value !== undefined) ? (typeof item.value === 'number' ? item.value / 100 : item.value) : 0;
            const rarityColor = getRarityColorHex(item.rarity);
            
            // Format ability score modifier badge
            let abBadgeHtml = '';
            const abObj = item.ability || item.abilityBonus || item.bonusAbility;
            if (abObj && typeof abObj === 'object') {
                const parts = [];
                Object.keys(abObj).forEach(k => {
                    const sign = abObj[k] >= 0 ? '+' : '';
                    parts.push(`${k.toUpperCase()} ${sign}${abObj[k]}`);
                });
                if (parts.length > 0) {
                    abBadgeHtml = `<span style="color: #38bdf8;">💪 ${parts.join(', ')}</span>`;
                }
            }

            html += `
                <div style="background: #090a10; border: 1px solid var(--border-iron); border-left: 4px solid ${rarityColor}; border-radius: 6px; padding: 10px 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                        <div>
                            <span style="font-family: 'Cinzel', serif; font-weight: bold; color: #fff; font-size: 0.9rem;">${item.name}</span>
                            <span style="font-size: 0.7rem; color: ${rarityColor}; background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; margin-left: 6px; font-weight: bold;">${item.rarity || 'Common'}</span>
                        </div>
                        <span style="font-size: 0.75rem; color: var(--gold-amber); font-weight: bold;">${gpVal} GP</span>
                    </div>

                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 6px; display: flex; gap: 12px; flex-wrap: wrap;">
                        <span><strong>Type:</strong> ${getItemTypeName(item.type)}</span>
                        ${item.dmg1 ? `<span><strong>Damage:</strong> ${item.dmg1} ${item.dmgType || ''}</span>` : ''}
                        ${item.ac ? `<span><strong>AC:</strong> ${item.ac}</span>` : ''}
                        ${abBadgeHtml}
                        ${item.reqAttune ? `<span style="color: #a78bfa;">🔒 Attunement</span>` : ''}
                    </div>

                    ${item.entries && item.entries.length > 0 ? `
                        <div style="font-size: 0.75rem; color: #cbd5e1; font-style: italic; line-height: 1.3; margin-bottom: 8px; max-height: 40px; overflow: hidden; text-overflow: ellipsis;">
                            ${typeof item.entries[0] === 'string' ? item.entries[0] : 'Custom magic properties...'}
                        </div>
                    ` : ''}

                    <div style="display: flex; justify-content: flex-end; gap: 6px;">
                        <button class="btn-secondary" style="font-size: 0.7rem; padding: 3px 8px; background: #1e1b4b; color: #c7d2fe; border: 1px solid #4338ca;" onclick='openHomebrewItemCreator(${JSON.stringify(item).replace(/'/g, "&apos;")})'>✏️ Edit</button>
                        <button class="btn-primary" style="font-size: 0.7rem; padding: 3px 8px; background: #0284c7;" onclick='quickSendHomebrewItem(${JSON.stringify(item).replace(/'/g, "&apos;")})'>🚀 Send Offer</button>
                        <button class="btn-danger" style="font-size: 0.7rem; padding: 3px 8px;" onclick="deleteHomebrewItem('${item.id || item.name}')">🗑️</button>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;

    } catch (e) {
        container.innerHTML = '<div style="color: #ef4444; font-size: 0.8rem; text-align: center; padding: 15px;">Failed to load homebrew items library.</div>';
    }
};

window.saveHomebrewItemFromModal = async function() {
    const item = getHomebrewItemFromForm();
    if (!item.name || item.name.trim() === '' || item.name === 'Unnamed Custom Item') {
        alert("Please enter a valid item name.");
        return;
    }

    try {
        const res = await fetch('/api/homebrew/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item)
        });
        const data = await res.json();
        if (data.success) {
            closeHomebrewItemCreator();
            window.loadHomebrewLibrary();
            showToastAlert(`Saved "${item.name}" to Homebrew Compendium!`, 'success');
        } else {
            alert(data.error || "Failed to save item.");
        }
    } catch (e) {
        alert("Error saving item to server.");
    }
};

window.sendHomebrewItemFromModal = function() {
    const item = getHomebrewItemFromForm();
    const charId = document.getElementById('hb-send-target-char')?.value;

    if (!charId) {
        alert("Please select a target player character sheet from the dropdown first.");
        return;
    }
    if (!item.name || item.name.trim() === '') {
        alert("Please enter a valid item name before sending.");
        return;
    }

    if (window.socket) {
        window.socket.emit('dm-send-item', { charId, item });
        closeHomebrewItemCreator();
    } else {
        alert("Socket connection not available.");
    }
};

window.saveAndSendHomebrewItemFromModal = async function() {
    const charId = document.getElementById('hb-send-target-char')?.value;
    if (!charId) {
        alert("Please select a target player character sheet from the dropdown first.");
        return;
    }

    await window.saveHomebrewItemFromModal();

    const item = getHomebrewItemFromForm();
    if (window.socket) {
        window.socket.emit('dm-send-item', { charId, item });
    }
};

window.quickSendHomebrewItem = async function(item) {
    let party = window.localPartyData || [];
    if (!party || party.length === 0) {
        try {
            const res = await fetch('/api/party');
            party = await res.json();
            window.localPartyData = party;
        } catch (e) {}
    }

    if (!party || party.length === 0) {
        alert("No active player characters found.");
        return;
    }

    let promptMsg = `Select character to send "${item.name}" to:\n`;
    party.forEach((c, idx) => {
        promptMsg += `${idx + 1}. ${c.name} (${c.class || ''})\n`;
    });

    const choice = prompt(promptMsg, "1");
    if (!choice) return;
    const selectedIdx = parseInt(choice) - 1;
    if (isNaN(selectedIdx) || selectedIdx < 0 || selectedIdx >= party.length) {
        alert("Invalid selection.");
        return;
    }

    const targetChar = party[selectedIdx];
    if (window.socket) {
        window.socket.emit('dm-send-item', { charId: targetChar.id, item });
    }
};

window.deleteHomebrewItem = async function(id) {
    if (!confirm("Are you sure you want to delete this homebrew item from your compendium?")) return;
    try {
        const res = await fetch(`/api/homebrew/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            window.loadHomebrewLibrary();
            showToastAlert("Homebrew item deleted.", "info");
        }
    } catch (e) {
        alert("Failed to delete item.");
    }
};

function getRarityColorHex(rarity) {
    switch (rarity) {
        case 'Uncommon': return '#22c55e';
        case 'Rare': return '#3b82f6';
        case 'Very Rare': return '#a855f7';
        case 'Legendary': return '#f59e0b';
        case 'Artifact': return '#ef4444';
        default: return '#94a3b8';
    }
}

function getItemTypeName(type) {
    const types = {
        'M': 'Melee Weapon',
        'R': 'Ranged Weapon',
        'LA': 'Light Armor',
        'MA': 'Medium Armor',
        'HA': 'Heavy Armor',
        'S': 'Shield',
        'W': 'Wondrous Item',
        'P': 'Potion',
        'RG': 'Ring',
        'WD': 'Wand',
        'ST': 'Staff',
        'RD': 'Rod',
        'SC': 'Scroll',
        'G': 'Adventuring Gear',
        'A': 'Ammunition'
    };
    return types[type] || type || 'Item';
}

function showToastAlert(msg, type = 'info') {
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.zIndex = '100000';
    toast.style.padding = '12px 18px';
    toast.style.borderRadius = '8px';
    toast.style.fontFamily = "'Cinzel', serif";
    toast.style.fontWeight = 'bold';
    toast.style.fontSize = '0.85rem';
    toast.style.boxShadow = '0 8px 25px rgba(0,0,0,0.5)';
    toast.style.color = '#fff';
    toast.style.transition = 'all 0.3s ease';

    if (type === 'success') {
        toast.style.background = '#10b981';
    } else if (type === 'warning') {
        toast.style.background = '#f59e0b';
        toast.style.color = '#000';
    } else {
        toast.style.background = '#3b82f6';
    }

    toast.innerText = msg;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Socket listener for DM alerts when players accept/decline offered items
if (window.socket) {
    window.socket.on('dm-item-status-alert', (data) => {
        showToastAlert(data.message, data.type || 'info');
    });
}

// ====================================================
// --- 7. PDF RULES SCRAPER STUDIO & ENGINE FRONTEND ---
// ====================================================

let currentUploadedPdfPath = null;
let currentUploadedPdfInfo = null;

window.handlePdfDragOver = function(e) {
    e.preventDefault();
    e.stopPropagation();
    const zone = document.getElementById('pdf-drop-zone');
    if (zone) zone.style.background = 'rgba(124, 58, 237, 0.2)';
};

window.openDraftsReviewDrawer = function() {
    if (typeof window.openReviewModal === 'function') {
        window.openReviewModal();
        if (typeof window.switchReviewTab === 'function') {
            window.switchReviewTab('drafts');
        }
    } else {
        alert("Review modal is not loaded.");
    }
};

window.handlePdfDragLeave = function(e) {
    e.preventDefault();
    e.stopPropagation();
    const zone = document.getElementById('pdf-drop-zone');
    if (zone) zone.style.background = 'rgba(124, 58, 237, 0.05)';
};

window.handlePdfDrop = function(e) {
    e.preventDefault();
    e.stopPropagation();
    const zone = document.getElementById('pdf-drop-zone');
    if (zone) zone.style.background = 'rgba(124, 58, 237, 0.05)';

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
        processUploadedPdfFile(files[0]);
    }
};

window.onPdfFileSelected = function(event) {
    const files = event.target.files;
    if (files && files.length > 0) {
        processUploadedPdfFile(files[0]);
    }
};

async function processUploadedPdfFile(file) {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
        alert("Please select a valid PDF sourcebook file.");
        return;
    }

    appendPdfLogLine(`[STEP] Uploading & inspecting "${file.name}"...`, 'step');

    const reader = new FileReader();
    reader.onload = async function(e) {
        const base64Data = e.target.result;
        try {
            const res = await fetch('/api/pdf-parser/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileName: file.name, base64Data })
            });

            const data = await res.json();
            if (data.success) {
                currentUploadedPdfPath = data.filePath;
                currentUploadedPdfInfo = data.info;
                renderPdfInspectorCard(data.info);
                appendPdfLogLine(`[STEP] PDF Ready! Title: "${data.info.title}" (${data.info.page_count} Pages)`, 'saved');
            } else {
                alert(data.error || "Failed to inspect PDF file.");
                appendPdfLogLine(`[ERROR] ${data.error || 'Failed to inspect PDF.'}`, 'warn');
            }
        } catch (err) {
            alert("Error uploading PDF file to server.");
        }
    };
    reader.readAsDataURL(file);
}

function renderPdfInspectorCard(info) {
    const card = document.getElementById('pdf-file-inspector-card');
    if (!card) return;

    document.getElementById('pdf-inspector-name').innerText = info.file_name || 'Book.pdf';
    document.getElementById('pdf-inspector-pages').innerText = `${info.page_count} Pages Total`;
    
    const sizeMb = (info.file_size_bytes / (1024 * 1024)).toFixed(1);
    document.getElementById('pdf-inspector-size').innerText = `Size: ${sizeMb} MB`;

    // Max limits for inputs
    const startIn = document.getElementById('pdf-page-start');
    const endIn = document.getElementById('pdf-page-end');
    if (startIn) { startIn.max = info.page_count; startIn.value = 1; }
    if (endIn) { endIn.max = info.page_count; endIn.value = info.page_count; }

    card.style.display = 'block';
    updatePdfPageRangeBadge();
}

window.onPdfTypeSelectChange = function() {
    const type = document.getElementById('pdf-type-select')?.value || 'all';
    const monsterFilter = document.getElementById('pdf-filter-monsters');
    const spellFilter = document.getElementById('pdf-filter-spells');

    if (monsterFilter) monsterFilter.style.display = (type === 'monsters' || type === 'all') ? 'grid' : 'none';
    if (spellFilter) spellFilter.style.display = (type === 'spells' || type === 'all') ? 'grid' : 'none';
};

window.onPdfPageModeChange = function() {
    const mode = document.getElementById('pdf-page-mode-select')?.value || 'all';
    const rangeContainer = document.getElementById('pdf-range-input-container');

    if (rangeContainer) rangeContainer.style.display = (mode === 'range' || mode === 'custom') ? 'grid' : 'none';
    updatePdfPageRangeBadge();
};

window.updatePdfPageRangeBadge = function() {
    const badge = document.getElementById('pdf-inspector-range-badge');
    if (!badge) return;

    const mode = document.getElementById('pdf-page-mode-select')?.value || 'all';
    if (mode === 'all') {
        badge.innerText = `Range: All Pages (${currentUploadedPdfInfo?.page_count || '0'} Pages)`;
    } else {
        const start = document.getElementById('pdf-page-start')?.value || 1;
        const end = document.getElementById('pdf-page-end')?.value || (currentUploadedPdfInfo?.page_count || 1);
        const count = Math.max(1, (parseInt(end) - parseInt(start) + 1));
        badge.innerText = `Range: Pages ${start}-${end} (${count} Selected)`;
    }
};

window.runPdfScraperEngine = function() {
    if (!currentUploadedPdfPath) {
        alert("Please upload or drag & drop a D&D PDF sourcebook file first.");
        return;
    }

    const type = document.getElementById('pdf-type-select')?.value || 'all';
    const pageMode = document.getElementById('pdf-page-mode-select')?.value || 'all';
    
    let pagesArg = null;
    if (pageMode === 'range') {
        const start = document.getElementById('pdf-page-start')?.value || 1;
        const end = document.getElementById('pdf-page-end')?.value || (currentUploadedPdfInfo?.page_count || 1);
        pagesArg = `${start}-${end}`;
    }

    const crMin = document.getElementById('pdf-filter-cr-min')?.value;
    const crMax = document.getElementById('pdf-filter-cr-max')?.value;
    const spellLevel = document.getElementById('pdf-filter-spell-level')?.value;

    // Reset Progress Bar & Terminal
    const progressContainer = document.getElementById('pdf-progress-container');
    const progressBar = document.getElementById('pdf-progress-bar-fill');
    const progressPct = document.getElementById('pdf-progress-percent');
    if (progressContainer) progressContainer.style.display = 'block';
    if (progressBar) progressBar.style.width = '0%';
    if (progressPct) progressPct.innerText = '0%';

    clearPdfTerminalLog();
    appendPdfLogLine(`[STEP] Launching Python Rule Extractor on ${currentUploadedPdfInfo?.file_name}...`, 'step');

    if (window.socket) {
        window.socket.emit('start-pdf-extraction', {
            filePath: currentUploadedPdfPath,
            type,
            pages: pagesArg,
            crMin,
            crMax,
            spellLevel
        });
    } else {
        alert("Socket connection not available to stream PDF extraction.");
    }
};

window.clearPdfTerminalLog = function() {
    const log = document.getElementById('pdf-terminal-log');
    if (log) log.innerHTML = '';
};

function appendPdfLogLine(text, type = 'step') {
    const log = document.getElementById('pdf-terminal-log');
    if (!log) return;

    const line = document.createElement('div');
    if (type === 'saved') {
        line.style.color = '#a78bfa'; // Arcane Violet for saved items
        line.style.fontWeight = 'bold';
    } else if (type === 'completed') {
        line.style.color = '#34d399'; // Emerald green
        line.style.fontWeight = 'bold';
    } else if (type === 'warn' || type === 'error') {
        line.style.color = '#ef4444'; // Red
    } else {
        line.style.color = '#38bdf8'; // Cyan step
    }

    line.innerText = text;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
}

// Socket listeners for PDF log stream & completion
if (window.socket) {
    window.socket.on('pdf-log-line', (data) => {
        if (data.type === 'progress') {
            const progressBar = document.getElementById('pdf-progress-bar-fill');
            const progressPct = document.getElementById('pdf-progress-percent');
            if (progressBar) progressBar.style.width = `${data.pct}%`;
            if (progressPct) progressPct.innerText = `${data.pct}%`;
            appendPdfLogLine(data.text, 'step');
        } else {
            appendPdfLogLine(data.text, data.type || 'step');
        }
    });

    window.socket.on('pdf-extraction-finished', (data) => {
        const progressBar = document.getElementById('pdf-progress-bar-fill');
        const progressPct = document.getElementById('pdf-progress-percent');
        if (progressBar) progressBar.style.width = '100%';
        if (progressPct) progressPct.innerText = '100%';

        appendPdfLogLine("🎉 [COMPLETED] Extraction finished! Staged rules are ready for DM review.", 'completed');
        
        // Show celebratory toast with button to open staged drafts
        showToastAlert("🎉 PDF Rules Extraction Complete! Click 'Open Staged Drafts' to review.", 'success');

        // Check duplicates in background
        checkPdfDraftDuplicates();
    });
}

async function checkPdfDraftDuplicates() {
    try {
        const res = await fetch('/api/drafts/check-duplicates');
        const data = await res.json();
        if (data.success && data.duplicates && data.duplicates.length > 0) {
            appendPdfLogLine(`⚠️ [NOTICE] Found ${data.duplicates.length} duplicate draft entries that already exist in active compendiums.`, 'warn');
        }
    } catch (e) {}
}
