// Wild Shape & Familiar / Companion Manager Engine
// Handlers for active Wild Shape stat overrides, damage spillover, companions, and 1-click rolls.

window.creaturesLibrary = { wild_shapes: [], familiars: [] };

async function loadCreaturesLibrary() {
    try {
        const res = await fetch('/api/creatures');
        if (res.ok) {
            const data = await res.json();
            window.creaturesLibrary = data;
            console.log('🐾 Preloaded Creatures Library loaded:', data);
        }
    } catch (e) {
        console.warn('Failed to load /api/creatures:', e);
    }
}

// Automatically load creatures library on page load
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadCreaturesLibrary);
    } else {
        loadCreaturesLibrary();
    }
}


// ----------------------------------------------------
// WILD SHAPE LOGIC
// ----------------------------------------------------

function openWildShapeModal() {
    let modal = document.getElementById('wildshape-modal');
    if (!modal) {
        createWildShapeModalHTML();
        modal = document.getElementById('wildshape-modal');
    }
    populateWildShapeDropdown();
    modal.style.display = 'flex';
}

function closeWildShapeModal() {
    const modal = document.getElementById('wildshape-modal');
    if (modal) modal.style.display = 'none';
}

function populateWildShapeDropdown() {
    const select = document.getElementById('wildshape-select');
    if (!select) return;

    select.innerHTML = '<option value="">-- Choose a Beast Form --</option>';
    const shapes = window.creaturesLibrary.wild_shapes || [];
    shapes.forEach(shape => {
        const opt = document.createElement('option');
        opt.value = shape.id;
        opt.innerText = `${shape.name} (CR ${shape.cr} | HP ${shape.hp} | AC ${shape.ac} | Speed ${shape.speed})`;
        select.appendChild(opt);
    });
}

function notify(msg) {
    if (typeof alert !== 'undefined') {
        alert(msg);
    } else {
        console.log('[Notification]', msg);
    }
}

function confirmWildShapeTransform() {
    const select = document.getElementById('wildshape-select');
    const selectedId = select ? select.value : '';

    if (!selectedId) {
        notify('Please select a Beast Form or create a Custom Creature.');
        return;
    }

    const shape = window.creaturesLibrary.wild_shapes.find(s => s.id === selectedId);
    if (!shape) return;

    transformIntoWildShape(shape);
    closeWildShapeModal();
}

function getActiveChar() {
    if (typeof character !== 'undefined' && character) {
        window.character = character;
        return character;
    }
    if (window.character) {
        return window.character;
    }
    window.character = {};
    return window.character;
}

function transformIntoWildShape(shapeData) {
    const char = getActiveChar();

    char.wild_shape = {
        active: true,
        id: shapeData.id || ('custom_' + Date.now()),
        name: shapeData.name || 'Wild Shape Form',
        hp: shapeData.hp || 20,
        max_hp: shapeData.hp || 20,
        ac: shapeData.ac || 11,
        speed: shapeData.speed || '30 ft',
        str: shapeData.str || 14,
        dex: shapeData.dex || 12,
        con: shapeData.con || 14,
        actions: shapeData.actions || []
    };

    // Store base character stats if not already stored
    if (!char._base_stats) {
        char._base_stats = {
            ac: char.ac || 10,
            speed: char.speed || '30 ft'
        };
    }

    // Trigger calculation engine update
    if (window.characterEngine) {
        const updated = window.characterEngine.calculate(char);
        Object.assign(char, updated);
    }

    syncCharacterAndRender();
    if (window.socket) {
        window.socket.emit('update-wild-shape', { charId: window.charId || char.id, wild_shape: char.wild_shape });
    }

    notify(`🐻 Transformed into ${shapeData.name}! Physical stats and AC updated.`);
}

function revertWildShape() {
    const char = getActiveChar();
    if (!char || !char.wild_shape) return;

    const shapeName = char.wild_shape.name || 'Wild Shape';
    char.wild_shape.active = false;
    char.wild_shape.hp = 0;

    // Trigger calculation engine update
    if (window.characterEngine) {
        const updated = window.characterEngine.calculate(char);
        Object.assign(char, updated);
    }

    syncCharacterAndRender();
    if (window.socket) {
        window.socket.emit('update-wild-shape', { charId: window.charId || char.id, wild_shape: char.wild_shape });
    }

    notify(`↩️ Reverted from ${shapeName} back to True Character form.`);
}

function adjustWildShapeHP(amount) {
    const char = getActiveChar();
    if (!char || !char.wild_shape || !char.wild_shape.active) return;

    if (window.characterEngine && typeof window.characterEngine.applyDamageToWildShape === 'function') {
        if (amount < 0) {
            // Damage
            const result = window.characterEngine.applyDamageToWildShape(char, Math.abs(amount));
            if (result.spilledOver) {
                notify(`⚠️ Wild Shape HP reached 0! Form dropped and ${result.overflowDamage} overflow damage applied to True HP!`);
            }
        } else {
            // Heal shape HP
            char.wild_shape.hp = Math.min(
                char.wild_shape.max_hp,
                (char.wild_shape.hp || 0) + amount
            );
        }
    } else {
        // Fallback
        char.wild_shape.hp = Math.max(0, (char.wild_shape.hp || 0) + amount);
        if (char.wild_shape.hp === 0) {
            char.wild_shape.active = false;
            notify(`⚠️ Wild Shape dropped!`);
        }
    }

    // Trigger calculation engine update
    if (window.characterEngine) {
        const updated = window.characterEngine.calculate(char);
        Object.assign(char, updated);
    }

    syncCharacterAndRender();
}



// ----------------------------------------------------
// FAMILIAR & COMPANION LOGIC
// ----------------------------------------------------

function openSummonCompanionModal() {
    let modal = document.getElementById('companion-modal');
    if (!modal) {
        createCompanionModalHTML();
        modal = document.getElementById('companion-modal');
    }
    populateCompanionDropdown();
    modal.style.display = 'flex';
}

function closeCompanionModal() {
    const modal = document.getElementById('companion-modal');
    if (modal) modal.style.display = 'none';
}

function populateCompanionDropdown() {
    const select = document.getElementById('companion-select');
    if (!select) return;

    select.innerHTML = '<option value="">-- Choose a Familiar or Companion --</option>';
    const familiars = window.creaturesLibrary.familiars || [];
    familiars.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.innerText = `${f.name} (HP ${f.hp} | AC ${f.ac} | Speed ${f.speed})`;
        select.appendChild(opt);
    });
}

