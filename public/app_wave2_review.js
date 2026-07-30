// D&D DM Command Center - Advanced PDF Imports Review & Player Sync Proposals Module

window.currentActiveReviewTab = 'drafts';
window.loadedDrafts = {};
window.selectedDraftType = null;
window.selectedDraftFileName = null;

// Open the main Review & Sync Proposals modal
window.openReviewModal = function() {
    document.getElementById('review-modal').classList.remove('hidden');
    switchReviewTab(window.currentActiveReviewTab);
};

// Switch active tab within the review modal
window.switchReviewTab = function(tabName) {
    window.currentActiveReviewTab = tabName;
    const draftsTabBtn = document.getElementById('tab-btn-drafts');
    const syncsTabBtn = document.getElementById('tab-btn-syncs');
    const draftsContent = document.getElementById('review-tab-drafts');
    const syncsContent = document.getElementById('review-tab-syncs');

    if (tabName === 'drafts') {
        draftsTabBtn.style.borderColor = 'var(--arcane-violet)';
        draftsTabBtn.style.background = 'rgba(139, 92, 246, 0.1)';
        draftsTabBtn.style.color = 'var(--text-main)';

        syncsTabBtn.style.borderColor = 'var(--border-iron)';
        syncsTabBtn.style.background = 'transparent';
        syncsTabBtn.style.color = 'var(--text-muted)';

        draftsContent.style.display = 'flex';
        syncsContent.style.display = 'none';

        loadReviewDrafts();
    } else {
        syncsTabBtn.style.borderColor = 'var(--arcane-violet)';
        syncsTabBtn.style.background = 'rgba(139, 92, 246, 0.1)';
        syncsTabBtn.style.color = 'var(--text-main)';

        draftsTabBtn.style.borderColor = 'var(--border-iron)';
        draftsTabBtn.style.background = 'transparent';
        draftsTabBtn.style.color = 'var(--text-muted)';

        draftsContent.style.display = 'none';
        syncsContent.style.display = 'flex';

        loadOfflineProposals();
    }
};

// Load draft files from the backend
window.loadReviewDrafts = async function() {
    const listContainer = document.getElementById('drafts-sidebar-list');
    listContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; text-align: center;">Scanning staging folders...</div>';

    try {
        const response = await fetch('/api/drafts');
        const drafts = await response.json();
        window.loadedDrafts = drafts;

        listContainer.innerHTML = '';
        const categories = [
            { key: 'spells', label: ' Spells' },
            { key: 'monsters', label: ' Monsters' },
            { key: 'magic_items', label: ' Magic Items' }
        ];

        let totalDraftsCount = 0;

        categories.forEach(cat => {
            const files = drafts[cat.key] || [];
            if (files.length > 0) {
                totalDraftsCount += files.length;
                
                const header = document.createElement('div');
                header.style.fontSize = '0.75rem';
                header.style.fontWeight = 'bold';
                header.style.color = 'var(--gold-amber)';
                header.style.marginTop = '10px';
                header.style.marginBottom = '4px';
                header.innerText = `${cat.label} (${files.length})`;
                listContainer.appendChild(header);

                files.forEach(file => {
                    const btn = document.createElement('button');
                    btn.className = 'deck-btn';
                    btn.style.width = '100%';
                    btn.style.textAlign = 'left';
                    btn.style.fontSize = '0.75rem';
                    btn.style.padding = '6px 8px';
                    btn.style.marginBottom = '3px';
                    btn.style.whiteSpace = 'nowrap';
                    btn.style.overflow = 'hidden';
                    btn.style.textOverflow = 'ellipsis';
                    btn.style.borderColor = 'var(--border-iron)';

                    // Extract a clean name
                    let cleanName = file.replace(/\.md|\.json/g, '').replace(/_/g, ' ');
                    cleanName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
                    btn.innerText = cleanName;

                    btn.onclick = () => {
                        // Highlight active draft button
                        document.querySelectorAll('#drafts-sidebar-list button').forEach(el => {
                            el.style.borderColor = 'var(--border-iron)';
                            el.style.background = 'transparent';
                        });
                        btn.style.borderColor = 'var(--arcane-violet)';
                        btn.style.background = 'rgba(139, 92, 246, 0.05)';

                        selectReviewDraft(cat.key, file);
                    };

                    listContainer.appendChild(btn);
                });
            }
        });

        if (totalDraftsCount === 0) {
            listContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; text-align: center; padding: 15px 0;">No PDF imports in the staging folder. Run parse_pdf.py to stage content.</div>';
        }

    } catch (err) {
        console.error("Failed to load drafts list:", err);
        listContainer.innerHTML = '<div style="color: var(--crimson-rage); font-size: 0.8rem; text-align: center;">Error loading drafts.</div>';
    }
};

