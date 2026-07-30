// --- SMART TEXT INGESTION HUB VIEWS ---
window.submitSmartIngest = async function() {
    const rawText = document.getElementById('ingest-raw-text').value.trim();
    const statusBox = document.getElementById('ingest-status-box');

    if (!rawText) {
        alert("Please paste some text first.");
        return;
    }

    statusBox.style.display = 'block';
    statusBox.innerHTML = '<span style="color: var(--text-muted);">Analyzing payload & parsing...</span>';

    try {
        const response = await fetch('/api/ingest/parse-text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: rawText })
        });
        const result = await response.json();

        if (result.success) {
            statusBox.innerHTML = `
                <div style="color: #10b981; font-weight: bold; margin-bottom: 4px;">Successfully Ingested!</div>
                <div><strong>Detected Category:</strong> <span style="text-transform: capitalize; color: var(--arcane-violet); font-weight: bold;">${result.detected}</span></div>
                <div><strong>Stored file:</strong> <span style="color: #fbbf24; font-family: monospace;">${result.savedTo}</span></div>
                <div style="margin-top: 4px; font-size: 0.8rem; color: var(--text-muted);">Loaded entity details: "${result.data.name || 'Anonymous'}"</div>
            `;
            if (result.detected === 'player') {
                loadPartyMatrix();
            }
        } else {
            statusBox.innerHTML = `<span style="color: #ef4444;">Error: ${result.error || 'Could not parse text.'}</span>`;
        }
    } catch(err) {
        console.error("Smart text ingest failed.", err);
        statusBox.innerHTML = '<span style="color: #ef4444;">Server error while parsing text.</span>';
    }
};

