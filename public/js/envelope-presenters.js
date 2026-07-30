// public/js/envelope-presenters.js

async function presentDreamSequence(envelope) {
    const { title, narrative, patron_themed, ambient_audio, journal_prompt } = envelope.content;

    // Create full-screen overlay
    const overlay = document.createElement('div');
    overlay.id = 'dream-overlay';
    overlay.className = 'envelope-fullscreen dream';
    if (patron_themed) overlay.classList.add('patron-themed');

    overlay.innerHTML = `
        <div class="dream-container">
            <p class="dream-prelude">You dream...</p>
            <h2 class="dream-title">${title}</h2>
            <div class="dream-narrative" id="dream-text"></div>
            <p class="dream-wake" style="display:none;">You wake in a cold sweat.</p>
            <button class="dream-continue" style="display:none;" id="dream-continue-btn">
                Open Journal
            </button>
        </div>
    `;

    document.body.appendChild(overlay);

    // Play synthesized ambient sound if enabled
    let synthInterval = null;
    try {
        if (window.Wave3Synth && typeof window.Wave3Synth.playAmbientDrone === 'function') {
            synthInterval = window.Wave3Synth.playAmbientDrone(patron_themed ? 'dark' : 'dreamy');
        }
    } catch (e) {
        console.warn("Could not start synthesized ambient tones:", e);
    }

    // Typewriter effect for narrative
    const textEl = document.getElementById('dream-text');
    await typewriterReveal(textEl, narrative, 35); // 35ms per character

    // Pause, then show wake text
    await delay(1500);
    const wakeEl = overlay.querySelector('.dream-wake');
    if (wakeEl) wakeEl.style.display = 'block';

    // Pause, then show continue button
    await delay(1200);
    const btn = document.getElementById('dream-continue-btn');
    if (btn) btn.style.display = 'block';

    btn.addEventListener('click', () => {
        if (synthInterval) {
            clearInterval(synthInterval);
            try {
                if (window.Wave3Synth && typeof window.Wave3Synth.stopAmbientDrone === 'function') {
                    window.Wave3Synth.stopAmbientDrone();
                }
            } catch (e) {}
        }
        overlay.remove();
        
        // Open campfire journal with prompt
        if (journal_prompt) {
            switchActiveTab('campfire');
            openJournalWithPrompt(journal_prompt);
        }
    });
}

