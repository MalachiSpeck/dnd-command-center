// --- PLAYER SHEET SUBSYSTEM EXTENSIONS (FEATS, BACKGROUNDS, LANGUAGES) ---
// Integrates with player-sheet.html dynamically and unobtrusively

window.availableFeats = null;
window.selectedFeatObj = null;

window.availableBackgrounds = null;
window.selectedBackgroundObj = null;

window.availableLanguages = null;

// Intercept window.renderCharacterSheet to render our new extensions reactively
document.addEventListener('DOMContentLoaded', () => {
    if (window.renderCharacterSheet) {
        const originalRender = window.renderCharacterSheet;
        window.renderCharacterSheet = function() {
            originalRender();
            renderFeats();
            renderBackground();
            renderLanguages();
        };
    }
});

// --- FEATS MODULE ---

window.openFeatSelector = async function() {
    const modal = document.getElementById('feat-selector-modal');
    if (!modal) return;

    modal.style.display = 'flex';
    showFeatList();

    if (!window.availableFeats) {
        const scrollList = document.getElementById('feat-scroll-list');
        scrollList.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:15px;">Loading feats database...</div>';
        
        try {
            const res = await fetch('/api/reference/feats');
            const data = await res.json();
            if (data && data.feat) {
                window.availableFeats = data.feat;
                populateFeatsList(window.availableFeats);
            } else {
                scrollList.innerHTML = '<div style="color:#ef4444; text-align:center; padding:15px;">Failed to parse feats data.</div>';
            }
        } catch (e) {
            console.error("Failed to load feats reference:", e);
            scrollList.innerHTML = '<div style="color:#ef4444; text-align:center; padding:15px;">Failed to connect to server.</div>';
        }
    } else {
        populateFeatsList(window.availableFeats);
    }
};

window.closeFeatSelector = function() {
    const modal = document.getElementById('feat-selector-modal');
    if (modal) modal.style.display = 'none';
};

window.closeFeatSelectorOnOuterClick = function(e) {
    if (e.target.id === 'feat-selector-modal') {
        closeFeatSelector();
    }
};

