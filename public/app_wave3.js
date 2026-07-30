// ==========================================
// WAVE 3 ENCHANTED DND COMMAND CENTER ENGINE
// ==========================================

// Web Audio Synth Engine
const Wave3Synth = {
    ctx: null,
    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    },
    playHeroicFanfare() {
        this.init();
        const now = this.ctx.currentTime;
        const notes = [261.63, 329.63, 392.00, 523.25];
        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.frequency.setValueAtTime(freq, now + idx * 0.15);
            osc.type = 'triangle';
            gain.gain.setValueAtTime(0.15, now + idx * 0.15);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.15 + 0.6);
            osc.start(now + idx * 0.15);
            osc.stop(now + idx * 0.15 + 0.6);
        });
    },
    playMenacingGrowl() {
        this.init();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        osc2.connect(gain);
        gain.connect(this.ctx.destination);
        osc.frequency.setValueAtTime(65, now);
        osc2.frequency.setValueAtTime(67, now);
        osc.type = 'sawtooth';
        osc2.type = 'sawtooth';
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
        osc.start(now);
        osc2.start(now);
        osc.stop(now + 1.2);
        osc2.stop(now + 1.2);
    },
    playChime() {
        this.init();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.frequency.setValueAtTime(880, now);
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
        osc.start(now);
        osc.stop(now + 0.8);
    },
    playWarningChime() {
        this.init();
        const now = this.ctx.currentTime;
        for (let i = 0; i < 3; i++) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.frequency.setValueAtTime(660, now + i * 0.15);
            osc.type = 'triangle';
            gain.gain.setValueAtTime(0.12, now + i * 0.15);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.15 + 0.4);
            osc.start(now + i * 0.15);
            osc.stop(now + i * 0.15 + 0.4);
        }
    },
    playSuccess() {
        this.init();
        const now = this.ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.frequency.setValueAtTime(freq, now + idx * 0.08);
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.12, now + idx * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.4);
            osc.start(now + idx * 0.08);
            osc.stop(now + idx * 0.08 + 0.4);
        });
    },
    playFailure() {
        this.init();
        const now = this.ctx.currentTime;
        const notes = [392.00, 349.23, 311.13, 261.63];
        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.frequency.setValueAtTime(freq, now + idx * 0.12);
            osc.type = 'triangle';
            gain.gain.setValueAtTime(0.12, now + idx * 0.12);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 0.5);
            osc.start(now + idx * 0.12);
            osc.stop(now + idx * 0.12 + 0.5);
        });
    }
};

// Global State
let activeShotClock = null;
let currentShotClockTime = 60;
let shotClockMax = 60;
let isShotClockActive = false;
let currentActiveTurnCombatantId = null;
let localCampaignParties = ['party.json'];
let activeCampaignParty = 'party.json';

// Initialize Wave 3 Engine
window.initWave3Engine = function() {
    console.log("Wave 3 advanced systems initialized.");
    
    // Connect to Web Socket updates if on character page or DM console
    if (window.socket) {
        window.socket.on('whisper-received', (data) => {
            showPlayerWhisperOverlay(data.message);
        });
        
        window.socket.on('badge-awarded-alert', (data) => {
            showBadgeAwardAlert(data.characterName, data.badgeId);
        });
        
        window.socket.on('session-closed-feedback-pulse', () => {
            showSessionFeedbackSurvey();
        });

        window.socket.on('session-config-updated', (data) => {
            if (data.shotClockSeconds) {
                shotClockMax = data.shotClockSeconds;
            }
        });

        window.socket.on('board-state-updated', (data) => {
            if (!data || !data.encounter || data.encounter.length === 0) return;
            
            // Track previous turn time
            if (currentActiveTurnCombatantId && currentActiveTurnCombatantId !== data.encounter[data.activeCombatIndex]?.id) {
                const prevCombatant = data.encounter.find(c => c.id === currentActiveTurnCombatantId);
                if (prevCombatant && prevCombatant.type === 'player') {
                    const elapsed = shotClockMax - currentShotClockTime;
                    fetch('/api/combat/record-turn-time', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            characterId: prevCombatant.id,
                            name: prevCombatant.name,
                            durationSeconds: elapsed > 0 ? elapsed : 15
                        })
                    }).catch(e => {});
                }
            }

            const activeCombatant = data.encounter[data.activeCombatIndex];
            if (activeCombatant) {
                const wasNewTurn = currentActiveTurnCombatantId !== activeCombatant.id;
                currentActiveTurnCombatantId = activeCombatant.id;

                if (wasNewTurn) {
                    startLocalTurnTimerCountdown(shotClockMax);

                    if (activeCombatant.type === 'player') {
                        Wave3Synth.playHeroicFanfare();
                        if (window.character && window.character.id === activeCombatant.id) {
                            renderPlayerTurnActionHelper(true);
                        } else {
                            renderPlayerTurnActionHelper(false);
                        }
                    } else if (activeCombatant.type === 'monster') {
                        Wave3Synth.playMenacingGrowl();
                        renderPlayerTurnActionHelper(false);
                    }
                }
            }
        });
    }
    
    // Check if on DM Console page
    const isDm = document.getElementById('open-grimoire-btn') || document.getElementById('combat-tracker-card-list');
    if (isDm) {
        loadWave3DmConsoleFeatures();
    }
};

// ==========================================
// PLAYER EXPERIENCE FEATURES
// ==========================================

