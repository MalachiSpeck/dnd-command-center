// --- ADVANCED GAME CONTROL BUTTONS AND SCRATCHPAD POPULATOR ---
async function advanceTurnIndex() {
    try {
        const response = await fetch('/api/streamdeck/next');
        const resData = await response.json();
        activeCombatIndex = resData.activeCombatIndex;
        currentRound = resData.activeRound;
        document.getElementById('global-round-display').innerText = `Round ${currentRound}`;
        resetTurnTimer();
        renderCombatTracker();
        broadcastToPlayers();
    } catch(err) {
        console.error("Failed to advance turn.", err);
    }
}

async function rewindTurnIndex() {
    try {
        const response = await fetch('/api/streamdeck/prev');
        const resData = await response.json();
        activeCombatIndex = resData.activeCombatIndex;
        currentRound = resData.activeRound;
        document.getElementById('global-round-display').innerText = `Round ${currentRound}`;
        resetTurnTimer();
        renderCombatTracker();
        broadcastToPlayers();
    } catch(err) {
        console.error("Failed to rewind turn.", err);
    }
}

function broadcastToPlayers() {
    fetch('/api/update-board', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(activeEncounter) 
    }).catch(err => console.error("Broadcast failed:", err));
}

// --- TABLE PROJECTOR (MONITOR 3) CONTROLS & EFFECT QUEUE ---
async function updateProjectorState(patchData) {
    try {
        await fetch('/api/projector-state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patchData)
        });
        loadActiveProjectorTemplatesList();
    } catch(err) {
        console.error("Failed to update projector state.", err);
    }
}

window.updateProjectorMap = function() {
    const url = document.getElementById('projector-map-url').value.trim();
    if (!url) return;
    updateProjectorState({ mapUrl: url });
};

window.uploadProjectorMapFile = function(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = function(e) {
            const base64Url = e.target.result;
            updateProjectorState({ mapUrl: base64Url });
        };
        reader.readAsDataURL(file);
    }
};

window.handleMapFileDrop = function(e) {
    e.preventDefault();
    const zone = document.getElementById('map-drop-zone');
    if (zone) zone.style.borderColor = 'var(--border-iron)';
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        const file = e.dataTransfer.files[0];
        const reader = new FileReader();
        reader.onload = function(ev) {
            const base64Url = ev.target.result;
            updateProjectorState({ mapUrl: base64Url });
        };
        reader.readAsDataURL(file);
    }
};

window.toggleCalibrationMode = async function() {
    try {
        const response = await fetch('/api/projector-state');
        const state = await response.json();
        updateProjectorState({ calibrationMode: !state.calibrationMode });
    } catch(e) {}
};

window.spawnProjectorTemplate = async function(type, radius, color, name) {
    try {
        const response = await fetch('/api/projector-state');
        const state = await response.json();

        const newTemplate = {
            id: 'temp_' + Date.now(),
            type: type,
            radius: radius,
            color: color,
            x: 150, 
            y: 150,
            name: name
        };

        const updatedTemplates = [...(state.templates || []), newTemplate];
        updateProjectorState({ templates: updatedTemplates });
    } catch(err) {
        console.error("Failed to spawn template.", err);
    }
};

window.clearProjectorTemplates = function() {
    updateProjectorState({ templates: [] });
};

async function loadActiveProjectorTemplatesList() {
    try {
        const response = await fetch('/api/projector-state');
        const state = await response.json();
        
        const listContainer = document.getElementById('active-effects-list');
        if (!listContainer) return;

        const templates = state.templates || [];
        if (templates.length === 0) {
            listContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; text-align: center; padding: 10px;">No templates active.</div>';
            return;
        }

        listContainer.innerHTML = '';
        templates.forEach(temp => {
            const row = document.createElement('div');
            row.style.cssText = 'background: var(--bg-abyss); border: 1px solid var(--border-iron); border-radius: 4px; padding: 6px 10px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem;';
            row.innerHTML = `
                <div style="display:flex; align-items:center; gap: 8px;">
                    <div style="width: 10px; height: 10px; border-radius: 50%; background: ${temp.color};"></div>
                    <span style="font-weight: bold; color: var(--text-main);">${temp.name} (${temp.radius}ft)</span>
                </div>
                <button class="btn-danger" style="padding: 2px 6px; font-size: 0.7rem;" onclick="deleteProjectorTemplate('${temp.id}')">Dismiss</button>
            `;
            listContainer.appendChild(row);
        });
    } catch(e) {
        console.error("Failed template list load.", e);
    }
}

