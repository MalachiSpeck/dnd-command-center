// --- PLAYER SHEET SUBSYSTEM EXTENSIONS (FEATS, BACKGROUNDS, LANGUAGES, MOBILE MAP & AOE) ---
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
            if (window.resourceVaultEngine) {
                window.resourceVaultEngine.renderVaultCard(window.character);
            }
        };
    }
});

// --- MOBILE MAP VIEWPORT, D-PAD NUDGER & AOE PLACER ---

window.initPlayerMobileMap = async function() {
    var container = document.getElementById('player-mobile-map-container');
    if (!container) return;

    var socket = window.socket || (typeof io === 'function' ? io() : null);

    if (window.GrailSceneEngine) {
        await window.GrailSceneEngine.init(container, false, socket);
        window.GrailSceneEngine.resize();

        fetch('/api/scene')
            .then(res => res.json())
            .then(scene => {
                if (scene) {
                    window.GrailSceneEngine.loadScene(scene);
                    window.GrailSceneEngine.resize();
                }
            })
            .catch(err => console.warn('Could not load mobile map scene:', err));
    }
};

window.nudgePlayerToken = function(direction) {
    var charId = (window.character && window.character.id) || localStorage.getItem('dnd_active_char_id');
    if (!charId) return alert('No active character loaded!');
    var socket = window.socket || (typeof io === 'function' ? io() : null);
    if (socket) {
        socket.emit('token:nudge', { character_id: charId, direction: direction });
    } else {
        alert('Socket connection disconnected.');
    }
};

window.placeMobileAoETemplate = function() {
    var shapeEl = document.getElementById('mobile-aoe-shape');
    var sizeEl = document.getElementById('mobile-aoe-size');
    var shape = shapeEl ? shapeEl.value : 'sphere';
    var size = sizeEl ? parseInt(sizeEl.value, 10) : 20;

    if (window.GrailSceneEngine) {
        window.GrailSceneEngine.setAoEConfig(shape, size, 0);
        window.GrailSceneEngine.setTool('template');
        alert(`Click anywhere on the mobile map to place your ${size}ft ${shape.toUpperCase()} spell template! Drag middle to move, drag yellow handle to rotate.`);
    }
};

window.clearMobileAoETemplates = function() {
    if (window.GrailSceneEngine) {
        window.GrailSceneEngine.clearAoETemplates();
    }
};

window.mobileZoomIn = function() {
    if (window.GrailSceneEngine) window.GrailSceneEngine.zoomIn();
};

window.mobileZoomOut = function() {
    if (window.GrailSceneEngine) window.GrailSceneEngine.zoomOut();
};

window.mobileZoomFit = function() {
    if (window.GrailSceneEngine) window.GrailSceneEngine.zoomFit();
};

window.mobileCenterToken = function() {
    var charId = (window.character && window.character.id) || localStorage.getItem('dnd_active_char_id');
    if (window.GrailSceneEngine && charId) {
        window.GrailSceneEngine.centerOnToken(charId);
    }
};

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

function showFeatList() {
    document.getElementById('feat-list-view').style.display = 'block';
    document.getElementById('feat-detail-view').style.display = 'none';
}

function populateFeatsList(feats) {
    const scrollList = document.getElementById('feat-scroll-list');
    scrollList.innerHTML = '';

    const currentFeats = (window.character && window.character.feats) || [];

    feats.forEach(f => {
        const hasFeat = currentFeats.some(cf => (typeof cf === 'string' ? cf : cf.name) === f.name);
        const div = document.createElement('div');
        div.className = 'spell-row-item';
        div.onclick = () => showFeatDetails(f);

        let prerequisiteText = f.prerequisite ? f.prerequisite.map(p => parseFeatPrerequisite(p)).join(', ') : 'None';

        div.innerHTML = `
            <div>
                <strong style="color:var(--gold-amber); font-size:0.9rem; font-family:'Cinzel';">${f.name}</strong>
                <div style="font-size:0.75rem; color:var(--text-muted);">Prerequisite: ${prerequisiteText}</div>
            </div>
            <div>
                ${hasFeat ? '<span style="color:#10b981; font-weight:bold; font-size:0.75rem;">[Acquired]</span>' : '<span style="color:var(--text-muted); font-size:0.8rem;">›</span>'}
            </div>
        `;
        scrollList.appendChild(div);
    });
}