// Turn Action Helper Dashboard Toggle (triggers automatically on player's turn)
window.renderPlayerTurnActionHelper = function(isActive) {
    let dashboard = document.getElementById('turn-action-helper-panel');
    if (!dashboard) {
        dashboard = document.createElement('div');
        dashboard.id = 'turn-action-helper-panel';
        dashboard.style = "background: rgba(13, 13, 18, 0.98); border: 1px solid var(--gold-amber); border-radius: 8px; padding: 15px; margin: 15px 0; box-shadow: 0 0 15px rgba(251, 191, 36, 0.25); display: none; transition: all 0.3s ease;";
        
        const header = document.getElementById('combat-turn-banner');
        if (header) {
            header.after(dashboard);
        } else {
            document.body.prepend(dashboard);
        }
    }

    if (!isActive) {
        dashboard.style.display = 'none';
        return;
    }

    // Load custom class features
    const charClass = (window.character && window.character.class) || 'Fighter';
    const charLvl = (window.character && window.character.level) || 1;
    
    // Fallback standard actions
    let bonusActionsHtml = `<li style="margin-bottom: 4px;">Off-hand Attack (Light weapon)</li>`;
    if (charClass === 'Rogue') {
        bonusActionsHtml += `<li style="margin-bottom: 4px;">Cunning Action: Dash, Disengage, or Hide</li>`;
    } else if (charClass === 'Cleric') {
        bonusActionsHtml += `<li style="margin-bottom: 4px;">Healing Word / Spiritual Weapon</li>`;
    } else if (charClass === 'Bard') {
        bonusActionsHtml += `<li style="margin-bottom: 4px;">Bardic Inspiration (1d8 to ally)</li>`;
    } else if (charClass === 'Fighter') {
        bonusActionsHtml += `<li style="margin-bottom: 4px;">Second Wind (Regain 1d10+Lvl HP)</li>`;
    }

    dashboard.innerHTML = `
        <h3 style="color: var(--gold-amber); font-family: 'Cinzel', serif; font-size: 1.1rem; border-bottom: 1px solid var(--gold-amber); padding-bottom: 5px; margin-top: 0; display:flex; justify-content:space-between;">
            <span>[TURN ACTIVE] Tactical Action Helper</span>
            <span id="player-turn-shot-clock-display" style="color: #ef4444; font-weight:bold;">60s</span>
        </h3>
        <p style="font-size:0.75rem; color:var(--text-muted); margin-top: 4px;">Eliminate analysis paralysis! Choose your optimal moves for this turn:</p>
        
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top:10px;">
            <div>
                <strong style="color: #a78bfa; font-size: 0.85rem; display:block; margin-bottom:4px;">Main Action (Choose One)</strong>
                <select id="action-helper-select" style="width:100%; background:#1e1b2e; color:white; border:1px solid var(--border-iron); padding:5px; font-size:0.8rem; border-radius:4px;">
                    <option>Attack (Strike with weapon/fist)</option>
                    <option>Cast a Spell (1 Main Action casting)</option>
                    <option>Dash (Gain extra speed equal to speed)</option>
                    <option>Disengage (Movement doesnt provoke opportunity attacks)</option>
                    <option>Dodge (Attacks against you have disadvantage)</option>
                    <option>Help (Give ally advantage on next check/attack)</option>
                    <option>Hide (Stealth vs enemy Perception)</option>
                    <option>Ready (Hold action for trigger)</option>
                    <option>Use an Object (Interact with environment/potion)</option>
                </select>
            </div>
            
            <div>
                <strong style="color: #a78bfa; font-size: 0.85rem; display:block; margin-bottom:4px;">Bonus Action (If Available)</strong>
                <ul style="font-size: 0.75rem; color: #cbd5e1; padding-left: 15px; margin: 0;">
                    ${bonusActionsHtml}
                </ul>
            </div>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top:12px; border-top: 1px solid var(--border-iron); padding-top: 10px;">
            <div>
                <strong style="color: #34d399; font-size: 0.85rem; display:block; margin-bottom:4px;">Movement Speed</strong>
                <span id="movement-speed-label" style="font-size:0.8rem; font-weight:bold; color:white;">30 ft</span>
                <label style="display:flex; align-items:center; font-size:0.7rem; color:var(--text-muted); margin-top:4px; gap:4px; cursor:pointer;">
                    <input type="checkbox" id="difficult-terrain-toggle" onchange="toggleDifficultTerrainMovement(this)" style="cursor:pointer;">
                    Difficult Terrain (Halves Speed)
                </label>
            </div>

            <div>
                <strong style="color: #f59e0b; font-size: 0.85rem; display:block; margin-bottom:4px;">Reaction & Free Actions</strong>
                <div style="display:flex; align-items:center; gap:10px;">
                    <label style="font-size:0.75rem; color:white; display:flex; align-items:center; gap:4px; cursor:pointer;">
                        <input type="checkbox" id="reaction-spent-toggle" style="cursor:pointer;"> Reaction Available
                    </label>
                </div>
                <span style="display:block; font-size:0.7rem; color:var(--text-muted); margin-top:4px;">Free: Draw/Sheathe, Speak 1-2 sentences.</span>
            </div>
        </div>
        
        <button onclick="endMyTurnLocal()" style="width:100%; margin-top:12px; background:var(--crimson-rage); border:none; color:white; padding:6px; font-weight:bold; border-radius:4px; font-size:0.8rem; cursor:pointer; font-family:'Cinzel', serif;">
            Finish Turn
        </button>
    `;
    
    dashboard.style.display = 'block';
};

window.toggleDifficultTerrainMovement = function(cb) {
    const label = document.getElementById('movement-speed-label');
    if (!label) return;
    const baseSpeed = 30;
    if (cb.checked) {
        label.innerText = `${baseSpeed / 2} ft (Reduced due to Difficult Terrain)`;
        label.style.color = '#ef4444';
    } else {
        label.innerText = `${baseSpeed} ft`;
        label.style.color = 'white';
    }
};

window.endMyTurnLocal = async function() {
    try {
        await fetch('/api/streamdeck/next');
        renderPlayerTurnActionHelper(false);
    } catch(e) {
        console.error("Failed to advance turn from player sheet", e);
    }
};

// Timer Clock Tick Logic on Player and Mirror
window.startLocalTurnTimerCountdown = function(seconds) {
    if (isShotClockActive) {
        clearInterval(activeShotClock);
    }
    currentShotClockTime = seconds || 60;
    isShotClockActive = true;
    
    activeShotClock = setInterval(() => {
        if (currentShotClockTime > 0) {
            currentShotClockTime--;
            updateLocalTurnTimerDisplay();
        } else {
            clearInterval(activeShotClock);
            isShotClockActive = false;
            // Play overtime buzzer / chimes
            Wave3Synth.playWarningChime();
            // Post overtime to server
            if (window.character) {
                fetch('/api/combat/record-turn-time', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        characterId: window.character.id,
                        name: window.character.name,
                        durationSeconds: 60
                    })
                });
            }
        }
    }, 1000);
};

function updateLocalTurnTimerDisplay() {
    const el = document.getElementById('player-turn-shot-clock-display') || document.getElementById('dm-shot-clock-timer-display');
    if (el) {
        el.innerText = `${currentShotClockTime}s`;
        if (currentShotClockTime <= 5) {
            el.style.color = '#ef4444';
            el.style.animation = "pulse 0.5s infinite";
        } else if (currentShotClockTime <= 15) {
            el.style.color = '#f59e0b';
            el.style.animation = "pulse 1s infinite";
        } else {
            el.style.color = '#34d399';
            el.style.animation = "none";
        }
    }
}

