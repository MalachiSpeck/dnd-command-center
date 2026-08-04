/* ==========================================
   DM COMMAND CENTER - MASTER INTERFACE LOGIC
   ========================================== */

let activeEncounter = [];
let currentShopItems = [];
let currentDiscount = 0;
let localPartyData = [];
let activeCombatIndex = 0;
let currentRound = 1;
let currentAudioContext = null;

// Timer State
let timerSeconds = 0;
let timerInterval = null;

// Undo stack
let undoStack = [];

// Spell Search/Reference pin list
let pinnedSpells = new Set();

// Active concentration warnings/banners cache
let activeConcentrationSpell = {}; // combatantId -> spellName

// Active hazard ref
let lastRolledHazardRef = null;

// Socket.io integration
const socket = io();
window.socket = socket;
const connectedPlayers = new Set();

socket.emit('join-room', 'dm');

socket.on('active-connections', (activeIds) => {
    connectedPlayers.clear();
    activeIds.forEach(id => connectedPlayers.add(id));
    loadPartyMatrix();
});

socket.on('player-status-changed', (data) => {
    if (data.connected) {
        connectedPlayers.add(data.charId);
    } else {
        connectedPlayers.delete(data.charId);
    }
    loadPartyMatrix();
});

socket.on('party-updated', (party) => {
    localPartyData = party;
    party.forEach(character => {
        if (character.spell_slots) {
            localSpellSlotsCache[character.id] = { ...character.spell_slots };
        }
    });
    loadPartyMatrix();
});

// Real-time character creation proposals from join page!
socket.on('new-character-proposed', (proposedChar) => {
    // Play sound notification
    try {
        if (window.Wave3Synth && typeof window.Wave3Synth.playSuccessChime === 'function') {
            window.Wave3Synth.playSuccessChime();
        }
    } catch (e) {}

    // Float notification banner to alert DM
    const container = document.getElementById('dm-notifications-container') || createDmNotificationsContainer();
    const alertDiv = document.createElement('div');
    alertDiv.className = 'dm-whisper-notification';
    alertDiv.style.backgroundColor = '#111827'; // Dark Gray
    alertDiv.style.border = '1px solid var(--gold-amber)';
    alertDiv.style.padding = '12px 16px';
    alertDiv.style.borderRadius = '6px';
    alertDiv.style.boxShadow = '0 4px 20px rgba(251, 191, 36, 0.2)';
    alertDiv.style.color = '#e2e8f0';
    alertDiv.style.fontSize = '0.85rem';
    alertDiv.style.display = 'flex';
    alertDiv.style.justifyContent = 'space-between';
    alertDiv.style.alignItems = 'center';
    alertDiv.style.gap = '12px';

    alertDiv.innerHTML = `
        <div style="flex-grow: 1;">
            <strong style="color: var(--gold-amber); font-family: 'Cinzel', serif;">[ HERO FORGED: ${proposedChar.name.toUpperCase()} ]</strong>
            <div style="margin-top: 4px; font-style: italic; color: #cbd5e1;">A level ${proposedChar.level} ${proposedChar.race} ${proposedChar.class} wants to join your campaign.</div>
        </div>
        <div style="display: flex; gap: 6px;">
            <button onclick="openReviewModal(); switchReviewTab('syncs'); this.parentElement.parentElement.remove();" style="background: var(--arcane-violet); border: none; color: white; cursor: pointer; font-size: 0.75rem; padding: 4px 8px; border-radius: 4px; font-weight: bold;">Review</button>
            <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 1.2rem; font-weight: bold; padding: 4px;">&times;</button>
        </div>
    `;
    container.appendChild(alertDiv);

    // Refresh pending queues if currently visible
    if (window.loadPendingCreatedCharacters) window.loadPendingCreatedCharacters();
});

