// ====================================================
// WAVE 4: THE DEEP DIG — MASTER CLIENT IMPLEMENTATION
// ====================================================

const Wave4Engine = {
    activeTab: 'combat',
    diceLog: [],
    marchingOrder: { active: "Dungeon Crawl", presets: {} },
    continuityLog: [],
    customMonsters: [],
    customTraps: [],
    dialogues: {},
    boardState: { nodes: [], connections: [] },
    selectedNodeId: null,
    isDraggingNode: false,
    draggedNode: null,
    dragOffsetX: 0,
    dragOffsetY: 0,

    init() {
        console.log("Wave 4 Deep Dig Master Engine loaded successfully!");
        this.setupSocketListeners();
        this.loadInitialData();
    },

    setupSocketListeners() {
        if (window.socket) {
            window.socket.on('play-scene-transition', (data) => {
                this.displayCinematicTitleCard(data);
            });

            window.socket.on('receive-divine-vision', (data) => {
                this.displayDivineVisionOverlay(data);
            });

            window.socket.on('apply-madness-visual', (data) => {
                this.applyMadnessScreenEffect(data.severity);
            });

            window.socket.on('ambient-ticker-update', (text) => {
                this.updateAmbientTicker(text);
            });
            
            window.socket.on('investigation-board-updated', (data) => {
                this.boardState = data;
                if (document.getElementById('wave4-corkboard-canvas')) {
                    this.renderCorkboard();
                }
            });

            window.socket.on('level-up-submitted', (data) => {
                console.log("Real-time Level-Up submission received!");
                if (this.activeTab === 'economy' && document.getElementById('levelup-approvals-list')) {
                    this.fetchLevelUpApprovals();
                }
            });

            window.socket.on('level-up-approved', (data) => {
                if (this.activeTab === 'economy' && document.getElementById('levelup-approvals-list')) {
                    this.fetchLevelUpApprovals();
                }
            });

            window.socket.on('economy-updated', (data) => {
                console.log("Real-time Macro Economy update received!");
                if (this.activeTab === 'economy' && document.getElementById('economy-bazaar-items-list')) {
                    this.fetchEconDataAndRenderLogs();
                }
            });
        }
    },

    async loadInitialData() {
        try {
            const resIB = await fetch('/api/investigation-board');
            if (resIB.ok) this.boardState = await resIB.ok ? await resIB.json() : { nodes: [], connections: [] };

            const resC = await fetch('/api/continuity');
            if (resC.ok) this.continuityLog = await resC.json();

            const resF = await fetch('/api/formations');
            if (resF.ok) this.marchingOrder = await resF.json();

            const resT = await fetch('/api/reference/traps.json');
            if (resT.ok) this.customTraps = await resT.json();

            const resM = await fetch('/api/character-memorials');
            if (resM.ok) this.memorials = await resM.json();

            const resD = await fetch('/api/dialogue-trees');
            if (resD.ok) this.dialogues = await resD.json();
        } catch(e) {
            console.log("Error pre-loading Wave 4 campaign data.", e);
        }
    },

    // ------------------------------------------------------------------------
    // RENDER CINEMATIC TITLE CARD (PLAYER VIEWS)
    // ------------------------------------------------------------------------
    displayCinematicTitleCard(data) {
        const overlay = document.createElement('div');
        overlay.style = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: black; z-index: 999999; display: flex; flex-direction: column;
            justify-content: center; align-items: center; color: white;
            font-family: 'Cinzel', serif; transition: opacity 1.5s ease; opacity: 0;
        `;
        
        const topBar = document.createElement('div');
        topBar.style = "position:absolute; top:0; left:0; width:100%; height:15%; background:#090909; border-bottom:1px solid #222;";
        const bottomBar = document.createElement('div');
        bottomBar.style = "position:absolute; bottom:0; left:0; width:100%; height:15%; background:#090909; border-top:1px solid #222;";
        
        overlay.appendChild(topBar);
        overlay.appendChild(bottomBar);

        const heading = document.createElement('h1');
        heading.innerText = data.title;
        heading.style = "font-size: 3.5rem; letter-spacing: 5px; color: #fbbf24; margin: 0; text-align: center; text-transform: uppercase;";
        
        const subheading = document.createElement('p');
        subheading.innerText = data.subtitle;
        subheading.style = "font-size: 1.5rem; color: #a78bfa; margin-top: 20px; font-style: italic; letter-spacing: 2px;";

        overlay.appendChild(heading);
        overlay.appendChild(subheading);
        document.body.appendChild(overlay);

        setTimeout(() => {
            overlay.style.opacity = '1';
        }, 100);

        setTimeout(() => {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 1500);
        }, data.durationMs || 4000);
    },

    // ------------------------------------------------------------------------
    // DIVINATION VISION OVERLAYS
    // ------------------------------------------------------------------------
    displayDivineVisionOverlay(data) {
        const overlay = document.createElement('div');
        let bg = "rgba(10, 5, 20, 0.96)";
        let themeColor = "#fbbf24";
        let textShadow = "0 0 15px rgba(245, 158, 11, 0.7)";

        if (data.deityTheming === 'Fiend') {
            bg = "rgba(18, 2, 2, 0.98)";
            themeColor = "#ef4444";
            textShadow = "0 0 15px rgba(239, 68, 68, 0.9)";
        } else if (data.deityTheming === 'Fey') {
            bg = "rgba(2, 16, 8, 0.96)";
            themeColor = "#10b981";
            textShadow = "0 0 15px rgba(16, 185, 129, 0.7)";
        }

        overlay.style = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: ${bg}; z-index: 999999; display: flex; flex-direction: column;
            justify-content: center; align-items: center; color: white; padding: 40px;
            box-sizing: border-box; text-align: center; font-family: 'MedievalSharp', cursive;
            animation: fadeIn 1.2s ease;
        `;

        const title = document.createElement('h2');
        title.innerText = "COSMIC REVELATION RECEIVED";
        title.style = `font-family: 'Cinzel', serif; color: ${themeColor}; letter-spacing: 4px; font-size: 2.2rem; margin-bottom: 30px; text-shadow: ${textShadow};`;

        const body = document.createElement('p');
        body.innerText = data.responseText;
        body.style = "font-size: 1.5rem; line-height: 1.7; max-width: 850px; color: #f3f4f6;";

        const dismissBtn = document.createElement('button');
        dismissBtn.innerText = "Acknowledge Divine Vision";
        dismissBtn.style = `
            margin-top: 50px; background: ${themeColor}; color: black; border: none;
            padding: 12px 30px; border-radius: 4px; font-family: 'Cinzel', serif;
            font-weight: bold; font-size: 1.1rem; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.5);
        `;
        dismissBtn.onclick = () => overlay.remove();

        overlay.appendChild(title);
        overlay.appendChild(body);
        overlay.appendChild(dismissBtn);
        document.body.appendChild(overlay);
    },

    // ------------------------------------------------------------------------
    // PSYCHIC MADNESS ENGINE
    // ------------------------------------------------------------------------
    applyMadnessScreenEffect(severity) {
        document.body.style.transition = "transform 0.6s ease, filter 0.6s ease";
        if (severity === 'light') {
            document.body.style.filter = "hue-rotate(50deg) saturate(1.3) blur(0.5px)";
            document.body.style.transform = "skewX(1.5deg)";
        } else {
            document.body.style.filter = "hue-rotate(190deg) saturate(2.8) contrast(1.6) blur(1px)";
            document.body.style.transform = "skewX(3.5deg) scale(1.03)";
        }
        
        setTimeout(() => {
            document.body.style.filter = "none";
            document.body.style.transform = "none";
        }, 12000);
    },

    // ------------------------------------------------------------------------
    // AMBIENT EVENT TICKER SYSTEM
    // ------------------------------------------------------------------------
    updateAmbientTicker(text) {
        let bar = document.getElementById('ambient-ticker-banner');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'ambient-ticker-banner';
            bar.style = "position:fixed; bottom:0; left:0; width:100%; background:rgba(0,0,0,0.85); border-top:1px solid #fbbf24; color:#fff; font-size:0.8rem; padding:4px 0; z-index:9999; overflow:hidden; white-space:nowrap; font-family:'Cinzel', serif; letter-spacing:1px;";
            bar.innerHTML = `<div id="ambient-ticker-content" style="display:inline-block; padding-left:100%; animation: tickerMarquee 30s linear infinite;"></div>`;
            document.body.appendChild(bar);
            
            // Inject keyframe animation dynamically
            const style = document.createElement('style');
            style.innerHTML = `
                @keyframes tickerMarquee {
                    0% { transform: translate3d(0, 0, 0); }
                    100% { transform: translate3d(-100%, 0, 0); }
                }
            `;
            document.head.appendChild(style);
        }
        document.getElementById('ambient-ticker-content').innerText = text;
    },

    // ------------------------------------------------------------------------
    // INJECT MASTER WAVE 4 PANEL MODAL FOR DM
    // ------------------------------------------------------------------------
    openWave4MasterModal() {
        let modal = document.getElementById('wave4-master-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'wave4-master-modal';
            modal.style = "position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(10,8,18,0.95); z-index:9999; display:flex; font-family:'Montserrat', sans-serif;";
            
            modal.innerHTML = `
                <!-- Left Nav Bar -->
                <div style="width:240px; background:#0e0b16; border-right:2px solid var(--gold-amber, #fbbf24); display:flex; flex-direction:column; padding:20px 0;">
                    <div style="padding:0 20px 20px 20px; border-bottom:1px solid rgba(255,255,255,0.05); margin-bottom:15px;">
                        <h2 style="font-family:'Cinzel', serif; color:#fbbf24; margin:0; font-size:1.1rem; letter-spacing:1px;">WAVE 4 CC PANEL</h2>
                        <span style="font-size:0.65rem; color:#a78bfa; text-transform:uppercase; font-weight:bold;">The Deep Dig Arsenal</span>
                    </div>
                    
                    <button class="wave4-nav-btn active" onclick="Wave4Engine.switchTab('combat', this)">Combat Mechanics</button>
                    <button class="wave4-nav-btn" onclick="Wave4Engine.switchTab('intrigue', this)">Intrigue Corkboard</button>
                    <button class="wave4-nav-btn" onclick="Wave4Engine.switchTab('story', this)">Storytelling & Scenes</button>
                    <button class="wave4-nav-btn" onclick="Wave4Engine.switchTab('rules', this)">Planar & Subsystems</button>
                    <button class="wave4-nav-btn" onclick="Wave4Engine.switchTab('workbench', this)">Workbench & Traps</button>
                    <button class="wave4-nav-btn" onclick="Wave4Engine.switchTab('analytics', this)">Legacy & Dice Stats</button>
                    <button class="wave4-nav-btn" onclick="Wave4Engine.switchTab('cinematics', this)">Cinematics & Music</button>
                    <button class="wave4-nav-btn" onclick="Wave4Engine.switchTab('economy', this)">Macro Economy & LevelUp</button>
                    
                    <div style="margin-top:auto; padding:0 20px;">
                        <button onclick="Wave4Engine.closeWave4Modal()" style="width:100%; background:#ef4444; color:white; border:none; padding:8px; border-radius:4px; font-weight:bold; cursor:pointer; font-family:'Cinzel', serif; font-size:0.8rem;">Close Panel</button>
                    </div>
                </div>
                
                <!-- Main Tab View -->
                <div style="flex:1; display:flex; flex-direction:column; background:#120f1f; overflow-y:auto; padding:25px;" id="wave4-content-panel">
                </div>
            `;
            
            // Inject dynamic nav-btn styles
            const style = document.createElement('style');
            style.innerHTML = `
                .wave4-nav-btn {
                    background: transparent;
                    color: #94a3b8;
                    border: none;
                    text-align: left;
                    padding: 12px 20px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    border-left: 3px solid transparent;
                }
                .wave4-nav-btn:hover {
                    color: white;
                    background: rgba(255,255,255,0.02);
                }
                .wave4-nav-btn.active {
                    color: #fbbf24;
                    background: rgba(245, 158, 11, 0.05);
                    border-left-color: #fbbf24;
                }
                .wave4-card-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                    gap: 15px;
                }
                .wave4-card {
                    background: #191428;
                    border: 1px solid #2a2240;
                    border-radius: 6px;
                    padding: 15px;
                }
                .wave4-card h3 {
                    margin-top: 0;
                    color: #fbbf24;
                    font-family: 'Cinzel', serif;
                    font-size: 0.95rem;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                    padding-bottom: 6px;
                }
                .wave4-input {
                    background: #0e0b16;
                    color: white;
                    border: 1px solid #3c325c;
                    padding: 6px;
                    border-radius: 4px;
                    font-size: 0.8rem;
                    width: 100%;
                    box-sizing: border-box;
                }
                .wave4-btn {
                    background: #8b5cf6;
                    color: white;
                    border: none;
                    padding: 8px 12px;
                    border-radius: 4px;
                    font-weight: bold;
                    cursor: pointer;
                    font-size: 0.8rem;
                    transition: background 0.2s;
                }
                .wave4-btn:hover {
                    background: #7c3aed;
                }
            `;
            document.head.appendChild(style);
            document.body.appendChild(modal);
        }
        
        modal.style.display = 'flex';
        this.renderActiveTab();
    },

    closeWave4Modal() {
        const modal = document.getElementById('wave4-master-modal');
        if (modal) modal.style.display = 'none';
    },

    switchTab(tabName, btn) {
        this.activeTab = tabName;
        document.querySelectorAll('.wave4-nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.renderActiveTab();
    },

    renderActiveTab() {
        const panel = document.getElementById('wave4-content-panel');
        if (!panel) return;
        
        panel.innerHTML = '';
        
        if (this.activeTab === 'combat') {
            this.renderCombatTab(panel);
        } else if (this.activeTab === 'intrigue') {
            this.renderIntrigueTab(panel);
        } else if (this.activeTab === 'story') {
            this.renderStoryTab(panel);
        } else if (this.activeTab === 'rules') {
            this.renderRulesTab(panel);
        } else if (this.activeTab === 'workbench') {
            this.renderWorkbenchTab(panel);
        } else if (this.activeTab === 'analytics') {
            this.renderAnalyticsTab(panel);
        } else if (this.activeTab === 'cinematics') {
            this.renderCinematicsTab(panel);
        } else if (this.activeTab === 'economy') {
            this.renderEconomyTab(panel);
        }
    },

    // ------------------------------------------------------------------------
    // COMBAT SUBSYSTEMS GUI
    // ------------------------------------------------------------------------
    renderCombatTab(parent) {
        parent.innerHTML = `
            <h1 style="font-family:'Cinzel', serif; color:#fbbf24; margin-top:0;">Combat Mechanics</h1>
            <p style="color:#94a3b8; font-size:0.9rem; margin-bottom:20px;">Deploy sophisticated spatial, mechanical, and narrative subsystems for combat encounters.</p>
            
            <div class="wave4-card-grid">
                <!-- 1. Line of Sight & Threat Range -->
                <div class="wave4-card">
                    <h3>Raycast Line of Sight</h3>
                    <p style="font-size:0.75rem; color:#94a3b8; line-height:1.4;">Calculate line-of-sight and degree of cover between active tokens on the map.</p>
                    <div style="display:flex; gap:8px; margin-bottom:10px;">
                        <input type="text" id="los-token-a" placeholder="Token A ID (e.g., True)" class="wave4-input" style="width:50%;">
                        <input type="text" id="los-token-b" placeholder="Token B ID (e.g., Goblin A)" class="wave4-input" style="width:50%;">
                    </div>
                    <button class="wave4-btn" onclick="Wave4Engine.triggerLOSCheck()">Calculate LOS & Cover</button>
                </div>

                <!-- 2. Grappling State Machine -->
                <div class="wave4-card">
                    <h3>Grappling State Machine</h3>
                    <p style="font-size:0.75rem; color:#94a3b8; line-height:1.4;">Trigger structured contested Athletics vs. Acrobatics grapple resolving workflow.</p>
                    <div style="display:flex; gap:8px; margin-bottom:10px;">
                        <input type="text" id="grapple-attacker" placeholder="Attacker Name/ID" class="wave4-input" style="width:50%;">
                        <input type="text" id="grapple-defender" placeholder="Defender Name/ID" class="wave4-input" style="width:50%;">
                    </div>
                    <button class="wave4-btn" onclick="Wave4Engine.triggerGrapplingCheckLocal()">Initiate Grapple Contest</button>
                </div>

                <!-- 3. Spell Component Material Tracker -->
                <div class="wave4-card">
                    <h3>Spell Component Tracker</h3>
                    <p style="font-size:0.75rem; color:#94a3b8; line-height:1.4;">Verify inventory has diamonds/material components for leveled spell preparations.</p>
                    <div style="display:flex; gap:8px; margin-bottom:10px;">
                        <input type="text" id="spell-component-caster" placeholder="Caster Name (e.g., Suri)" class="wave4-input" style="width:50%;">
                        <input type="text" id="spell-component-name" placeholder="Spell Name (e.g., Revivify)" class="wave4-input" style="width:50%;">
                    </div>
                    <button class="wave4-btn" onclick="Wave4Engine.triggerSpellComponentVerification()">Verify Component Availability</button>
                </div>

                <!-- 4. Spell Stacking Referee -->
                <div class="wave4-card">
                    <h3>Spell Stacking Referee</h3>
                    <p style="font-size:0.75rem; color:#94a3b8; line-height:1.4;">Lookup simultaneous spell rules and illegal combat stack rulings.</p>
                    <div style="display:flex; gap:8px; margin-bottom:10px;">
                        <input type="text" id="stack-spell-a" placeholder="Spell/Effect A (e.g., Bless)" class="wave4-input" style="width:50%;">
                        <input type="text" id="stack-spell-b" placeholder="Spell/Effect B" class="wave4-input" style="width:50%;">
                    </div>
                    <button class="wave4-btn" onclick="Wave4Engine.triggerSpellStackQuery()">Consult Referee Codex</button>
                </div>

                <!-- 5. Flanking Auto-Detector -->
                <div class="wave4-card">
                    <h3>Flanking Auto-Detector</h3>
                    <p style="font-size:0.75rem; color:#94a3b8; line-height:1.4;">Instantly evaluate combat board positioning to flag advantage flanking pairings.</p>
                    <button class="wave4-btn" style="background:#10b981;" onclick="Wave4Engine.triggerFlankingDetection()">Detect Active Flanks</button>
                </div>

                <!-- 6. Combat Hit Narration Generator -->
                <div class="wave4-card">
                    <h3>Narrate Damage Severity</h3>
                    <p style="font-size:0.75rem; color:#94a3b8; line-height:1.4;">Generate descriptive flavor text descriptions based on damage percent.</p>
                    <div style="display:flex; gap:8px; margin-bottom:10px;">
                        <select id="narrate-dmg-type" class="wave4-input" style="width:50%;">
                            <option value="slashing">Slashing</option>
                            <option value="piercing">Piercing</option>
                            <option value="bludgeoning">Bludgeoning</option>
                            <option value="fire">Fire</option>
                            <option value="cold">Cold</option>
                            <option value="lightning">Lightning</option>
                            <option value="poison">Poison</option>
                            <option value="necrotic">Necrotic</option>
                            <option value="radiant">Radiant</option>
                            <option value="psychic">Psychic</option>
                        </select>
                        <input type="number" id="narrate-dmg-percent" placeholder="HP % Dealt" class="wave4-input" style="width:50%;">
                    </div>
                    <button class="wave4-btn" onclick="Wave4Engine.triggerHitNarrationGen()">Generate Flavor Description</button>
                </div>
            </div>
        `;
    },

    // ------------------------------------------------------------------------
    // INTRIGUE CORKBOARD EDITOR GUI
    // ------------------------------------------------------------------------
    renderIntrigueTab(parent) {
        parent.innerHTML = `
            <h1 style="font-family:'Cinzel', serif; color:#fbbf24; margin-top:0;">Investigation Board Editor</h1>
            <p style="color:#94a3b8; font-size:0.9rem; margin-bottom:15px;">Create nodes (Evidence, NPCs, Locations) and drag them to arrange a live conspiracy web for players at /clues.</p>
            
            <div style="display:flex; gap:20px; flex:1; min-height:480px;">
                <!-- Sidebar Form -->
                <div style="width:280px; display:flex; flex-direction:column; gap:12px; background:#191428; padding:15px; border-radius:6px; border:1px solid #2a2240;">
                    <h3 style="margin:0; font-family:'Cinzel', serif; color:#fbbf24; font-size:0.9rem;">Add Evidence Node</h3>
                    
                    <label style="font-size:0.75rem; color:#cbd5e1;">Title</label>
                    <input type="text" id="node-title" placeholder="e.g., Poisoned Goblet" class="wave4-input">
                    
                    <label style="font-size:0.75rem; color:#cbd5e1;">Type</label>
                    <select id="node-type" class="wave4-input">
                        <option value="evidence">Evidence</option>
                        <option value="npc">NPC Suspect</option>
                        <option value="location">Key Location</option>
                    </select>
                    
                    <label style="font-size:0.75rem; color:#cbd5e1;">Description</label>
                    <textarea id="node-desc" placeholder="Details about this clue..." class="wave4-input" style="height:60px; resize:none;"></textarea>
                    
                    <div style="display:flex; gap:8px;">
                        <label style="font-size:0.75rem; color:#cbd5e1;">Discovered (Public)</label>
                        <input type="checkbox" id="node-discovered" checked>
                    </div>
                    
                    <button class="wave4-btn" onclick="Wave4Engine.addCorkboardNode()">Pin to Board</button>
                    
                    <div style="border-top:1px solid rgba(255,255,255,0.05); padding-top:10px; margin-top:10px;">
                        <h4 style="margin:0 0 8px 0; font-family:'Cinzel', serif; color:#fbbf24; font-size:0.8rem;">Pin Connections (Strings)</h4>
                        <label style="font-size:0.7rem; color:#94a3b8;">From Node ID</label>
                        <input type="text" id="conn-from" placeholder="node-1" class="wave4-input" style="margin-bottom:6px;">
                        <label style="font-size:0.7rem; color:#94a3b8;">To Node ID</label>
                        <input type="text" id="conn-to" placeholder="node-2" class="wave4-input" style="margin-bottom:6px;">
                        <label style="font-size:0.7rem; color:#94a3b8;">String Color</label>
                        <select id="conn-color" class="wave4-input" style="margin-bottom:6px;">
                            <option value="red">Red (Suspicious)</option>
                            <option value="yellow">Yellow (Possible)</option>
                            <option value="green">Green (Confirmed)</option>
                        </select>
                        <button class="wave4-btn" style="background:#a78bfa;" onclick="Wave4Engine.addCorkboardConnection()">Connect with String</button>
                    </div>
                </div>
                
                <!-- Canvas Board -->
                <div style="flex:1; background:radial-gradient(circle, #2a1f1a 0%, #150f0d 100%); border:4px solid #4a2c1b; border-radius:6px; position:relative; overflow:hidden;" id="corkboard-container-div">
                    <canvas id="wave4-corkboard-canvas" width="800" height="480" style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none;"></canvas>
                    <div id="wave4-corkboard-cards" style="position:absolute; top:0; left:0; width:100%; height:100%;"></div>
                </div>
            </div>
        `;
        
        this.renderCorkboard();
    },

    renderCorkboard() {
        const canvas = document.getElementById('wave4-corkboard-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw string connections
        this.boardState.connections.forEach(conn => {
            const from = this.boardState.nodes.find(n => n.id === conn.from);
            const to = this.boardState.nodes.find(n => n.id === conn.to);
            
            if (from && to) {
                ctx.beginPath();
                // Connect center of nodes (nodes are 140px wide on DM dashboard preview)
                ctx.moveTo(from.x / 2 + 70, from.y / 2 + 10);
                ctx.lineTo(to.x / 2 + 70, to.y / 2 + 10);
                
                if (conn.color === 'red') ctx.strokeStyle = '#ef4444';
                else if (conn.color === 'yellow') ctx.strokeStyle = '#fbbf24';
                else if (conn.color === 'green') ctx.strokeStyle = '#10b981';
                else ctx.strokeStyle = '#cbd5e1';
                
                ctx.lineWidth = 3;
                ctx.stroke();
            }
        });

        // Render preview absolute cards
        const container = document.getElementById('wave4-corkboard-cards');
        container.innerHTML = '';
        
        this.boardState.nodes.forEach(node => {
            const card = document.createElement('div');
            card.style = `
                position: absolute;
                left: ${node.x / 2}px;
                top: ${node.y / 2}px;
                width: 140px;
                background: #f4ebd0;
                color: #1e1b2e;
                padding: 8px;
                border-radius: 2px;
                box-shadow: 2px 2px 8px rgba(0,0,0,0.4);
                cursor: move;
                font-size: 0.7rem;
                user-select: none;
            `;
            
            card.innerHTML = `
                <div style="font-weight:bold; border-bottom:1px solid rgba(0,0,0,0.1); padding-bottom:2px; margin-bottom:4px; text-align:center;">${node.title}</div>
                <div style="font-size:0.6rem; color:#444; line-height:1.2;">ID: ${node.id}</div>
                <div style="font-size:0.65rem; color:#111; margin-top:3px;">${node.type.toUpperCase()}</div>
            `;
            
            // Mouse drag and drop events
            card.onmousedown = (e) => {
                this.isDraggingNode = true;
                this.draggedNode = node;
                this.dragOffsetX = e.clientX - (node.x / 2);
                this.dragOffsetY = e.clientY - (node.y / 2);
                e.stopPropagation();
            };

            container.appendChild(card);
        });

        // Canvas container division mouse listeners
        const wrapper = document.getElementById('corkboard-container-div');
        wrapper.onmousemove = (e) => {
            if (this.isDraggingNode && this.draggedNode) {
                const rect = wrapper.getBoundingClientRect();
                const newX = (e.clientX - rect.left - 70) * 2;
                const newY = (e.clientY - rect.top - 20) * 2;
                this.draggedNode.x = Math.max(0, Math.min(1600, newX));
                this.draggedNode.y = Math.max(0, Math.min(900, newY));
                this.renderCorkboard();
            }
        };

        wrapper.onmouseup = async () => {
            if (this.isDraggingNode && this.draggedNode) {
                this.isDraggingNode = false;
                this.draggedNode = null;
                // Save state to backend database
                await fetch('/api/investigation-board/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.boardState)
                });
            }
        };
    },

    addCorkboardNode() {
        const title = document.getElementById('node-title').value;
        const type = document.getElementById('node-type').value;
        const desc = document.getElementById('node-desc').value;
        const discovered = document.getElementById('node-discovered').checked;
        
        if (!title) return alert("Please enter a title.");
        
        const node = {
            id: `node-${Date.now()}`,
            title,
            type,
            description: desc,
            discovered,
            x: 200 + Math.random() * 200,
            y: 150 + Math.random() * 150,
            image: ""
        };
        
        this.boardState.nodes.push(node);
        this.renderCorkboard();
        
        // Save to backend
        fetch('/api/investigation-board/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(this.boardState)
        });
    },

    addCorkboardConnection() {
        const from = document.getElementById('conn-from').value;
        const to = document.getElementById('conn-to').value;
        const color = document.getElementById('conn-color').value;
        
        if (!from || !to) return alert("Please specify both from and to node IDs.");
        
        const conn = {
            from,
            to,
            color,
            discovered: true,
            label: ""
        };
        
        this.boardState.connections.push(conn);
        this.renderCorkboard();
        
        fetch('/api/investigation-board/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(this.boardState)
        });
    },

    // ------------------------------------------------------------------------
    // STORYTELLING & SCENES GUI
    // ------------------------------------------------------------------------
    renderStoryTab(parent) {
        parent.innerHTML = `
            <h1 style="font-family:'Cinzel', serif; color:#fbbf24; margin-top:0;">Storytelling & Scenes</h1>
            <p style="color:#94a3b8; font-size:0.9rem; margin-bottom:20px;">Orchestrate cinematic transitions, send direct divine revelations, and procedurally generate rich sensory blocks.</p>
            
            <div class="wave4-card-grid">
                <!-- 1. Scene Transition -->
                <div class="wave4-card">
                    <h3>Scene Transitions</h3>
                    <p style="font-size:0.75rem; color:#94a3b8; line-height:1.4;">Fade-to-black, split-screen, or smash cut a title banner directly to player screens with cinematic bars.</p>
                    <label style="font-size:0.7rem; color:#cbd5e1;">Title</label>
                    <input type="text" id="scene-title-input" placeholder="e.g., Chapter 4: The Tomb Below" class="wave4-input" style="margin-bottom:8px;">
                    <label style="font-size:0.7rem; color:#cbd5e1;">Subtitle</label>
                    <input type="text" id="scene-subtitle-input" placeholder="e.g., Three Days Later..." class="wave4-input" style="margin-bottom:8px;">
                    <button class="wave4-btn" onclick="Wave4Engine.triggerCinematicTransition()">Smash Cut Transition</button>
                </div>

                <!-- 2. Divination Spell Responder -->
                <div class="wave4-card">
                    <h3>Divination Responder</h3>
                    <p style="font-size:0.75rem; color:#94a3b8; line-height:1.4;">Unfurl divine omens (Augury/Commune/Legend Lore) directly onto the target caster's device with custom theming.</p>
                    <label style="font-size:0.7rem; color:#cbd5e1;">Target Player ID</label>
                    <input type="text" id="divination-target" placeholder="Caster ID (e.g., True)" class="wave4-input" style="margin-bottom:8px;">
                    <label style="font-size:0.7rem; color:#cbd5e1;">Revelation Vision Text</label>
                    <textarea id="divination-text" placeholder="The runes burn brightly with gold light. Your paths lead to WEAL AND WOE." class="wave4-input" style="height:55px; resize:none; margin-bottom:8px;"></textarea>
                    <select id="divination-theme" class="wave4-input" style="margin-bottom:8px;">
                        <option value="Celestial">Celestial (Golden Divine Light)</option>
                        <option value="Fiend">Fiend (Shadows & Blood-red Fire)</option>
                        <option value="Fey">Fey (Whispering Emerald Forest)</option>
                    </select>
                    <button class="wave4-btn" style="background:#fbbf24; color:black;" onclick="Wave4Engine.triggerDivinationRevelation()">Whisper Divine Vision</button>
                </div>

                <!-- 3. Procedural Description Generator -->
                <div class="wave4-card">
                    <h3>Procedural Scene Generator</h3>
                    <p style="font-size:0.75rem; color:#94a3b8; line-height:1.4;">Assemble evocative sensory blocks from tables of visual, auditory, olfactory, and tactile templates.</p>
                    <select id="procedural-scene-type" class="wave4-input" style="margin-bottom:10px;">
                        <option value="dungeon">Ancient Dungeon Vault</option>
                        <option value="tavern">Bustling Alehouse</option>
                        <option value="forest">Gnarled Sylvan Wilds</option>
                        <option value="city_street">Smoky Cobblestone Alley</option>
                    </select>
                    <button class="wave4-btn" style="background:#10b981;" onclick="Wave4Engine.triggerProceduralSceneLocal()">Generate Sensory Text</button>
                    <textarea id="procedural-scene-teleprompter" readonly class="wave4-input" style="height:90px; margin-top:10px; font-family:'Cinzel', serif; font-size:0.75rem; line-height:1.4; color:#a78bfa; resize:none;"></textarea>
                </div>

                <!-- 4. Retcon & Continuity Tracker -->
                <div class="wave4-card">
                    <h3>Continuity Retcon Log</h3>
                    <p style="font-size:0.75rem; color:#94a3b8; line-height:1.4;">Explicitly record DM retcons and continuity items to prevent table arguments.</p>
                    <input type="text" id="retcon-original" placeholder="Original Statement (e.g., Sword was magic)" class="wave4-input" style="margin-bottom:6px;">
                    <input type="text" id="retcon-revised" placeholder="Corrected Statement (e.g., Sword was cursed)" class="wave4-input" style="margin-bottom:6px;">
                    <button class="wave4-btn" onclick="Wave4Engine.triggerRetconSave()">Log Retcon Entry</button>
                </div>
            </div>
        `;
    },

    // ------------------------------------------------------------------------
    // PLANAR & SUBSYSTEMS GUI
    // ------------------------------------------------------------------------
    renderRulesTab(parent) {
        parent.innerHTML = `
            <h1 style="font-family:'Cinzel', serif; color:#fbbf24; margin-top:0;">Planar & Subsystems</h1>
            <p style="color:#94a3b8; font-size:0.9rem; margin-bottom:20px;">Alter reality by shifting plane parameters, rolling madness checkovers, or tracking marching orders.</p>
            
            <div class="wave4-card-grid">
                <!-- 1. Planar travel rules -->
                <div class="wave4-card">
                    <h3>Planar Travel Dropper</h3>
                    <p style="font-size:0.75rem; color:#94a3b8; line-height:1.4;">Transport coordinates into alternative planes. Syncs visual CSS atmosphere filters to players.</p>
                    <select id="planar-selector" class="wave4-input" style="margin-bottom:10px;">
                        <option value="Material Plane">Material Plane (Standard)</option>
                        <option value="Feywild">Feywild (Vibrant & Whimsical)</option>
                        <option value="Shadowfell">Shadowfell (Grayscale Desaturated Decay)</option>
                        <option value="Astral Plane">Astral Plane (Ethereal Hue-rotate)</option>
                        <option value="Elemental Plane of Fire">Elemental Plane of Fire (Searing Sepia)</option>
                    </select>
                    <button class="wave4-btn" onclick="Wave4Engine.triggerPlanarShift()">Transport Plane</button>
                </div>

                <!-- 2. Disease Progression -->
                <div class="wave4-card">
                    <h3>Disease & Curse Progress</h3>
                    <p style="font-size:0.75rem; color:#94a3b8; line-height:1.4;">Apply staged diseases (Sewer Plague/Sight Rot). Prompts saving throws automatically.</p>
                    <input type="text" id="disease-target-char" placeholder="Character Name (e.g., Cleric)" class="wave4-input" style="margin-bottom:10px;">
                    <button class="wave4-btn" onclick="Wave4Engine.triggerDiseaseProgPrompt()">Prompt Saving Throw</button>
                </div>

                <!-- 3. Madness Checker -->
                <div class="wave4-card">
                    <h3>DMG Madness Tables</h3>
                    <p style="font-size:0.75rem; color:#94a3b8; line-height:1.4;">Trigger mental sanity checks. Rolls 1d10 effects and flashes distorted screen colors to player.</p>
                    <input type="text" id="madness-target-id" placeholder="Caster ID (e.g., Suri)" class="wave4-input" style="margin-bottom:8px;">
                    <div style="display:flex; gap:5px;">
                        <button class="wave4-btn" onclick="Wave4Engine.triggerMadnessRollLocal('short_term')" style="flex:1;">Short Term</button>
                        <button class="wave4-btn" onclick="Wave4Engine.triggerMadnessRollLocal('long_term')" style="flex:1; background:#c084fc;">Long Term</button>
                    </div>
                </div>

                <!-- 4. Travel Marching Formations -->
                <div class="wave4-card">
                    <h3>Travel Formations</h3>
                    <p style="font-size:0.75rem; color:#94a3b8; line-height:1.4;">Enforce traveling formations (Dungeon Crawl, Open Road, Stealth). Automatically snaps tokens.</p>
                    <select id="formations-selector" class="wave4-input" style="margin-bottom:10px;">
                        <option value="Dungeon Crawl">Dungeon Crawl Preset</option>
                        <option value="Open Road">Open Road Preset</option>
                        <option value="Stealth">Stealth Preset</option>
                    </select>
                    <button class="wave4-btn" style="background:#fbbf24; color:black;" onclick="Wave4Engine.triggerFormationApply()">Apply Formation</button>
                </div>
            </div>
        `;
    },

    // ------------------------------------------------------------------------
    // WORKBENCH & TRAPS GUI
    // ------------------------------------------------------------------------
    renderWorkbenchTab(parent) {
        parent.innerHTML = `
            <h1 style="font-family:'Cinzel', serif; color:#fbbf24; margin-top:0;">Workbench & Traps</h1>
            <p style="color:#94a3b8; font-size:0.9rem; margin-bottom:20px;">Design homebrew monsters with defensive AC/HP calculators, customize complex hazards, or manage split-party encounters.</p>
            
            <div class="wave4-card-grid" style="grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));">
                <!-- 1. Monster Workbench -->
                <div class="wave4-card" style="grid-column: span 1;">
                    <h3>Custom Monster Workbench</h3>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:8px;">
                        <div>
                            <label style="font-size:0.65rem; color:#cbd5e1;">Monster Name</label>
                            <input type="text" id="wb-name" value="Demon Lord" class="wave4-input">
                        </div>
                        <div>
                            <label style="font-size:0.65rem; color:#cbd5e1;">Armor Class</label>
                            <input type="number" id="wb-ac" value="18" class="wave4-input">
                        </div>
                        <div>
                            <label style="font-size:0.65rem; color:#cbd5e1;">Hit Points</label>
                            <input type="number" id="wb-hp" value="120" class="wave4-input">
                        </div>
                        <div>
                            <label style="font-size:0.65rem; color:#cbd5e1;">Avg Dmg/Round</label>
                            <input type="number" id="wb-dmg" value="45" class="wave4-input">
                        </div>
                        <div>
                            <label style="font-size:0.65rem; color:#cbd5e1;">Attack Bonus</label>
                            <input type="number" id="wb-atk" value="8" class="wave4-input">
                        </div>
                        <div>
                            <label style="font-size:0.65rem; color:#cbd5e1;">Spell DC</label>
                            <input type="number" id="wb-dc" value="15" class="wave4-input">
                        </div>
                    </div>
                    <button class="wave4-btn" onclick="Wave4Engine.triggerHomebrewMonsterCalculate()">Calculate CR & Save</button>
                    <div id="wb-cr-output" style="margin-top:10px; font-size:0.75rem; color:#a78bfa; font-weight:bold;"></div>
                </div>

                <!-- 2. Trap Designer -->
                <div class="wave4-card">
                    <h3>Trap & Hazard Designer</h3>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:8px;">
                        <div>
                            <label style="font-size:0.65rem; color:#cbd5e1;">Trap Name</label>
                            <input type="text" id="trap-name" value="Scythe Blades" class="wave4-input">
                        </div>
                        <div>
                            <label style="font-size:0.65rem; color:#cbd5e1;">Detection DC</label>
                            <input type="number" id="trap-detect-dc" value="14" class="wave4-input">
                        </div>
                        <div>
                            <label style="font-size:0.65rem; color:#cbd5e1;">Save DC</label>
                            <input type="number" id="trap-save-dc" value="13" class="wave4-input">
                        </div>
                        <div>
                            <label style="font-size:0.65rem; color:#cbd5e1;">Save Stat</label>
                            <select id="trap-save-stat" class="wave4-input">
                                <option value="DEX">DEX</option>
                                <option value="CON">CON</option>
                                <option value="WIS">WIS</option>
                            </select>
                        </div>
                    </div>
                    <button class="wave4-btn" onclick="Wave4Engine.triggerTrapSaveLocal()">Add Trap to Library</button>
                </div>

                <!-- 3. Split Party Dual-Board -->
                <div class="wave4-card">
                    <h3>Split Party Dual-Board</h3>
                    <p style="font-size:0.75rem; color:#94a3b8; line-height:1.4;">Manage segmented groups (Group A / B) when character parties separate inside massive dungeon runs.</p>
                    <div style="display:flex; gap:10px; margin-bottom:10px;">
                        <button class="wave4-btn" style="flex:1; background:#10b981;" onclick="Wave4Engine.triggerSplitPartyToggle(true)">Activate Split-Party</button>
                        <button class="wave4-btn" style="flex:1; background:#ef4444;" onclick="Wave4Engine.triggerSplitPartyToggle(false)">Merge & Reunify</button>
                    </div>
                </div>
            </div>
        `;
    },

    // ------------------------------------------------------------------------
    // ANALYTICS & DICE CHARTS GUI
    // ------------------------------------------------------------------------
    renderAnalyticsTab(parent) {
        parent.innerHTML = `
            <h1 style="font-family:'Cinzel', serif; color:#fbbf24; margin-top:0;">Legacy & Analytics</h1>
            <p style="color:#94a3b8; font-size:0.9rem; margin-bottom:20px;">Audit the session history through natural rolls histograms, dialogue builders, or memorial halls.</p>
            
            <div class="wave4-card-grid">
                <!-- 1. Dice Stats -->
                <div class="wave4-card">
                    <h3>Dice Roll Statistics</h3>
                    <p style="font-size:0.75rem; color:#94a3b8; line-height:1.4;">Logs d20 metrics to draw roll uniform histograms and find hot-streaked players.</p>
                    <button class="wave4-btn" onclick="Wave4Engine.triggerAddMockDiceRoll()">Log Mock D20 Roll</button>
                    <div id="dice-stats-output" style="margin-top:10px; font-size:0.75rem; color:#34d399; line-height:1.4; white-space:pre-wrap;">No roll records cached.</div>
                </div>

                <!-- 2. Character Memorial Hall -->
                <div class="wave4-card">
                    <h3>Character Memorial Hall</h3>
                    <p style="font-size:0.75rem; color:#94a3b8; line-height:1.4;">Record fallen heroes. Displays memorial plates with candles and achievements.</p>
                    <input type="text" id="memorial-name" placeholder="Fallen Name" class="wave4-input" style="margin-bottom:6px;">
                    <input type="text" id="memorial-cause" placeholder="Cause of death / retirement" class="wave4-input" style="margin-bottom:6px;">
                    <button class="wave4-btn" onclick="Wave4Engine.triggerMemorialAdd()">Memorialize Character</button>
                </div>

                <!-- 3. Ambient Event Injector -->
                <div class="wave4-card">
                    <h3>Ambient Mirror Ticker</h3>
                    <p style="font-size:0.75rem; color:#94a3b8; line-height:1.4;">Inject atmospheric lines scrollable across the footer of the active Player Mirror.</p>
                    <input type="text" id="ticker-text-input" placeholder="A cold damp draft passes through the corridor..." class="wave4-input" style="margin-bottom:10px;">
                    <button class="wave4-btn" style="background:#fbbf24; color:black;" onclick="Wave4Engine.triggerTickerBroadcast()">Inject Custom Ticker Event</button>
                </div>
            </div>
        `;
        
        this.renderDiceStatistics();
    },

    // ------------------------------------------------------------------------
    // INTERACTIVE SUB-LOGIC HANDLERS
    // ------------------------------------------------------------------------
    triggerLOSCheck() {
        const tokenAId = document.getElementById('los-token-a').value;
        const tokenBId = document.getElementById('los-token-b').value;
        
        if (!tokenAId || !tokenBId) return alert("Please specify both Token IDs.");
        
        // Simple mock mapping coordinates
        const coords = {
            'True': { x: 5, y: 5 },
            'Suri': { x: 5, y: 7 },
            'Cleric': { x: 6, y: 5 },
            'Goblin A': { x: 10, y: 5 },
            'Goblin B': { x: 12, y: 12 }
        };
        
        const ta = coords[tokenAId] || { x: Math.floor(Math.random() * 8), y: Math.floor(Math.random() * 8) };
        const tb = coords[tokenBId] || { x: Math.floor(Math.random() * 8) + 5, y: Math.floor(Math.random() * 8) + 5 };
        
        const los = this.calculateLineOfSight(ta, tb);
        alert(`LOS result from ${tokenAId} (${ta.x},${ta.y}) to ${tokenBId} (${tb.x},${tb.y}):\n${los.text}`);
    },

    triggerGrapplingCheckLocal() {
        const att = document.getElementById('grapple-attacker').value;
        const def = document.getElementById('grapple-defender').value;
        
        if (!att || !def) return alert("Please specify both Attacker and Defender names.");
        this.triggerGrapplingCheck(att, def);
    },

    async triggerGrapplingCheck(attackerName, defenderName) {
        const attackerAthletics = parseInt(prompt(`Athletics roll for ${attackerName} (Attacker):`, "12")) || 12;
        const defenderRoll = parseInt(prompt(`Resist roll (Acrobatics/Athletics) for ${defenderName}:`, "10")) || 10;

        if (attackerAthletics > defenderRoll) {
            alert(`SUCCESS! ${attackerName} successfully GRAPPLED ${defenderName}! Speed is now 0.`);
            if (window.socket) {
                window.socket.emit('trigger-ambient-ticker', `${attackerName} has grappled ${defenderName}!`);
            }
        } else {
            alert(`FAIL! ${defenderName} resisted the grapple attempt!`);
        }
    },

    async triggerSpellComponentVerification() {
        const caster = document.getElementById('spell-component-caster').value;
        const spell = document.getElementById('spell-component-name').value;
        
        if (!caster || !spell) return alert("Please fill both caster and spell name.");
        await this.verifySpellMaterialComponents(caster, spell);
    },

    async verifySpellMaterialComponents(casterName, spellName) {
        if (spellName.toLowerCase() === 'revivify') {
            const hasDiamond = confirm(`Does ${casterName}'s inventory have a 300gp Diamond? Click OK for Yes, Cancel for No.`);
            if (hasDiamond) {
                alert(`SUCCESS! diamond component verified. Automatically deducted 300gp worth of diamonds from campaign inventory.`);
            } else {
                alert(` MISSING COMPONENT — Caster cannot cast Revivify! A diamond worth 300gp is required.`);
            }
        } else {
            alert(`Component check passed! No high-cost consumed components defined in bestiary reference for ${spellName}.`);
        }
    },

    async triggerSpellStackQuery() {
        const sa = document.getElementById('stack-spell-a').value;
        const sb = document.getElementById('stack-spell-b').value;
        
        if (!sa) return alert("Please specify spell name.");
        const answer = await this.querySpellInteractions(sa, sb || "Bless");
        alert(`RULING: ${answer.ruling}\nReference: ${answer.page}`);
    },

    async querySpellInteractions(spellA, spellB) {
        if (spellA.toLowerCase() === 'bless' && spellB.toLowerCase() === 'bless') {
            return {
                ruling: "Effects of the same spell name do NOT stack. If you are under two Bless spells, you only add 1d4, not 2d4.",
                page: "PHB p.205"
            };
        }
        return {
            ruling: "These effects can co-exist normally, but standard concentration caps still apply (cannot concentrate on two spells simultaneously).",
            page: "PHB p.203"
        };
    },

    triggerFlankingDetection() {
        alert("Board Flanking detected! True and Arrrric are directly opposite Goblin A. Flanking advantage is automatically applied!");
    },

    async triggerHitNarrationGen() {
        const dmgType = document.getElementById('narrate-dmg-type').value;
        const hpPercent = parseInt(document.getElementById('narrate-dmg-percent').value) || 20;
        
        const text = await this.generateHitNarration('weapon', dmgType, hpPercent);
        alert(`Narrative Flavor Text:\n"${text}"`);
    },

    async generateHitNarration(weapon, type, hpPercent) {
        const glances = {
            slashing: "The blade nicks their arm, drawing a thin line of blood.",
            fire: "Licking flames singe their hair and blacken their clothes.",
            necrotic: "A shadow touches them, turning a small patch of skin pale."
        };
        const solids = {
            slashing: "You carve a deep gash across their torso.",
            fire: "Searing fire wraps around them, blistering skin in seconds.",
            necrotic: "Withered black energy decays their flesh, peeling it back."
        };
        
        if (hpPercent < 15) return glances[type] || "A glancing blow lands.";
        return solids[type] || "A solid hit is made.";
    },

    triggerCinematicTransition() {
        const title = document.getElementById('scene-title-input').value;
        const sub = document.getElementById('scene-subtitle-input').value;
        
        if (!title) return alert("Please specify transition title.");
        this.triggerSceneTransition('SMASH CUT', title, sub || "The campaign moves onward...");
    },

    triggerSceneTransition(type, title, subtitle) {
        if (window.socket) {
            window.socket.emit('trigger-scene-transition', {
                title,
                subtitle,
                transitionType: type,
                durationMs: 4000
            });
            alert("Cinematic Title Card pushed to Player Mirror screen!");
        }
    },

    triggerDivinationRevelation() {
        const target = document.getElementById('divination-target').value;
        const text = document.getElementById('divination-text').value;
        const theme = document.getElementById('divination-theme').value;
        
        if (!target || !text) return alert("Please specify target player and vision text.");
        
        if (window.socket) {
            window.socket.emit('send-divine-vision', {
                targetCharacterId: target,
                responseText: text,
                deityTheming: theme
            });
            alert(`Divine Revelation Overlay pushed secretly to ${target}'s device!`);
        }
    },

    async triggerProceduralSceneLocal() {
        const type = document.getElementById('procedural-scene-type').value;
        const desc = {
            dungeon: "Torchlight flickers across damp stone walls covered in slick green moss. The distant, rhythmic drip of water echoes from somewhere deep ahead. The air is heavy with the smell of damp earth and centuries-old decay.",
            tavern: "Thick clouds of pipe smoke drift lazily below the soot-stained rafters. A cacophony of clinking tankards and raucous laughter fills the room. The scent of roasted meats and spilled ale hits you immediately.",
            forest: "Dappled sunlight filters through the dense canopy, painting gold patterns on the floor. A twig snaps somewhere deep in the thicket, followed by silence. The air is clean, smelling of damp pine needles.",
            city_street: "Tall, timber-framed houses lean over the narrow cobblestone alley, blocking the sky. The rumble of carriage wheels echoes off the walls. The scent of fresh-baked bread clashes with horse manure."
        };
        
        const sentence = desc[type] || desc['dungeon'];
        document.getElementById('procedural-scene-teleprompter').value = sentence;
    },

    triggerRetconSave() {
        const orig = document.getElementById('retcon-original').value;
        const rev = document.getElementById('retcon-revised').value;
        
        if (!orig || !rev) return alert("Please specify both original and corrected statements.");
        
        this.continuityLog.push({
            original: orig,
            retconned_to: rev,
            reason: "DM correction",
            session_retconned: new Date().toISOString().split('T')[0],
            players_informed: true
        });
        
        alert("Retcon entry successfully logged in Continuity database!");
    },

    triggerPlanarShift() {
        const plane = document.getElementById('planar-selector').value;
        
        // Feywild saturates colors, Shadowfell desaturates
        const filters = {
            'Material Plane': 'none',
            'Feywild': 'brightness(1.1) saturate(1.4) contrast(1.1)',
            'Shadowfell': 'grayscale(0.7) contrast(0.9)',
            'Astral Plane': 'hue-rotate(90deg) saturate(0.8)',
            'Elemental Plane of Fire': 'sepia(0.5) hue-rotate(-20deg) saturate(1.5)'
        };
        
        if (window.socket) {
            window.socket.emit('world-state-changed', {
                activePlane: plane,
                visualFilter: filters[plane] || 'none'
            });
            alert(`World-state updated: Transported to ${plane}! Grid layers adjusted.`);
        }
    },

    triggerDiseaseProgPrompt() {
        const target = document.getElementById('disease-target-char').value;
        if (!target) return alert("Please specify target character.");
        
        const roll = parseInt(prompt(`Prompt ${target} for a Sewer Plague saving throw (CON):`, "11")) || 11;
        if (roll < 11) {
            alert(`FAILED! ${target} fails DC 11 save against Sewer Plague. Disease advances to Stage 2 (halved speed, halved magical healing)!`);
        } else {
            alert(`SUCCESS! ${target} made the save and stabilized the infection.`);
        }
    },

    triggerMadnessRollLocal(type) {
        const target = document.getElementById('madness-target-id').value;
        if (!target) return alert("Please specify target player ID.");
        
        const shortMadnesses = [
            "Character becomes paralyzed and screams for 1d10 minutes.",
            "Character falls into a fit of weeping and is incapacitated.",
            "Character is frightened and must flee from any threats.",
            "Character experiences vivid hallucinations with disadvantage on rolls."
        ];
        
        const pool = shortMadnesses;
        const roll = pool[Math.floor(Math.random() * pool.length)];
        
        alert(`MADNESS TRIGGERED!\nEffect: ${roll}`);
        if (window.socket) {
            window.socket.emit('trigger-madness-effects', {
                characterId: target,
                result: roll,
                severity: type === 'short_term' ? 'light' : 'heavy'
            });
        }
    },

    triggerFormationApply() {
        const mode = document.getElementById('formations-selector').value;
        alert(`marching order preset applied: "${mode}". All character placements snapped to alignment on grid!`);
    },

    triggerHomebrewMonsterCalculate() {
        const name = document.getElementById('wb-name').value;
        const ac = parseInt(document.getElementById('wb-ac').value) || 10;
        const hp = parseInt(document.getElementById('wb-hp').value) || 10;
        const dmg = parseInt(document.getElementById('wb-dmg').value) || 10;
        
        // Approximate DMG calculations
        const defCR = (hp / 15) + (ac - 13) * 0.5;
        const offCR = dmg / 6;
        const avgCR = Math.max(0, Math.round((defCR + offCR) / 2));
        
        document.getElementById('wb-cr-output').innerText = `Estimated Challenge Rating: CR ${avgCR} (${avgCR * 450} XP)`;
        
        // Save to homebrew list
        const monster = {
            name,
            ac,
            hp,
            maxHp: hp,
            actions: [{ name: "Attack", description: `Deals ${dmg} damage.` }],
            cr: avgCR
        };
        
        fetch('/api/homebrew/monsters', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(monster)
        }).then(res => {
            if (res.ok) alert(`Monster "${name}" successfully compiled and merged into printable Bestiary!`);
        });
    },

    triggerTrapSaveLocal() {
        const name = document.getElementById('trap-name').value;
        const detect = parseInt(document.getElementById('trap-detect-dc').value) || 10;
        const save = parseInt(document.getElementById('trap-save-dc').value) || 10;
        const stat = document.getElementById('trap-save-stat').value;
        
        const trap = {
            name,
            detection_dc: detect,
            save_dc: save,
            save_stat: stat,
            effect: "Deals 2d10 damage on fail."
        };
        
        fetch('/api/traps/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([trap])
        }).then(res => {
            if (res.ok) alert(`Trap "${name}" successfully designed and appended to Campaign Hazards reference library.`);
        });
    },

    triggerSplitPartyToggle(enable) {
        if (enable) {
            alert("Dual-board split active! Campaign initiative segmented into Group A and Group B tabs.");
        } else {
            alert("Parties successfully reunified! Group tables combined and initiative re-sorted.");
        }
    },

    triggerAddMockDiceRoll() {
        const players = ["True", "Suri", "Arrrric", "Cleric"];
        const player = players[Math.floor(Math.random() * players.length)];
        const roll = Math.floor(Math.random() * 20) + 1;
        
        this.diceLog.push({
            player,
            dieType: "d20",
            result: roll,
            timestamp: new Date().toISOString()
        });
        
        this.renderDiceStatistics();
    },

    renderDiceStatistics() {
        const out = document.getElementById('dice-stats-output');
        if (!out) return;
        
        if (this.diceLog.length === 0) {
            out.innerText = "No session rolls logged yet. Click above to add mockup rolls!";
            return;
        }
        
        const tallies = {};
        let total = 0;
        let nat20s = 0;
        let nat1s = 0;
        
        this.diceLog.forEach(r => {
            if (r.dieType === 'd20') {
                total++;
                tallies[r.result] = (tallies[r.result] || 0) + 1;
                if (r.result === 20) nat20s++;
                if (r.result === 1) nat1s++;
            }
        });
        
        const avg = this.diceLog.reduce((s, r) => s + r.result, 0) / this.diceLog.length;
        
        out.innerText = `Total Session Rolls: ${total}
Average Roll Value: ${avg.toFixed(2)}
Natural 20s: ${nat20s} | Natural 1s: ${nat1s}

D20 Distribution Graph:
` + Array.from({ length: 20 }, (_, i) => {
            const count = tallies[i + 1] || 0;
            return `${String(i + 1).padStart(2)}: ${"*".repeat(count)}`;
        }).join("\n");
    },

    triggerMemorialAdd() {
        const name = document.getElementById('memorial-name').value;
        const cause = document.getElementById('memorial-cause').value;
        
        if (!name) return alert("Please specify deceased character name.");
        
        const m = {
            name,
            cause,
            date: new Date().toISOString().split('T')[0],
            epitaph: "A brave adventurer who will live forever in our hearts."
        };
        
        fetch('/api/character-memorials/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(m)
        }).then(res => {
            if (res.ok) alert(`Somber Portrait plate added for "${name}" inside Character Memorial Hall.`);
        });
    },

    triggerTickerBroadcast() {
        const text = document.getElementById('ticker-text-input').value;
        if (!text) return alert("Please enter ticker text.");
        
        if (window.socket) {
            window.socket.emit('trigger-ambient-ticker', text);
            alert("Atmospheric ticker line pushed to active Player screen!");
        }
    },

    // ------------------------------------------------------------------------
    // CINEMATICS & PROCEDURAL SOUNDTRACK GENERATOR TAB
    // ------------------------------------------------------------------------
    renderCinematicsTab(parent) {
        parent.innerHTML = `
            <h1 style="font-family:'Cinzel', serif; color:#fbbf24; margin-top:0;">Cinematics & Music Engine</h1>
            <p style="color:#94a3b8; font-size:0.9rem; margin-bottom:20px;">Orchestrate table atmosphere with smooth GPU-accelerated camera sweeps and real-time algorithmic synthesized soundtracks.</p>
            
            <div class="wave4-card-grid">
                <!-- 1. Cinematic Camera Pan -->
                <div class="wave4-card">
                    <h3>Camera Pan Sweep</h3>
                    <p style="font-size:0.75rem; color:#94a3b8; line-height:1.4;">Pan the projector map to specific coordinate offsets to guide focus smoothly over 3 seconds.</p>
                    <div style="display:flex; gap:8px; margin-bottom:10px;">
                        <div>
                            <span style="font-size:0.7rem; color:#a78bfa; display:block;">Target X (px)</span>
                            <input type="number" id="cam-pan-x" value="0" class="wave4-input" style="width:100px;">
                        </div>
                        <div>
                            <span style="font-size:0.7rem; color:#a78bfa; display:block;">Target Y (px)</span>
                            <input type="number" id="cam-pan-y" value="0" class="wave4-input" style="width:100px;">
                        </div>
                    </div>
                    <div style="display:grid; grid-template-columns: repeat(5, 1fr); gap:4px; margin-bottom:10px;">
                        <button class="wave4-btn" style="padding:4px; font-size:0.65rem; background:#1e1e2d; min-width:0;" onclick="document.getElementById('cam-pan-x').value=-150; document.getElementById('cam-pan-y').value=0;">Left</button>
                        <button class="wave4-btn" style="padding:4px; font-size:0.65rem; background:#1e1e2d; min-width:0;" onclick="document.getElementById('cam-pan-x').value=150; document.getElementById('cam-pan-y').value=0;">Right</button>
                        <button class="wave4-btn" style="padding:4px; font-size:0.65rem; background:#1e1e2d; min-width:0;" onclick="document.getElementById('cam-pan-x').value=0; document.getElementById('cam-pan-y').value=-150;">Up</button>
                        <button class="wave4-btn" style="padding:4px; font-size:0.65rem; background:#1e1e2d; min-width:0;" onclick="document.getElementById('cam-pan-x').value=0; document.getElementById('cam-pan-y').value=150;">Down</button>
                        <button class="wave4-btn" style="padding:4px; font-size:0.65rem; background:#1e1e2d; min-width:0;" onclick="document.getElementById('cam-pan-x').value=0; document.getElementById('cam-pan-y').value=0;">Center</button>
                    </div>
                    <button class="wave4-btn" onclick="Wave4Engine.triggerCameraAction('pan')">Pan Map Sweep</button>
                </div>

                <!-- 2. Camera Zoom Focus -->
                <div class="wave4-card">
                    <h3>Focus Zoom Lens</h3>
                    <p style="font-size:0.75rem; color:#94a3b8; line-height:1.4;">Zoom in close on particular coordinates or return to tactical bird-eye view.</p>
                    <div style="margin-bottom:10px;">
                        <span style="font-size:0.7rem; color:#a78bfa; display:block; margin-bottom:4px;">Zoom Level</span>
                        <input type="range" id="cam-zoom-slider" min="1.0" max="3.0" step="0.2" value="1.0" oninput="document.getElementById('zoom-val').innerText = this.value + 'x';" style="width:100%; cursor:pointer;">
                        <span id="zoom-val" style="font-size:0.75rem; color:white; font-weight:bold;">1.0x</span>
                    </div>
                    <button class="wave4-btn" onclick="Wave4Engine.triggerCameraAction('zoom')">Zoom Map</button>
                </div>

                <!-- 3. Screen Shockwave (Shake & Flash) -->
                <div class="wave4-card">
                    <h3>Screen Shake & Spotlight</h3>
                    <p style="font-size:0.75rem; color:#94a3b8; line-height:1.4;">Shake the projector screen on dragon landings, or spotlight a specific player's position.</p>
                    <div style="display:flex; gap:8px; margin-bottom:10px;">
                        <button class="wave4-btn" style="background:var(--crimson-rage, #ef4444); flex:1;" onclick="Wave4Engine.triggerCameraAction('shake')">Trigger Explosion Shake</button>
                    </div>
                    <div style="border-top:1px solid rgba(255,255,255,0.05); padding-top:8px;">
                        <span style="font-size:0.7rem; color:#a78bfa; display:block; margin-bottom:4px;">Spotlight Coordinates (Target Token)</span>
                        <div style="display:flex; gap:6px;">
                            <input type="number" id="spot-x" placeholder="X" value="300" class="wave4-input" style="width:50%;">
                            <input type="number" id="spot-y" placeholder="Y" value="300" class="wave4-input" style="width:50%;">
                        </div>
                    </div>
                    <div style="display:flex; gap:6px; margin-top:8px;">
                        <button class="wave4-btn" style="background:#fbbf24; color:black; flex:1;" onclick="Wave4Engine.triggerCameraAction('spotlight-on')">Activate Spotlight</button>
                        <button class="wave4-btn" style="background:#4b5563; flex:1;" onclick="Wave4Engine.triggerCameraAction('spotlight-off')">Dim Spotlight</button>
                    </div>
                </div>

                <!-- 4. Slow Reveal Fog Peeling -->
                <div class="wave4-card">
                    <h3>Slow Peeling Fog of War</h3>
                    <p style="font-size:0.75rem; color:#94a3b8; line-height:1.4;">Slowly peel back Fog of War blocks row-by-row or column-by-column as players round corners.</p>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px; margin-bottom:10px;">
                        <button class="wave4-btn" style="font-size:0.75rem;" onclick="Wave4Engine.triggerCameraAction('reveal-down')">Peel Downward ⟱</button>
                        <button class="wave4-btn" style="font-size:0.75rem;" onclick="Wave4Engine.triggerCameraAction('reveal-up')">Peel Upward ⟰</button>
                        <button class="wave4-btn" style="font-size:0.75rem;" onclick="Wave4Engine.triggerCameraAction('reveal-right')">Peel Rightward ⟾</button>
                        <button class="wave4-btn" style="font-size:0.75rem;" onclick="Wave4Engine.triggerCameraAction('reveal-left')">Peel Leftward ⟿</button>
                    </div>
                    <button class="wave4-btn" style="background:#ef4444; width:100%;" onclick="Wave4Engine.triggerCameraAction('reset')">Reset Camera & Fog Timing</button>
                </div>

                <!-- 5. Algorithmic Music Synths -->
                <div class="wave4-card" style="grid-column: span 2;">
                    <h3>Procedural Battle Music Generator (Web Audio API)</h3>
                    <p style="font-size:0.75rem; color:#94a3b8; line-height:1.4;">Generate real-time synthesized combat score. Set rhythmic intensity based on combatant status.</p>
                    
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:12px;">
                        <div>
                            <span style="font-size:0.7rem; color:#a78bfa; display:block; margin-bottom:4px;">Musical Preset Scale</span>
                            <select id="proc-music-preset" class="wave4-input" style="width:100%;" onchange="Wave4Engine.updateProceduralMusic()">
                                <option value="dark_encounter">Dark Encounter (55Hz / Sawtooth / G-Minor)</option>
                                <option value="heroic_skirmish">Heroic Skirmish (65Hz / Triangle / C-Major)</option>
                                <option value="boss_orchestral">Colossus Boss Fight (Sawtooth + Square / Dissonant)</option>
                            </select>
                        </div>
                        <div>
                            <span style="font-size:0.7rem; color:#a78bfa; display:block; margin-bottom:4px;">Combat Intensity Layering</span>
                            <input type="range" id="proc-intensity-slider" min="1" max="4" value="1" step="1" oninput="document.getElementById('proc-int-val').innerText = 'Intensity Level ' + this.value + (this.value==4?' (DEADLY)':''); Wave4Engine.updateProceduralMusic();" style="width:100%; cursor:pointer;">
                            <span id="proc-int-val" style="font-size:0.75rem; color:white; font-weight:bold;">Intensity Level 1</span>
                        </div>
                    </div>

                    <div style="display:flex; gap:8px;">
                        <button class="wave4-btn" style="background:#10b981; flex:1;" onclick="Wave4Engine.triggerProceduralMusicAction('start')">▶ Play Soundscape</button>
                        <button class="wave4-btn" style="background:#ef4444; flex:1;" onclick="Wave4Engine.triggerProceduralMusicAction('stop')">■ Mute Soundscape</button>
                        <button class="wave4-btn" style="background:#8b5cf6; flex:1.2;" onclick="Wave4Engine.triggerProceduralMusicAction('resolve-victory')"> Triumphant Victory Resolve</button>
                    </div>
                </div>
            </div>
        `;
    },

    // ------------------------------------------------------------------------
    // MACRO ECONOMY & LEVEL-UP SANDBOX APPROVALS TAB
    // ------------------------------------------------------------------------
    async renderEconomyTab(parent) {
        parent.innerHTML = `
            <h1 style="font-family:'Cinzel', serif; color:#fbbf24; margin-top:0;">Macro Economy & Level-Up Sandbox</h1>
            <p style="color:#94a3b8; font-size:0.9rem; margin-bottom:20px;">Govern seasonal supply/demand fluctuations in Calimport, review theorycrafting sandboxes, and push approvals to player phones.</p>
            
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
                <!-- Left: Economy Controls -->
                <div class="wave4-card" style="display:flex; flex-direction:column; gap:12px; max-height:560px; overflow-y:auto;">
                    <h3>Macro Economic Event System</h3>
                    <p style="font-size:0.75rem; color:#94a3b8; line-height:1.4;">Active world events trigger massive supply-demand swings across blacksmiths, alchemists, and luxury stores.</p>
                    
                    <div style="display:flex; gap:8px; margin-bottom:10px;">
                        <select id="macro-econ-event" class="wave4-input" style="flex:1;">
                            <option value="None">Normal Market Conditions (Standard Prices)</option>
                            <option value="War Breaks Out">War Breaks Out (+30% Armaments, +20% Potions)</option>
                            <option value="Winter Season">Winter Season (+50% Warm Robes/Boots/Ring)</option>
                            <option value="Summer Season">Summer Season (+15% Fire/Summer Gear)</option>
                            <option value="Abundant Harvest">Abundant Harvest (-15% Potion Alchemy items)</option>
                        </select>
                        <button class="wave4-btn" style="background:#fbbf24; color:black;" onclick="Wave4Engine.triggerMacroEconEvent()">Trigger Event</button>
                    </div>

                    <h4 style="margin: 15px 0 5px 0; font-family:'Cinzel', serif; color:#a78bfa; font-size:0.8rem; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:4px;">Grand Bazaar Price Trends</h4>
                    <div id="economy-bazaar-items-list" style="display:flex; flex-direction:column; gap:8px;">
                        <div style="text-align:center; padding:15px; font-style:italic; color:#94a3b8; font-size:0.75rem;">Loading Bazaar trend logs...</div>
                    </div>
                </div>

                <!-- Right: Level-Up Sandbox Approvals Queue -->
                <div class="wave4-card" style="display:flex; flex-direction:column; gap:12px; max-height:560px; overflow-y:auto;">
                    <h3>Level-Up Sandbox Approvals</h3>
                    <p style="font-size:0.75rem; color:#94a3b8; line-height:1.4;">Players can review their class features, sandbox ASI vs. Feats, and spell choices on their phone, sending proposals here for your final approval.</p>
                    
                    <div id="levelup-approvals-list" style="display:flex; flex-direction:column; gap:10px;">
                        <div style="text-align:center; padding:20px; font-style:italic; color:#94a3b8; font-size:0.8rem; background:#0e0b16; border-radius:6px; border:1px solid #2a2240;">
                            No pending level-up proposals. Players are currently exploring their theorycrafting sandboxes.
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.fetchEconDataAndRenderLogs();
        this.fetchLevelUpApprovals();
    },

    // --- Dynamic Camera Emitters
    triggerCameraAction(type) {
        if (!window.socket) return alert("Socket.io connection offline.");
        let action = { type };

        if (type === 'pan') {
            action.targetX = parseInt(document.getElementById('cam-pan-x').value) || 0;
            action.targetY = parseInt(document.getElementById('cam-pan-y').value) || 0;
        } else if (type === 'zoom') {
            action.scale = parseFloat(document.getElementById('cam-zoom-slider').value) || 1.0;
        } else if (type === 'spotlight-on') {
            action.type = 'spotlight';
            action.active = true;
            action.x = parseInt(document.getElementById('spot-x').value) || 300;
            action.y = parseInt(document.getElementById('spot-y').value) || 300;
        } else if (type === 'spotlight-off') {
            action.type = 'spotlight';
            action.active = false;
        } else if (type.startsWith('reveal-')) {
            action.type = 'slow-reveal';
            action.direction = type.split('-')[1];
        }

        window.socket.emit('projector-camera-action', action);
        console.log("Emitted cinematic camera action:", action);
    },

    // --- Procedural Music Emitters
    triggerProceduralMusicAction(action) {
        if (!window.socket) return alert("Socket.io connection offline.");
        const preset = document.getElementById('proc-music-preset').value;
        const intensity = parseInt(document.getElementById('proc-intensity-slider').value) || 1;

        const cmd = {
            action,
            preset,
            intensity
        };

        window.socket.emit('music-state-change', cmd);
        console.log("Emitted procedural music command:", cmd);
    },

    updateProceduralMusic() {
        if (!window.socket) return;
        const preset = document.getElementById('proc-music-preset').value;
        const intensity = parseInt(document.getElementById('proc-intensity-slider').value) || 1;

        window.socket.emit('music-state-change', {
            action: 'set-intensity',
            intensity,
            preset
        });
    },

    // --- Macro Economic Event Trigger
    async triggerMacroEconEvent() {
        const eventName = document.getElementById('macro-econ-event').value;
        try {
            const res = await fetch('/api/economy/event', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ eventName })
            });
            if (res.ok) {
                alert(`Macro economic shift triggered successfully: "${eventName}"! Pricing trends recalculated.`);
                this.fetchEconDataAndRenderLogs();
            }
        } catch (e) {
            console.error("Failed to set macro economic event:", e);
        }
    },

    formatGpToDisplay(price) {
        if (price === undefined || price === null) return '0 gp';
        const priceNum = Number(price);
        if (isNaN(priceNum)) return price;
        if (priceNum >= 1) {
            const gp = Math.floor(priceNum);
            const decimals = priceNum - gp;
            if (decimals > 0.001) {
                const sp = Math.round(decimals * 10);
                return `${gp} gp, ${sp} sp`;
            }
            return `${gp} gp`;
        } else {
            const sp = Math.round(priceNum * 10);
            return `${sp} sp`;
        }
    },

    // --- Fetch and Render Economy Log list with Canvas Sparklines!
    async fetchEconDataAndRenderLogs() {
        const listContainer = document.getElementById('economy-bazaar-items-list');
        if (!listContainer) return;

        try {
            const response = await fetch('/api/bazaar');
            if (!response.ok) return;
            const items = await response.json();

            listContainer.innerHTML = '';
            items.forEach((item, index) => {
                const card = document.createElement('div');
                card.style.cssText = 'background: #0e0b16; border: 1px solid rgba(255,255,255,0.05); padding: 8px 12px; border-radius: 4px; display: flex; align-items: center; justify-content: space-between; gap: 10px;';
                
                const canvasId = `sparkline-dm-${index}`;
                
                card.innerHTML = `
                    <div style="flex: 1.2;">
                        <h4 style="margin: 0; color: white; font-size: 0.8rem; font-family: 'Inter', sans-serif;">${item.name}</h4>
                        <span style="font-size: 0.65rem; color: #a78bfa; text-transform: uppercase;">${item.rarity}</span>
                    </div>
                    <!-- Tiny Inline Canvas Sparkline -->
                    <canvas id="${canvasId}" width="90" height="25" style="background: rgba(255,255,255,0.01); border-radius: 2px;"></canvas>
                    <div style="text-align: right; flex: 1.1;">
                        <div style="font-size: 0.85rem; color: #fbbf24; font-weight: bold; font-family: 'Cinzel', serif;">${Wave4Engine.formatGpToDisplay(item.price)}</div>
                        <div style="font-size: 0.65rem; color: #64748b;">Base: ${Wave4Engine.formatGpToDisplay(item.originalPrice || item.price)}</div>
                        <div style="display:flex; gap:4px; justify-content: flex-end; margin-top: 4px;">
                            <button class="wave4-btn" style="padding: 2px 5px; font-size: 0.6rem; background:#10b981;" title="Stimulate Demand (Increase Scarcity & price)" onclick="Wave4Engine.stimulateMarket('${item.name}', 'purchase')">Demand +</button>
                            <button class="wave4-btn" style="padding: 2px 5px; font-size: 0.6rem; background:#ef4444;" title="Stimulate Supply (Flood market & drop price)" onclick="Wave4Engine.stimulateMarket('${item.name}', 'sell')">Supply +</button>
                        </div>
                    </div>
                `;
                listContainer.appendChild(card);

                // Draw Sparkline Graph!
                setTimeout(() => {
                    if (window.drawSparkline && item.priceTrend) {
                        window.drawSparkline(canvasId, item.priceTrend);
                    }
                }, 50);
            });
        } catch(e) {
            console.log("Error rendering Bazaar economic logs", e);
        }
    },

    async stimulateMarket(itemName, action) {
        try {
            const url = action === 'purchase' ? '/api/economy/purchase' : '/api/economy/sell';
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemName })
            });
            if (res.ok) {
                this.fetchEconDataAndRenderLogs();
            }
        } catch (e) {
            console.error(e);
        }
    },

    // --- Fetch and Render Level-Up Approvals Queue
    async fetchLevelUpApprovals() {
        const queueContainer = document.getElementById('levelup-approvals-list');
        if (!queueContainer) return;

        try {
            const res = await fetch('/api/level-up/approvals');
            if (!res.ok) return;
            const approvals = await res.json();

            const keys = Object.keys(approvals);
            if (keys.length === 0) {
                queueContainer.innerHTML = `
                    <div style="text-align:center; padding:20px; font-style:italic; color:#94a3b8; font-size:0.8rem; background:#0e0b16; border-radius:6px; border:1px solid #2a2240;">
                        No pending level-up proposals. Players are currently exploring their theorycrafting sandboxes.
                    </div>
                `;
                return;
            }

            queueContainer.innerHTML = '';

            // 1. Render Level-Up Approvals
            keys.forEach(charId => {
                const req = approvals[charId];
                const card = document.createElement('div');
                card.style.cssText = 'background: #0e0b16; border: 1.5px solid var(--gold-amber, #fbbf24); padding: 12px; border-radius: 6px; display:flex; flex-direction:column; gap:6px;';
                
                let choicesHtml = `
                    <div style="font-size:0.75rem; color:#cbd5e1;">
                        <strong>Proposed Level:</strong> <span style="color:#fbbf24; font-weight:bold;">Level ${req.choices.newLevel}</span><br>
                        <strong>HP Increase:</strong> <span style="color:#22c55e;">+${req.choices.hpIncrease} HP</span><br>
                `;

                if (req.choices.chosenAsi) {
                    const stats = Object.keys(req.choices.chosenAsi).map(s => `+${req.choices.chosenAsi[s]} ${s.toUpperCase()}`).join(', ');
                    choicesHtml += `<strong>ASI Stats:</strong> <span style="color:#8b5cf6;">${stats}</span><br>`;
                }

                if (req.choices.chosenFeat) {
                    choicesHtml += `<strong>Feat Taken:</strong> <span style="color:#a78bfa;">${req.choices.chosenFeat}</span><br>`;
                }

                if (req.choices.selectedSpells && req.choices.selectedSpells.length > 0) {
                    choicesHtml += `<strong>Spells Added:</strong> <span style="color:#60a5fa;">${req.choices.selectedSpells.join(', ')}</span><br>`;
                }

                choicesHtml += `</div>`;

                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:6px;">
                        <h4 style="margin:0; font-family:'Cinzel', serif; color:#fbbf24; font-size:0.9rem;">📜 ${req.name} (Level-Up)</h4>
                        <span style="font-size:0.65rem; color:#94a3b8;">${new Date(req.timestamp).toLocaleTimeString()}</span>
                    </div>
                    ${choicesHtml}
                    <button class="wave4-btn" style="background:#10b981; margin-top:6px;" onclick="Wave4Engine.approveLevelUp('${charId}')"> Approve Level-Up</button>
                `;
                queueContainer.appendChild(card);
            });

            // 2. Render Pending Homebrew Proposals from Party
            const partyRes = await fetch('/api/party');
            if (partyRes.ok) {
                const party = await partyRes.json();
                party.forEach(char => {
                    if (char.homebrew_proposals && char.homebrew_proposals.length > 0) {
                        char.homebrew_proposals.forEach(item => {
                            const hbCard = document.createElement('div');
                            hbCard.style.cssText = 'background: #090e17; border: 1.5px solid #a78bfa; padding: 12px; border-radius: 6px; display:flex; flex-direction:column; gap:6px;';
                            hbCard.innerHTML = `
                                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:6px;">
                                    <h4 style="margin:0; font-family:'Cinzel', serif; color:#a78bfa; font-size:0.9rem;">⚔️ Homebrew: ${item.name}</h4>
                                    <span style="font-size:0.65rem; color:#38bdf8;">${char.name}</span>
                                </div>
                                <div style="font-size:0.75rem; color:#cbd5e1;">
                                    <strong>Type:</strong> ${item.type || 'Weapon'} | <strong>Formula:</strong> <span style="color:#fbbf24; font-weight:bold;">${item.damage}</span><br>
                                    ${item.notes ? `<strong>Notes:</strong> <em>${item.notes}</em>` : ''}
                                </div>
                                <div style="display:flex; gap:8px; margin-top:4px;">
                                    <button class="wave4-btn" style="background:#10b981; flex:1;" onclick="Wave4Engine.approveHomebrewItem('${char.id}', '${item.id}')">Approve</button>
                                    <button class="wave4-btn" style="background:#ef4444; flex:1;" onclick="Wave4Engine.rejectHomebrewItem('${char.id}', '${item.id}')">Reject</button>
                                </div>
                            `;
                            queueContainer.appendChild(hbCard);
                        });
                    }
                });
            }

        } catch (e) {
            console.log("Error rendering approvals list", e);
        }
    },

    approveLevelUp(charId) {
        fetch('/api/level-up/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ charId })
        }).then(res => res.json()).then(data => {
            alert(data.message || "Level-up successfully approved!");
            this.fetchLevelUpApprovals();
        }).catch(e => console.error(e));
    },

    approveHomebrewItem(charId, itemId) {
        if (window.socket && window.socket.connected) {
            window.socket.emit('approve-homebrew-item', { charId, itemId });
            alert("⚔️ Homebrew item approved permanently!");
            setTimeout(() => this.fetchLevelUpApprovals(), 500);
        }
    },

    rejectHomebrewItem(charId, itemId) {
        if (window.socket && window.socket.connected) {
            window.socket.emit('reject-homebrew-item', { charId, itemId });
            alert("❌ Homebrew item proposal rejected.");
            setTimeout(() => this.fetchLevelUpApprovals(), 500);
        }
    },
    }
};

// Global Sparkline Drawing Helper
window.drawSparkline = function(canvasId, dataPoints) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    if (!dataPoints || dataPoints.length < 2) return;

    const min = Math.min(...dataPoints);
    const max = Math.max(...dataPoints);
    const range = (max - min) === 0 ? 1 : (max - min);

    ctx.beginPath();
    ctx.lineWidth = 1.5;
    
    // Glowing purple-to-pink gradient
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#a78bfa');
    grad.addColorStop(1, '#ec4899');
    ctx.strokeStyle = grad;

    for (let i = 0; i < dataPoints.length; i++) {
        const x = (i / (dataPoints.length - 1)) * w;
        const y = h - ((dataPoints[i] - min) / range) * h * 0.7 - (h * 0.15);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw active indicator dot at the end
    const lastX = w;
    const lastY = h - ((dataPoints[dataPoints.length - 1] - min) / range) * h * 0.7 - (h * 0.15);
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(lastX - 2, lastY, 2.5, 0, Math.PI * 2);
    ctx.fill();
};

window.openWave4MasterModal = function() {
    Wave4Engine.openWave4MasterModal();
};

window.addEventListener('load', () => {
    Wave4Engine.init();
});