// --- MONSTER STAT BLOCK MODAL VIEWER ---
window.openMonsterStatBlockModal = async function(combatantId, name, type) {
    if (type === 'player') {
        const char = localPartyData.find(c => c.name === name);
        if (char) openSecretsDrawer(char);
        return;
    } else if (type === 'hazard') {
        if (lastRolledHazardRef) {
            alert(`Hazard Details:\n\nName: ${lastRolledHazardRef.name}\nTrigger: ${lastRolledHazardRef.trigger}\nEffect: ${lastRolledHazardRef.effect}`);
        } else {
            alert(`Hazard combatant: ${name}`);
        }
        return;
    }

    const modal = document.getElementById('statblock-modal');
    const modalName = document.getElementById('statblock-name');
    const modalBody = document.getElementById('statblock-modal-body');

    modalName.innerText = name;
    modalBody.innerHTML = '<div style="color: var(--text-muted); padding: 20px; text-align: center;">Fetching D&D Beyond Bestiary Data...</div>';
    modal.classList.remove('hidden');

    try {
        const response = await fetch('/api/monsters');
        const monsters = await response.json();
        
        const monster = monsters.find(m => m.name.toLowerCase() === name.toLowerCase());
        
        if (!monster) {
            modalBody.innerHTML = `<div style="color: #ef4444; padding: 20px; text-align: center;">Dossier details for "${name}" not found in local beastiary.json.</div>`;
            return;
        }

        const getStatValue = (statName) => {
            if (monster[statName] !== undefined) return monster[statName];
            if (monster.stats && monster.stats[statName.toLowerCase()] !== undefined) {
                return monster.stats[statName.toLowerCase()];
            }
            return 10;
        };

        const getStatMod = (statName) => {
            const modKey = `${statName}_mod`;
            if (monster[modKey] !== undefined) return monster[modKey];
            const val = parseInt(getStatValue(statName), 10);
            const mod = Math.floor((val - 10) / 2);
            return mod >= 0 ? `(+${mod})` : `(${mod})`;
        };

        const ac = monster.ac || monster.armorClass || "10";
        const hp = monster.hp || monster.hitPoints || "10";
        const speed = monster.speed || monster.Speed || "30 ft.";
        const cr = monster.challengeRating || monster.cr || monster.Challenge || "0";
        const senses = monster.senses || monster.Senses || "passive Perception 10";
        const languages = monster.languages || monster.Languages || "common";

        const rawSaves = monster.savingThrows || monster.saves || monster["Saving Throws"] || [];
        const saves = Array.isArray(rawSaves) ? rawSaves.join(', ') : String(rawSaves);

        const rawSkills = monster.skills || monster.Skills || [];
        const skills = Array.isArray(rawSkills) ? rawSkills.join(', ') : String(rawSkills);

        const renderSection = (title, itemsOrHtml) => {
            let contentHtml = '';

            if (typeof itemsOrHtml === 'string') {
                contentHtml = itemsOrHtml.trim();
            } else if (Array.isArray(itemsOrHtml)) {
                contentHtml = itemsOrHtml.map(item => {
                    if (!item) return '';
                    if (typeof item === 'string') {
                        return `<p style="margin-bottom: 6px;">${item}</p>`;
                    }
                    const itemName = item.name || item.title || '';
                    const itemDesc = item.description || item.desc || '';
                    return `<p style="margin-bottom: 6px;"><strong><em>${itemName}.</em></strong> ${itemDesc}</p>`;
                }).join('');
            }

            if (!contentHtml) return '';

            return `
                <div style="border-top: 1px solid #7e22ce; margin-top: 15px; padding-top: 10px;">
                    <h3 style="font-family: 'Cinzel', serif; color: #a78bfa; font-size: 1.1rem; margin-bottom: 8px;">${title}</h3>
                    <div style="font-size: 0.95rem; line-height: 1.5; color: #cbd5e1;">${contentHtml}</div>
                </div>
            `;
        };

        const traitsHtml = renderSection('Traits', monster.abilities || monster.Traits || monster.traits || monster.specialabilities);
        const actionsHtml = renderSection('Actions', monster.actions || monster.Actions);
        const legendaryHtml = renderSection('Legendary Actions', monster.legendaryActions || monster.LegendaryActions || monster.legendary_actions);

        const richTraits = formatTextWithSpellTooltips(traitsHtml);
        const richActions = formatTextWithSpellTooltips(actionsHtml);
        const richLegendary = formatTextWithSpellTooltips(legendaryHtml);

        modalBody.innerHTML = `
            <div style="font-style: italic; color: var(--text-muted); margin-bottom: 12px; font-size: 0.85rem; text-transform: capitalize;">
                ${monster.size || 'Medium'} ${monster.type || 'undead'}, ${monster.alignment || 'neutral evil'}
            </div>
            
            <div style="border-top: 2px solid #ef4444; border-bottom: 2px solid #ef4444; padding: 8px 0; margin-bottom: 12px; display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem;">
                <div><strong style="color: #fbbf24;">Armor Class:</strong> ${ac}</div>
                <div><strong style="color: #fbbf24;">Hit Points:</strong> ${hp}</div>
                <div><strong style="color: #fbbf24;">Speed:</strong> ${speed}</div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(6, 1fr); text-align: center; background-color: #0f0f13; border: 1px solid var(--border-iron); border-radius: 6px; padding: 8px 0; margin-bottom: 15px; font-size: 0.8rem;">
                <div><strong style="color: #a78bfa; display:block;">STR</strong>${getStatValue('STR')}<span style="color: var(--text-muted); font-size:0.75rem; display:block;">${getStatMod('STR')}</span></div>
                <div><strong style="color: #a78bfa; display:block;">DEX</strong>${getStatValue('DEX')}<span style="color: var(--text-muted); font-size:0.75rem; display:block;">${getStatMod('DEX')}</span></div>
                <div><strong style="color: #a78bfa; display:block;">CON</strong>${getStatValue('CON')}<span style="color: var(--text-muted); font-size:0.75rem; display:block;">${getStatMod('CON')}</span></div>
                <div><strong style="color: #a78bfa; display:block;">INT</strong>${getStatValue('INT')}<span style="color: var(--text-muted); font-size:0.75rem; display:block;">${getStatMod('INT')}</span></div>
                <div><strong style="color: #a78bfa; display:block;">WIS</strong>${getStatValue('WIS')}<span style="color: var(--text-muted); font-size:0.75rem; display:block;">${getStatMod('WIS')}</span></div>
                <div><strong style="color: #a78bfa; display:block;">CHA</strong>${getStatValue('CHA')}<span style="color: var(--text-muted); font-size:0.75rem; display:block;">${getStatMod('CHA')}</span></div>
            </div>

            <div style="font-size: 0.85rem; display: flex; flex-direction: column; gap: 4px; margin-bottom: 15px; color: #cbd5e1;">
                ${saves ? `<div><strong>Saving Throws:</strong> ${saves}</div>` : ''}
                ${skills ? `<div><strong>Skills:</strong> ${skills}</div>` : ''}
                <div><strong>Senses:</strong> ${senses}</div>
                <div><strong>Languages:</strong> ${languages}</div>
                <div><strong>Challenge:</strong> ${cr}</div>
            </div>

            ${richTraits}
            ${richActions}
            ${richLegendary}
        `;
    } catch(err) {
        console.error("Failed to render monster details.", err);
        modalBody.innerHTML = `<div style="color: #ef4444; padding: 20px; text-align: center;">Error loading stat block from server.</div>`;
    }
};

// --- CAMPAIGN NOTES DRAWER NOTES CORES ---
async function openNotesDrawer() {
    const area = document.getElementById('campaign-notes-textarea');
    area.value = "Fetching campaign log files...";
    document.getElementById('notes-drawer').classList.add('open');

    try {
        const response = await fetch('/api/notes');
        const data = await response.json();
        area.value = data.notes || "";
    } catch(err) {
        console.error("Failed to load campaign log.", err);
        area.value = "Failed to load log files from server.";
    }
}

window.closeNotesDrawer = function() {
    document.getElementById('notes-drawer').classList.remove('open');
};

async function saveCampaignNotes() {
    const area = document.getElementById('campaign-notes-textarea');
    const saveBtn = document.getElementById('save-notes-btn');
    const originalText = saveBtn.innerText;
    
    saveBtn.innerText = "Locking changes...";
    saveBtn.disabled = true;

    try {
        const response = await fetch('/api/notes/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: area.value })
        });
        const result = await response.json();
        
        if (result.success) {
            saveBtn.innerText = "Changes Secured!";
            setTimeout(() => {
                saveBtn.innerText = originalText;
                saveBtn.disabled = false;
            }, 1500);
        } else {
            throw new Error(result.error);
        }
    } catch(err) {
        console.error("Failed to save campaign notes.", err);
        alert("Server error. Could not write notes to local database.");
        saveBtn.innerText = originalText;
        saveBtn.disabled = false;
    }
}