function confirmSummonCompanion() {
    const select = document.getElementById('companion-select');
    const selectedId = select ? select.value : '';

    if (!selectedId) {
        alert('Please select a Familiar/Companion or create a Custom Creature.');
        return;
    }

    const familiar = window.creaturesLibrary.familiars.find(f => f.id === selectedId);
    if (!familiar) return;

    summonCompanion(familiar);
    closeCompanionModal();
}

function summonCompanion(companionData) {
    if (!window.character) window.character = {};
    if (!Array.isArray(window.character.companions)) {
        window.character.companions = [];
    }

    const newCompanion = {
        id: 'comp_' + Date.now(),
        name: companionData.name || 'Companion',
        hp: companionData.hp || 1,
        max_hp: companionData.hp || 1,
        ac: companionData.ac || 10,
        speed: companionData.speed || '30 ft',
        actions: companionData.actions || []
    };

    window.character.companions.push(newCompanion);
    syncCharacterAndRender();

    if (window.socket) {
        window.socket.emit('update-companions', { charId: window.charId, companions: window.character.companions });
    }

    alert(`🦅 Summoned ${companionData.name}!`);
}

function dismissCompanion(companionId) {
    if (!window.character || !Array.isArray(window.character.companions)) return;

    const comp = window.character.companions.find(c => c.id === companionId);
    const name = comp ? comp.name : 'Companion';

    window.character.companions = window.character.companions.filter(c => c.id !== companionId);
    syncCharacterAndRender();

    if (window.socket) {
        window.socket.emit('update-companions', { charId: window.charId, companions: window.character.companions });
    }

    alert(`👋 Dismissed ${name}.`);
}

function adjustCompanionHP(companionId, amount) {
    if (!window.character || !Array.isArray(window.character.companions)) return;

    const comp = window.character.companions.find(c => c.id === companionId);
    if (!comp) return;

    comp.hp = Math.max(0, Math.min(comp.max_hp, (comp.hp || 0) + amount));
    syncCharacterAndRender();

    if (window.socket) {
        window.socket.emit('update-companions', { charId: window.charId, companions: window.character.companions });
    }
}

// ----------------------------------------------------
// 1-CLICK COMPANION / WILD SHAPE ROLLER
// ----------------------------------------------------

function rollCreatureAction(creatureName, actionName, toHit, damage, description) {
    if (typeof openDiceRollerModal === 'function') {
        openDiceRollerModal({
            title: `${creatureName}: ${actionName}`,
            notation: damage && damage.includes('d') ? damage : '1d20',
            modifier: toHit ? parseInt(toHit) || 0 : 0,
            description: description || ''
        });
    } else {
        alert(`🎲 ${creatureName} uses ${actionName}! (${toHit || ''} ${damage || ''})`);
    }
}

// ----------------------------------------------------
// POLYMORPH LOGIC (5e Spell Rules)
// ----------------------------------------------------

function openPolymorphModal() {
    let modal = document.getElementById('polymorph-modal');
    if (!modal) {
        createPolymorphModalHTML();
        modal = document.getElementById('polymorph-modal');
    }
    populatePolymorphTargetsAndBeasts();
    modal.style.display = 'flex';
}

function closePolymorphModal() {
    const modal = document.getElementById('polymorph-modal');
    if (modal) modal.style.display = 'none';
}

function populatePolymorphTargetsAndBeasts() {
    const char = getActiveChar();
    const targetLevel = parseInt(char.level) || 1;

    const infoSpan = document.getElementById('polymorph-target-info');
    if (infoSpan) {
        infoSpan.innerText = `Target: ${char.name || 'Character'} (Level ${targetLevel} | Max Allowed Beast CR: ${targetLevel})`;
    }

    const select = document.getElementById('polymorph-beast-select');
    if (!select) return;

    select.innerHTML = '<option value="">-- Select a Beast Form (CR <= Level) --</option>';

    const beasts = window.creaturesLibrary.polymorph_beasts || window.creaturesLibrary.wild_shapes || [];
    const eligibleBeasts = beasts.filter(b => (b.cr_num !== undefined ? b.cr_num : parseFloat(b.cr) || 1) <= targetLevel);

    eligibleBeasts.sort((a, b) => (b.cr_num || 0) - (a.cr_num || 0));

    eligibleBeasts.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.innerText = `[CR ${b.cr}] ${b.name} (HP ${b.hp} | AC ${b.ac} | Speed ${b.speed} | STR ${b.str})`;
        select.appendChild(opt);
    });
}

function confirmPolymorphTransform() {
    const select = document.getElementById('polymorph-beast-select');
    const selectedId = select ? select.value : '';

    if (!selectedId) {
        notify('Please select a Beast Form for Polymorph.');
        return;
    }

    const beasts = window.creaturesLibrary.polymorph_beasts || window.creaturesLibrary.wild_shapes || [];
    const beast = beasts.find(b => b.id === selectedId);
    if (!beast) return;

    transformIntoPolymorph(beast);
    closePolymorphModal();
}

function transformIntoPolymorph(beastData) {
    const char = getActiveChar();

    char.polymorph = {
        active: true,
        id: beastData.id || ('poly_' + Date.now()),
        name: beastData.name || 'Polymorphed Beast',
        cr: beastData.cr || '1',
        hp: beastData.hp || 30,
        max_hp: beastData.hp || 30,
        ac: beastData.ac || 11,
        speed: beastData.speed || '30 ft',
        str: beastData.str || 14,
        dex: beastData.dex || 10,
        con: beastData.con || 14,
        int: beastData.int !== undefined ? beastData.int : 2,
        wis: beastData.wis !== undefined ? beastData.wis : 10,
        cha: beastData.cha !== undefined ? beastData.cha : 5,
        actions: beastData.actions || []
    };

    // Trigger calculation engine update (Polymorph overrides ALL 6 stats and locks spellcasting)
    if (window.characterEngine) {
        const updated = window.characterEngine.calculate(char);
        Object.assign(char, updated);
    }

    syncCharacterAndRender();
    if (window.socket) {
        window.socket.emit('update-polymorph', { charId: window.charId || char.id, polymorph: char.polymorph });
    }

    notify(`🦖 POLYMORPH ACTIVE! Transformed into ${beastData.name} (CR ${beastData.cr}). All stats replaced & spellcasting locked per 5e rules.`);
}