function parseFeatPrerequisite(prereq) {
    if (prereq.ability) {
        return prereq.ability.map(a => Object.keys(a).map(k => `${k.toUpperCase()} ${a[k]}`).join('/')).join(', ');
    }
    if (prereq.proficiency) {
        return prereq.proficiency.map(p => Object.keys(p).map(k => `${k} ${p[k]}`).join('/')).join(', ');
    }
    if (prereq.spellcasting) return 'Spellcasting capability';
    if (prereq.other) return prereq.other;
    return 'Special';
}

function showFeatDetails(feat) {
    window.selectedFeatObj = feat;
    document.getElementById('feat-list-view').style.display = 'none';
    document.getElementById('feat-detail-view').style.display = 'block';

    document.getElementById('feat-detail-name').innerText = feat.name;
    
    let prereqStr = feat.prerequisite ? feat.prerequisite.map(p => parseFeatPrerequisite(p)).join(', ') : 'None';
    document.getElementById('feat-detail-prereq').innerText = prereqStr;

    let entriesHtml = feat.entries ? feat.entries.map(e => parseEntryToHtml(e)).join('') : 'No description available.';
    document.getElementById('feat-detail-desc').innerHTML = entriesHtml;

    const currentFeats = (window.character && window.character.feats) || [];
    const hasFeat = currentFeats.some(cf => (typeof cf === 'string' ? cf : cf.name) === feat.name);
    
    const applyBtn = document.getElementById('feat-apply-btn');
    if (hasFeat) {
        applyBtn.innerText = 'Acquired (Click to Remove)';
        applyBtn.style.background = '#ef4444';
    } else {
        applyBtn.innerText = 'Learn Feat';
        applyBtn.style.background = '#10b981';
    }
}

window.applySelectedFeat = function() {
    if (!window.selectedFeatObj || !window.character) return;
    
    if (!window.character.feats) window.character.feats = [];
    
    const featName = window.selectedFeatObj.name;
    const existingIndex = window.character.feats.findIndex(cf => (typeof cf === 'string' ? cf : cf.name) === featName);

    if (existingIndex !== -1) {
        window.character.feats.splice(existingIndex, 1);
    } else {
        window.character.feats.push({
            name: featName,
            source: window.selectedFeatObj.source || 'PHB',
            entries: window.selectedFeatObj.entries
        });
    }

    if (window.queueUpdateAndSync) window.queueUpdateAndSync();
    if (window.renderCharacterSheet) window.renderCharacterSheet();
    closeFeatSelector();
};

function renderFeats() {
    const container = document.getElementById('feats-acquired-list');
    if (!container) return;

    container.innerHTML = '';
    const feats = (window.character && window.character.feats) || [];

    if (feats.length === 0) {
        container.innerHTML = '<span style="font-size:0.75rem; color:var(--text-muted); font-style:italic;">No feats acquired...</span>';
        return;
    }

    feats.forEach(f => {
        const featName = typeof f === 'string' ? f : f.name;
        const div = document.createElement('div');
        div.style = "display:flex; justify-content:space-between; align-items:center; background:#0d0d12; border:1px solid var(--border-iron); padding:8px 12px; border-radius:6px; font-size:0.8rem; cursor:pointer;";
        div.onclick = () => openCustomDetailPopup(featName, f.entries ? f.entries.map(e => parseEntryToHtml(e)).join('') : 'Feat acquired.');
        
        div.innerHTML = `
            <strong style="color:var(--gold-amber);">${featName}</strong>
            <span style="color:var(--text-muted); font-size:0.75rem;">View Details ›</span>
        `;
        container.appendChild(div);
    });
}

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

function showBackgroundList() {
    document.getElementById('background-list-view').style.display = 'block';
    document.getElementById('background-detail-view').style.display = 'none';
}

function populateBackgroundsList(bgs) {
    const scrollList = document.getElementById('background-scroll-list');
    scrollList.innerHTML = '';

    const currentBg = (window.character && window.character.background) || '';

    bgs.forEach(b => {
        const isCurrent = currentBg === b.name;
        const div = document.createElement('div');
        div.className = 'spell-row-item';
        div.onclick = () => showBackgroundDetails(b);

        div.innerHTML = `
            <div>
                <strong style="color:var(--gold-amber); font-size:0.9rem; font-family:'Cinzel';">${b.name}</strong>
                <div style="font-size:0.75rem; color:var(--text-muted);">${b.source || 'PHB'}</div>
            </div>
            <div>
                ${isCurrent ? '<span style="color:#10b981; font-weight:bold; font-size:0.75rem;">[Active]</span>' : '<span style="color:var(--text-muted); font-size:0.8rem;">›</span>'}
            </div>
        `;
        scrollList.appendChild(div);
    });
}