// Select and load details of a specific draft file
window.selectReviewDraft = async function(type, fileName) {
    window.selectedDraftType = type;
    window.selectedDraftFileName = fileName;

    const pane = document.getElementById('draft-editing-pane');
    pane.innerHTML = '<div style="color: var(--text-muted); font-size: 0.9rem; text-align: center; margin-top: 50px;">Loading draft contents...</div>';

    try {
        const response = await fetch(`/api/drafts/${type}/${fileName}`);
        
        if (type === 'spells') {
            const rawMarkdown = await response.text();
            renderSpellReviewForm(fileName, rawMarkdown);
        } else {
            const rawJson = await response.json();
            if (type === 'monsters') {
                renderMonsterReviewForm(fileName, rawJson);
            } else if (type === 'magic_items') {
                renderMagicItemReviewForm(fileName, rawJson);
            }
        }
    } catch (err) {
        console.error("Failed to fetch draft contents:", err);
        pane.innerHTML = '<div style="color: var(--crimson-rage); font-size: 0.9rem; text-align: center; margin-top: 50px;">Error reading draft details.</div>';
    }
};

// RENDER: Spell Review & Markdown Editor Form
function renderSpellReviewForm(fileName, markdownText) {
    const pane = document.getElementById('draft-editing-pane');
    pane.innerHTML = `
        <div style="display: flex; flex: 1; overflow: hidden; gap: 15px;">
            <!-- Left Side: Interactive Raw Editor -->
            <div style="flex: 1.2; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; padding-right: 5px;">
                <h4 style="color: var(--gold-amber); margin: 0; font-family: 'Cinzel'; font-size: 1.1rem;">Edit Spell Markdown</h4>
                
                <div style="display: flex; flex-direction: column; gap: 4px; flex: 1;">
                    <label style="font-size: 0.75rem; color: var(--text-muted);">Spell Grimoire file:</label>
                    <textarea id="spell-md-editor" style="width: 100%; flex: 1; min-height: 280px; background: var(--bg-abyss); color: #e2e8f0; border: 1px solid var(--border-iron); border-radius: 4px; padding: 10px; font-family: monospace; font-size: 0.8rem; line-height: 1.4; resize: none;">${markdownText}</textarea>
                </div>
            </div>

            <!-- Right Side: Markdown Previewer -->
            <div style="flex: 0.8; border-left: 1px solid var(--border-iron); padding-left: 15px; display: flex; flex-direction: column; overflow-y: auto;">
                <h4 style="color: var(--text-muted); margin: 0; font-family: 'Cinzel'; font-size: 1rem; border-bottom: 1px solid var(--border-iron); padding-bottom: 6px;">Parsed Preview</h4>
                <div style="font-size: 0.8rem; line-height: 1.4; color: var(--text-muted); padding: 10px 0;">
                    <div style="color: var(--text-main); font-weight: bold; font-size: 1rem; margin-bottom: 5px;">${fileName.replace('.md', '').replace(/_/g, ' ').toUpperCase()}</div>
                    <p style="font-style: italic; color: var(--gold-amber); margin-bottom: 10px;">Review markdown frontmatter matches schema and classes. Ensure the description is formatted nicely.</p>
                    <pre style="background: #0f0f13; padding: 8px; border-radius: 4px; border: 1px solid #1a1a24; font-size:0.75rem; overflow-x: auto;">${markdownText.substring(0, 350)}...</pre>
                </div>
            </div>
        </div>

        <!-- Form Footer Actions -->
        <div style="display: flex; gap: 10px; justify-content: flex-end; border-top: 1px solid var(--border-iron); padding-top: 12px; margin-top: 10px;">
            <button class="btn-danger" style="padding: 6px 14px;" onclick="discardReviewDraft('spells', '${fileName}')">Discard</button>
            <button class="btn-primary" style="padding: 6px 14px; background: var(--success-green); color: white;" onclick="approveSpellDraft('${fileName}')">Approve & Save</button>
        </div>
    `;
}