// Secret whispers Overlay
function showPlayerWhisperOverlay(message) {
    let overlay = document.getElementById('whisper-overlay-popup');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'whisper-overlay-popup';
        overlay.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(5, 5, 10, 0.95); z-index:99999; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:20px; text-align:center; box-sizing:border-box;";
        document.body.appendChild(overlay);
    }
    
    overlay.innerHTML = `
        <div style="max-width:500px; background:#110e1b; border:2px solid #a78bfa; padding:30px; border-radius:12px; box-shadow: 0 0 30px rgba(167, 139, 250, 0.4);">
            <h2 style="color:#a78bfa; font-family:'Cinzel', serif; font-size:1.5rem; letter-spacing:2px; margin-top:0;">[ TELEPATHIC WHISPER ]</h2>
            <p style="color:#94a3b8; font-size:0.85rem; font-style:italic; margin-bottom:20px;">A silent voice echoes in the chambers of your mind...</p>
            <div style="background:rgba(167, 139, 250, 0.05); border:1px solid rgba(167, 139, 250, 0.2); padding:15px; border-radius:6px; font-size:1.1rem; line-height:1.4; color:#f3f4f6; margin-bottom:25px; min-height:80px; display:flex; justify-content:center; align-items:center;">
                "${message}"
            </div>
            <button onclick="dismissWhisperOverlay()" style="background:#a78bfa; color:#110e1b; border:none; padding:10px 24px; font-weight:bold; border-radius:6px; font-size:0.9rem; cursor:pointer; font-family:'Cinzel', serif; transition:0.2s;">
                Acknowledge
            </button>
        </div>
    `;
    overlay.style.display = 'flex';
    Wave3Synth.playHeroicFanfare();
}

window.dismissWhisperOverlay = function() {
    const overlay = document.getElementById('whisper-overlay-popup');
    if (overlay) overlay.style.display = 'none';
};

// Session feedback popup survey
function showSessionFeedbackSurvey() {
    let overlay = document.getElementById('session-feedback-popup-survey');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'session-feedback-popup-survey';
        overlay.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(5, 5, 10, 0.95); z-index:99998; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:20px; box-sizing:border-box;";
        document.body.appendChild(overlay);
    }
    
    overlay.innerHTML = `
        <div style="max-width:500px; width:100%; background:#110e1b; border:2px solid var(--gold-amber); padding:25px; border-radius:12px; box-shadow: 0 0 25px rgba(245, 158, 11, 0.25);">
            <h2 style="color:var(--gold-amber); font-family:'Cinzel', serif; font-size:1.3rem; margin-top:0; border-bottom:1px solid var(--gold-amber); padding-bottom:8px; text-align:center;">
                Rate Tonight's Adventure
            </h2>
            <p style="color:var(--text-muted); font-size:0.8rem; text-align:center; margin-top:6px; margin-bottom:20px;">
                Your feedback helps the DM curate a legendary experience. Answers are anonymous.
            </p>
            
            <div style="display:flex; flex-direction:column; gap:15px;">
                <div>
                    <label style="color:#cbd5e1; font-size:0.85rem; display:block; margin-bottom:6px; font-weight:bold;">1. How fun was combat?</label>
                    <div style="display:flex; gap:10px; justify-content:center;" class="feedback-stars" data-q="combat">
                        ${[1,2,3,4,5].map(v => `<button onclick="setFeedbackValue(this, 'combat', ${v})" style="background:#1e1b2e; border:1px solid var(--border-iron); color:#cbd5e1; padding:6px 12px; border-radius:4px; font-weight:bold; cursor:pointer;">${v}</button>`).join('')}
                    </div>
                </div>
                
                <div>
                    <label style="color:#cbd5e1; font-size:0.85rem; display:block; margin-bottom:6px; font-weight:bold;">2. How fun was roleplay?</label>
                    <div style="display:flex; gap:10px; justify-content:center;" class="feedback-stars" data-q="roleplay">
                        ${[1,2,3,4,5].map(v => `<button onclick="setFeedbackValue(this, 'roleplay', ${v})" style="background:#1e1b2e; border:1px solid var(--border-iron); color:#cbd5e1; padding:6px 12px; border-radius:4px; font-weight:bold; cursor:pointer;">${v}</button>`).join('')}
                    </div>
                </div>

                <div>
                    <label style="color:#cbd5e1; font-size:0.85rem; display:block; margin-bottom:6px; font-weight:bold;">3. How was the game pacing?</label>
                    <div style="display:flex; gap:10px; justify-content:center;" class="feedback-stars" data-q="pacing">
                        ${[1,2,3,4,5].map(v => `<button onclick="setFeedbackValue(this, 'pacing', ${v})" style="background:#1e1b2e; border:1px solid var(--border-iron); color:#cbd5e1; padding:6px 12px; border-radius:4px; font-weight:bold; cursor:pointer;">${v}</button>`).join('')}
                    </div>
                </div>

                <div>
                    <label style="color:#cbd5e1; font-size:0.85rem; display:block; margin-bottom:4px; font-weight:bold;">4. One word to describe tonight's session:</label>
                    <input type="text" id="feedback-word-input" placeholder="Epic, Intense, Hilarious, Slow..." style="width:100%; background:#1e1b2e; color:white; border:1px solid var(--border-iron); padding:8px; border-radius:4px; box-sizing:border-box; font-size:0.85rem;">
                </div>
            </div>
            
            <div style="display:flex; gap:10px; margin-top:20px;">
                <button onclick="submitFeedbackPulseLocal()" style="flex:1; background:var(--gold-amber); color:#110e1b; border:none; padding:10px; font-weight:bold; border-radius:4px; font-size:0.85rem; cursor:pointer; font-family:'Cinzel', serif;">
                    Submit Survey
                </button>
                <button onclick="dismissFeedbackSurvey()" style="background:rgba(255,255,255,0.05); color:var(--text-muted); border:1px solid var(--border-iron); padding:10px; border-radius:4px; font-size:0.85rem; cursor:pointer;">
                    Skip
                </button>
            </div>
        </div>
    `;
    overlay.style.display = 'flex';
    overlay.dataset.combat = 3;
    overlay.dataset.roleplay = 3;
    overlay.dataset.pacing = 3;
}

window.setFeedbackValue = function(btn, question, value) {
    const parent = btn.parentElement;
    Array.from(parent.children).forEach(child => {
        child.style.background = '#1e1b2e';
        child.style.borderColor = 'var(--border-iron)';
        child.style.color = '#cbd5e1';
    });
    btn.style.background = 'var(--gold-amber)';
    btn.style.borderColor = 'var(--gold-amber)';
    btn.style.color = '#110e1b';
    
    document.getElementById('session-feedback-popup-survey').dataset[question] = value;
};

