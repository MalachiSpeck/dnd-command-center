// --- VISUAL LIGHTING & DAY/NIGHT CONTROLLERS ---
window.toggleDayNightCycleMode = function(phase) {
    updateProjectorState({ dayNightMode: phase });
    logCombatAction(`[Day/Night Phase] Sunk daylight phase to: ${phase}`);
};

window.setWeatherOverlayMode = function(weather) {
    updateProjectorState({ weatherMode: weather });
    
    // Fetch and display rules alert banner from weather_effects.json database files
    fetch('/api/reference/weather_effects')
        .then(res => res.json())
        .then(data => {
            const currentEffect = data[weather];
            if (currentEffect) {
                const banner = document.getElementById('weather-rules-alert-banner');
                if (banner) {
                    banner.innerHTML = `<strong>Weather Active: ${weather}</strong><br><span style="font-size:0.75rem;">${currentEffect.rules}</span>`;
                    banner.style.display = weather === 'Clear' ? 'none' : 'block';
                }
            }
        });
    logCombatAction(`[Weather Phase] Sunk weather pattern mode to: ${weather}`);
};

// --- DIGITAL LIGHTS & STATUS EFFECT AURASGrid OVERLAYS CENTERED ON TOKENS ---
window.toggleStatusEffectAuraOnToken = function(tokenId, radius, color, friendly) {
    pushToUndoStack();
    fetch('/api/projector-state')
        .then(res => res.json())
        .then(state => {
            const currentAuras = state.auras || {};
            if (!currentAuras[tokenId]) currentAuras[tokenId] = [];

            // If same radius exists, remove it (toggle off), else add
            const idx = currentAuras[tokenId].findIndex(a => a.radius === radius);
            if (idx !== -1) {
                currentAuras[tokenId].splice(idx, 1);
            } else {
                currentAuras[tokenId].push({ radius, color, friendly });
            }

            updateProjectorState({ auras: currentAuras });
        });
};

window.setTokenLightingRadius = function(tokenId, radiusValue) {
    pushToUndoStack();
    fetch('/api/projector-state')
        .then(res => res.json())
        .then(state => {
            const currentLights = state.lightSources || {};
            currentLights[tokenId] = radiusValue;
            updateProjectorState({ lightSources: currentLights });
        });
};

// --- MAP ANNOTATION PINNING SYSTEM ---
window.addMapCoordinatesAnnotationPin = function(filename, r, c) {
    const text = prompt("Enter DM sticky note annotation:");
    if (!text) return;

    fetch('/api/reference/map_annotations')
        .then(res => res.json())
        .then(data => {
            const list = Array.isArray(data) ? data : [];
            list.push({ filename, r, c, text, id: 'pin_' + Date.now() });
            
            fetch('/api/reference/save/map_annotations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(list)
            }).then(() => {
                alert("DM pin annotated successfully.");
                renderConsoleDMAnnotatedMapPins(filename);
            });
        });
};

function renderConsoleDMAnnotatedMapPins(filename) {
    const listContainer = document.getElementById('dm-map-pins-list-sidebar');
    if (!listContainer) return;

    fetch('/api/reference/map_annotations')
        .then(res => res.json())
        .then(data => {
            const list = Array.isArray(data) ? data : [];
            const filtered = list.filter(p => p.filename === filename);
            
            if (filtered.length === 0) {
                listContainer.innerHTML = '<div style="color:var(--text-muted); font-size:0.75rem;">No active pins on this map.</div>';
                return;
            }

            listContainer.innerHTML = filtered.map(item => `
                <div style="background:var(--bg-abyss); border:1px solid var(--border-iron); border-radius:4px; padding:6px; margin-bottom:5px; font-size:0.75rem; display:flex; justify-content:space-between; align-items:center;">
                    <div><strong>Row ${item.r}, Col ${item.c}:</strong> "${item.text}"</div>
                    <button class="btn-danger" style="padding:1px 4px; font-size:0.65rem;" onclick="deleteMapCoordinateAnnotationPin('${item.id}', '${filename}')">X</button>
                </div>
            `).join('');
        });
}

window.deleteMapCoordinateAnnotationPin = function(pinId, filename) {
    fetch('/api/reference/map_annotations')
        .then(res => res.json())
        .then(data => {
            const list = Array.isArray(data) ? data : [];
            const updated = list.filter(p => p.id !== pinId);
            
            fetch('/api/reference/save/map_annotations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updated)
            }).then(() => {
                renderConsoleDMAnnotatedMapPins(filename);
            });
        });
};