function populateFeatsList(feats) {
    const scrollList = document.getElementById('feat-scroll-list');
    if (!scrollList) return;

    scrollList.innerHTML = '';
    const sorted = [...feats].sort((a, b) => a.name.localeCompare(b.name));

    sorted.forEach(feat => {
        const div = document.createElement('div');
        div.style.cssText = "background:#0f0f13; border:1px solid var(--border-iron); border-radius:4px; padding:10px; cursor:pointer; transition:all 0.15s ease;";
        div.onmouseover = () => { div.style.borderColor = 'var(--gold-amber)'; };
        div.onmouseout = () => { div.style.borderColor = 'var(--border-iron)'; };
        div.onclick = () => showFeatDetails(feat);

        const scoreText = getFeatScoreText(feat);

        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="color:var(--gold-amber);">${feat.name}</strong>
                ${scoreText ? `<span style="font-size:0.75rem; color:#10b981; background:rgba(16,185,129,0.1); padding:2px 6px; border-radius:3px;">${scoreText}</span>` : ''}
            </div>
            <p style="font-size:0.75rem; color:var(--text-muted); margin:4px 0 0 0; line-height:1.3; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">
                ${getFeatSimpleDesc(feat)}
            </p>
        `;
        scrollList.appendChild(div);
    });
}

window.filterFeatsList = function() {
    if (!window.availableFeats) return;
    const searchVal = document.getElementById('feat-search-input').value.toLowerCase();
    const filtered = window.availableFeats.filter(f => 
        f.name.toLowerCase().includes(searchVal) ||
        getFeatSimpleDesc(f).toLowerCase().includes(searchVal)
    );
    populateFeatsList(filtered);
};

function showFeatDetails(feat) {
    window.selectedFeatObj = feat;
    document.getElementById('feat-search-and-list').style.display = 'none';
    document.getElementById('feat-detail-view').style.display = 'flex';

    document.getElementById('feat-detail-name').innerText = feat.name;
    
    // Format prerequisite
    let prereqStr = "Prerequisite: None";
    if (feat.prerequisite && Array.isArray(feat.prerequisite)) {
        const list = [];
        feat.prerequisite.forEach(p => {
            if (p.race) p.race.forEach(r => list.push(`Race: ${r.name}`));
            if (p.proficiency) p.proficiency.forEach(pr => {
                if (pr.armor) list.push(`Armor proficiency: ${pr.armor}`);
                if (pr.weapon) list.push(`Weapon proficiency: ${pr.weapon}`);
            });
            if (p.ability) p.ability.forEach(ab => {
                Object.keys(ab).forEach(k => list.push(`${k.toUpperCase()} ${ab[k]}+`));
            });
            if (p.spellcasting) list.push("Ability to cast at least one spell");
        });
        if (list.length > 0) prereqStr = "Prerequisite: " + list.join(', ');
    }
    document.getElementById('feat-detail-prereq').innerText = prereqStr;

    // Description text parsing links
    const descDiv = document.getElementById('feat-detail-desc');
    descDiv.innerHTML = formatFeatTextEntries(feat.entries);

    // Show choice selectors if the feat provides stats choice
    const choiceContainer = document.getElementById('feat-stat-choice-container');
    const select = document.getElementById('feat-stat-choice-select');
    choiceContainer.style.display = 'none';
    select.innerHTML = '';

    const scoreIncreases = getAbilityIncreasesFromFeat(feat);
    const choiceObj = scoreIncreases.find(si => si.type === 'choose');

    if (choiceObj) {
        choiceContainer.style.display = 'block';
        choiceObj.from.forEach(stat => {
            const opt = document.createElement('option');
            opt.value = stat;
            opt.innerText = `+1 to ${stat.toUpperCase()}`;
            select.appendChild(opt);
        });
    }
}

window.showFeatList = function() {
    window.selectedFeatObj = null;
    document.getElementById('feat-search-and-list').style.display = 'flex';
    document.getElementById('feat-detail-view').style.display = 'none';
};

window.applySelectedFeat = function() {
    if (!window.selectedFeatObj) return;

    if (!window.character.feats) window.character.feats = [];

    // Avoid duplicate feats
    if (window.character.feats.some(f => f.toLowerCase() === window.selectedFeatObj.name.toLowerCase())) {
        alert(`Your character already has the "${window.selectedFeatObj.name}" feat.`);
        return;
    }

    // Process Ability Score Increase (ASI)
    const scoreIncreases = getAbilityIncreasesFromFeat(window.selectedFeatObj);
    
    if (!window.character.ability_scores) {
        window.character.ability_scores = { base: {}, racial: {}, asi: {}, overrides: {} };
    }
    if (!window.character.ability_scores.asi) {
        window.character.ability_scores.asi = {};
    }

    // 1. Direct increases
    scoreIncreases.forEach(si => {
        if (si.type === 'direct') {
            const stat = si.stat;
            const amt = si.amount;
            window.character.ability_scores.asi[stat] = (window.character.ability_scores.asi[stat] || 0) + amt;
        }
    });

    // 2. Choice increases
    const choiceObj = scoreIncreases.find(si => si.type === 'choose');
    if (choiceObj) {
        const select = document.getElementById('feat-stat-choice-select');
        const chosenStat = select.value;
        if (!chosenStat) {
            alert("Please select which ability score you want to increase.");
            return;
        }
        window.character.ability_scores.asi[chosenStat] = (window.character.ability_scores.asi[chosenStat] || 0) + 1;
    }

    // Add feat
    window.character.feats.push(window.selectedFeatObj.name);

    // Sync, recalculate and render!
    window.character = window.characterEngine.calculate(window.character);
    window.renderCharacterSheet();
    window.queueUpdateAndSync();

    closeFeatSelector();
    alert(`Applied the "${window.selectedFeatObj.name}" feat to your character sheet!`);
};

window.renderFeats = function() {
    const container = document.getElementById('feats-list-container');
    if (!container) return;

    container.innerHTML = '';
    const feats = window.character?.feats || [];

    if (feats.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 10px;">No feats selected yet.</div>';
        return;
    }

    feats.forEach(featName => {
        const card = document.createElement('div');
        card.className = 'feature-card';
        card.style.cssText = 'background: rgba(139, 92, 246, 0.05); border: 1px solid var(--border-iron); border-radius: 6px; padding: 10px; margin-bottom: 5px; cursor: pointer; position: relative;';
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="color:#fbbf24; font-size:0.85rem;">${featName}</strong>
                <button onclick="removeFeat('${featName}', event)" style="background:none; border:none; color:#ef4444; font-size:0.75rem; cursor:pointer;" title="Remove Feat">Remove</button>
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">Tap to expand details and read features.</div>
        `;
        card.onclick = () => viewFeatCardDetails(featName);
        container.appendChild(card);
    });
};