// RENDER: Monster Review & Statistics Editor Form
function renderMonsterReviewForm(fileName, monsterJson) {
    const pane = document.getElementById('draft-editing-pane');
    
    let actionsHtml = '';
    const actionsList = monsterJson.actions || [];
    actionsList.forEach((act, idx) => {
        actionsHtml += `
            <div style="border: 1px solid #222; background: #0c0c10; padding: 8px; border-radius: 4px; margin-bottom: 6px; position: relative;">
                <input type="text" id="monster-action-name-${idx}" value="${act.name || ''}" style="width: 100%; background: transparent; border: none; font-weight: bold; color: var(--gold-amber); font-size:0.8rem; margin-bottom: 4px;" placeholder="Action Name">
                <textarea id="monster-action-desc-${idx}" style="width: 100%; background: transparent; border: none; color: var(--text-main); font-size:0.75rem; line-height: 1.3; resize: vertical;" placeholder="Description">${act.desc || ''}</textarea>
            </div>
        `;
    });

    pane.innerHTML = `
        <div style="display: flex; flex: 1; overflow: hidden; gap: 15px;">
            <!-- Left Side: Interactive Stat Block Editor -->
            <div style="flex: 1.2; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; padding-right: 5px;">
                <h4 style="color: var(--gold-amber); margin: 0; font-family: 'Cinzel'; font-size: 1.1rem;">Recalculate & Edit Statblock</h4>
                
                <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px;">
                    <div>
                        <label style="font-size: 0.7rem; color: var(--text-muted);">Name:</label>
                        <input type="text" id="monster-name" value="${monsterJson.name || ''}" style="width: 100%; padding: 6px; background: var(--bg-abyss); border: 1px solid var(--border-iron); border-radius: 4px; color: white; font-size: 0.8rem;">
                    </div>
                    <div>
                        <label style="font-size: 0.7rem; color: var(--text-muted);">AC:</label>
                        <input type="number" id="monster-ac" value="${monsterJson.ac || 10}" style="width: 100%; padding: 6px; background: var(--bg-abyss); border: 1px solid var(--border-iron); border-radius: 4px; color: white; font-size: 0.8rem;">
                    </div>
                    <div>
                        <label style="font-size: 0.7rem; color: var(--text-muted);">HP:</label>
                        <input type="number" id="monster-hp" value="${monsterJson.hp || 30}" style="width: 100%; padding: 6px; background: var(--bg-abyss); border: 1px solid var(--border-iron); border-radius: 4px; color: white; font-size: 0.8rem;">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <div>
                        <label style="font-size: 0.7rem; color: var(--text-muted);">Speed:</label>
                        <input type="text" id="monster-speed" value="${monsterJson.speed || '30 ft.'}" style="width: 100%; padding: 6px; background: var(--bg-abyss); border: 1px solid var(--border-iron); border-radius: 4px; color: white; font-size: 0.8rem;">
                    </div>
                    <div>
                        <label style="font-size: 0.7rem; color: var(--text-muted);">CR:</label>
                        <input type="text" id="monster-cr" value="${monsterJson.cr || '1'}" style="width: 100%; padding: 6px; background: var(--bg-abyss); border: 1px solid var(--border-iron); border-radius: 4px; color: white; font-size: 0.8rem;">
                    </div>
                </div>

                <!-- Attributes Row -->
                <div>
                    <label style="font-size: 0.7rem; color: var(--text-muted); font-weight: bold;">Ability Scores:</label>
                    <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; margin-top: 4px;">
                        ${['str', 'dex', 'con', 'int', 'wis', 'cha'].map(stat => `
                            <div style="background: var(--bg-abyss); border: 1px solid var(--border-iron); padding: 4px; border-radius: 4px; text-align: center;">
                                <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">${stat}</div>
                                <input type="number" id="monster-stat-${stat}" value="${monsterJson.stats?.[stat] || 10}" style="width: 100%; background: transparent; border: none; color: white; text-align: center; font-weight: bold; font-size: 0.8rem; outline: none; margin-top: 2px;">
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Actions List -->
                <div>
                    <label style="font-size: 0.7rem; color: var(--text-muted); font-weight: bold;">Actions (${actionsList.length}):</label>
                    <div style="margin-top: 6px;" id="monster-actions-review-container">
                        ${actionsHtml || '<div style="font-size:0.75rem; color:var(--text-muted); font-style:italic;">No Actions Extracted</div>'}
                    </div>
                </div>
            </div>

            <!-- Right Side: Raw text comparison -->
            <div style="flex: 0.8; border-left: 1px solid var(--border-iron); padding-left: 15px; display: flex; flex-direction: column; overflow: hidden;">
                <h4 style="color: var(--text-muted); margin: 0; font-family: 'Cinzel'; font-size: 1rem; border-bottom: 1px solid var(--border-iron); padding-bottom: 6px;">Raw Source View</h4>
                <div style="flex: 1; overflow-y: auto; background: #0a0a0c; font-family: monospace; font-size: 0.75rem; line-height: 1.4; color: #a1a1aa; padding: 8px; border-radius: 4px; border: 1px solid #111; margin-top: 10px;">
                    ${monsterJson.raw_extracted || 'No raw source block attached by parser.'}
                </div>
            </div>
        </div>

        <!-- Form Footer Actions -->
        <div style="display: flex; gap: 10px; justify-content: flex-end; border-top: 1px solid var(--border-iron); padding-top: 12px; margin-top: 10px;">
            <button class="btn-danger" style="padding: 6px 14px;" onclick="discardReviewDraft('monsters', '${fileName}')">Discard</button>
            <button class="btn-primary" style="padding: 6px 14px; background: var(--success-green); color: white;" onclick="approveMonsterDraft('${fileName}', ${actionsList.length})">Approve & Save</button>
        </div>
    `;
}

// RENDER: Magic Item Review & Price Editor Form
function renderMagicItemReviewForm(fileName, itemJson) {
    const pane = document.getElementById('draft-editing-pane');
    pane.innerHTML = `
        <div style="display: flex; flex: 1; overflow: hidden; gap: 15px;">
            <!-- Left Side: Fields -->
            <div style="flex: 1.2; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; padding-right: 5px;">
                <h4 style="color: var(--gold-amber); margin: 0; font-family: 'Cinzel'; font-size: 1.1rem;">Edit Magic Item Properties</h4>
                
                <div>
                    <label style="font-size: 0.7rem; color: var(--text-muted);">Name:</label>
                    <input type="text" id="item-name" value="${itemJson.name || ''}" style="width: 100%; padding: 6px; background: var(--bg-abyss); border: 1px solid var(--border-iron); border-radius: 4px; color: white; font-size: 0.8rem;">
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <div>
                        <label style="font-size: 0.7rem; color: var(--text-muted);">Type & Rarity:</label>
                        <input type="text" id="item-type-rarity" value="${itemJson.type_rarity || ''}" style="width: 100%; padding: 6px; background: var(--bg-abyss); border: 1px solid var(--border-iron); border-radius: 4px; color: white; font-size: 0.8rem;">
                    </div>
                    <div>
                        <label style="font-size: 0.7rem; color: var(--text-muted);">Sane Price (gp):</label>
                        <input type="number" id="item-price" value="${itemJson.price_gp || 500}" style="width: 100%; padding: 6px; background: var(--bg-abyss); border: 1px solid var(--border-iron); border-radius: 4px; color: white; font-size: 0.8rem;">
                    </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 4px; flex: 1;">
                    <label style="font-size: 0.7rem; color: var(--text-muted);">Mechanical Effects Description:</label>
                    <textarea id="item-desc" style="width: 100%; flex: 1; min-height: 180px; background: var(--bg-abyss); color: #e2e8f0; border: 1px solid var(--border-iron); border-radius: 4px; padding: 10px; font-family: monospace; font-size: 0.8rem; line-height: 1.4; resize: none;">${itemJson.description || ''}</textarea>
                </div>
            </div>

            <!-- Right Side: Summary preview -->
            <div style="flex: 0.8; border-left: 1px solid var(--border-iron); padding-left: 15px; display: flex; flex-direction: column; overflow-y: auto;">
                <h4 style="color: var(--text-muted); margin: 0; font-family: 'Cinzel'; font-size: 1rem; border-bottom: 1px solid var(--border-iron); padding-bottom: 6px;">Attunement & Prices</h4>
                <div style="font-size: 0.8rem; color: var(--text-muted); padding: 10px 0; display:flex; flex-direction:column; gap:8px;">
                    <p>Sane Pricing benchmarks from reference guidelines:</p>
                    <ul style="padding-left:15px; margin: 0; display:flex; flex-direction:column; gap:4px; font-size:0.75rem;">
                        <li>Common Item: 50 - 100 gp</li>
                        <li>Uncommon Item: 100 - 500 gp</li>
                        <li>Rare Item: 500 - 5,000 gp</li>
                        <li>Very Rare: 5,000 - 50,000 gp</li>
                        <li>Legendary Item: 50,000+ gp</li>
                    </ul>
                </div>
            </div>
        </div>

        <!-- Form Footer Actions -->
        <div style="display: flex; gap: 10px; justify-content: flex-end; border-top: 1px solid var(--border-iron); padding-top: 12px; margin-top: 10px;">
            <button class="btn-danger" style="padding: 6px 14px;" onclick="discardReviewDraft('magic_items', '${fileName}')">Discard</button>
            <button class="btn-primary" style="padding: 6px 14px; background: var(--success-green); color: white;" onclick="approveMagicItemDraft('${fileName}')">Approve & Save</button>
        </div>
    `;
}

// ACTION: Approve Spell Draft Markdown
window.approveSpellDraft = async function(fileName) {
    const editorVal = document.getElementById('spell-md-editor').value;

    try {
        const response = await fetch('/api/drafts/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'spells',
                fileName: fileName,
                data: editorVal
            })
        });

        const result = await response.json();
        if (result.success) {
            flashReviewToast(result.message || "Spell approved!");
            document.getElementById('draft-editing-pane').innerHTML = '<div style="text-align: center; color: var(--text-muted); margin-top: 50px; font-style: italic;">Approved successfully! Select another file.</div>';
            loadReviewDrafts();
        } else {
            alert("Approval failed: " + result.error);
        }
    } catch(e) {
        console.error(e);
        alert("Failed to submit approval.");
    }
};

// ACTION: Approve Monster Draft JSON
window.approveMonsterDraft = async function(fileName, actionsCount) {
    const monsterName = document.getElementById('monster-name').value.trim();
    const ac = parseInt(document.getElementById('monster-ac').value) || 10;
    const hp = parseInt(document.getElementById('monster-hp').value) || 30;
    const speed = document.getElementById('monster-speed').value.trim();
    const cr = document.getElementById('monster-cr').value.trim();

    const stats = {
        str: parseInt(document.getElementById('monster-stat-str').value) || 10,
        dex: parseInt(document.getElementById('monster-stat-dex').value) || 10,
        con: parseInt(document.getElementById('monster-stat-con').value) || 10,
        int: parseInt(document.getElementById('monster-stat-int').value) || 10,
        wis: parseInt(document.getElementById('monster-stat-wis').value) || 10,
        cha: parseInt(document.getElementById('monster-stat-cha').value) || 10
    };

    const actions = [];
    for (let i = 0; i < actionsCount; i++) {
        const nameEl = document.getElementById(`monster-action-name-${i}`);
        const descEl = document.getElementById(`monster-action-desc-${i}`);
        if (nameEl && descEl) {
            actions.push({
                name: nameEl.value.trim(),
                desc: descEl.value.trim()
            });
        }
    }

    const payload = {
        name: monsterName,
        size: "Medium",
        type: "creature",
        alignment: "unaligned",
        ac: ac,
        hp: hp,
        speed: speed,
        stats: stats,
        cr: cr,
        actions: actions
    };

    try {
        const response = await fetch('/api/drafts/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'monsters',
                fileName: fileName,
                data: payload
            })
        });

        const result = await response.json();
        if (result.success) {
            flashReviewToast(result.message || "Monster approved!");
            document.getElementById('draft-editing-pane').innerHTML = '<div style="text-align: center; color: var(--text-muted); margin-top: 50px; font-style: italic;">Approved successfully! Select another file.</div>';
            loadReviewDrafts();
        } else {
            alert("Approval failed: " + result.error);
        }
    } catch(e) {
        console.error(e);
        alert("Failed to submit approval.");
    }
};

// ACTION: Approve Magic Item Draft JSON
window.approveMagicItemDraft = async function(fileName) {
    const itemName = document.getElementById('item-name').value.trim();
    const typeRarity = document.getElementById('item-type-rarity').value.trim();
    const price = parseInt(document.getElementById('item-price').value) || 100;
    const desc = document.getElementById('item-desc').value.trim();

    const payload = {
        name: itemName,
        type_rarity: typeRarity,
        price_gp: price,
        description: desc
    };

    try {
        const response = await fetch('/api/drafts/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'magic_items',
                fileName: fileName,
                data: payload
            })
        });

        const result = await response.json();
        if (result.success) {
            flashReviewToast(result.message || "Magic Item approved!");
            document.getElementById('draft-editing-pane').innerHTML = '<div style="text-align: center; color: var(--text-muted); margin-top: 50px; font-style: italic;">Approved successfully! Select another file.</div>';
            loadReviewDrafts();
        } else {
            alert("Approval failed: " + result.error);
        }
    } catch(e) {
        console.error(e);
        alert("Failed to submit approval.");
    }
};

// ACTION: Discard/Reject draft file
window.discardReviewDraft = async function(type, fileName) {
    if (!confirm(`Are you sure you want to permanently discard the draft "${fileName}"?`)) return;

    try {
        const response = await fetch(`/api/drafts/${type}/${fileName}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            flashReviewToast("Draft discarded.");
            document.getElementById('draft-editing-pane').innerHTML = '<div style="text-align: center; color: var(--text-muted); margin-top: 50px; font-style: italic;">Draft deleted! Select another file.</div>';
            loadReviewDrafts();
        } else {
            alert("Failed to discard draft: " + result.error);
        }
    } catch (e) {
        console.error(e);
        alert("Failed to delete draft.");
    }
};