socket.on('initial-pending-characters', (pending) => {
    if (pending && pending.length > 0) {
        // Build floating banner notifying DM of backlogged creations
        const container = document.getElementById('dm-notifications-container') || createDmNotificationsContainer();
        const alertDiv = document.createElement('div');
        alertDiv.className = 'dm-whisper-notification';
        alertDiv.style.backgroundColor = '#111827';
        alertDiv.style.border = '1px solid var(--gold-amber)';
        alertDiv.style.padding = '12px 16px';
        alertDiv.style.borderRadius = '6px';
        alertDiv.style.color = '#e2e8f0';
        alertDiv.style.fontSize = '0.85rem';
        alertDiv.style.display = 'flex';
        alertDiv.style.justifyContent = 'space-between';
        alertDiv.style.alignItems = 'center';

        alertDiv.innerHTML = `
            <div>
                <strong style="color: var(--gold-amber); font-family: 'Cinzel', serif;">[ UNRESOLVED CHARACTER PROPOSALS ]</strong>
                <div style="margin-top: 4px; color: #cbd5e1;">There are ${pending.length} custom character designs waiting in the forge.</div>
            </div>
            <div style="display: flex; gap: 6px;">
                <button onclick="openReviewModal(); switchReviewTab('syncs'); this.parentElement.parentElement.remove();" style="background: var(--arcane-violet); border: none; color: white; cursor: pointer; font-size: 0.75rem; padding: 4px 8px; border-radius: 4px; font-weight: bold;">Review</button>
                <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 1.2rem; font-weight: bold; padding: 4px;">&times;</button>
            </div>
        `;
        container.appendChild(alertDiv);
    }
});

// Listener for Real-time Player Whispers / Secret Wish Lists
socket.on('whisper-received-dm', (data) => {
    // Play a gentle alert notification sound
    try {
        if (window.Wave3Synth && typeof window.Wave3Synth.playSuccessChime === 'function') {
            window.Wave3Synth.playSuccessChime();
        }
    } catch (e) {
        console.warn("Could not play synthesized notification sound:", e);
    }

    // Build a floating desktop banner/notification inside DM console
    const container = document.getElementById('dm-notifications-container') || createDmNotificationsContainer();
    const alertDiv = document.createElement('div');
    alertDiv.className = 'dm-whisper-notification';
    alertDiv.style.backgroundColor = '#1e1b4b'; // Deep Indigo
    alertDiv.style.border = '1px solid #8b5cf6'; // Arcane Violet border
    alertDiv.style.padding = '12px 16px';
    alertDiv.style.borderRadius = '6px';
    alertDiv.style.boxShadow = '0 4px 20px rgba(139, 92, 246, 0.2)';
    alertDiv.style.color = '#e2e8f0';
    alertDiv.style.fontSize = '0.85rem';
    alertDiv.style.display = 'flex';
    alertDiv.style.justifyContent = 'space-between';
    alertDiv.style.alignItems = 'center';
    alertDiv.style.gap = '12px';
    alertDiv.style.animation = 'slideInNotification 0.3s cubic-bezier(0.16, 1, 0.3, 1)';

    alertDiv.innerHTML = `
        <div style="flex-grow: 1;">
            <strong style="color: #c084fc; font-family: 'Cinzel', serif;">[ PRIVATE WHISPER: ${data.characterName.toUpperCase()} ]</strong>
            <div style="margin-top: 4px; font-style: italic; color: #cbd5e1;">"${data.message}"</div>
        </div>
        <button onclick="this.parentElement.remove()" style="background: none; border: none; color: #a78bfa; cursor: pointer; font-size: 1.2rem; font-weight: bold; padding: 4px;">&times;</button>
    `;

    container.appendChild(alertDiv);

    // Auto-remove after 20 seconds to keep DM screen clean
    setTimeout(() => {
        if (alertDiv.parentElement) alertDiv.remove();
    }, 20000);
});

function createDmNotificationsContainer() {
    const div = document.createElement('div');
    div.id = 'dm-notifications-container';
    div.style.position = 'fixed';
    div.style.top = '20px';
    div.style.right = '20px';
    div.style.zIndex = '999999';
    div.style.width = '380px';
    div.style.display = 'flex';
    div.style.flexDirection = 'column';
    div.style.gap = '10px';
    
    // Add slide-in animation styles directly to the document head
    const style = document.createElement('style');
    style.innerText = `
        @keyframes slideInNotification {
            from { transform: translateX(120%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
    document.body.appendChild(div);
    return div;
}

socket.on('board-state-updated', (data) => {
    if (data.encounter) {
        const hasLocalChanged = JSON.stringify(activeEncounter) !== JSON.stringify(data.encounter);
        const activeInput = document.activeElement;
        const isTyping = activeInput && activeInput.id && activeInput.id.startsWith('dmg-input-');
        
        if (hasLocalChanged && !isTyping) {
            activeEncounter = data.encounter;
            renderCombatTracker();
        }
    }

    if (data.activeRound && data.activeRound !== currentRound) {
        currentRound = data.activeRound;
        const roundDisplay = document.getElementById('global-round-display');
        if (roundDisplay) roundDisplay.innerText = `Round ${currentRound}`;
    }

    if (data.activeCombatIndex !== undefined && data.activeCombatIndex !== activeCombatIndex) {
        activeCombatIndex = data.activeCombatIndex;
        resetTurnTimer();
        renderCombatTracker();
        triggerEndOfTurnReminders();
    }

    loadActiveProjectorTemplatesList();
});

window.showCharacterQR = function(id, name) {
    const modal = document.getElementById('player-qr-modal');
    document.getElementById('qr-modal-title').innerText = `${name}'s Sheet`;
    document.getElementById('qr-modal-image').src = `/api/qr/${id}`;
    
    const url = `http://${window.location.hostname}:3000/sheet/${id}`;
    document.getElementById('qr-modal-link').innerText = url;
    
    modal.classList.remove('hidden');
};