function revertPolymorph() {
    const char = getActiveChar();
    if (!char || !char.polymorph) return;

    const formName = char.polymorph.name || 'Polymorph Form';
    char.polymorph.active = false;
    char.polymorph.hp = 0;

    // Trigger calculation engine update
    if (window.characterEngine) {
        const updated = window.characterEngine.calculate(char);
        Object.assign(char, updated);
    }

    syncCharacterAndRender();
    if (window.socket) {
        window.socket.emit('update-polymorph', { charId: window.charId || char.id, polymorph: char.polymorph });
    }

    notify(`↩️ Polymorph ended! Reverted from ${formName} back to original character form & unlocked spellcasting.`);
}

function adjustPolymorphHP(amount) {
    const char = getActiveChar();
    if (!char || !char.polymorph || !char.polymorph.active) return;

    if (amount < 0) {
        // Damage
        const result = window.characterEngine.applyDamageToWildShape(char, Math.abs(amount));
        if (result.spilledOver) {
            notify(`⚠️ Polymorph HP reached 0! Form dropped and ${result.overflowDamage} overflow damage applied to True HP!`);
        }
    } else {
        // Heal shape HP
        char.polymorph.hp = Math.min(
            char.polymorph.max_hp,
            (char.polymorph.hp || 0) + amount
        );
    }

    // Trigger calculation engine update
    if (window.characterEngine) {
        const updated = window.characterEngine.calculate(char);
        Object.assign(char, updated);
    }

    syncCharacterAndRender();
}

function createPolymorphModalHTML() {
    if (document.getElementById('polymorph-modal')) return;
    const div = document.createElement('div');
    div.id = 'polymorph-modal';
    div.className = 'modal-overlay';
    div.style.cssText = 'display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10000; align-items: center; justify-content: center; backdrop-filter: blur(4px);';

    div.innerHTML = `
        <div class="modal-content" style="background: #0f172a; border: 2px solid #ef4444; border-radius: 12px; padding: 20px; width: 90%; max-width: 480px; color: white; box-shadow: 0 0 25px rgba(239, 68, 68, 0.3);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <h3 style="margin: 0; color: #ef4444; font-family: 'Cinzel', serif;">🦖 Cast Polymorph (5e Spell)</h3>
                <button onclick="closePolymorphModal()" style="background: none; border: none; color: #9ca3af; font-size: 1.2rem; cursor: pointer;">✖</button>
            </div>
            <p style="font-size: 0.8rem; color: #94a3b8; margin-top: 0;">Transform target into a Beast whose CR is equal to or less than the target's Level/CR. All stats (STR/DEX/CON/INT/WIS/CHA, AC, HP) are replaced, and spellcasting is locked.</p>
            
            <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; border-radius: 6px; padding: 8px; margin-bottom: 12px;">
                <span id="polymorph-target-info" style="font-size: 0.8rem; color: #fca5a5; font-weight: bold;">Target: Level 5</span>
            </div>

            <div style="margin-bottom: 15px;">
                <label style="font-size: 0.75rem; color: #fca5a5; font-weight: bold; display: block; margin-bottom: 4px;">Eligible Beast Forms (CR <= Level):</label>
                <select id="polymorph-beast-select" style="width: 100%; padding: 8px; background: #020617; border: 1px solid #ef4444; color: white; border-radius: 6px; font-size: 0.85rem;"></select>
            </div>
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button onclick="openCustomCreatureModal('polymorph')" style="background: #334155; color: white; border: 1px solid #64748b; padding: 8px 12px; border-radius: 6px; font-weight: bold; font-size: 0.8rem; cursor: pointer;">✨ Custom Beast</button>
                <button onclick="confirmPolymorphTransform()" style="background: #ef4444; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; font-size: 0.8rem; cursor: pointer;">🦖 Cast Polymorph</button>
            </div>
        </div>
    `;
    document.body.appendChild(div);
}


// ----------------------------------------------------
// RENDER & UI SYNC HELPERS
// ----------------------------------------------------

function syncCharacterAndRender() {
    // 1. Sync script-scoped character variable if present
    if (typeof character !== 'undefined' && window.character) {
        Object.assign(character, window.character);
    }

    // 2. Persist & emit via queueUpdateAndSync or offlineStore
    if (typeof queueUpdateAndSync === 'function') {
        queueUpdateAndSync();
    } else if (window.offlineStore && window.charId && window.character) {
        window.offlineStore.put('characters', window.character);
    }

    // 3. Render main sheet & Wild Shape UI
    if (typeof renderCharacterSheet === 'function') {
        renderCharacterSheet();
    } else {
        renderWildShapeAndCompanionsUI();
    }
}