// Load Offline Player Proposals queue
window.loadOfflineProposals = async function() {
    const container = document.getElementById('sync-proposals-queue');
    container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 20px;">Scanning character database...</div>';

    // Also load the pending custom characters proposed from the join page!
    loadPendingCreatedCharacters();

    try {
        const res = await fetch('/api/party');
        const party = await res.json();

        container.innerHTML = '';
        let totalProposalsCount = 0;

        party.forEach(char => {
            const props = char.proposals || {};
            const keys = Object.keys(props);

            if (keys.length > 0) {
                totalProposalsCount += keys.length;

                const card = document.createElement('div');
                card.style.background = '#0d0d12';
                card.style.border = '1px solid var(--border-iron)';
                card.style.borderRadius = '6px';
                card.style.padding = '12px';
                card.style.marginBottom = '10px';

                let fieldsHtml = '';
                keys.forEach(field => {
                    const proposedVal = props[field];
                    fieldsHtml += `
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #222; padding: 6px 0; font-size: 0.8rem;">
                            <div>
                                <span style="text-transform: capitalize; font-weight: bold; color: var(--arcane-violet);">${field.replace('_', ' ')}:</span> 
                                Current: <span style="color: var(--text-muted);">${char[field] || 'None'}</span> &rarr; Proposed: <span style="color: var(--success-green); font-weight: bold;">${JSON.stringify(proposedVal)}</span>
                            </div>
                            <div style="display: flex; gap: 6px;">
                                <button class="btn-primary" style="padding: 2px 8px; font-size: 0.7rem; background: var(--success-green); color: white;" onclick="resolveProposal('${char.id}', '${field}', true)">Approve</button>
                                <button class="btn-danger" style="padding: 2px 8px; font-size: 0.7rem;" onclick="resolveProposal('${char.id}', '${field}', false)">Reject</button>
                            </div>
                        </div>
                    `;
                });

                card.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                        <div style="width: 32px; height: 32px; border-radius: 50%; background-image: url('${char.art || ''}'); background-size: cover; background-position: center; border: 1px solid var(--border-iron);"></div>
                        <div>
                            <strong style="font-family: 'Cinzel', serif; color: var(--text-main); font-size: 0.95rem;">${char.name}</strong>
                            <div style="font-size: 0.7rem; color: var(--text-muted);">Level ${char.level} ${char.class}</div>
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        ${fieldsHtml}
                    </div>
                `;

                container.appendChild(card);
            }
        });

        if (totalProposalsCount === 0) {
            container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 30px 0; font-style: italic;">All quiet. No pending player offline level-ups or feature proposals.</div>';
        }

    } catch (e) {
        console.error("Failed to load proposals queue:", e);
        container.innerHTML = '<div style="color: var(--crimson-rage); font-size: 0.85rem; text-align: center;">Error scanning database.</div>';
    }
};

// Load Pending Created Characters from the Join page
window.loadPendingCreatedCharacters = async function() {
    const queueDiv = document.getElementById('pending-characters-queue');
    if (!queueDiv) return;

    queueDiv.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 15px;">Scanning pending creations...</div>';

    try {
        const response = await fetch('/api/pending-characters');
        const pending = await response.json();

        queueDiv.innerHTML = '';

        if (!pending || pending.length === 0) {
            queueDiv.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 25px 0; font-style: italic;">No pending new characters. All quiet on the forge.</div>';
            return;
        }

        pending.forEach(char => {
            const card = document.createElement('div');
            card.style.background = '#0d0d12';
            card.style.border = '1px solid var(--border-iron)';
            card.style.borderRadius = '6px';
            card.style.padding = '12px';
            card.style.display = 'flex';
            card.style.flexDirection = 'column';
            card.style.gap = '10px';

            card.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 40px; height: 40px; border-radius: 50%; background-image: url('${char.art || ''}'); background-size: cover; background-position: center; border: 1px solid var(--border-iron);"></div>
                    <div style="flex-grow: 1;">
                        <strong style="font-family: 'Cinzel', serif; color: var(--gold-amber); font-size: 1rem;">${char.name}</strong>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">Level ${char.level} ${char.race} ${char.class}</div>
                    </div>
                </div>
                <div style="font-size: 0.8rem; background: rgba(0,0,0,0.3); padding: 8px; border-radius: 4px; display: flex; justify-content: space-around; border: 1px solid #1a1a24;">
                    <div><strong>HP:</strong> ${char.hp}</div>
                    <div><strong>AC:</strong> ${char.ac}</div>
                    <div><strong>Stats:</strong> STR:10 DEX:10 CON:10 INT:10 WIS:10 CHA:10</div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn-primary" style="background: var(--success-green); color: white; padding: 6px 12px; font-size: 0.75rem; border: none; border-radius: 4px; cursor: pointer; flex: 1; font-family: 'Cinzel', serif;" onclick="resolveCreatedCharacter('${char.id}', true)">Approve & Add</button>
                    <button class="btn-danger" style="background: var(--crimson-rage); color: white; padding: 6px 12px; font-size: 0.75rem; border: none; border-radius: 4px; cursor: pointer; flex: 1; font-family: 'Cinzel', serif;" onclick="resolveCreatedCharacter('${char.id}', false)">Nuke It</button>
                </div>
            `;
            queueDiv.appendChild(card);
        });
    } catch (e) {
        console.error("Failed to load pending characters:", e);
        queueDiv.innerHTML = '<div style="color: var(--crimson-rage); font-size: 0.85rem; text-align: center;">Failed to scan character forge.</div>';
    }
};

// Approve or Reject / Nuke a proposed new character
window.resolveCreatedCharacter = async function(charId, approve) {
    if (!approve) {
        if (!confirm("Are you absolutely sure you want to nuke this proposed character? It will be permanently deleted from the forge.")) {
            return;
        }
    }

    try {
        const response = await fetch('/api/pending-characters/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: charId, approve })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            flashReviewToast(result.message);
            // Refresh both queues and active character board
            loadOfflineProposals();
            if (window.loadPartyMatrix) window.loadPartyMatrix();
        } else {
            alert(result.error || "Failed to resolve character creation proposal.");
        }
    } catch (e) {
        console.error("Error resolving proposed character:", e);
        alert("An error occurred trying to contact the campaign server.");
    }
};

// Approve or Reject a proposed player offline update
window.resolveProposal = async function(charId, field, approve) {
    try {
        const res = await fetch('/api/party');
        const party = await res.json();
        const charIdx = party.findIndex(c => c.id === charId);

        if (charIdx === -1) return;

        const character = party[charIdx];
        if (!character.proposals || character.proposals[field] === undefined) return;

        if (approve) {
            // Apply the proposed change!
            character[field] = character.proposals[field];
        }

        // Clean up proposal
        delete character.proposals[field];
        if (Object.keys(character.proposals).length === 0) {
            delete character.proposals;
        }

        // Save updated party back to server
        const saveRes = await fetch('/api/party/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(party)
        });

        if (saveRes.ok) {
            flashReviewToast(approve ? "Proposal approved and applied!" : "Proposal rejected.");
            loadOfflineProposals();
        } else {
            alert("Failed to save resolution.");
        }

    } catch (e) {
        console.error("Failed to resolve proposal:", e);
        alert("An error occurred resolving proposal.");
    }
};