window.deleteProjectorTemplate = async function(id) {
    try {
        const response = await fetch('/api/projector-state');
        const state = await response.json();
        const updated = (state.templates || []).filter(t => t.id !== id);
        updateProjectorState({ templates: updated });
    } catch(e) {}
};


// --- BAZAAR MERCHANT GENERATOR WITH SHOP PRESETS ---
window.generateShop = async function() {
    const shopType = document.getElementById('bazaar-preset-select').value;
    try {
        const response = await fetch('/api/bazaar');
        const allItems = await response.json();
        
        let filtered = allItems;
        if (shopType === 'armory') {
            filtered = allItems.filter(item => 
                item.name.toLowerCase().includes('armor') || 
                item.name.toLowerCase().includes('sword') || 
                item.name.toLowerCase().includes('shield') ||
                item.name.toLowerCase().includes('weapon') ||
                item.name.toLowerCase().includes('glaive') ||
                item.name.toLowerCase().includes('+1')
            );
        } else if (shopType === 'alchemist') {
            filtered = allItems.filter(item => 
                item.name.toLowerCase().includes('potion') || 
                item.name.toLowerCase().includes('wand') || 
                item.name.toLowerCase().includes('scroll') ||
                item.name.toLowerCase().includes('elixir') ||
                item.name.toLowerCase().includes('oil')
            );
        }

        if (filtered.length === 0) filtered = allItems;

        const shuffled = filtered.sort(() => 0.5 - Math.random());
        currentShopItems = shuffled.slice(0, 4);
        
        renderShop();
    } catch (error) {
        console.error("Failed to load shop items:", error);
    }
};

function formatGpToDisplay(gpValue) {
    if (gpValue <= 0) return '0 gp';
    const gold = Math.floor(gpValue);
    const silver = Math.round((gpValue - gold) * 10);
    const parts = [];
    if (gold > 0) parts.push(`${gold} gp`);
    if (silver > 0) parts.push(`${silver} sp`);
    return parts.length > 0 ? parts.join(', ') : '0 gp';
}

function renderShop() {
    const shopList = document.getElementById('shop-inventory');
    if (!shopList) return;

    if (currentShopItems.length === 0) {
        shopList.innerHTML = '<p class="empty-state">The merchant has nothing to sell today.</p>';
        return;
    }

    shopList.innerHTML = ''; 
    currentShopItems.forEach(item => {
        const rawDiscounted = item.price - (item.price * (currentDiscount / 100));
        const discountedPrice = Math.max(0.1, Math.round(rawDiscounted * 10) / 10);

        const itemCard = document.createElement('div');
        itemCard.style.cssText = 'background-color: #1a1a24; border: 1px solid var(--border-iron); border-radius: 6px; padding: 10px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem;';
        
        itemCard.innerHTML = `
            <div>
                <h4 style="margin: 0; color: var(--text-main); font-family: 'Inter', sans-serif;">${item.name}</h4>
                <span style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">${item.rarity || 'None'}</span>
            </div>
            <div style="text-align: right;">
                ${currentDiscount > 0 ? `<div style="font-size: 0.65rem; color: var(--crimson-rage); text-decoration: line-through;">${formatGpToDisplay(item.price)}</div>` : ''}
                <div style="font-size: 0.95rem; color: #fbbf24; font-weight: bold; font-family: 'Cinzel', serif;">${formatGpToDisplay(discountedPrice)}</div>
            </div>
        `;
        shopList.appendChild(itemCard);
    });
}