window.viewFeatCardDetails = async function(featName) {
    let featObj = null;
    if (window.availableFeats) {
        featObj = window.availableFeats.find(f => f.name.toLowerCase() === featName.toLowerCase());
    }

    if (!featObj) {
        try {
            const res = await fetch('/api/reference/feats');
            const data = await res.json();
            if (data && data.feat) {
                window.availableFeats = data.feat;
                featObj = window.availableFeats.find(f => f.name.toLowerCase() === featName.toLowerCase());
            }
        } catch(e) {}
    }

    if (featObj) {
        // Render in a popup or simple details alert card
        const title = featObj.name;
        const html = formatFeatTextEntries(featObj.entries);
        openCustomDetailPopup(title, html);
    } else {
        alert(`Feat details for "${featName}" not found in database.`);
    }
};

window.removeFeat = function(featName, event) {
    if (event) event.stopPropagation();

    if (!confirm(`Are you sure you want to remove the "${featName}" feat?`)) return;

    if (!window.character.feats) return;
    window.character.feats = window.character.feats.filter(f => f !== featName);

    // Roll back stat updates if we can identify them (simple reverse approximation)
    // To keep it safe and avoid corrupting manually edited ASIs, we don't automatically deduct stats, 
    // but we let the player know they can adjust their base stats under Ability Scores if needed.
    window.character = window.characterEngine.calculate(window.character);
    window.renderCharacterSheet();
    window.queueUpdateAndSync();

    alert(`Removed feat "${featName}". You can manually adjust your Base Ability Scores on this tab if necessary.`);
};

// --- BACKGROUNDS MODULE ---

window.openBackgroundSelector = async function() {
    const modal = document.getElementById('background-selector-modal');
    if (!modal) return;

    modal.style.display = 'flex';
    showBackgroundList();

    if (!window.availableBackgrounds) {
        const scrollList = document.getElementById('background-scroll-list');
        scrollList.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:15px;">Loading backgrounds database...</div>';
        
        try {
            const res = await fetch('/api/reference/backgrounds');
            const data = await res.json();
            if (data && data.background) {
                window.availableBackgrounds = data.background;
                populateBackgroundsList(window.availableBackgrounds);
            } else {
                scrollList.innerHTML = '<div style="color:#ef4444; text-align:center; padding:15px;">Failed to parse backgrounds data.</div>';
            }
        } catch (e) {
            console.error("Failed to load backgrounds reference:", e);
            scrollList.innerHTML = '<div style="color:#ef4444; text-align:center; padding:15px;">Failed to connect to server.</div>';
        }
    } else {
        populateBackgroundsList(window.availableBackgrounds);
    }
};

window.closeBackgroundSelector = function() {
    const modal = document.getElementById('background-selector-modal');
    if (modal) modal.style.display = 'none';
};

window.closeBackgroundSelectorOnOuterClick = function(e) {
    if (e.target.id === 'background-selector-modal') {
        closeBackgroundSelector();
    }
};