window.submitFeedbackPulseLocal = async function() {
    const overlay = document.getElementById('session-feedback-popup-survey');
    const word = document.getElementById('feedback-word-input').value.trim() || 'Awesome';
    const payload = {
        combat: parseInt(overlay.dataset.combat),
        roleplay: parseInt(overlay.dataset.roleplay),
        pacing: parseInt(overlay.dataset.pacing),
        oneWord: word
    };
    
    try {
        await fetch('/api/session/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        Wave3Synth.playSuccess();
        alert("Thank you! Feedback submitted to the DM.");
    } catch(e) {}
    dismissFeedbackSurvey();
};

window.dismissFeedbackSurvey = function() {
    const overlay = document.getElementById('session-feedback-popup-survey');
    if (overlay) overlay.style.display = 'none';
};

// Show decorative banner alert for badge awarded
function showBadgeAwardAlert(characterName, badgeId) {
    let container = document.getElementById('achievement-banner-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'achievement-banner-container';
        container.style = "position:fixed; bottom:20px; right:20px; z-index:99999; display:flex; flex-direction:column; gap:10px;";
        document.body.appendChild(container);
    }
    
    const banner = document.createElement('div');
    banner.style = "background:#1e1b2e; border:2px solid var(--gold-amber); border-radius:6px; padding:15px; width:300px; box-shadow:0 0 15px rgba(245, 158, 11, 0.4); display:flex; gap:10px; align-items:center; animation: slideIn 0.3s ease-out;";
    banner.innerHTML = `
        <div style="font-size:2rem; background:rgba(245,158,11,0.1); padding:8px; border-radius:4px; border:1px solid var(--gold-amber);">[T]</div>
        <div>
            <strong style="color:var(--gold-amber); display:block; font-size:0.85rem; font-family:'Cinzel', serif;">ACHIEVEMENT UNLOCKED</strong>
            <span style="color:white; font-size:0.8rem; display:block;">${characterName} earned:</span>
            <span style="color:#a78bfa; font-size:0.85rem; font-weight:bold;">${badgeId.replace(/_/g, ' ').toUpperCase()}</span>
        </div>
    `;
    container.appendChild(banner);
    Wave3Synth.playHeroicFanfare();
    
    setTimeout(() => {
        banner.style.animation = "slideOut 0.3s ease-in";
        setTimeout(() => banner.remove(), 300);
    }, 4000);
}


// ==========================================
// DM REFERENCE & CHEAT SHEETS (DM SIDE ONLY)
// ==========================================

function loadWave3DmConsoleFeatures() {
    console.log("Loading DM Console Wave 3 dashboards.");
    
    // Inject Custom DM reference layout panels
    injectDmConsoleWave3Controls();
}

function injectDmConsoleWave3Controls() {
    // 1. Let's create a collapsible Wave 3 Panel at the side of the page or in a modal
    let panel = document.getElementById('dm-console-wave3-sidebar');
    if (panel) return;
    
    panel = document.createElement('div');
    panel.id = 'dm-console-wave3-sidebar';
    panel.style = "position: fixed; left: -320px; top: 0; width: 320px; height: 100%; background: #0c0a14; border-right: 1px solid var(--gold-amber); z-index: 10000; box-shadow: 5px 0 15px rgba(0,0,0,0.7); display: flex; flex-direction: column; transition: left 0.3s ease;";
    
    panel.innerHTML = `
        <div style="background:#13101e; padding:15px; border-bottom:1px solid var(--gold-amber); display:flex; justify-content:space-between; align-items:center;">
            <h2 style="margin:0; font-family:'Cinzel', serif; font-size:1.1rem; color:var(--gold-amber);">Wave 3 Core CC</h2>
            <button onclick="toggleWave3Sidebar()" style="background:transparent; border:none; color:white; font-size:1.2rem; cursor:pointer;">&times;</button>
        </div>
        
        <div style="flex:1; overflow-y:auto; padding:15px; display:flex; flex-direction:column; gap:15px;" class="sidebar-scrollable">
            <!-- Active Campaign Switcher -->
            <div style="border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:10px;">
                <h4 style="color:#a78bfa; margin-top:0; margin-bottom:5px; font-size:0.85rem;">Campaign Party Selector</h4>
                <div style="display:flex; gap:5px;">
                    <select id="campaign-party-select-dropdown" style="flex:1; background:#1a1525; color:white; border:1px solid var(--border-iron); padding:5px; border-radius:4px; font-size:0.75rem;">
                        <option value="party.json">Default Party (party.json)</option>
                    </select>
                    <button onclick="triggerSwitchPartyLocal()" style="background:var(--gold-amber); color:#110e1b; border:none; padding:4px 8px; border-radius:4px; font-size:0.75rem; font-weight:bold; cursor:pointer;">Switch</button>
                </div>
            </div>

            <!-- Turn Shot Clock Control Widget -->
            <div style="border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:10px;">
                <h4 style="color:#a78bfa; margin-top:0; margin-bottom:5px; font-size:0.85rem;">Turn Shot Clock</h4>
                <div style="display:flex; gap:10px; align-items:center; margin-bottom:6px;">
                    <span id="dm-shot-clock-timer-display" style="font-size:1.4rem; font-weight:bold; color:#ef4444; font-family:monospace;">60s</span>
                    <button onclick="toggleShotClockEnabledLocal(this)" style="background:#34d399; color:#110e1b; border:none; padding:3px 8px; border-radius:4px; font-size:0.7rem; font-weight:bold; cursor:pointer;">Clock On</button>
                </div>
                <div style="display:flex; gap:5px; align-items:center;">
                    <label style="font-size:0.7rem; color:var(--text-muted);">Max s:</label>
                    <input type="number" id="shot-clock-seconds-input" value="60" style="width:50px; background:#1a1525; color:white; border:1px solid var(--border-iron); padding:3px; font-size:0.75rem; border-radius:4px;">
                    <button onclick="saveShotClockConfigLocal()" style="background:#a78bfa; color:#110e1b; border:none; padding:3px 8px; border-radius:4px; font-size:0.7rem; font-weight:bold; cursor:pointer;">Save</button>
                </div>
            </div>

            <!-- Secret Messages (Whispers Matrix) -->
            <div style="border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:10px;">
                <h4 style="color:#a78bfa; margin-top:0; margin-bottom:5px; font-size:0.85rem;">Secret Telepathic Whisper</h4>
                <div style="display:flex; flex-direction:column; gap:5px;">
                    <select id="whisper-player-select" style="background:#1a1525; color:white; border:1px solid var(--border-iron); padding:5px; border-radius:4px; font-size:0.75rem;"></select>
                    <textarea id="whisper-message-textarea" placeholder="Enter secret message to whisper to player's phone..." style="background:#1a1525; color:white; border:1px solid var(--border-iron); padding:5px; border-radius:4px; font-size:0.75rem; height:45px; resize:none;"></textarea>
                    <button onclick="sendSecretWhisperLocal()" style="background:var(--gold-amber); color:#110e1b; border:none; padding:5px; border-radius:4px; font-size:0.75rem; font-weight:bold; cursor:pointer;">Send Whisper</button>
                </div>
            </div>

            <!-- Award Achievement / Badges -->
            <div style="border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:10px;">
                <h4 style="color:#a78bfa; margin-top:0; margin-bottom:5px; font-size:0.85rem;">Award Character Trophies</h4>
                <div style="display:flex; flex-direction:column; gap:5px;">
                    <select id="badge-player-select" style="background:#1a1525; color:white; border:1px solid var(--border-iron); padding:5px; border-radius:4px; font-size:0.75rem;"></select>
                    <select id="badge-type-select" style="background:#1a1525; color:white; border:1px solid var(--border-iron); padding:5px; border-radius:4px; font-size:0.75rem;">
                        <option value="first_blood">First Blood [T]</option>
                        <option value="nat_20_club">Nat 20 Club [T]</option>
                        <option value="down_but_not_out">Down But Not Out [T]</option>
                        <option value="dragon_slayer">Dragon Slayer [T]</option>
                        <option value="silver_tongue">Silver Tongue [T]</option>
                        <option value="leeroy_jenkins">Leeroy Jenkins [T]</option>
                    </select>
                    <button onclick="awardBadgeLocal()" style="background:#34d399; color:#110e1b; border:none; padding:5px; border-radius:4px; font-size:0.75rem; font-weight:bold; cursor:pointer;">Award Badge</button>
                </div>
            </div>

            <!-- Skill Challenge Framework Engine -->
            <div style="border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:10px;">
                <h4 style="color:#a78bfa; margin-top:0; margin-bottom:5px; font-size:0.85rem;">Skill Challenge Framework</h4>
                <div style="display:flex; flex-direction:column; gap:5px;">
                    <input type="text" id="skill-challenge-goal" placeholder="e.g. Escape the collapsing vault" style="background:#1a1525; color:white; border:1px solid var(--border-iron); padding:4px; font-size:0.75rem; border-radius:4px;">
                    <div style="display:flex; gap:5px;">
                        <label style="font-size:0.7rem; color:var(--text-muted);">S req:</label>
                        <input type="number" id="skill-challenge-successes" value="5" style="width:35px; background:#1a1525; color:white; border:1px solid var(--border-iron); padding:3px; font-size:0.75rem; border-radius:4px;">
                        <label style="font-size:0.7rem; color:var(--text-muted);">F max:</label>
                        <input type="number" id="skill-challenge-failures" value="3" style="width:35px; background:#1a1525; color:white; border:1px solid var(--border-iron); padding:3px; font-size:0.75rem; border-radius:4px;">
                    </div>
                    <button onclick="startSkillChallengeLocal()" style="background:#a78bfa; color:#110e1b; border:none; padding:5px; border-radius:4px; font-size:0.75rem; font-weight:bold; cursor:pointer;">Start Challenge</button>
                </div>
                <div id="dm-skill-challenge-active-indicator" style="display:none; margin-top:5px; font-size:0.75rem; color:#f59e0b; font-weight:bold;">
                    Active: <span id="active-challenge-text">None</span>
                </div>
            </div>

            <!-- Soundtrack Sequencer Controls -->
            <div style="border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:10px;">
                <h4 style="color:#a78bfa; margin-top:0; margin-bottom:5px; font-size:0.85rem;">Soundtrack sequencer</h4>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">
                    <button onclick="setSoundtrackStateLocal('exploration')" style="background:#1a1525; border:1px solid var(--border-iron); color:white; padding:4px; border-radius:4px; font-size:0.7rem; cursor:pointer;">Calm Ambient</button>
                    <button onclick="setSoundtrackStateLocal('tension')" style="background:#1a1525; border:1px solid var(--border-iron); color:white; padding:4px; border-radius:4px; font-size:0.7rem; cursor:pointer;">Suspense</button>
                    <button onclick="setSoundtrackStateLocal('combat')" style="background:#1e1026; border:1px solid #c084fc; color:white; padding:4px; border-radius:4px; font-size:0.7rem; cursor:pointer;">Combat Beat</button>
                    <button onclick="setSoundtrackStateLocal('boss')" style="background:#261010; border:1px solid #f87171; color:white; padding:4px; border-radius:4px; font-size:0.7rem; cursor:pointer;">Epic Boss</button>
                </div>
            </div>

            <!-- Bounties Quest Board -->
            <div style="border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:10px;">
                <h4 style="color:#a78bfa; margin-top:0; margin-bottom:5px; font-size:0.85rem;">Bounties Quest Board</h4>
                <div style="display:flex; flex-direction:column; gap:5px;">
                    <input type="text" id="bounty-title" placeholder="Quest Title" style="background:#1a1525; color:white; border:1px solid var(--border-iron); padding:4px; font-size:0.75rem; border-radius:4px;">
                    <textarea id="bounty-desc" placeholder="Quest Description" style="background:#1a1525; color:white; border:1px solid var(--border-iron); padding:4px; font-size:0.75rem; border-radius:4px; height:35px; resize:none;"></textarea>
                    <div style="display:flex; gap:5px;">
                        <input type="number" id="bounty-gold" placeholder="gp" style="width:60px; background:#1a1525; color:white; border:1px solid var(--border-iron); padding:3px; font-size:0.75rem; border-radius:4px;">
                        <button onclick="publishBountyLocal()" style="flex:1; background:#a78bfa; color:#110e1b; border:none; padding:4px; border-radius:4px; font-size:0.75rem; font-weight:bold; cursor:pointer;">Publish Bounty</button>
                    </div>
                </div>
            </div>

            <!-- Session Prep Checklist -->
            <div style="border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:10px;">
                <h4 style="color:#a78bfa; margin-top:0; margin-bottom:5px; font-size:0.85rem;">Pre-Session Checklist</h4>
                <div id="prep-checklist-container" style="font-size:0.75rem; color:#cbd5e1; display:flex; flex-direction:column; gap:4px;">
                    <label style="display:flex; align-items:center; gap:5px;"><input type="checkbox"> Review player wishes (2 pending)</label>
                    <label style="display:flex; align-items:center; gap:5px;"><input type="checkbox"> Verify prophecies board (1 active)</label>
                    <label style="display:flex; align-items:center; gap:5px;"><input type="checkbox"> Check world events / news</label>
                </div>
            </div>

            <!-- End of Session Wizard Integration -->
            <div style="border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:10px;">
                <h4 style="color:var(--gold-amber); margin-top:0; margin-bottom:5px; font-size:0.85rem; font-family:'Cinzel', serif;">Session Wrap Suite</h4>
                <button onclick="openEndSessionWizard()" style="width:100%; padding:8px; background:linear-gradient(135deg, #1e1b4b, #111029); border:1.5px dashed var(--arcane-violet); color:white; font-weight:bold; border-radius:4px; font-size:0.75rem; cursor:pointer; font-family:'Cinzel', serif;">
                    End Session & Seal Mail
                </button>
            </div>

            <!-- Mobile Panic Mode Toggle -->
            <div>
                <button onclick="triggerDmMobilePanicModeToggle(this)" style="width:100%; padding:8px; background:var(--crimson-rage); color:white; font-weight:bold; border:none; border-radius:4px; font-size:0.8rem; cursor:pointer; font-family:'Cinzel', serif;">
                    Lock Console (Panic Mode)
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(panel);
    
    // Inject Toggle Sidebar Button to DM corner
    let triggerBtn = document.createElement('button');
    triggerBtn.id = 'toggle-wave3-sidebar-btn';
    triggerBtn.innerText = ">> WAVE 3 CC";
    triggerBtn.style = "position:fixed; left:10px; bottom:10px; z-index:9999; background:rgba(167, 139, 250, 0.1); border:1px solid #a78bfa; color:#a78bfa; padding:6px 12px; font-weight:bold; font-size:0.7rem; border-radius:4px; cursor:pointer; font-family:'Cinzel', serif;";
    triggerBtn.onclick = toggleWave3Sidebar;
    document.body.appendChild(triggerBtn);
    
    // Populates DM selects with characters in the matrix
    setTimeout(() => {
        populateWave3DmDropdowns();
        loadActiveCampaignPartiesDropdown();
    }, 1000);
}

window.toggleWave3Sidebar = function() {
    const sidebar = document.getElementById('dm-console-wave3-sidebar');
    if (sidebar.style.left === '0px') {
        sidebar.style.left = '-320px';
    } else {
        sidebar.style.left = '0px';
    }
};

function populateWave3DmDropdowns() {
    const whisperSelect = document.getElementById('whisper-player-select');
    const badgeSelect = document.getElementById('badge-player-select');
    
    if (!whisperSelect || !badgeSelect) return;
    
    fetch('/api/wiki/entities')
        .then(res => res.json())
        .then(data => {
            const players = data.filter(e => e.type === 'player');
            whisperSelect.innerHTML = players.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
            badgeSelect.innerHTML = players.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        })
        .catch(e => console.error("Failed to populate dropdowns", e));
}

function loadActiveCampaignPartiesDropdown() {
    const dropdown = document.getElementById('campaign-party-select-dropdown');
    if (!dropdown) return;
    
    fetch('/api/campaign/parties')
        .then(res => res.json())
        .then(parties => {
            dropdown.innerHTML = parties.map(p => `<option value="${p}">${p}</option>`).join('');
        });
}

window.triggerSwitchPartyLocal = async function() {
    const val = document.getElementById('campaign-party-select-dropdown').value;
    try {
        const res = await fetch('/api/campaign/switch-party', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partyFile: val })
        });
        const d = await res.json();
        if (d.success) {
            alert(`Switched active party file to: ${d.activeParty}`);
            location.reload();
        }
    } catch(e) {}
};

window.sendSecretWhisperLocal = function() {
    const charId = document.getElementById('whisper-player-select').value;
    const msg = document.getElementById('whisper-message-textarea').value.trim();
    if (!msg) return;
    
    if (window.socket) {
        window.socket.emit('whisper-to-player', { characterId: charId, message: msg });
        document.getElementById('whisper-message-textarea').value = '';
        alert("Whisper delivered to player's screen.");
    }
};

window.awardBadgeLocal = function() {
    const charId = document.getElementById('badge-player-select').value;
    const badgeId = document.getElementById('badge-type-select').value;
    
    if (window.socket) {
        window.socket.emit('award-badge', { characterId: charId, badgeId });
        alert(`Badge awarded!`);
    }
};

// Skill Challenge Framework State
let activeSkillChallenge = null;

window.startSkillChallengeLocal = function() {
    const goal = document.getElementById('skill-challenge-goal').value.trim() || "Survive the Gauntlet";
    const reqS = parseInt(document.getElementById('skill-challenge-successes').value) || 5;
    const maxF = parseInt(document.getElementById('skill-challenge-failures').value) || 3;
    
    activeSkillChallenge = {
        id: 'challenge_' + Date.now(),
        goal,
        reqSuccesses: reqS,
        maxFailures: maxF,
        currentSuccesses: 0,
        currentFailures: 0,
        rolls: []
    };
    
    document.getElementById('dm-skill-challenge-active-indicator').style.display = 'block';
    document.getElementById('active-challenge-text').innerText = `${goal} (${reqS} successes / ${maxF} failures)`;
    
    if (window.socket) {
        window.socket.emit('submit-skill-challenge-roll', {
            type: 'init',
            challenge: activeSkillChallenge
        });
        alert("Skill Challenge initialized and broadcast to players.");
    }
};

// Soundtrack Sequencer Crossfade
window.setSoundtrackStateLocal = function(stateName) {
    fetch('/api/session-config')
        .then(res => res.json())
        .then(() => {
            fetch('/api/streamdeck/sound/' + stateName);
            Wave3Synth.playHeroicFanfare();
            alert(`Sequencing Soundtrack State: ${stateName.toUpperCase()}`);
        });
};

window.publishBountyLocal = function() {
    const title = document.getElementById('bounty-title').value.trim();
    const desc = document.getElementById('bounty-desc').value.trim();
    const gold = parseInt(document.getElementById('bounty-gold').value) || 100;
    
    if (!title || !desc) return;
    
    fetch('/api/bounties')
        .then(res => res.json())
        .then(bounties => {
            const newItem = {
                id: 'bounty_' + Date.now(),
                title,
                description: desc,
                reward_gold: gold,
                reward_items: ["Potion of Healing"],
                difficulty: "Medium",
                deadline_date: "Calendar Date",
                status: "available"
            };
            bounties.push(newItem);
            fetch('/api/bounties', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bounties)
            }).then(() => {
                alert("Quest published to Bounties Board!");
                document.getElementById('bounty-title').value = '';
                document.getElementById('bounty-desc').value = '';
                document.getElementById('bounty-gold').value = '';
            });
        });
};

// Dm Mobile Panic Mode Toggle
let isPanicModeActive = false;

window.triggerDmMobilePanicModeToggle = function(btn) {
    isPanicModeActive = !isPanicModeActive;
    if (isPanicModeActive) {
        btn.innerText = "Console Locked [PANIC]";
        btn.style.background = "#fbbf24";
        btn.style.color = "#110e1b";
        
        if (window.socket) {
            window.socket.emit('close-session-pulse'); // Triggers feedback pulse & holding screens!
        }
    } else {
        btn.innerText = "Lock Console (Panic Mode)";
        btn.style.background = "var(--crimson-rage)";
        btn.style.color = "white";
    }
};

// Dynamic End of Session Wizard Overlays & Sealed Envelope Builder
window.openEndSessionWizard = function() {
    let overlay = document.getElementById('dm-end-session-wizard-modal');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'dm-end-session-wizard-modal';
        overlay.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(4,4,6,0.96); backdrop-filter:blur(8px); z-index:999999; display:flex; justify-content:center; align-items:center; padding:20px; box-sizing:border-box;";
        document.body.appendChild(overlay);
    }

    // Default wizard states
    window.draftEnvelopes = [
        {
            id: `env_recap_${Date.now()}`,
            type: "session_recap",
            target: "all",
            reveal_after: new Date(Date.now() + 86400000).toISOString().split('T')[0] + "T10:00:00Z", // Monday Morning
            content: {
                previously_on: "The party ventured deep into the sewers of Calimport, slaying the sewer drakes...",
                narrative: "Under the dim, flickering torchlight, our heroes secured the stolen scrolls and retreated to the Safehouse..."
            }
        },
        {
            id: `env_dream_${Date.now()}`,
            type: "dream",
            target: "char_1", // Default first char
            reveal_after: new Date(Date.now() + 172800000).toISOString().split('T')[0] + "T20:00:00Z", // Tuesday Evening
            content: {
                title: "Whispers of the Deep",
                narrative: "You stand in a shifting black desert. The stars above begin to fall into the sand, whispering your true name...",
                patron_themed: true,
                ambient_audio: "void_drone.mp3",
                journal_prompt: "Who was standing beside you in the black desert?"
            }
        }
    ];

    renderEndSessionWizardStep(0);
};

window.renderEndSessionWizardStep = function(stepIdx) {
    const overlay = document.getElementById('dm-end-session-wizard-modal');
    if (!overlay) return;

    if (stepIdx === 0) {
        // Step 1: Campaign Recap
        const recap = window.draftEnvelopes.find(e => e.type === "session_recap");
        overlay.innerHTML = `
            <div style="max-width:550px; width:100%; background:#141419; border:2px solid var(--gold-amber); border-radius:10px; padding:25px; box-sizing:border-box; color:white; box-shadow: 0 10px 30px rgba(0,0,0,0.85);">
                <h3 style="font-family:'Cinzel', serif; color:var(--gold-amber); margin-top:0; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                    <span>Step 1 of 3: Session Recap</span>
                    <span style="font-size:0.7rem; color:var(--text-muted);">End Session Suite</span>
                </h3>
                <p style="font-size:0.8rem; color:var(--text-muted); line-height:1.4; margin-bottom:15px;">
                    Draft the campaign recap. This time-gated narrative scroll will reveal itself on players' devices at home!
                </p>

                <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:20px;">
                    <div>
                        <label style="font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:4px;">Previously On (Recap Hook):</label>
                        <textarea id="recap-prev-text" style="width:100%; height:55px; background:#0d0d12; border:1px solid var(--border-iron); color:white; padding:8px; border-radius:4px; font-size:0.8rem; resize:none;" oninput="updateDraftRecap()">${recap.content.previously_on}</textarea>
                    </div>
                    <div>
                        <label style="font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:4px;">Recap Scroll Narrative:</label>
                        <textarea id="recap-narrative-text" style="width:100%; height:110px; background:#0d0d12; border:1px solid var(--border-iron); color:white; padding:8px; border-radius:4px; font-size:0.8rem; resize:none;" oninput="updateDraftRecap()">${recap.content.narrative}</textarea>
                    </div>
                    <div>
                        <label style="font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:4px;">Reveal Timestamp:</label>
                        <input type="datetime-local" id="recap-reveal-time" value="${recap.reveal_after.substring(0, 16)}" style="width:100%; background:#0d0d12; border:1px solid var(--border-iron); color:white; padding:8px; border-radius:4px; font-size:0.8rem;" onchange="updateDraftRecap()">
                    </div>
                </div>

                <div style="display:flex; justify-content:space-between; gap:10px;">
                    <button onclick="document.getElementById('dm-end-session-wizard-modal').remove()" style="background:#2a2a2e; border:none; color:#ccc; padding:10px 20px; font-weight:bold; border-radius:4px; cursor:pointer;">Cancel</button>
                    <button onclick="renderEndSessionWizardStep(1)" style="background:var(--arcane-violet); border:none; color:white; padding:10px 24px; font-weight:bold; border-radius:4px; cursor:pointer;">Next: Character Dreams </button>
                </div>
            </div>
        `;
    } else if (stepIdx === 1) {
        // Step 2: Character Dream
        const dream = window.draftEnvelopes.find(e => e.type === "dream");
        overlay.innerHTML = `
            <div style="max-width:550px; width:100%; background:#141419; border:2px solid var(--gold-amber); border-radius:10px; padding:25px; box-sizing:border-box; color:white; box-shadow: 0 10px 30px rgba(0,0,0,0.85);">
                <h3 style="font-family:'Cinzel', serif; color:var(--gold-amber); margin-top:0; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                    <span>Step 2 of 3: Character Dream</span>
                    <span style="font-size:0.7rem; color:var(--text-muted);">Targeted Sealed Mail</span>
                </h3>
                <p style="font-size:0.8rem; color:var(--text-muted); line-height:1.4; margin-bottom:15px;">
                    Draft a secret vision/dream that will play a takeover screen complete with synthesized audio on the selected player's phone!
                </p>

                <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:20px;">
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                        <div>
                            <label style="font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:4px;">Target Character:</label>
                            <select id="dream-target-select" style="width:100%; background:#0d0d12; border:1px solid var(--border-iron); color:white; padding:8px; border-radius:4px;" onchange="updateDraftDream()">
                                <option value="char_1">Furfur (char_1)</option>
                                <option value="char_2">Grizz (char_2)</option>
                                <option value="char_3">Suri (char_3)</option>
                                <option value="char_4">Machete (char_4)</option>
                                <option value="char_5">Valerie (char_5)</option>
                            </select>
                        </div>
                        <div>
                            <label style="font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:4px;">Dream Title:</label>
                            <input type="text" id="dream-title-input" value="${dream.content.title}" style="width:100%; background:#0d0d12; border:1px solid var(--border-iron); color:white; padding:8px; border-radius:4px;" oninput="updateDraftDream()">
                        </div>
                    </div>
                    <div>
                        <label style="font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:4px;">Dream Narrative Takeover:</label>
                        <textarea id="dream-narrative-input" style="width:100%; height:80px; background:#0d0d12; border:1px solid var(--border-iron); color:white; padding:8px; border-radius:4px; font-size:0.8rem; resize:none;" oninput="updateDraftDream()">${dream.content.narrative}</textarea>
                    </div>
                    <div>
                        <label style="font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:4px;">Journal Prompt Hook:</label>
                        <input type="text" id="dream-prompt-input" value="${dream.content.journal_prompt}" style="width:100%; background:#0d0d12; border:1px solid var(--border-iron); color:white; padding:8px; border-radius:4px;" oninput="updateDraftDream()">
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                        <div>
                            <label style="font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:4px;">Patron Red Glow:</label>
                            <select id="dream-theme-select" style="width:100%; background:#0d0d12; border:1px solid var(--border-iron); color:white; padding:8px; border-radius:4px;" onchange="updateDraftDream()">
                                <option value="true" ${dream.content.patron_themed ? 'selected':''}>Yes (Red Eldritch Theme)</option>
                                <option value="false" ${!dream.content.patron_themed ? 'selected':''}>No (Violet Dreamy Theme)</option>
                            </select>
                        </div>
                        <div>
                            <label style="font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:4px;">Reveal Date:</label>
                            <input type="datetime-local" id="dream-reveal-time" value="${dream.reveal_after.substring(0, 16)}" style="width:100%; background:#0d0d12; border:1px solid var(--border-iron); color:white; padding:8px; border-radius:4px; font-size:0.8rem;" onchange="updateDraftDream()">
                        </div>
                    </div>
                </div>

                <div style="display:flex; justify-content:space-between; gap:10px;">
                    <button onclick="renderEndSessionWizardStep(0)" style="background:#2a2a2e; border:none; color:#ccc; padding:10px 20px; font-weight:bold; border-radius:4px; cursor:pointer;">Back</button>
                    <button onclick="renderEndSessionWizardStep(2)" style="background:var(--arcane-violet); border:none; color:white; padding:10px 24px; font-weight:bold; border-radius:4px; cursor:pointer;">Next: Next Session Date </button>
                </div>
            </div>
        `;
        document.getElementById('dream-target-select').value = dream.target;
    } else if (stepIdx === 2) {
        // Step 3: Complete & Push
        overlay.innerHTML = `
            <div style="max-width:500px; width:100%; background:#141419; border:2px solid var(--success-green); border-radius:10px; padding:25px; box-sizing:border-box; color:white; box-shadow: 0 10px 30px rgba(0,0,0,0.85);">
                <h3 style="font-family:'Cinzel', serif; color:var(--success-green); margin-top:0; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                    <span>Step 3 of 3: Seal & Broadcast</span>
                    <span style="font-size:0.7rem; color:var(--text-muted);">Seal Mail Suite</span>
                </h3>
                <p style="font-size:0.8rem; color:var(--text-muted); line-height:1.4; margin-bottom:15px;">
                    Confirm next game session calendar schedule. Clicking 'Push and End Session' will force real-time feedback surveys to connected players, push envelopes, and end game night!
                </p>

                <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:20px;">
                    <div>
                        <label style="font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:4px;">Next Session Date:</label>
                        <input type="date" id="wizard-next-session-date" value="${new Date(Date.now() + 604800000).toISOString().split('T')[0]}" style="width:100%; background:#0d0d12; border:1px solid var(--border-iron); color:white; padding:8px; border-radius:4px; font-size:0.8rem;">
                    </div>
                </div>

                <div style="display:flex; justify-content:space-between; gap:10px;">
                    <button onclick="renderEndSessionWizardStep(1)" style="background:#2a2a2e; border:none; color:#ccc; padding:10px 20px; font-weight:bold; border-radius:4px; cursor:pointer;">Back</button>
                    <button onclick="submitSealedEnvelopesEndSession()" style="background:var(--success-green); border:none; color:white; padding:10px 24px; font-weight:bold; border-radius:4px; cursor:pointer; font-family:'Cinzel', serif;">Push & End Session</button>
                </div>
            </div>
        `;
    }
};

window.updateDraftRecap = function() {
    const recap = window.draftEnvelopes.find(e => e.type === "session_recap");
    recap.content.previously_on = document.getElementById('recap-prev-text').value;
    recap.content.narrative = document.getElementById('recap-narrative-text').value;
    recap.reveal_after = new Date(document.getElementById('recap-reveal-time').value).toISOString();
};

window.updateDraftDream = function() {
    const dream = window.draftEnvelopes.find(e => e.type === "dream");
    dream.target = document.getElementById('dream-target-select').value;
    dream.content.title = document.getElementById('dream-title-input').value;
    dream.content.narrative = document.getElementById('dream-narrative-input').value;
    dream.content.journal_prompt = document.getElementById('dream-prompt-input').value;
    dream.content.patron_themed = document.getElementById('dream-theme-select').value === "true";
    dream.reveal_after = new Date(document.getElementById('dream-reveal-time').value).toISOString();
};

window.submitSealedEnvelopesEndSession = function() {
    const nextSession = document.getElementById('wizard-next-session-date').value;
    
    // Notify Server to End Session, pushing sealed envelopes
    fetch('/api/session/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            envelopes: window.draftEnvelopes,
            nextSessionDate: nextSession
        })
    })
    .then(r => r.json())
    .then(res => {
        if (res.success) {
            // Emit close-session-pulse to trigger client side survey and secure screens
            if (window.socket) {
                window.socket.emit('close-session-pulse');
            }
            alert("Legendary session archived! Sealed envelopes successfully dispatched mid-week.");
            document.getElementById('dm-end-session-wizard-modal').remove();
        } else {
            alert("Error archiving session.");
        }
    })
    .catch(e => {
        console.error(e);
        alert("Success dispatch bypass — check logs!");
    });
};
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.initWave3Engine();
    }, 2000);
});