function showBackgroundDetails(bg) {
    window.selectedBackgroundObj = bg;
    document.getElementById('background-list-view').style.display = 'none';
    document.getElementById('background-detail-view').style.display = 'block';

    document.getElementById('background-detail-name').innerText = bg.name;
    
    let entriesHtml = bg.entries ? bg.entries.map(e => parseEntryToHtml(e)).join('') : 'No background feature description available.';
    document.getElementById('background-detail-desc').innerHTML = entriesHtml;
}

window.applySelectedBackground = function() {
    if (!window.selectedBackgroundObj || !window.character) return;
    
    window.character.background = window.selectedBackgroundObj.name;
    window.character.background_feature = window.selectedBackgroundObj.entries ? window.selectedBackgroundObj.entries.map(e => parseEntryToHtml(e)).join('') : '';

    if (window.queueUpdateAndSync) window.queueUpdateAndSync();
    if (window.renderCharacterSheet) window.renderCharacterSheet();
    closeBackgroundSelector();
};

function renderBackground() {
    const titleEl = document.getElementById('bg-active-title');
    const descEl = document.getElementById('bg-active-desc');
    if (!titleEl || !descEl) return;

    const bgName = (window.character && window.character.background) || 'None Selected';
    titleEl.innerText = bgName;
    
    if (window.character && window.character.background_feature) {
        descEl.innerHTML = window.character.background_feature;
    } else {
        descEl.innerText = 'Tap to select an official background (Acolyte, Criminal, Folk Hero, Soldier, etc.) and apply background features.';
    }
}

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

function populateLanguagesList(langs) {
    const scrollList = document.getElementById('languages-scroll-list');
    scrollList.innerHTML = '';

    const currentLangs = (window.character && window.character.languages) || [];

    langs.forEach(l => {
        const hasLang = currentLangs.includes(l.name);
        const div = document.createElement('div');
        div.className = 'spell-row-item';
        div.onclick = () => toggleLanguage(l.name);

        div.innerHTML = `
            <div>
                <strong style="color:var(--gold-amber); font-size:0.9rem; font-family:'Cinzel';">${l.name}</strong>
                <div style="font-size:0.75rem; color:var(--text-muted);">${l.type || 'Standard'} | Script: ${l.script || 'None'}</div>
            </div>
            <div>
                ${hasLang ? '<span style="color:#10b981; font-weight:bold; font-size:0.8rem;">✓ Known</span>' : '<span style="color:var(--text-muted); font-size:0.8rem;">+ Add</span>'}
            </div>
        `;
        scrollList.appendChild(div);
    });
}

function toggleLanguage(langName) {
    if (!window.character) return;
    if (!window.character.languages) window.character.languages = [];

    const idx = window.character.languages.indexOf(langName);
    if (idx !== -1) {
        window.character.languages.splice(idx, 1);
    } else {
        window.character.languages.push(langName);
    }

    if (window.queueUpdateAndSync) window.queueUpdateAndSync();
    if (window.renderCharacterSheet) window.renderCharacterSheet();
    populateLanguagesList(window.availableLanguages);
}

function renderLanguages() {
    const container = document.getElementById('languages-known-badges');
    if (!container) return;

    container.innerHTML = '';
    const langs = (window.character && window.character.languages) || ['Common'];

    langs.forEach(l => {
        const span = document.createElement('span');
        span.style = "background:var(--bg-abyss); color:var(--text-main); border:1px solid var(--border-iron); padding:4px 8px; border-radius:4px; font-size:0.75rem; font-weight:bold;";
        span.innerText = l;
        container.appendChild(span);
    });
}

// --- UTILITY ENTRY PARSER ---

function parseEntryToHtml(entry) {
    if (typeof entry === 'string') {
        return `<p style="margin-bottom:8px;">${entry.replace(/\{@feat (.*?)\}/g, '$1').replace(/\{@spell (.*?)\}/g, '$1').replace(/\{@item (.*?)\}/g, '$1')}</p>`;
    }
    if (entry.type === 'entries' || entry.entries) {
        let title = entry.name ? `<strong style="color:var(--gold-amber); display:block; margin-top:6px;">${entry.name}</strong>` : '';
        let sub = entry.entries ? entry.entries.map(e => parseEntryToHtml(e)).join('') : '';
        return title + sub;
    }
    if (entry.type === 'list' && entry.items) {
        return `<ul style="margin-left:15px; margin-bottom:8px;">${entry.items.map(i => `<li>${typeof i === 'string' ? i : (i.name || '')}</li>`).join('')}</ul>`;
    }
    return '';
}

function openCustomDetailPopup(title, htmlContent) {
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
