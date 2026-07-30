// Level up submit modal wizard helper
window.openLevelUpModal = function(id, name) {
    const modal = document.getElementById('levelup-modal');
    modal.classList.remove('hidden');
    document.getElementById('levelup-title').innerText = `Level Up ${name}`;
    window.activeLevelUpId = id;
};

window.submitLevelUp = async function() {
    const id = window.activeLevelUpId;
    const hpIncrease = parseInt(document.getElementById('levelup-hp-add').value) || 0;
    const featInput = document.getElementById('levelup-feat-select');
    const newFeat = featInput ? featInput.value : '';
    const asiStat = document.getElementById('levelup-asi-stat').value;
    const asiVal = document.getElementById('levelup-asi-val').value;

    try {
        const response = await fetch('/api/party/levelup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id,
                hpIncrease,
                newFeat,
                increaseStatKey: asiStat,
                increaseStatVal: asiVal
            })
        });
        const data = await response.json();
        alert(data.message || "Character leveled up!");
        document.getElementById('levelup-modal').classList.add('hidden');
        loadPartyMatrix();
    } catch (err) {
        console.error("Failed level up character:", err);
    }
};

window.openSecretsDrawer = function(character) {
    const drawer = document.getElementById('secrets-drawer');
    document.getElementById('secrets-drawer-char-name').innerText = `${character.name}'s Dossier`;
    document.getElementById('secrets-text-input').value = character.secrets || "";
    
    const statsContainer = document.getElementById('secrets-dossier-stats');
    const wishlistItems = character.wishlist && character.wishlist.length > 0 
        ? character.wishlist.map(w => `<li style="margin-bottom: 4px; color: var(--gold-amber);">${w}</li>`).join('') 
        : '<li style="color: var(--text-muted); font-style: italic;">No wishlist items submitted yet.</li>';

    statsContainer.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div><strong>Class & Level:</strong> Lvl ${character.level} ${character.class || 'Adventurer'}</div>
            <div><strong>Race:</strong> ${character.race || 'Human'}</div>
        </div>
        <div style="margin-top: 6px;"><strong>Magic Items:</strong> ${character.magic_items?.join(', ') || 'None'}</div>
        
        <div style="margin-top: 10px; border-top: 1px solid var(--border-iron); padding-top: 10px;">
            <strong style="color: #a78bfa; font-family: 'Cinzel', serif; font-size: 0.8rem; display: block; margin-bottom: 6px;">Secret Adventure Wish List (From Player Sheet):</strong>
            <ul style="margin: 0; padding-left: 16px; font-size: 0.85rem;">
                ${wishlistItems}
            </ul>
        </div>

        <div style="margin-top: 12px; border-top: 1px solid var(--border-iron); padding-top: 10px; display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; text-align: center; font-size: 0.75rem;">
            <div style="background:#111; border-radius:3px;"><strong>STR</strong><br>${character.stats?.str || 10}</div>
            <div style="background:#111; border-radius:3px;"><strong>DEX</strong><br>${character.stats?.dex || 10}</div>
            <div style="background:#111; border-radius:3px;"><strong>CON</strong><br>${character.stats?.con || 10}</div>
            <div style="background:#111; border-radius:3px;"><strong>INT</strong><br>${character.stats?.int || 10}</div>
            <div style="background:#111; border-radius:3px;"><strong>WIS</strong><br>${character.stats?.wis || 10}</div>
            <div style="background:#111; border-radius:3px;"><strong>CHA</strong><br>${character.stats?.cha || 10}</div>
        </div>
    `;

    drawer.classList.add('open');
    window.activeSecretsCharId = character.id;
};

window.closeSecretsDrawer = function() {
    document.getElementById('secrets-drawer').classList.remove('open');
};

async function saveActiveSecrets() {
    const id = window.activeSecretsCharId;
    const text = document.getElementById('secrets-text-input').value;
    if (!id) return;

    try {
        await fetch('/api/party/secrets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, secrets: text })
        });
        alert("Dossier secrets saved successfully.");
        closeSecretsDrawer();
        loadPartyMatrix();
    } catch(err) {
        console.error("Failed to save character secrets:", err);
    }
}

// --- PERSISTENT SESSION SCRATCHPAD LOGS ---
window.saveScratchpadNote = async function() {
    const text = document.getElementById('scratchpad-textarea').value.trim();
    if (!text) return;
    try {
        const response = await fetch('/api/session-scratchpad/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text,
                round: currentRound
            })
        });
        const data = await response.json();
        document.getElementById('scratchpad-textarea').value = '';
        renderScratchpadNotes(data.notes);
    } catch(e) {
        console.error("Failed saving note:", e);
    }
};

async function loadScratchpadNotes() {
    try {
        const res = await fetch('/api/session-scratchpad');
        const notes = await res.json();
        renderScratchpadNotes(notes);
    } catch (e) {}
}

function renderScratchpadNotes(notes) {
    const container = document.getElementById('scratchpad-list');
    if (!container) return;
    if (!notes || notes.length === 0) {
        container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; text-align: center; padding: 10px;">Scratchpad empty.</div>';
        return;
    }
    container.innerHTML = notes.map(n => `
        <div style="background: var(--bg-abyss); border: 1px solid var(--border-iron); border-radius: 4px; padding: 8px; margin-bottom: 6px; font-size: 0.8rem;">
            <div style="display:flex; justify-content:space-between; color: var(--gold-amber); font-weight:bold; font-size: 0.75rem; margin-bottom: 4px;">
                <span>${n.date} ${n.timestamp}</span>
                <span>Round ${n.round}</span>
            </div>
            <div style="line-height:1.4; color: var(--text-main); white-space: pre-wrap;">${n.text}</div>
        </div>
    `).join('');
}