document.addEventListener('DOMContentLoaded', () => {
    console.log("DM Command Center Interface Loaded.");
    loadPartyMatrix();
    loadGrimoireSpellsList();
    loadSavedEncountersList();
    if (window.loadConditionsReference) window.loadConditionsReference();
    
    // Perform initial state check
    pollServerState();
    
    // WebSockets handle sub-50ms sync; slow fallback 15s poll to ensure robustness
    setInterval(pollServerState, 15000);
    
    // Core Event Setup
    const addCharBtn = document.getElementById('add-character-btn');
    if (addCharBtn) {
        addCharBtn.addEventListener('click', () => {
            document.getElementById('add-char-modal').classList.remove('hidden');
        });
    }

    const spawnMenuBtn = document.getElementById('spawn-menu-btn');
    if (spawnMenuBtn) {
        spawnMenuBtn.addEventListener('click', openSpawnMonsterMenu);
    }

    const nextTurnBtn = document.getElementById('next-turn-btn');
    if (nextTurnBtn) {
        nextTurnBtn.addEventListener('click', advanceTurnIndex);
    }

    const openImprovBtn = document.getElementById('open-improv-btn');
    if (openImprovBtn) {
        openImprovBtn.addEventListener('click', openImprovCheatSheet);
    }

    // Downtime Modal Listeners
    const downtimeBtn = document.getElementById('open-downtime-btn');
    const closeBtn = document.getElementById('close-downtime-btn');
    const modal = document.getElementById('downtime-modal');

    if (downtimeBtn) {
        downtimeBtn.addEventListener('click', () => {
            modal.classList.remove('hidden');
            loadDowntimeMatrix();
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    }

    // Haggle Slider Listener
    const haggleSlider = document.getElementById('haggle-slider');
    if (haggleSlider) {
        haggleSlider.addEventListener('input', (e) => {
            currentDiscount = e.target.value;
            const disp = document.getElementById('discount-display');
            if (disp) disp.innerText = `${currentDiscount}%`;
            renderShop();
        });
    }

    // Grid calibration slider
    const gridSlider = document.getElementById('grid-scale-slider');
    if (gridSlider) {
        gridSlider.addEventListener('input', (e) => {
            const scale = e.target.value;
            const disp = document.getElementById('grid-scale-display');
            if (disp) disp.innerText = `${scale} px (1 inch)`;
            updateProjectorState({ gridScale: parseInt(scale) });
        });
    }

    // Secrets save button
    const saveSecretsBtn = document.getElementById('save-secrets-btn');
    if (saveSecretsBtn) {
        saveSecretsBtn.addEventListener('click', saveActiveSecrets);
    }

    // Campaign Notes popout triggers
    const openNotesBtn = document.getElementById('open-notes-btn');
    const saveNotesBtn = document.getElementById('save-notes-btn');
    if (openNotesBtn) {
        openNotesBtn.addEventListener('click', openNotesDrawer);
    }
    if (saveNotesBtn) {
        saveNotesBtn.addEventListener('click', saveCampaignNotes);
    }

    // Initialize Timer
    startTurnTimer();

    // Setup global keyboard hotkeys
    setupKeyboardShortcuts();
});

// Audio handled exclusively by Standalone Soundboard
function initAudio() {}

// Poll the server state for round counter, active turn, and templates list
async function pollServerState() {
    try {
        const response = await fetch('/api/board-state');
        const data = await response.json();
        
        if (data.encounter) {
            const hasLocalChanged = JSON.stringify(activeEncounter) !== JSON.stringify(data.encounter);
            const activeInput = document.activeElement;
            const isTyping = activeInput && activeInput.id && activeInput.id.startsWith('dmg-input-');
            
            if (hasLocalChanged && !isTyping) {
                activeEncounter = data.encounter;
                renderCombatTracker();
            }
        }

        if (data.activeRound && data.activeRound !== currentRound) {
            currentRound = data.activeRound;
            const roundDisplay = document.getElementById('global-round-display');
            if (roundDisplay) roundDisplay.innerText = `Round ${currentRound}`;
        }

        if (data.activeCombatIndex !== undefined && data.activeCombatIndex !== activeCombatIndex) {
            activeCombatIndex = data.activeCombatIndex;
            resetTurnTimer();
            renderCombatTracker();
            triggerEndOfTurnReminders();
        }

        loadActiveProjectorTemplatesList();

    } catch(err) {
        console.error("Poller failed sync.", err);
    }
}

// Timer mechanics
function startTurnTimer() {
    clearInterval(timerInterval);
    timerSeconds = 0;
    timerInterval = setInterval(() => {
        timerSeconds++;
        const mins = Math.floor(timerSeconds / 60);
        const secs = timerSeconds % 60;
        const display = document.getElementById('turn-timer-display');
        if (display) {
            display.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
    }, 1000);
}

function resetTurnTimer() {
    timerSeconds = 0;
    const display = document.getElementById('turn-timer-display');
    if (display) display.innerText = "00:00";
}

// --- PARTY MATRIX & DOSSIER SECRETS ---
async function loadPartyMatrix() {
    try {
        // Fetch only if we don't have localPartyData yet (or from the server for initial load)
        if (!window.localPartyData || window.localPartyData.length === 0) {
            const response = await fetch('/api/party');
            localPartyData = await response.json();
        }
        
        const partyList = document.getElementById('party-list');
        if (!partyList) return;
        partyList.innerHTML = ''; 

        localPartyData.forEach(character => {
            // Sync spell_slots to localSpellSlotsCache so existing grid uses current state
            if (character.spell_slots) {
                localSpellSlotsCache[character.id] = { ...character.spell_slots };
            }

            const charCard = document.createElement('div');
            charCard.style.padding = '10px';
            charCard.style.marginBottom = '10px';
            charCard.style.backgroundColor = '#1a1a24';
            charCard.style.border = '1px solid var(--border-iron)';
            charCard.style.borderRadius = '6px';
            charCard.style.cursor = 'pointer';

            charCard.addEventListener('click', (e) => {
                if (e.target.tagName !== 'BUTTON') {
                    openSecretsDrawer(character);
                }
            });
            
            const slotsHtml = renderSpellSlotsTrackerGrid(character.id, character.level);
            
            const isConnected = connectedPlayers.has(character.id);
            const dotColor = isConnected ? '#22c55e' : '#4b5563';
            const dotTitle = isConnected ? 'Connected' : 'Disconnected';
            const dotHtml = `<span class="connection-dot" id="dot-${character.id}" style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${dotColor}; margin-right:6px;" title="${dotTitle}"></span>`;

            // Display current interactive values (HP/AC) from sheet
            const currentHp = character.hp_current !== undefined ? character.hp_current : character.hp;
            const maxHp = character.hp_max !== undefined ? character.hp_max : character.hp;
            const ac = character.ac !== undefined ? character.ac : character.ac;

            let auditHtml = '';
            if (character.level_up_audit) {
                auditHtml = `
                    <div style="background: rgba(239, 68, 68, 0.1); border: 1px dashed #ef4444; border-radius: 4px; padding: 6px; margin-top: 8px; display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 0.7rem; color: #f87171; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Audit: Level Up to Lvl ${character.level}</span>
                        <button class="btn-primary" style="padding: 2px 6px; font-size: 0.65rem; background: #22c55e; border: none; font-weight: bold;" onclick="event.stopPropagation(); approveLevelUp('${character.id}')">Approve</button>
                    </div>
                `;
            }

            charCard.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; min-width: 0;">
                    <div style="display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1;">
                        ${dotHtml}
                        <h3 style="margin: 0; color: var(--text-main); font-family: 'Inter', sans-serif; font-size: 1rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px;" title="${character.name}">${character.name}</h3>
                        <button class="btn-primary" style="padding: 2px 6px; font-size: 0.7rem; background: #ef4444; flex-shrink: 0;" onclick="addPartyToCombat('${character.id}')">Fight</button>
                        <button class="btn-primary" style="padding: 2px 6px; font-size: 0.7rem; background: #22c55e; flex-shrink: 0;" onclick="openLevelUpModal('${character.id}', '${character.name}')">LVL</button>
                        <button class="btn-primary" style="padding: 2px 6px; font-size: 0.7rem; background: #8b5cf6; flex-shrink: 0;" onclick="event.stopPropagation(); showCharacterQR('${character.id}', '${character.name}')">QR</button>
                    </div>
                    <span style="font-size: 0.75rem; color: var(--text-muted); flex-shrink: 0; margin-left: 6px;">Lvl ${character.level} ${character.race}</span>
                </div>
                <div style="display: flex; gap: 12px; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 8px;">
                    <div><strong>AC:</strong> <span style="color: white;" id="matrix-ac-${character.id}">${ac}</span></div>
                    <div><strong>HP:</strong> <span style="color: white;" id="matrix-hp-${character.id}">${currentHp}/${maxHp}</span></div>
                    <div><strong>PP:</strong> <span style="color: white;">${character.passives?.perception || 10}</span></div>
                    <div><strong>PI:</strong> <span style="color: white;">${character.passives?.insight || 10}</span></div>
                </div>
                ${slotsHtml}
                ${auditHtml}
            `;
            partyList.appendChild(charCard);
        });
    } catch (error) {
        console.error("Failed to load party matrix:", error);
    }
}

window.approveLevelUp = async function(charId) {
    try {
        const response = await fetch(`/api/party/approve-level/${charId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        if (response.ok) {
            console.log(`[Level Audit] Successfully approved level change for character: ${charId}`);
        } else {
            console.error(`[Level Audit] Failed to approve level change for character: ${charId}`);
        }
    } catch (err) {
        console.error(`[Level Audit] Error post approving level change:`, err);
    }
};

window.addPartyToCombat = function(id) {
    const char = localPartyData.find(c => c.id === id);
    if (!char) return;

    const exists = activeEncounter.find(m => m.id === char.id);
    if (exists) {
        alert(`${char.name} is already on the battlefield!`);
        return;
    }

    pushToUndoStack();

    const pc = {
        id: char.id,
        name: char.name,
        maxHp: char.hp,
        ac: char.ac,
        currentDamage: 0,
        isFuckedUp: false,
        isDefeated: false,
        initiative: 0,
        art: char.art,
        type: "player",
        conditions: [],
        deathSaves: { successes: 0, failures: 0 }
    };

    activeEncounter.push(pc);
    renderCombatTracker();
    broadcastToPlayers();
};

window.submitAddNewCharacter = async function() {
    const name = document.getElementById('newchar-name').value.trim();
    const race = document.getElementById('newchar-race').value.trim();
    const charClass = document.getElementById('newchar-class').value.trim();
    const level = parseInt(document.getElementById('newchar-level').value) || 1;
    const hp = parseInt(document.getElementById('newchar-hp').value) || 30;
    const ac = parseInt(document.getElementById('newchar-ac').value) || 10;
    const art = document.getElementById('newchar-art').value.trim();

    if (!name) {
        alert("Please enter a character name.");
        return;
    }

    const newChar = {
        id: 'char_' + Date.now(),
        name, race, class: charClass, level, hp, ac,
        passives: { perception: 10, insight: 10, investigation: 10 },
        magic_items: [],
        secrets: "",
        art: art || "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?q=80&w=200",
        stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }
    };

    localPartyData.push(newChar);

    try {
        await fetch('/api/party/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(localPartyData)
        });
        document.getElementById('add-char-modal').classList.add('hidden');
        
        document.getElementById('newchar-name').value = '';
        document.getElementById('newchar-race').value = '';
        document.getElementById('newchar-class').value = '';
        document.getElementById('newchar-level').value = '1';
        document.getElementById('newchar-hp').value = '30';
        document.getElementById('newchar-ac').value = '10';
        document.getElementById('newchar-art').value = '';
        
        loadPartyMatrix();
    } catch(e) {
        console.error("Save failed character add.", e);
    }
};