function renderWildShapeAndCompanionsUI() {
    if (typeof document === 'undefined') return;
    const char = getActiveChar();
    const ws = char?.wild_shape;
    const poly = char?.polymorph;

    const isWsActive = ws && ws.active && ws.hp > 0;
    const isPolyActive = poly && poly.active && poly.hp > 0;

    // 1. Header Banner
    const headerBanner = document.getElementById('wildshape-active-header-banner');
    if (headerBanner) {
        if (isPolyActive) {
            headerBanner.style.display = 'block';
            headerBanner.style.borderColor = '#ef4444';
            headerBanner.style.background = 'rgba(239, 68, 68, 0.12)';
            headerBanner.style.cursor = 'pointer';
            headerBanner.title = 'Click to open active Beast Statblock & Actions';
            headerBanner.onclick = (e) => {
                if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
                openActiveBeastStatblockModal();
            };

            document.getElementById('header-wildshape-name').innerHTML = `🦖 POLYMORPH: ${poly.name} <small style="color: #fca5a5;">(CR ${poly.cr})</small> <span style="font-size: 0.68rem; color: #fca5a5; font-weight: normal; margin-left: 6px;">🔍 Click for Statblock</span>`;
            document.getElementById('header-wildshape-name').style.color = '#ef4444';
            document.getElementById('header-wildshape-stats').innerText = `HP: ${poly.hp}/${poly.max_hp} | AC: ${poly.ac} | Speed: ${poly.speed}`;
            
            const btn = headerBanner.querySelector('button');
            if (btn) btn.setAttribute('onclick', 'revertPolymorph()');
        } else if (isWsActive) {
            headerBanner.style.display = 'block';
            headerBanner.style.borderColor = '#10b981';
            headerBanner.style.background = 'rgba(16, 185, 129, 0.12)';
            headerBanner.style.cursor = 'pointer';
            headerBanner.title = 'Click to open active Beast Statblock & Actions';
            headerBanner.onclick = (e) => {
                if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
                openActiveBeastStatblockModal();
            };

            document.getElementById('header-wildshape-name').innerHTML = `WILD SHAPE: ${ws.name} <span style="font-size: 0.68rem; color: #a7f3d0; font-weight: normal; margin-left: 6px;">🔍 Click for Statblock</span>`;
            document.getElementById('header-wildshape-name').style.color = '#10b981';
            document.getElementById('header-wildshape-stats').innerText = `HP: ${ws.hp}/${ws.max_hp} | AC: ${ws.ac} | Speed: ${ws.speed}`;
            
            const btn = headerBanner.querySelector('button');
            if (btn) btn.setAttribute('onclick', 'revertWildShape()');
        } else {
            headerBanner.style.display = 'none';
        }
    }


    // 2. Vitals Tab Wild Shape / Polymorph Card
    const wsContainer = document.getElementById('vitals-wildshape-container');
    if (wsContainer) {
        if (isPolyActive) {
            wsContainer.style.display = 'block';
            wsContainer.style.borderColor = '#ef4444';
            wsContainer.style.background = 'rgba(239, 68, 68, 0.08)';

            document.getElementById('vitals-ws-title').innerHTML = `🦖 Active Polymorph: ${poly.name} <small style="color: #fca5a5;">(CR ${poly.cr})</small>`;
            document.getElementById('vitals-ws-title').style.color = '#ef4444';
            document.getElementById('vitals-ws-hp-text').innerText = `${poly.hp} / ${poly.max_hp} HP`;

            const pct = Math.max(0, Math.min(100, Math.round((poly.hp / poly.max_hp) * 100)));
            const bar = document.getElementById('vitals-ws-hp-bar');
            if (bar) {
                bar.style.width = `${pct}%`;
                bar.style.background = '#ef4444';
            }

            // Adjust HP buttons for Polymorph
            const btns = wsContainer.querySelectorAll('.hp-adjust-btn');
            if (btns.length >= 4) {
                btns[0].setAttribute('onclick', 'adjustPolymorphHP(-5)');
                btns[1].setAttribute('onclick', 'adjustPolymorphHP(-1)');
                btns[2].setAttribute('onclick', 'adjustPolymorphHP(1)');
                btns[3].setAttribute('onclick', 'adjustPolymorphHP(5)');
            }

            // Actions list
            const actionsList = document.getElementById('vitals-ws-actions-list');
            if (actionsList) {
                if (Array.isArray(poly.actions) && poly.actions.length > 0) {
                    actionsList.innerHTML = poly.actions.map(act => `
                        <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(239,68,68,0.3); border-radius: 6px; padding: 6px; display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <span style="font-weight: bold; color: #fca5a5; font-size: 0.8rem;">${act.name}</span>
                                <span style="font-size: 0.7rem; color: #9ca3af; margin-left: 6px;">${act.toHit || ''} ${act.damage || ''}</span>
                            </div>
                            <button onclick="rollCreatureAction('${poly.name}', '${act.name}', '${act.toHit || ''}', '${act.damage || ''}', '${act.description || act.extra || ''}')" style="background: #ef4444; color: white; border: none; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 0.7rem; cursor: pointer;">🎲 Roll</button>
                        </div>
                    `).join('');
                } else {
                    actionsList.innerHTML = '<span style="font-size: 0.75rem; color: #9ca3af;">No beast actions listed.</span>';
                }
            }
        } else if (isWsActive) {
            wsContainer.style.display = 'block';
            wsContainer.style.borderColor = '#10b981';
            wsContainer.style.background = 'rgba(16, 185, 129, 0.1)';

            document.getElementById('vitals-ws-title').innerText = `🐻 Active Form: ${ws.name}`;
            document.getElementById('vitals-ws-title').style.color = '#10b981';
            document.getElementById('vitals-ws-hp-text').innerText = `${ws.hp} / ${ws.max_hp} HP`;

            const pct = Math.max(0, Math.min(100, Math.round((ws.hp / ws.max_hp) * 100)));
            const bar = document.getElementById('vitals-ws-hp-bar');
            if (bar) {
                bar.style.width = `${pct}%`;
                bar.style.background = '#10b981';
            }

            // Adjust HP buttons for Wild Shape
            const btns = wsContainer.querySelectorAll('.hp-adjust-btn');
            if (btns.length >= 4) {
                btns[0].setAttribute('onclick', 'adjustWildShapeHP(-5)');
                btns[1].setAttribute('onclick', 'adjustWildShapeHP(-1)');
                btns[2].setAttribute('onclick', 'adjustWildShapeHP(1)');
                btns[3].setAttribute('onclick', 'adjustWildShapeHP(5)');
            }

            // Actions list
            const actionsList = document.getElementById('vitals-ws-actions-list');
            if (actionsList) {
                if (Array.isArray(ws.actions) && ws.actions.length > 0) {
                    actionsList.innerHTML = ws.actions.map(act => `
                        <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(16,185,129,0.3); border-radius: 6px; padding: 6px; display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <span style="font-weight: bold; color: #a7f3d0; font-size: 0.8rem;">${act.name}</span>
                                <span style="font-size: 0.7rem; color: #9ca3af; margin-left: 6px;">${act.toHit || ''} ${act.damage || ''}</span>
                            </div>
                            <button onclick="rollCreatureAction('${ws.name}', '${act.name}', '${act.toHit || ''}', '${act.damage || ''}', '${act.description || act.extra || ''}')" style="background: #10b981; color: white; border: none; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 0.7rem; cursor: pointer;">🎲 Roll</button>
                        </div>
                    `).join('');
                } else {
                    actionsList.innerHTML = '<span style="font-size: 0.75rem; color: #9ca3af;">No beast actions listed.</span>';
                }
            }
        } else {
            wsContainer.style.display = 'none';
        }
    }

    // 3. Vitals Tab Companions List
    const compContainer = document.getElementById('vitals-companions-list');
    if (compContainer) {
        const companions = char?.companions || [];

        if (companions.length === 0) {
            compContainer.innerHTML = '<div style="font-size: 0.75rem; color: var(--text-muted); font-style: italic; padding: 4px;">No active familiars or companions summoned.</div>';
        } else {
            compContainer.innerHTML = companions.map(comp => `
                <div style="background: rgba(56, 189, 248, 0.08); border: 1px solid #38bdf8; border-radius: 8px; padding: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <div>
                            <span style="font-weight: bold; color: #38bdf8; font-size: 0.85rem;">🦅 ${comp.name}</span>
                            <span style="font-size: 0.75rem; color: #93c5fd; margin-left: 6px;">AC ${comp.ac} | ${comp.speed}</span>
                        </div>
                        <button onclick="dismissCompanion('${comp.id}')" style="background: rgba(239,68,68,0.2); color: #ef4444; border: 1px solid #ef4444; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; cursor: pointer;">Dismiss</button>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="font-size: 0.75rem; color: white;">HP: <strong>${comp.hp} / ${comp.max_hp}</strong></span>
                        <div style="display: flex; gap: 4px;">
                            <button class="hp-adjust-btn" style="padding: 2px 6px; font-size: 0.75rem;" onclick="adjustCompanionHP('${comp.id}', -1)">-1</button>
                            <button class="hp-adjust-btn" style="padding: 2px 6px; font-size: 0.75rem;" onclick="adjustCompanionHP('${comp.id}', 1)">+1</button>
                        </div>
                    </div>
                    ${Array.isArray(comp.actions) && comp.actions.length > 0 ? `
                        <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 6px;">
                            ${comp.actions.map(act => `
                                <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(56,189,248,0.3); border-radius: 4px; padding: 4px 8px; display: flex; justify-content: space-between; align-items: center;">
                                    <span style="font-size: 0.75rem; color: #93c5fd; font-weight: 500;">${act.name} <small style="color:#9ca3af;">(${act.toHit || ''} ${act.damage || ''})</small></span>
                                    <button onclick="rollCreatureAction('${comp.name}', '${act.name}', '${act.toHit || ''}', '${act.damage || ''}', '${act.description || ''}')" style="background: #0284c7; color: white; border: none; padding: 2px 6px; border-radius: 4px; font-size: 0.68rem; font-weight: bold; cursor: pointer;">🎲 Roll</button>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `).join('');
        }
    }
}

// ----------------------------------------------------
// DYNAMIC MODAL BUILDERS
// ----------------------------------------------------

function createWildShapeModalHTML() {
    if (document.getElementById('wildshape-modal')) return;
    const div = document.createElement('div');
    div.id = 'wildshape-modal';
    div.className = 'modal-overlay';
    div.style.cssText = 'display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 10000; align-items: center; justify-content: center; backdrop-filter: blur(4px);';

    div.innerHTML = `
        <div class="modal-content" style="background: #0f172a; border: 2px solid #10b981; border-radius: 12px; padding: 20px; width: 90%; max-width: 450px; color: white; box-shadow: 0 0 25px rgba(16, 185, 129, 0.3);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <h3 style="margin: 0; color: #10b981; font-family: 'Cinzel', serif;">🐻 Transform into Wild Shape</h3>
                <button onclick="closeWildShapeModal()" style="background: none; border: none; color: #9ca3af; font-size: 1.2rem; cursor: pointer;">✖</button>
            </div>
            <p style="font-size: 0.8rem; color: #94a3b8; margin-top: 0;">Select a preloaded SRD Beast Form or create a custom shape. Physical stats (STR/DEX/CON, AC, Speed) and Outer HP will be applied live.</p>
            <div style="margin-bottom: 15px;">
                <label style="font-size: 0.75rem; color: #a7f3d0; font-weight: bold; display: block; margin-bottom: 4px;">SRD Beast Forms:</label>
                <select id="wildshape-select" style="width: 100%; padding: 8px; background: #020617; border: 1px solid #10b981; color: white; border-radius: 6px; font-size: 0.85rem;"></select>
            </div>
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button onclick="openCustomCreatureModal('wildshape')" style="background: #334155; color: white; border: 1px solid #64748b; padding: 8px 12px; border-radius: 6px; font-weight: bold; font-size: 0.8rem; cursor: pointer;">✨ Custom Creature</button>
                <button onclick="confirmWildShapeTransform()" style="background: #10b981; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; font-size: 0.8rem; cursor: pointer;">🐻 Transform</button>
            </div>
        </div>
    `;
    document.body.appendChild(div);
}

function createCompanionModalHTML() {
    if (document.getElementById('companion-modal')) return;
    const div = document.createElement('div');
    div.id = 'companion-modal';
    div.className = 'modal-overlay';
    div.style.cssText = 'display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 10000; align-items: center; justify-content: center; backdrop-filter: blur(4px);';

    div.innerHTML = `
        <div class="modal-content" style="background: #0f172a; border: 2px solid #38bdf8; border-radius: 12px; padding: 20px; width: 90%; max-width: 450px; color: white; box-shadow: 0 0 25px rgba(56, 189, 248, 0.3);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <h3 style="margin: 0; color: #38bdf8; font-family: 'Cinzel', serif;">🦅 Summon Companion / Familiar</h3>
                <button onclick="closeCompanionModal()" style="background: none; border: none; color: #9ca3af; font-size: 1.2rem; cursor: pointer;">✖</button>
            </div>
            <p style="font-size: 0.8rem; color: #94a3b8; margin-top: 0;">Select a Familiar, Pet, or Summoned Creature to add to your character dashboard.</p>
            <div style="margin-bottom: 15px;">
                <label style="font-size: 0.75rem; color: #93c5fd; font-weight: bold; display: block; margin-bottom: 4px;">Preloaded Familiars & Companions:</label>
                <select id="companion-select" style="width: 100%; padding: 8px; background: #020617; border: 1px solid #38bdf8; color: white; border-radius: 6px; font-size: 0.85rem;"></select>
            </div>
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button onclick="openCustomCreatureModal('companion')" style="background: #334155; color: white; border: 1px solid #64748b; padding: 8px 12px; border-radius: 6px; font-weight: bold; font-size: 0.8rem; cursor: pointer;">✨ Custom Creature</button>
                <button onclick="confirmSummonCompanion()" style="background: #0284c7; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; font-size: 0.8rem; cursor: pointer;">🦅 Summon</button>
            </div>
        </div>
    `;
    document.body.appendChild(div);
}

function openCustomCreatureModal(type) {
    window._customCreatureType = type; // 'wildshape' or 'companion'
    let modal = document.getElementById('custom-creature-modal');
    if (!modal) {
        createCustomCreatureModalHTML();
        modal = document.getElementById('custom-creature-modal');
    }
    modal.style.display = 'flex';
}

function closeCustomCreatureModal() {
    const modal = document.getElementById('custom-creature-modal');
    if (modal) modal.style.display = 'none';
}

function createCustomCreatureModalHTML() {
    if (document.getElementById('custom-creature-modal')) return;
    const div = document.createElement('div');
    div.id = 'custom-creature-modal';
    div.className = 'modal-overlay';
    div.style.cssText = 'display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10005; align-items: center; justify-content: center; backdrop-filter: blur(4px);';

    div.innerHTML = `
        <div class="modal-content" style="background: #0f172a; border: 2px solid var(--gold-amber); border-radius: 12px; padding: 20px; width: 90%; max-width: 480px; color: white; box-shadow: 0 0 25px rgba(245, 158, 11, 0.3);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <h3 style="margin: 0; color: var(--gold-amber); font-family: 'Cinzel', serif;">✨ Create Custom Creature</h3>
                <button onclick="closeCustomCreatureModal()" style="background: none; border: none; color: #9ca3af; font-size: 1.2rem; cursor: pointer;">✖</button>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 8px; max-height: 60vh; overflow-y: auto; padding-right: 4px;">
                <div>
                    <label style="font-size: 0.75rem; color: var(--gold-amber);">Creature Name</label>
                    <input type="text" id="cc-name" placeholder="e.g. Shadow Wolf" style="width: 100%; padding: 6px; background: #020617; border: 1px solid var(--border-iron); color: white; border-radius: 6px; font-size: 0.85rem;">
                </div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
                    <div>
                        <label style="font-size: 0.75rem; color: #a7f3d0;">Max HP</label>
                        <input type="number" id="cc-hp" value="20" style="width: 100%; padding: 6px; background: #020617; border: 1px solid var(--border-iron); color: white; border-radius: 6px; font-size: 0.85rem;">
                    </div>
                    <div>
                        <label style="font-size: 0.75rem; color: #93c5fd;">Armor Class</label>
                        <input type="number" id="cc-ac" value="13" style="width: 100%; padding: 6px; background: #020617; border: 1px solid var(--border-iron); color: white; border-radius: 6px; font-size: 0.85rem;">
                    </div>
                    <div>
                        <label style="font-size: 0.75rem; color: #fde047;">Speed</label>
                        <input type="text" id="cc-speed" value="40 ft" style="width: 100%; padding: 6px; background: #020617; border: 1px solid var(--border-iron); color: white; border-radius: 6px; font-size: 0.85rem;">
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
                    <div>
                        <label style="font-size: 0.7rem; color: #9ca3af;">STR</label>
                        <input type="number" id="cc-str" value="14" style="width: 100%; padding: 4px; background: #020617; border: 1px solid var(--border-iron); color: white; border-radius: 4px; font-size: 0.8rem;">
                    </div>
                    <div>
                        <label style="font-size: 0.7rem; color: #9ca3af;">DEX</label>
                        <input type="number" id="cc-dex" value="14" style="width: 100%; padding: 4px; background: #020617; border: 1px solid var(--border-iron); color: white; border-radius: 4px; font-size: 0.8rem;">
                    </div>
                    <div>
                        <label style="font-size: 0.7rem; color: #9ca3af;">CON</label>
                        <input type="number" id="cc-con" value="14" style="width: 100%; padding: 4px; background: #020617; border: 1px solid var(--border-iron); color: white; border-radius: 4px; font-size: 0.8rem;">
                    </div>
                </div>

                <div style="border-top: 1px solid var(--border-iron); padding-top: 8px; margin-top: 4px;">
                    <label style="font-size: 0.75rem; color: var(--gold-amber); font-weight: bold;">Attack Action 1</label>
                    <div style="display: grid; grid-template-columns: 2fr 1fr 1.5fr; gap: 6px; margin-top: 4px;">
                        <input type="text" id="cc-act1-name" placeholder="Attack Name (e.g. Bite)" style="padding: 4px; background: #020617; border: 1px solid var(--border-iron); color: white; border-radius: 4px; font-size: 0.8rem;">
                        <input type="text" id="cc-act1-hit" placeholder="+To Hit" style="padding: 4px; background: #020617; border: 1px solid var(--border-iron); color: white; border-radius: 4px; font-size: 0.8rem;">
                        <input type="text" id="cc-act1-dmg" placeholder="Damage (e.g. 1d8+2)" style="padding: 4px; background: #020617; border: 1px solid var(--border-iron); color: white; border-radius: 4px; font-size: 0.8rem;">
                    </div>
                </div>
            </div>

            <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 15px;">
                <button onclick="closeCustomCreatureModal()" style="background: #334155; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-size: 0.8rem; cursor: pointer;">Cancel</button>
                <button onclick="saveCustomCreature()" style="background: var(--gold-amber); color: black; border: none; padding: 6px 16px; border-radius: 6px; font-weight: bold; font-size: 0.8rem; cursor: pointer;">Save & Use</button>
            </div>
        </div>
    `;
    document.body.appendChild(div);
}

function saveCustomCreature() {
    const name = document.getElementById('cc-name')?.value || 'Custom Beast';
    const hp = parseInt(document.getElementById('cc-hp')?.value) || 20;
    const ac = parseInt(document.getElementById('cc-ac')?.value) || 12;
    const speed = document.getElementById('cc-speed')?.value || '30 ft';
    const str = parseInt(document.getElementById('cc-str')?.value) || 12;
    const dex = parseInt(document.getElementById('cc-dex')?.value) || 12;
    const con = parseInt(document.getElementById('cc-con')?.value) || 12;

    const act1Name = document.getElementById('cc-act1-name')?.value;
    const act1Hit = document.getElementById('cc-act1-hit')?.value;
    const act1Dmg = document.getElementById('cc-act1-dmg')?.value;

    const actions = [];
    if (act1Name) {
        actions.push({ name: act1Name, toHit: act1Hit || '+4', damage: act1Dmg || '1d6+2' });
    }

    const customObj = {
        id: 'custom_' + Date.now(),
        name: name,
        hp: hp,
        max_hp: hp,
        ac: ac,
        speed: speed,
        str: str,
        dex: dex,
        con: con,
        actions: actions
    };

    closeCustomCreatureModal();

    if (window._customCreatureType === 'wildshape') {
        closeWildShapeModal();
        transformIntoWildShape(customObj);
    } else if (window._customCreatureType === 'polymorph') {
        closePolymorphModal();
        transformIntoPolymorph(customObj);
    } else {
        closeCompanionModal();
        summonCompanion(customObj);
    }
}

// ----------------------------------------------------
// ACTIVE BEAST STATBLOCK POP-OUT MODAL
// ----------------------------------------------------

function openActiveBeastStatblockModal() {
    if (typeof document === 'undefined') return;
    const char = getActiveChar();
    const isPoly = char?.polymorph && char.polymorph.active && char.polymorph.hp > 0;
    const isWs = char?.wild_shape && char.wild_shape.active && char.wild_shape.hp > 0;

    if (!isPoly && !isWs) {
        notify('No active Polymorph or Wild Shape transformation currently active.');
        return;
    }

    const activeForm = isPoly ? char.polymorph : char.wild_shape;
    const formType = isPoly ? 'Polymorph' : 'Wild Shape';
    const themeColor = isPoly ? '#ef4444' : '#10b981';
    const themeBg = isPoly ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)';

    let modal = document.getElementById('beast-statblock-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'beast-statblock-modal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 10010; align-items: center; justify-content: center; backdrop-filter: blur(5px);';
        document.body.appendChild(modal);
    }

    const calcMod = (score) => {
        const mod = Math.floor(((parseInt(score) || 10) - 10) / 2);
        return (mod >= 0 ? '+' : '') + mod;
    };

    const strMod = calcMod(activeForm.str);
    const dexMod = calcMod(activeForm.dex);
    const conMod = calcMod(activeForm.con);
    const intMod = calcMod(activeForm.int || 2);
    const wisMod = calcMod(activeForm.wis || 10);
    const chaMod = calcMod(activeForm.cha || 5);

    modal.innerHTML = `
        <div class="modal-content" style="background: #0f172a; border: 2px solid ${themeColor}; border-radius: 14px; padding: 20px; width: 92%; max-width: 520px; color: white; box-shadow: 0 0 30px ${themeColor}55; max-height: 85vh; overflow-y: auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid ${themeColor}44; padding-bottom: 10px; margin-bottom: 12px;">
                <div>
                    <span style="font-size: 0.75rem; color: ${themeColor}; font-weight: bold; text-transform: uppercase;">ACTIVE ${formType.toUpperCase()} FORM</span>
                    <h2 style="margin: 2px 0 0 0; color: white; font-family: 'Cinzel', serif; font-size: 1.4rem;">${isPoly ? '🦖' : '🐻'} ${activeForm.name}</h2>
                </div>
                <button onclick="closeActiveBeastStatblockModal()" style="background: none; border: none; color: #9ca3af; font-size: 1.4rem; cursor: pointer;">✖</button>
            </div>

            <!-- Vitals Summary Bar -->
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; background: ${themeBg}; border: 1px solid ${themeColor}66; border-radius: 8px; padding: 10px; margin-bottom: 14px; text-align: center;">
                <div>
                    <div style="font-size: 0.7rem; color: #9ca3af;">HP</div>
                    <div style="font-size: 1.1rem; font-weight: bold; color: ${themeColor};">${activeForm.hp} / ${activeForm.max_hp}</div>
                </div>
                <div>
                    <div style="font-size: 0.7rem; color: #9ca3af;">ARMOR CLASS</div>
                    <div style="font-size: 1.1rem; font-weight: bold; color: white;">${activeForm.ac}</div>
                </div>
                <div>
                    <div style="font-size: 0.7rem; color: #9ca3af;">SPEED</div>
                    <div style="font-size: 0.9rem; font-weight: bold; color: #fde047;">${activeForm.speed || '30 ft'}</div>
                </div>
            </div>

            <!-- 6 Ability Scores Grid with 1-Click Saving Throw Rolls -->
            <div style="margin-bottom: 14px;">
                <div style="font-size: 0.75rem; color: ${themeColor}; font-weight: bold; margin-bottom: 6px; font-family: 'Cinzel';">ABILITY SCORES &amp; SAVING THROWS</div>
                <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px;">
                    <div style="background: #020617; border: 1px solid #334155; border-radius: 6px; padding: 6px 2px; text-align: center;">
                        <div style="font-size: 0.65rem; color: #94a3b8; font-weight: bold;">STR</div>
                        <div style="font-size: 0.95rem; font-weight: bold; color: white;">${activeForm.str || 10}</div>
                        <div style="font-size: 0.7rem; color: #38bdf8; font-weight: bold;">${strMod}</div>
                        <button onclick="rollCreatureAction('${activeForm.name}', 'STR Saving Throw', '${strMod}', '1d20', 'Strength Saving Throw')" style="margin-top: 4px; width: 90%; background: #1e293b; border: 1px solid #38bdf8; color: #38bdf8; border-radius: 3px; font-size: 0.6rem; cursor: pointer;">🎲 Save</button>
                    </div>
                    <div style="background: #020617; border: 1px solid #334155; border-radius: 6px; padding: 6px 2px; text-align: center;">
                        <div style="font-size: 0.65rem; color: #94a3b8; font-weight: bold;">DEX</div>
                        <div style="font-size: 0.95rem; font-weight: bold; color: white;">${activeForm.dex || 10}</div>
                        <div style="font-size: 0.7rem; color: #38bdf8; font-weight: bold;">${dexMod}</div>
                        <button onclick="rollCreatureAction('${activeForm.name}', 'DEX Saving Throw', '${dexMod}', '1d20', 'Dexterity Saving Throw')" style="margin-top: 4px; width: 90%; background: #1e293b; border: 1px solid #38bdf8; color: #38bdf8; border-radius: 3px; font-size: 0.6rem; cursor: pointer;">🎲 Save</button>
                    </div>
                    <div style="background: #020617; border: 1px solid #334155; border-radius: 6px; padding: 6px 2px; text-align: center;">
                        <div style="font-size: 0.65rem; color: #94a3b8; font-weight: bold;">CON</div>
                        <div style="font-size: 0.95rem; font-weight: bold; color: white;">${activeForm.con || 10}</div>
                        <div style="font-size: 0.7rem; color: #38bdf8; font-weight: bold;">${conMod}</div>
                        <button onclick="rollCreatureAction('${activeForm.name}', 'CON Saving Throw', '${conMod}', '1d20', 'Constitution Saving Throw')" style="margin-top: 4px; width: 90%; background: #1e293b; border: 1px solid #38bdf8; color: #38bdf8; border-radius: 3px; font-size: 0.6rem; cursor: pointer;">🎲 Save</button>
                    </div>
                    <div style="background: #020617; border: 1px solid #334155; border-radius: 6px; padding: 6px 2px; text-align: center;">
                        <div style="font-size: 0.65rem; color: #94a3b8; font-weight: bold;">INT</div>
                        <div style="font-size: 0.95rem; font-weight: bold; color: white;">${activeForm.int || 2}</div>
                        <div style="font-size: 0.7rem; color: #38bdf8; font-weight: bold;">${intMod}</div>
                        <button onclick="rollCreatureAction('${activeForm.name}', 'INT Saving Throw', '${intMod}', '1d20', 'Intelligence Saving Throw')" style="margin-top: 4px; width: 90%; background: #1e293b; border: 1px solid #38bdf8; color: #38bdf8; border-radius: 3px; font-size: 0.6rem; cursor: pointer;">🎲 Save</button>
                    </div>
                    <div style="background: #020617; border: 1px solid #334155; border-radius: 6px; padding: 6px 2px; text-align: center;">
                        <div style="font-size: 0.65rem; color: #94a3b8; font-weight: bold;">WIS</div>
                        <div style="font-size: 0.95rem; font-weight: bold; color: white;">${activeForm.wis || 10}</div>
                        <div style="font-size: 0.7rem; color: #38bdf8; font-weight: bold;">${wisMod}</div>
                        <button onclick="rollCreatureAction('${activeForm.name}', 'WIS Saving Throw', '${wisMod}', '1d20', 'Wisdom Saving Throw')" style="margin-top: 4px; width: 90%; background: #1e293b; border: 1px solid #38bdf8; color: #38bdf8; border-radius: 3px; font-size: 0.6rem; cursor: pointer;">🎲 Save</button>
                    </div>
                    <div style="background: #020617; border: 1px solid #334155; border-radius: 6px; padding: 6px 2px; text-align: center;">
                        <div style="font-size: 0.65rem; color: #94a3b8; font-weight: bold;">CHA</div>
                        <div style="font-size: 0.95rem; font-weight: bold; color: white;">${activeForm.cha || 5}</div>
                        <div style="font-size: 0.7rem; color: #38bdf8; font-weight: bold;">${chaMod}</div>
                        <button onclick="rollCreatureAction('${activeForm.name}', 'CHA Saving Throw', '${chaMod}', '1d20', 'Charisma Saving Throw')" style="margin-top: 4px; width: 90%; background: #1e293b; border: 1px solid #38bdf8; color: #38bdf8; border-radius: 3px; font-size: 0.6rem; cursor: pointer;">🎲 Save</button>
                    </div>
                </div>
            </div>

            <!-- Actions & Attacks List -->
            <div style="margin-bottom: 14px;">
                <div style="font-size: 0.75rem; color: ${themeColor}; font-weight: bold; margin-bottom: 6px; font-family: 'Cinzel';">BEAST ACTIONS &amp; ATTACKS</div>
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    ${Array.isArray(activeForm.actions) && activeForm.actions.length > 0 ? activeForm.actions.map(act => `
                        <div style="background: rgba(2, 6, 23, 0.8); border: 1px solid ${themeColor}44; border-radius: 6px; padding: 8px 10px; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                            <div style="flex: 1;">
                                <div style="font-weight: bold; color: white; font-size: 0.85rem;">${act.name}</div>
                                <div style="font-size: 0.72rem; color: #94a3b8;">${act.toHit ? 'To Hit: ' + act.toHit : ''} ${act.damage ? '| Damage: ' + act.damage : ''} ${act.description ? '| ' + act.description : ''}</div>
                            </div>
                            <button onclick="rollCreatureAction('${activeForm.name}', '${act.name}', '${act.toHit || ''}', '${act.damage || ''}', '${act.description || act.extra || ''}')" style="background: ${themeColor}; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-weight: bold; font-size: 0.75rem; cursor: pointer; white-space: nowrap;">🎲 Roll Action</button>
                        </div>
                    `).join('') : '<div style="font-size: 0.75rem; color: #94a3b8; font-style: italic;">No actions listed for this beast.</div>'}
                </div>
            </div>

            <!-- Modal Footer Actions -->
            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #334155; padding-top: 10px; margin-top: 10px;">
                <button onclick="${isPoly ? 'revertPolymorph()' : 'revertWildShape()'}; closeActiveBeastStatblockModal();" style="background: #ef4444; color: white; border: none; padding: 6px 14px; border-radius: 6px; font-weight: bold; font-size: 0.78rem; cursor: pointer;">↩️ Revert Form</button>
                <button onclick="closeActiveBeastStatblockModal()" style="background: #334155; color: white; border: none; padding: 6px 14px; border-radius: 6px; font-size: 0.78rem; cursor: pointer;">Close</button>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
}

function closeActiveBeastStatblockModal() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('beast-statblock-modal');
    if (modal) modal.style.display = 'none';
}

// Global Exports
window.openWildShapeModal = openWildShapeModal;
window.closeWildShapeModal = closeWildShapeModal;
window.confirmWildShapeTransform = confirmWildShapeTransform;
window.transformIntoWildShape = transformIntoWildShape;
window.revertWildShape = revertWildShape;
window.adjustWildShapeHP = adjustWildShapeHP;
window.openSummonCompanionModal = openSummonCompanionModal;
window.closeCompanionModal = closeCompanionModal;
window.confirmSummonCompanion = confirmSummonCompanion;
window.summonCompanion = summonCompanion;
window.dismissCompanion = dismissCompanion;
window.adjustCompanionHP = adjustCompanionHP;
window.rollCreatureAction = rollCreatureAction;
window.renderWildShapeAndCompanionsUI = renderWildShapeAndCompanionsUI;
window.openCustomCreatureModal = openCustomCreatureModal;
window.closeCustomCreatureModal = closeCustomCreatureModal;
window.saveCustomCreature = saveCustomCreature;
window.openPolymorphModal = openPolymorphModal;
window.closePolymorphModal = closePolymorphModal;
window.confirmPolymorphTransform = confirmPolymorphTransform;
window.transformIntoPolymorph = transformIntoPolymorph;
window.revertPolymorph = revertPolymorph;
window.adjustPolymorphHP = adjustPolymorphHP;
window.openActiveBeastStatblockModal = openActiveBeastStatblockModal;
window.closeActiveBeastStatblockModal = closeActiveBeastStatblockModal;