// Help helper for quick review toast popups
function flashReviewToast(msg) {
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '30px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.backgroundColor = '#1e1b2e';
    toast.style.border = '1px solid var(--arcane-violet)';
    toast.style.color = 'white';
    toast.style.padding = '10px 20px';
    toast.style.borderRadius = '5px';
    toast.style.fontSize = '0.85rem';
    toast.style.zIndex = '999999';
    toast.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
    toast.innerText = msg;

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// SOCKET.IO REAL-TIME NOTIFICATIONS DRAWER ON THE DM CONSOLE
// Instantly flashes when a player walks in, connects, and merges offline edits!
document.addEventListener('DOMContentLoaded', () => {
    // Wait until socket is loaded on global scope
    const checkSocket = setInterval(() => {
        if (window.socket) {
            clearInterval(checkSocket);
            console.log("[Review Module] Connected socket listener for Offline Sync Events!");

            window.socket.on('player-synced', (data) => {
                console.log("[Socket Event] player-synced received:", data);

                // Flash a dramatic notification toast on the screen!
                const notification = document.createElement('div');
                notification.style.position = 'fixed';
                notification.style.top = '80px';
                notification.style.right = '20px';
                notification.style.backgroundColor = '#1e1b2e';
                notification.style.borderLeft = '4px solid var(--gold-amber)';
                notification.style.border = '1px solid var(--arcane-violet)';
                notification.style.borderRadius = '4px';
                notification.style.padding = '15px';
                notification.style.color = 'white';
                notification.style.width = '350px';
                notification.style.zIndex = '999999';
                notification.style.boxShadow = '0 10px 30px rgba(0,0,0,0.6)';

                notification.innerHTML = `
                    <div style="font-family: 'Cinzel', serif; color: var(--gold-amber); font-weight: bold; border-bottom: 1px solid var(--border-iron); padding-bottom: 4px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                        <span> Player Synced Offline</span>
                        <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 1.1rem;">&times;</button>
                    </div>
                    <div style="font-size: 0.8rem; line-height: 1.4;">
                        <strong style="color: var(--text-main); font-size:0.85rem;">${data.name}</strong> just connected to table Wi-Fi!
                        <ul style="padding-left: 15px; margin: 6px 0; color: var(--text-muted); font-size: 0.75rem;">
                            <li>Applied ${data.appliedCount} safe edits</li>
                            <li>${data.conflicts.length} strict conflicts flagged</li>
                            <li>${data.proposals.length} proposed updates staged</li>
                        </ul>
                        <button onclick="this.parentElement.parentElement.remove(); window.openReviewModal();" style="width: 100%; margin-top: 8px; background: var(--arcane-violet); border: none; color: white; padding: 6px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 0.75rem;">Open Review Dashboard</button>
                    </div>
                `;

                document.body.appendChild(notification);
                
                // Play notification sound if available
                if (window.triggerSound) {
                    // Quick low key sound alert
                    console.log("Flashed sync notification toast.");
                }
            });
        }
    }, 1000);
});

// Bulk Approve All Drafts (PDF Imports Review Stage)
window.approveAllDrafts = async function() {
    if (!confirm("Are you sure you want to approve and move ALL staged draft files to your Homebrew library?")) return;

    try {
        const response = await fetch('/api/drafts/approve-all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        if (result.success) {
            flashReviewToast(result.message || "All drafts successfully approved!");
            document.getElementById('draft-editing-pane').innerHTML = '<div style="text-align: center; color: var(--text-muted); margin-top: 50px; font-style: italic;">All drafts approved! Select another file.</div>';
            loadReviewDrafts();
        } else {
            alert("Approve All failed: " + result.error);
        }
    } catch (e) {
        console.error(e);
        alert("Failed to submit bulk approval.");
    }
};

// Bulk Approve All Sync Proposals (Player Offline Updates)
window.approveAllProposals = async function() {
    if (!confirm("Are you sure you want to approve and commit ALL pending player sync proposals across the entire party?")) return;

    try {
        const response = await fetch('/api/proposals/approve-all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        if (result.success) {
            flashReviewToast(result.message || "All player sync proposals approved!");
            loadOfflineProposals();
        } else {
            alert("Approve All failed: " + result.error);
        }
    } catch (e) {
        console.error(e);
        alert("Failed to submit bulk proposals approval.");
    }
};