async function presentFactionIntel(envelope) {
    const { faction, classification, report, attachments } = envelope.content;

    const factionStyles = {
        'Harpers':              { bg: '#13111c', border: '#4a90d9', font: "'Inter', sans-serif" },
        'Zhentarim':            { bg: '#07070a', border: '#4b5563', font: "monospace" },
        'Order of the Gauntlet': { bg: '#1c1c14', border: '#fbbf24', font: "'Cinzel', serif" },
        'Emerald Enclave':      { bg: '#0b1610', border: '#10b981', font: "'Inter', sans-serif" },
        'Lords Alliance':       { bg: '#160b16', border: '#a78bfa', font: "'Cinzel', serif" }
    };

    const style = factionStyles[faction] || factionStyles['Harpers'];

    const overlay = document.createElement('div');
    overlay.className = 'envelope-fullscreen intel';
    overlay.innerHTML = `
        <div class="intel-document" style="
            background: ${style.bg};
            border: 2px solid ${style.border};
            font-family: ${style.font};
        ">
            <div class="intel-header">
                <span class="intel-faction" style="color: ${style.border};">${faction.toUpperCase()} Intelligence</span>
                <span class="intel-classification">${classification}</span>
            </div>
            <div class="intel-stamp">FOR YOUR EYES ONLY</div>
            <div class="intel-body">${report}</div>
            ${attachments && attachments.length > 0 ? `
                <div class="intel-attachments">
                    <h4>Attached Intel Dossiers:</h4>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        ${attachments.map(a => `
                            <a href="#" onclick="event.preventDefault(); alert('Downloaded file: ${a}');" class="intel-attachment">${a}</a>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            <button class="intel-dismiss" style="background: ${style.border}; width:100%;" onclick="this.closest('.envelope-fullscreen').remove()">
                Acknowledge and Secure
            </button>
        </div>
    `;
    document.body.appendChild(overlay);
}

async function presentSessionRecap(envelope) {
    const { narrative, previously_on } = envelope.content;

    const overlay = document.createElement('div');
    overlay.className = 'envelope-fullscreen recap';
    overlay.innerHTML = `
        <div class="recap-scroll">
            ${previously_on ? `
                <p class="recap-previously">Previously on your adventure...</p>
                <p class="recap-previously-text">${previously_on}</p>
                <hr class="recap-divider">
            ` : ''}
            <div class="recap-narrative">
                <span class="drop-cap">${narrative.charAt(0)}</span>${narrative.slice(1)}
            </div>
            <button class="recap-dismiss" style="width:100%;" onclick="this.closest('.envelope-fullscreen').remove()">
                Begin Next Act
            </button>
        </div>
    `;
    document.body.appendChild(overlay);
}

async function presentSkillChallenge(envelope) {
    const { title, description, deadline, options, one_per_player } = envelope.content;

    const overlay = document.createElement('div');
    overlay.className = 'envelope-fullscreen challenge';
    overlay.innerHTML = `
        <div class="challenge-board">
            <h2>${title}</h2>
            <p class="challenge-desc">${description}</p>
            ${deadline ? `<p class="challenge-deadline">
                Respond Before: ${new Date(deadline).toLocaleDateString()}
            </p>` : ''}
            <div class="challenge-options">
                ${options.map((opt, i) => `
                    <button class="challenge-option" data-index="${i}" data-skill="${opt.skill}" data-dc="${opt.dc}">
                        <span class="challenge-skill">${opt.skill} (DC ${opt.dc})</span>
                        <span class="challenge-option-desc">${opt.description}</span>
                    </button>
                `).join('')}
            </div>
            <div id="challenge-result" style="display:none; margin-top:12px;"></div>
        </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelectorAll('.challenge-option').forEach(btn => {
        btn.addEventListener('click', async () => {
            const skill = btn.dataset.skill;
            const dc = parseInt(btn.dataset.dc);

            // Fetch skill modifier from engine
            const statMapping = {
                'athletics': 'str', 'acrobatics': 'dex', 'sleight of hand': 'dex', 'stealth': 'dex',
                'arcana': 'int', 'history': 'int', 'investigation': 'int', 'nature': 'int', 'religion': 'int',
                'animal handling': 'wis', 'insight': 'wis', 'medicine': 'wis', 'perception': 'wis', 'survival': 'wis',
                'deception': 'cha', 'intimidation': 'cha', 'performance': 'cha', 'persuasion': 'cha'
            };
            const skillKey = skill.toLowerCase();
            const statKey = statMapping[skillKey] || 'str';
            const modifier = (character.ability_modifiers ? (character.ability_modifiers[statKey] || 0) : 0);

            const roll = Math.floor(Math.random() * 20) + 1;
            const total = roll + modifier;
            const success = total >= dc;

            // Trigger synth roll chime
            try {
                if (window.Wave3Synth && typeof window.Wave3Synth.playDiceRollSFX === 'function') {
                    window.Wave3Synth.playDiceRollSFX();
                }
            } catch (e) {}

            const resultEl = document.getElementById('challenge-result');
            resultEl.style.display = 'block';
            resultEl.className = `challenge-roll ${success ? 'success' : 'failure'}`;
            resultEl.innerHTML = `
                <div class="roll-die">d20 Roll: ${roll}</div>
                <div class="roll-mod">+${modifier} Modifier (${skill})</div>
                <div class="roll-total">Result: ${total}</div>
                <div class="roll-result">${success ? 'CRITICAL SUCCESS' : 'CHALLENGE FAILED'}</div>
                <p class="roll-note">Outcome queued successfully. Your DM has been updated in real-time.</p>
                <button class="recap-dismiss" style="width:100%; margin-top:10px;" onclick="this.closest('.envelope-fullscreen').remove()">Dismiss</button>
            `;

            if (one_per_player) {
                overlay.querySelectorAll('.challenge-option').forEach(b => b.disabled = true);
            }

            // Save skill result to pending changes queue
            await window.offlineStore.addPendingChange({
                type: 'skill_challenge_result',
                envelope_id: envelope.id,
                characterId: charId,
                skill,
                dc,
                roll,
                modifier,
                total,
                success,
                timestamp: Date.now()
            });
        });
    });
}

async function presentAnnouncement(envelope) {
    const { title, message, style } = envelope.content;

    const overlay = document.createElement('div');
    overlay.className = 'envelope-fullscreen announcement';
    overlay.innerHTML = `
        <div style="max-width: 450px; width: 100%; background: #141419; border: 1px solid var(--border-iron); border-radius: 8px; padding: 24px; box-sizing: border-box; text-align: center;">
            <h3 style="font-family: 'Cinzel', serif; color: var(--gold-amber); margin-bottom: 12px; font-size: 1.25rem;">${title}</h3>
            <p style="font-size: 0.85rem; line-height: 1.6; color: #cbd5e1; margin-bottom: 20px;">${message}</p>
            <button class="recap-dismiss" style="width:100%;" onclick="this.closest('.envelope-fullscreen').remove()">Got It</button>
        </div>
    `;
    document.body.appendChild(overlay);
}

async function presentDowntimeUpdate(envelope) {
    const { activity, days_completed, days_required, estimated_completion, gold_spent, gold_remaining } = envelope.content;

    const overlay = document.createElement('div');
    overlay.className = 'envelope-fullscreen downtime';
    overlay.innerHTML = `
        <div style="max-width: 450px; width: 100%; background: #0d0d12; border: 1.5px solid var(--arcane-violet); border-radius: 8px; padding: 24px; box-sizing: border-box;">
            <h3 style="font-family: 'Cinzel', serif; color: var(--arcane-violet); margin-bottom: 6px; font-size: 1.2rem; text-align:center;">Downtime Milestone</h3>
            <p style="font-size:0.75rem; color:var(--text-muted); text-align:center; margin-bottom:15px; text-transform:uppercase;">Activity: ${activity}</p>
            
            <div style="background:#141419; border:1px solid var(--border-iron); border-radius:6px; padding:12px; margin-bottom:15px;">
                <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:4px;">
                    <span style="color:var(--text-muted);">Days Completed:</span>
                    <strong style="color:white;">${days_completed} / ${days_required}</strong>
                </div>
                <!-- Progress bar -->
                <div style="width:100%; height:8px; background:#1e1e24; border-radius:4px; overflow:hidden; margin-bottom:10px;">
                    <div style="width: ${(days_completed / days_required) * 100}%; height: 100%; background: var(--arcane-violet);"></div>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:0.8rem;">
                    <span style="color:var(--text-muted);">Gold Spent:</span>
                    <strong style="color:var(--gold-amber);">${gold_spent} gp</strong>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-top:4px;">
                    <span style="color:var(--text-muted);">Gold Remaining:</span>
                    <strong style="color:var(--gold-amber);">${gold_remaining} gp</strong>
                </div>
            </div>

            <p style="font-size: 0.8rem; color: #cbd5e1; font-style: italic; text-align:center; margin-bottom: 20px;">Estimated Completion: ${estimated_completion}</p>
            <button class="recap-dismiss" style="width:100%;" onclick="this.closest('.envelope-fullscreen').remove()">Accept Downtime Outcome</button>
        </div>
    `;
    document.body.appendChild(overlay);
}

// Helper methods for presentation
function typewriterReveal(element, text, charDelay = 35) {
    return new Promise((resolve) => {
        let i = 0;
        element.textContent = '';
        const interval = setInterval(() => {
            element.textContent += text.charAt(i);
            i++;
            if (i >= text.length) {
                clearInterval(interval);
                resolve();
            }
        }, charDelay);
    });
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