function populateBackgroundsList(backgrounds) {
    const scrollList = document.getElementById('background-scroll-list');
    if (!scrollList) return;

    scrollList.innerHTML = '';
    const sorted = [...backgrounds].sort((a, b) => a.name.localeCompare(b.name));

    sorted.forEach(bg => {
        const div = document.createElement('div');
        div.style.cssText = "background:#0f0f13; border:1px solid var(--border-iron); border-radius:4px; padding:10px; cursor:pointer; transition:all 0.15s ease;";
        div.onmouseover = () => { div.style.borderColor = 'var(--gold-amber)'; };
        div.onmouseout = () => { div.style.borderColor = 'var(--border-iron)'; };
        div.onclick = () => showBackgroundDetails(bg);

        // Extract skills display name
        const skillsText = getBackgroundSkillsText(bg);

        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="color:var(--gold-amber);">${bg.name}</strong>
                ${skillsText ? `<span style="font-size:0.75rem; color:#a78bfa; background:rgba(167,139,250,0.1); padding:2px 6px; border-radius:3px;">${skillsText}</span>` : ''}
            </div>
            <p style="font-size:0.75rem; color:var(--text-muted); margin:4px 0 0 0; line-height:1.3; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">
                ${getBackgroundSimpleDesc(bg)}
            </p>
        `;
        scrollList.appendChild(div);
    });
}

window.filterBackgroundsList = function() {
    if (!window.availableBackgrounds) return;
    const searchVal = document.getElementById('background-search-input').value.toLowerCase();
    const filtered = window.availableBackgrounds.filter(b => 
        b.name.toLowerCase().includes(searchVal) ||
        getBackgroundSimpleDesc(b).toLowerCase().includes(searchVal)
    );
    populateBackgroundsList(filtered);
};

function showBackgroundDetails(bg) {
    window.selectedBackgroundObj = bg;
    document.getElementById('background-search-and-list').style.display = 'none';
    document.getElementById('background-detail-view').style.display = 'flex';

    document.getElementById('background-detail-name').innerText = bg.name;
    document.getElementById('background-detail-desc').innerHTML = formatFeatTextEntries(bg.entries);
}

window.showBackgroundList = function() {
    window.selectedBackgroundObj = null;
    document.getElementById('background-search-and-list').style.display = 'flex';
    document.getElementById('background-detail-view').style.display = 'none';
};

window.applySelectedBackground = function() {
    if (!window.selectedBackgroundObj) return;

    // Apply Background name
    window.character.background = window.selectedBackgroundObj.name;

    // Grant skill proficiencies automatically!
    const textDesc = JSON.stringify(window.selectedBackgroundObj.entries);
    const skillRegex = /\{@skill ([a-zA-Z0-9 ]+)\}/g;
    let match;
    const detectedSkills = [];
    
    while ((match = skillRegex.exec(textDesc)) !== null) {
        const skillName = match[1].trim().toLowerCase();
        if (!detectedSkills.includes(skillName)) {
            detectedSkills.push(skillName);
        }
    }

    if (!window.character.proficiencies) {
        window.character.proficiencies = { skills: [], saving_throws: [], armor: [], weapons: [] };
    }
    if (!window.character.proficiencies.skills) {
        window.character.proficiencies.skills = [];
    }

    // Add newly granted background proficiencies if not already present
    let newlyAdded = [];
    detectedSkills.forEach(skill => {
        if (!window.character.proficiencies.skills.includes(skill)) {
            window.character.proficiencies.skills.push(skill);
            newlyAdded.push(skill.toUpperCase());
        }
    });

    // Alert and sync
    window.character = window.characterEngine.calculate(window.character);
    window.renderCharacterSheet();
    window.queueUpdateAndSync();

    closeBackgroundSelector();

    let msg = `Successfully applied the "${window.selectedBackgroundObj.name}" background to your character sheet!`;
    if (newlyAdded.length > 0) {
        msg += `\n\nSkill proficiencies granted: ${newlyAdded.join(', ')} (proficiency bonus added automatically!)`;
    }
    alert(msg);
};

window.renderBackground = function() {
    const container = document.getElementById('background-details-container');
    if (!container) return;

    container.innerHTML = '';
    const bgName = window.character?.background;

    if (!bgName) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 10px;">No background selected yet.</div>';
        return;
    }

    const card = document.createElement('div');
    card.style.cssText = 'background: rgba(167, 139, 250, 0.05); border: 1px solid var(--border-iron); border-radius: 6px; padding: 12px; cursor: pointer;';
    card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom:6px; margin-bottom:8px;">
            <strong style="color:#fbbf24; font-size:0.9rem;">${bgName}</strong>
            <span style="font-size:0.7rem; color:var(--text-muted); font-style:italic;">Tap to view details</span>
        </div>
        <p style="font-size:0.8rem; color:#cbd5e1; margin:0; line-height:1.4;">
            Your active background is <strong>${bgName}</strong>. Tap this card to explore full features, equipment lists, and specialties.
        </p>
    `;
    card.onclick = () => viewBackgroundCardDetails(bgName);
    container.appendChild(card);
};

window.viewBackgroundCardDetails = async function(bgName) {
    let bgObj = null;
    if (window.availableBackgrounds) {
        bgObj = window.availableBackgrounds.find(b => b.name.toLowerCase() === bgName.toLowerCase());
    }

    if (!bgObj) {
        try {
            const res = await fetch('/api/reference/backgrounds');
            const data = await res.json();
            if (data && data.background) {
                window.availableBackgrounds = data.background;
                bgObj = window.availableBackgrounds.find(b => b.name.toLowerCase() === bgName.toLowerCase());
            }
        } catch(e) {}
    }

    if (bgObj) {
        const title = bgObj.name;
        const html = formatFeatTextEntries(bgObj.entries);
        openCustomDetailPopup(title, html);
    } else {
        alert(`Background details for "${bgName}" not found in database.`);
    }
};

// --- LANGUAGES MODULE ---

window.openLanguageSelector = async function() {
    const modal = document.getElementById('language-selector-modal');
    if (!modal) return;

    modal.style.display = 'flex';

    if (!window.availableLanguages) {
        const scrollList = document.getElementById('languages-scroll-list');
        scrollList.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:15px;">Loading languages database...</div>';
        
        try {
            const res = await fetch('/api/reference/languages');
            const data = await res.json();
            if (data && data.language) {
                window.availableLanguages = data.language;
                populateLanguagesList(window.availableLanguages);
            } else {
                scrollList.innerHTML = '<div style="color:#ef4444; text-align:center; padding:15px;">Failed to parse languages data.</div>';
            }
        } catch (e) {
            console.error("Failed to load languages reference:", e);
            scrollList.innerHTML = '<div style="color:#ef4444; text-align:center; padding:15px;">Failed to connect to server.</div>';
        }
    } else {
        populateLanguagesList(window.availableLanguages);
    }
};

window.closeLanguageSelector = function() {
    const modal = document.getElementById('language-selector-modal');
    if (modal) modal.style.display = 'none';
};

window.closeLanguageSelectorOnOuterClick = function(e) {
    if (e.target.id === 'language-selector-modal') {
        closeLanguageSelector();
    }
};

function populateLanguagesList(languages) {
    const scrollList = document.getElementById('languages-scroll-list');
    if (!scrollList) return;

    scrollList.innerHTML = '';
    const sorted = [...languages].sort((a, b) => a.name.localeCompare(b.name));

    const known = window.character?.languages || ["Common"];

    sorted.forEach(lang => {
        const isKnown = known.some(k => k.toLowerCase() === lang.name.toLowerCase());

        const div = document.createElement('div');
        div.style.cssText = `background:#0f0f13; border:1px solid ${isKnown ? '#10b981' : 'var(--border-iron)'}; border-radius:4px; padding:10px; display:flex; justify-content:space-between; align-items:center; opacity:${isKnown ? 0.6 : 1};`;

        div.innerHTML = `
            <div>
                <strong style="color:${isKnown ? '#10b981' : 'var(--gold-amber)'};">${lang.name}</strong>
                <span style="font-size:0.7rem; color:var(--text-muted); display:block; margin-top:2px;">Speakers: ${lang.typicalSpeakers ? lang.typicalSpeakers.join(', ').replace(/\{@creature (.*?)\}/g, '$1') : 'Various'}</span>
            </div>
            ${isKnown ? 
                `<span style="font-size:0.75rem; color:#10b981; font-weight:bold;">Learned</span>` : 
                `<button onclick="applySelectedLanguage('${lang.name}')" style="background:#10b981; color:white; border:none; border-radius:4px; padding:4px 10px; font-size:0.75rem; font-weight:bold; cursor:pointer;">Learn</button>`
            }
        `;
        scrollList.appendChild(div);
    });
}

window.applySelectedLanguage = function(langName) {
    if (!window.character.languages) window.character.languages = ["Common"];

    if (window.character.languages.some(l => l.toLowerCase() === langName.toLowerCase())) {
        alert("You already speak this language.");
        return;
    }

    window.character.languages.push(langName);

    // Sync
    window.renderCharacterSheet();
    window.queueUpdateAndSync();

    populateLanguagesList(window.availableLanguages);
    alert(`Learned language: ${langName}!`);
};

window.renderLanguages = function() {
    const container = document.getElementById('languages-list-container');
    if (!container) return;

    container.innerHTML = '';
    const languages = window.character?.languages || ["Common"];

    languages.forEach(lang => {
        const badge = document.createElement('div');
        badge.style.cssText = 'background: rgba(167, 139, 250, 0.1); border: 1px solid var(--border-iron); border-radius: 4px; padding: 4px 10px; font-size: 0.8rem; font-weight: 500; color: white; display: flex; align-items: center; gap: 8px;';
        badge.innerHTML = `
            <span>${lang}</span>
            ${lang.toLowerCase() !== 'common' ? `<button onclick="removeLanguage('${lang}', event)" style="background:none; border:none; color:#ef4444; font-size:0.7rem; cursor:pointer; padding:0 0 0 4px; font-weight:bold;">x</button>` : ''}
        `;
        container.appendChild(badge);
    });
};

window.removeLanguage = function(langName, event) {
    if (event) event.stopPropagation();

    if (!confirm(`Are you sure you want to forget the "${langName}" language?`)) return;

    if (!window.character.languages) return;
    window.character.languages = window.character.languages.filter(l => l !== langName);

    window.renderCharacterSheet();
    window.queueUpdateAndSync();
};

// --- GENERAL PARSER & UI HELPERS ---

function formatFeatTextEntries(entries) {
    if (!entries) return '';
    
    // Parse entries
    let html = '';
    entries.forEach(entry => {
        if (typeof entry === 'string') {
            html += `<p style="margin-bottom:8px; line-height:1.4;">${parseFeatMarkupLinks(entry)}</p>`;
        } else if (entry.type === 'list' && entry.items) {
            html += `<ul style="margin-bottom:8px; padding-left:20px; list-style-type:disc; line-height:1.4;">`;
            entry.items.forEach(item => {
                html += `<li style="margin-bottom:4px;">${parseFeatMarkupLinks(typeof item === 'string' ? item : item.entry || '')}</li>`;
            });
            html += `</ul>`;
        } else if (entry.type === 'entries') {
            html += `<div style="margin-bottom:8px; border-left:2px solid var(--gold-amber); padding-left:8px; margin-left:4px;">`;
            if (entry.name) html += `<strong style="color:var(--gold-amber); display:block; margin-bottom:4px;">${entry.name}</strong>`;
            html += formatFeatTextEntries(entry.entries);
            html += `</div>`;
        }
    });

    return html;
}

function parseFeatMarkupLinks(text) {
    if (!text) return '';

    // Convert {@spell name} to beautiful clickable links that trigger spell details pop-up modal on player sheet!
    text = text.replace(/\{@spell (.*?)\}/g, (match, contents) => {
        const parts = contents.split('|');
        const spellName = parts[0].trim();
        return `<a href="#" onclick="event.preventDefault(); window.openSpellByName('${spellName}')" style="color: #a78bfa; font-weight: bold; text-decoration: underline; cursor: pointer;">${spellName}</a>`;
    });

    // Strip other tags
    text = text.replace(/\{@skill (.*?)\}/g, '$1');
    text = text.replace(/\{@condition (.*?)\}/g, '$1');
    text = text.replace(/\{@item (.*?)\}/g, '$1');
    text = text.replace(/\{@creature (.*?)\}/g, '$1');

    return text;
}

window.openSpellByName = async function(spellName) {
    try {
        const response = await fetch(`/api/spells/lookup/${encodeURIComponent(spellName)}`);
        if (response.ok) {
            const spell = await response.json();
            if (window.openSpellDetailModal) {
                window.openSpellDetailModal(spell);
            } else {
                alert(`Spell: ${spell.name}\n\n${spell.description}`);
            }
        } else {
            alert(`Spell details for "${spellName}" not found.`);
        }
    } catch (e) {
        console.error("Failed to load spell:", e);
    }
};

function getFeatSimpleDesc(feat) {
    if (!feat.entries) return '';
    const firstStr = feat.entries.find(e => typeof e === 'string');
    if (firstStr) return firstStr;
    return "Click to view description details.";
}

function getFeatScoreText(feat) {
    const list = getAbilityIncreasesFromFeat(feat);
    if (list.length === 0) return null;
    const textParts = [];
    list.forEach(si => {
        if (si.type === 'direct') {
            textParts.push(`+1 ${si.stat.toUpperCase()}`);
        } else if (si.type === 'choose') {
            textParts.push(`+1 Any`);
        }
    });
    return textParts.join(', ');
}

function getAbilityIncreasesFromFeat(feat) {
    const list = [];
    if (!feat.ability) return list;
    
    feat.ability.forEach(ab => {
        Object.keys(ab).forEach(key => {
            if (key !== 'choose' && typeof ab[key] === 'number') {
                list.push({ type: 'direct', stat: key, amount: ab[key] });
            }
        });
        
        if (ab.choose) {
            list.push({
                type: 'choose',
                from: ab.choose.from || ['str', 'dex', 'con', 'int', 'wis', 'cha'],
                amount: ab.choose.amount || 1
            });
        }
    });
    
    return list;
}

function getBackgroundSimpleDesc(bg) {
    if (!bg.entries) return '';
    // Look for Skill Proficiencies item or descriptive text
    const listCard = bg.entries.find(e => e.type === 'list');
    if (listCard && listCard.items) {
        const skillItem = listCard.items.find(i => i.name === 'Skill Proficiencies');
        if (skillItem) return "Skill Proficiencies: " + skillItem.entry.replace(/\{@skill (.*?)\}/g, '$1');
    }
    return "D&D 5e official background. Click to view proficiencies, languages, and specialties.";
}

function getBackgroundSkillsText(bg) {
    if (!bg.entries) return null;
    const listCard = bg.entries.find(e => e.type === 'list');
    if (listCard && listCard.items) {
        const skillItem = listCard.items.find(i => i.name === 'Skill Proficiencies');
        if (skillItem) {
            return skillItem.entry.replace(/\{@skill (.*?)\}/g, '$1');
        }
    }
    return null;
}

// Opens a beautiful, generic full details modal for feats, backgrounds, languages
function openCustomDetailPopup(title, htmlContent) {
    // We can reuse the class-table-modal or spell-detail-modal structure, or create a simple modal dynamically
    let modal = document.getElementById('extension-detail-popover-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'extension-detail-popover-modal';
        modal.className = 'overlay-modal';
        modal.style.cssText = 'display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); justify-content:center; align-items:center; z-index:90000;';
        modal.onclick = (e) => { if (e.target.id === 'extension-detail-popover-modal') modal.style.display = 'none'; };
        
        modal.innerHTML = `
            <div class="modal-content" style="width: 500px; max-height: 80vh; overflow-y: auto; padding: 25px; background: #15151c; border: 2px solid var(--border-iron); border-radius: 8px;" onclick="event.stopPropagation()">
                <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-iron); padding-bottom:12px; margin-bottom:15px;">
                    <h3 id="ext-popover-title" style="color:var(--gold-amber); font-family:'Cinzel'; margin:0; font-size:1.4rem;">Detail Title</h3>
                    <button class="btn-danger" onclick="document.getElementById('extension-detail-popover-modal').style.display = 'none'" style="padding:4px 10px;">Close</button>
                </div>
                <div id="ext-popover-body" style="font-size:0.9rem; line-height:1.5; color:#cbd5e1;"></div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    document.getElementById('ext-popover-title').innerText = title;
    document.getElementById('ext-popover-body').innerHTML = htmlContent;
    modal.style.display = 'flex';
}
