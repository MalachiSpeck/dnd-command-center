const express = require('express');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const http = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const os = require('os');

const { PartyStore } = require('./services/partyStore');
const { JsonFileStore } = require('./services/jsonFileStore');
const { readJsonSafe, readJsonSafeSync } = require('./services/jsonStore');
const dataCache = require('./services/dataCache');
const setupSockets = require('./sockets');

const monstersRouter = require('./routes/monsters');
const spellsRouter = require('./routes/spells');
const soundsRouter = require('./routes/sounds');
const scenesRouter = require('./routes/scenes');
const mapsRouter = require('./routes/maps');
const draftsRouter = require('./routes/drafts');
const projectorRouter = require('./routes/projector');
const campaignRouter = require('./routes/campaign');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

function getProjectorState() {
    return projectorState;
}

function setProjectorState(newState) {
    projectorState = newState;
}

// --- DM PASSCODE & PATH SAFETY UTILITIES ---
const DM_PASSCODE = process.env.DM_PASSCODE || '0524';
const failedPinAttempts = new Map();

function safeJoin(baseDir, ...userSegments) {
    const resolvedBase = path.resolve(baseDir);
    const targetPath = path.resolve(baseDir, ...userSegments);
    if (!targetPath.startsWith(resolvedBase + path.sep) && targetPath !== resolvedBase) {
        const err = new Error("Invalid path: Path traversal outside base directory");
        err.statusCode = 400;
        throw err;
    }
    return targetPath;
}

function checkPinRateLimit(ip) {
    const now = Date.now();
    const record = failedPinAttempts.get(ip);
    if (record && record.lockedUntil && now < record.lockedUntil) {
        const remainingSec = Math.ceil((record.lockedUntil - now) / 1000);
        return { locked: true, remainingSec };
    }
    return { locked: false };
}

function recordFailedPin(ip) {
    const now = Date.now();
    const record = failedPinAttempts.get(ip) || { count: 0, lockedUntil: 0 };
    if (record.lockedUntil && now >= record.lockedUntil) {
        record.count = 0;
        record.lockedUntil = 0;
    }
    record.count++;
    if (record.count >= 5) {
        record.lockedUntil = now + (15 * 60 * 1000); // 15 min lockout
    }
    failedPinAttempts.set(ip, record);
    return record;
}

function clearFailedPin(ip) {
    failedPinAttempts.delete(ip);
}

// Initialize in-memory data cache on startup
dataCache.init();

// Active Party Switcher & PartyStore
let activePartyFileName = 'party.json';
function getPartyPath() {
    return path.join(__dirname, 'data', activePartyFileName);
}
const partyStore = new PartyStore(getPartyPath, io);
const partyRouter = require('./routes/party')(partyStore, getPartyPath);

// Attach Socket handlers
setupSockets(io, partyStore, DM_PASSCODE);

// High-capacity body parser middleware for 4K map image uploads & PDF base64 payloads
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// DM PIN verification endpoint
app.post('/api/auth/verify-dm', (req, res) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const limit = checkPinRateLimit(ip);
    if (limit.locked) {
        return res.status(429).json({ 
            success: false, 
            error: `Too many failed attempts. Locked out for ${limit.remainingSec} seconds.` 
        });
    }

    const { passcode } = req.body || {};
    if (passcode === DM_PASSCODE) {
        clearFailedPin(ip);
        res.cookie('dm_passcode', passcode, { httpOnly: false, sameSite: 'lax' });
        return res.json({ success: true, passcode });
    } else {
        const rec = recordFailedPin(ip);
        const attemptsRemaining = Math.max(0, 5 - rec.count);
        if (rec.count >= 5) {
            return res.status(429).json({ 
                success: false, 
                error: 'Maximum 5 attempts reached. Locked out for 15 minutes.' 
            });
        }
        return res.status(401).json({ 
            success: false, 
            error: `Invalid PIN. ${attemptsRemaining} attempt(s) remaining.` 
        });
    }
});

// Error handler middleware for malformed JSON payloads
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        console.error("JSON parsing error on request:", err.message);
        return res.status(400).json({ error: "Malformed JSON payload in request body", details: err.message });
    }
    next(err);
});

// Middleware to prevent aggressive browser caching on local development files
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Scenes Store
const scenesPath = path.join(__dirname, 'data', 'scenes.json');
const scenesStore = new JsonFileStore(scenesPath, { active_scene_id: 'scene_default', scenes: [] }, io, 'scene:update');

// Mount Modular API Routers
app.use('/api/monsters', monstersRouter);
app.use('/api/spells', spellsRouter);
app.use('/api/sounds', soundsRouter);
app.use('/api', partyRouter);
app.use('/api', scenesRouter(scenesStore, syncPartyAndEncounterToScene));
app.use('/api', mapsRouter(scenesStore));
app.use('/api', draftsRouter(io));
app.use('/api', projectorRouter(getProjectorState, setProjectorState, io));
app.use('/api', campaignRouter(io));

// Helper to sync party.json & currentEncounterState to active battle map scene
function syncPartyAndEncounterToScene(activeScene) {
    if (!activeScene) return activeScene;
    if (!activeScene.tokens) activeScene.tokens = [];

    // 1. Sync Party Characters
    const partyPath = getPartyPath();
    const party = readJsonSafeSync(partyPath, [], 'SyncPartyToScene');
    if (Array.isArray(party)) {
        party.forEach((char, idx) => {
            let tok = activeScene.tokens.find(t => t.character_id === char.id || t.id === `tok_party_${char.id}` || t.name === char.name);
            if (!tok) {
                tok = {
                    id: `tok_party_${char.id}`,
                    character_id: char.id,
                    name: char.name || `Player ${idx + 1}`,
                    x: 280 + (idx % 6) * 140,
                    y: 350 + Math.floor(idx / 6) * 140,
                    size_cells: 1,
                    color: char.theme_color || '#3b82f6',
                    vision_radius_ft: 60,
                    disposition: 'friendly',
                    hp_current: char.hp_current || char.hp || 10,
                    hp_max: char.hp_max || char.maxHp || 10,
                    conditions: char.conditions || []
                };
                activeScene.tokens.push(tok);
            } else {
                tok.name = char.name || tok.name;
                if (char.hp_current !== undefined) tok.hp_current = char.hp_current;
                if (char.hp_max) tok.hp_max = char.hp_max;
            }
        });
    }

    // 2. Sync Encounter Combatants (Monsters / Enemies)
    if (typeof currentEncounterState !== 'undefined' && Array.isArray(currentEncounterState)) {
        currentEncounterState.forEach((mon, idx) => {
            let tok = activeScene.tokens.find(t => t.id === `tok_mon_${mon.id}` || t.name === mon.name);
            var isLarge = (mon.name && mon.name.toLowerCase().includes('allosaurus')) || mon.size === 'large' || mon.size === 'huge';
            if (!tok) {
                tok = {
                    id: `tok_mon_${mon.id || idx}`,
                    name: mon.name || `Monster ${idx + 1}`,
                    x: 1050 + (idx % 5) * 140,
                    y: 490 + Math.floor(idx / 5) * 140,
                    size_cells: isLarge ? 2 : 1,
                    color: '#ef4444',
                    vision_radius_ft: 60,
                    disposition: 'hostile',
                    hp_current: Math.max(0, (mon.maxHp || 30) - (mon.currentDamage || 0)),
                    hp_max: mon.maxHp || 30,
                    conditions: mon.conditions || []
                };
                activeScene.tokens.push(tok);
            } else {
                tok.hp_current = Math.max(0, (mon.maxHp || 30) - (mon.currentDamage || 0));
                if (mon.maxHp) tok.hp_max = mon.maxHp;
            }
        });
    }

    return activeScene;
}

// Atomic save helper for scenes.json to prevent file corruption
function saveScenesJson(parsedData, callback) {
    const scenesPath = path.join(__dirname, 'data', 'scenes.json');
    const tmpPath = scenesPath + '.tmp';
    fs.writeFile(tmpPath, JSON.stringify(parsedData, null, 2), 'utf8', (err) => {
        if (err) {
            if (callback) callback(err);
            return;
        }
        fs.rename(tmpPath, scenesPath, (renameErr) => {
            if (callback) callback(renameErr);
        });
    });
}

function getLocalIPAddress() {
    const interfaces = os.networkInterfaces();
    let fallbackIP = '127.0.0.1';
    
    // Step 1: Look for physical Wi-Fi or Ethernet adapters first
    for (const devName in interfaces) {
        const nameLower = devName.toLowerCase();
        if (nameLower.includes('wi-fi') || nameLower.includes('wifi') || nameLower.includes('ethernet') || nameLower.includes('wireless')) {
            const iface = interfaces[devName];
            for (let i = 0; i < iface.length; i++) {
                const alias = iface[i];
                if (alias.family === 'IPv4' && !alias.internal) {
                    return alias.address;
                }
            }
        }
    }
    
    // Step 2: Prioritize 192.168.x.x home router subnets
    for (const devName in interfaces) {
        const iface = interfaces[devName];
        for (let i = 0; i < iface.length; i++) {
            const alias = iface[i];
            if (alias.family === 'IPv4' && !alias.internal) {
                if (alias.address.startsWith('192.168.')) {
                    return alias.address;
                }
                fallbackIP = alias.address;
            }
        }
    }
    
    return fallbackIP;
}
const localIP = getLocalIPAddress();

// --- PLAYER CONNECTIVITY & ROUTING ---
app.get('/sheet/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'player-sheet.html'));
});

app.get('/join', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'join.html'));
});

// GET QR Code for a character's sheet
app.get('/api/qr/:id', (req, res) => {
    const charId = req.params.id;
    const url = `http://${localIP}:${PORT}/sheet/${charId}`;
    QRCode.toBuffer(url, (err, buffer) => {
        if (err) {
            console.error("Error generating QR code:", err);
            return res.status(500).send("Error generating QR code");
        }
        res.setHeader('Content-Type', 'image/png');
        res.send(buffer);
    });
});

// --- HELPER TO SYNC COMBAT BACK TO PARTY DATABASE ---
function syncEncounterToParty(encounter) {
    if (!Array.isArray(encounter)) return;
    const partyPath = getPartyPath();
    fs.readFile(partyPath, 'utf8', (err, data) => {
        if (err) return;
        try {
            let party = JSON.parse(data);
            let changed = false;
            encounter.forEach(com => {
                if (com.type === 'player') {
                    const char = party.find(c => c.id === com.id);
                    if (char) {
                        const newHpCurrent = Math.max(0, (com.maxHp || char.hp_max || 30) - (com.currentDamage || 0));
                        if (char.hp_current !== newHpCurrent || 
                            JSON.stringify(char.conditions) !== JSON.stringify(com.conditions || []) ||
                            JSON.stringify(char.death_saves) !== JSON.stringify(com.deathSaves)) {
                            
                            char.hp_current = newHpCurrent;
                            char.conditions = com.conditions || [];
                            char.death_saves = com.deathSaves || { successes: 0, failures: 0 };
                            changed = true;
                            io.to(`player:${char.id}`).emit('character-updated', char);
                        }
                    }
                }
            });
            if (changed) {
                fs.writeFile(partyPath, JSON.stringify(party, null, 2), (err) => {
                    if (!err) {
                        io.to('dm').emit('party-updated', party);
                    }
                });
            }
        } catch (e) {
            console.error("Error syncing encounter to party:", e);
        }
    });
}

// --- SOCKET.IO REAL-TIME CAMPAIGN ENGINE ---
const activeConnections = new Set();

// Helper to load permissions dynamically
function getFieldPermissions() {
    const permissionsPath = path.join(__dirname, 'data', 'field_permissions.json');
    try {
        if (fs.existsSync(permissionsPath)) {
            return JSON.parse(fs.readFileSync(permissionsPath, 'utf8'));
        }
    } catch (e) {
        console.warn("Could not read field permissions, using defaults.");
    }
    return {
        "hp_current": "player", "hp_temp": "player", "ac": "player", "stats": "player",
        "prepared_spells": "player", "inventory": "player", "notes": "player",
        "level": "dm-confirm", "feats": "dm-confirm"
    };
}

io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('join-room', (roomName) => {
        socket.join(roomName);
        console.log(`Socket ${socket.id} joined room: ${roomName}`);

        if (roomName === 'dm') {
            socket.emit('active-connections', Array.from(activeConnections));
            
            // Also feed DM any proposed new characters on connect!
            const pendingPath = path.join(__dirname, 'data', 'pending_characters.json');
            if (fs.existsSync(pendingPath)) {
                fs.readFile(pendingPath, 'utf8', (err, data) => {
                    if (!err) {
                        try {
                            const pending = JSON.parse(data);
                            if (pending.length > 0) {
                                socket.emit('initial-pending-characters', pending);
                            }
                        } catch (e) {}
                    }
                });
            }
        } else if (roomName.startsWith('player:')) {
            const charId = roomName.split(':')[1];
            socket.characterId = charId;
            activeConnections.add(charId);
            io.to('dm').emit('player-status-changed', { charId, connected: true });
        }
    });

    socket.on('player-update', ({ charId, updatedData }) => {
        console.log(`Real-time player update for ${charId}:`, updatedData);
        const partyPath = getPartyPath();
        
        fs.readFile(partyPath, 'utf8', (err, data) => {
            if (err) return;
            try {
                let party = JSON.parse(data);
                const idx = party.findIndex(c => c.id === charId);
                if (idx !== -1) {
                    const permissions = getFieldPermissions();
                    const character = party[idx];
                    
                    // Respect field permissions for direct permanent edits!
                    // If a field is "dm-confirm", we save it in .proposals, NOT in the core character fields!
                    // If a field is "dm", we ignore it.
                    // If a field is "player", we update it directly.
                    Object.keys(updatedData).forEach(field => {
                        const permission = permissions[field] || 'player';
                        if (permission === 'player') {
                            character[field] = updatedData[field];
                        } else if (permission === 'dm-confirm') {
                            if (!character.proposals) character.proposals = {};
                            character.proposals[field] = updatedData[field];
                        }
                    });
                    
                    party[idx] = character;
                    
                    fs.writeFile(partyPath, JSON.stringify(party, null, 2), (writeErr) => {
                        if (writeErr) {
                            console.error("Failed to save player update:", writeErr);
                            return;
                        }
                        
                        let encounterChanged = false;
                        currentEncounterState.forEach(com => {
                            if (com.id === charId && com.type === 'player') {
                                com.maxHp = updatedData.hp_max || com.maxHp;
                                com.ac = updatedData.ac || com.ac;
                                com.currentDamage = Math.max(0, com.maxHp - (updatedData.hp_current || 0));
                                com.conditions = updatedData.conditions || [];
                                com.deathSaves = updatedData.death_saves || { successes: 0, failures: 0 };
                                
                                if (updatedData.hp_current <= 0) {
                                    com.isDefeated = true;
                                } else {
                                    com.isDefeated = false;
                                }
                                
                                if (updatedData.hp_current < com.maxHp / 2) {
                                    com.isFuckedUp = true;
                                } else {
                                    com.isFuckedUp = false;
                                }
                                encounterChanged = true;
                            }
                        });

                        io.to(`player:${charId}`).emit('character-updated', party[idx]);
                        io.to('dm').emit('party-updated', party);
                        
                        if (encounterChanged) {
                            io.emit('board-state-updated', {
                                encounter: currentEncounterState,
                                activeCombatIndex,
                                activeRound,
                                soundTrigger: activeSoundTrigger,
                                handout: currentHandoutImage
                            });
                        }
                    });
                }
            } catch (e) {
                console.error("Failed to process player-update socket event:", e);
            }
        });
    });

    socket.on('trigger-legendary-resistance', (bossName) => {
        io.emit('legendary-resistance-triggered', bossName);
    });

    socket.on('whisper-to-player', ({ characterId, message }) => {
        console.log(`DM whispering to player ${characterId}: ${message}`);
        io.to(`player:${characterId}`).emit('whisper-received', { message });
    });

    socket.on('whisper-to-dm', ({ characterId, characterName, message }) => {
        console.log(`Player ${characterName} (${characterId}) whispering to DM: ${message}`);
        io.to('dm').emit('whisper-received-dm', { characterId, characterName, message });
    });

    socket.on('propose-homebrew-item', ({ charId, item }) => {
        const partyPath = getPartyPath();
        fs.readFile(partyPath, 'utf8', (err, data) => {
            if (err) return;
            try {
                let party = JSON.parse(data);
                const idx = party.findIndex(c => c.id === charId);
                if (idx !== -1) {
                    if (!party[idx].homebrew_proposals) party[idx].homebrew_proposals = [];
                    item.id = item.id || 'hb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
                    item.status = 'pending';
                    item.createdAt = new Date().toISOString();
                    party[idx].homebrew_proposals.push(item);
                    
                    fs.writeFile(partyPath, JSON.stringify(party, null, 2), () => {
                        io.to(`player:${charId}`).emit('character-updated', party[idx]);
                        io.to('dm').emit('party-updated', party);
                        io.to('dm').emit('homebrew-proposed', { charId, characterName: party[idx].name, item });
                    });
                }
            } catch (e) {}
        });
    });

    socket.on('approve-homebrew-item', ({ charId, itemId }) => {
        const partyPath = getPartyPath();
        fs.readFile(partyPath, 'utf8', (err, data) => {
            if (err) return;
            try {
                let party = JSON.parse(data);
                const idx = party.findIndex(c => c.id === charId);
                if (idx !== -1) {
                    const proposals = party[idx].homebrew_proposals || [];
                    const pIdx = proposals.findIndex(p => p.id === itemId);
                    if (pIdx !== -1) {
                        const approvedItem = proposals.splice(pIdx, 1)[0];
                        approvedItem.status = 'approved';
                        
                        if (approvedItem.type === 'weapon') {
                            if (!party[idx].weapons) party[idx].weapons = [];
                            party[idx].weapons.push(approvedItem);
                        } else {
                            if (!party[idx].inventory) party[idx].inventory = [];
                            party[idx].inventory.push(approvedItem);
                        }

                        fs.writeFile(partyPath, JSON.stringify(party, null, 2), () => {
                            io.to(`player:${charId}`).emit('character-updated', party[idx]);
                            io.to('dm').emit('party-updated', party);
                            io.to(`player:${charId}`).emit('homebrew-approved', approvedItem);
                        });
                    }
                }
            } catch (e) {}
        });
    });

    socket.on('reject-homebrew-item', ({ charId, itemId }) => {
        const partyPath = getPartyPath();
        fs.readFile(partyPath, 'utf8', (err, data) => {
            if (err) return;
            try {
                let party = JSON.parse(data);
                const idx = party.findIndex(c => c.id === charId);
                if (idx !== -1) {
                    if (party[idx].homebrew_proposals) {
                        party[idx].homebrew_proposals = party[idx].homebrew_proposals.filter(p => p.id !== itemId);
                        fs.writeFile(partyPath, JSON.stringify(party, null, 2), () => {
                            io.to(`player:${charId}`).emit('character-updated', party[idx]);
                            io.to('dm').emit('party-updated', party);
                        });
                    }
                }
            } catch (e) {}
        });
    });

    // DM sends homebrew/custom item to player sheet with interactive prompt
    socket.on('dm-send-item', ({ charId, item }) => {
        const partyPath = getPartyPath();
        fs.readFile(partyPath, 'utf8', (err, data) => {
            if (err) return;
            try {
                let party = JSON.parse(data);
                const idx = party.findIndex(c => c.id === charId);
                if (idx !== -1) {
                    item.id = item.id || 'hb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
                    io.to(`player:${charId}`).emit('item-receive-prompt', {
                        charId,
                        characterName: party[idx].name,
                        item
                    });
                    socket.emit('dm-item-status-alert', {
                        type: 'info',
                        message: `Offered "${item.name}" to ${party[idx].name}. Awaiting player response...`
                    });
                }
            } catch (e) {
                console.error("Error in dm-send-item:", e);
            }
        });
    });

    // Player accepts sent item from DM
    socket.on('player-accept-item', ({ charId, item }) => {
        const partyPath = getPartyPath();
        fs.readFile(partyPath, 'utf8', (err, data) => {
            if (err) return;
            try {
                let party = JSON.parse(data);
                const idx = party.findIndex(c => c.id === charId);
                if (idx !== -1) {
                    if (!party[idx].inventory) party[idx].inventory = [];
                    
                    const existingIdx = party[idx].inventory.findIndex(i => (typeof i === 'object' && i.id && i.id === item.id));
                    if (existingIdx === -1) {
                        party[idx].inventory.push(item);
                    }

                    const isWeapon = item.type === 'M' || item.type === 'R' || item.type === 'weapon' || item.weaponCategory || item.dmg1;
                    if (isWeapon) {
                        if (!party[idx].weapons) party[idx].weapons = [];
                        const existingWpn = party[idx].weapons.findIndex(w => (typeof w === 'object' && w.id && w.id === item.id));
                        if (existingWpn === -1) {
                            party[idx].weapons.push(item);
                        }
                    }

                    if (item.rarity && item.rarity !== 'None') {
                        if (!party[idx].magic_items) party[idx].magic_items = [];
                        if (!party[idx].magic_items.includes(item.name)) {
                            party[idx].magic_items.push(item.name);
                        }
                    }

                    fs.writeFile(partyPath, JSON.stringify(party, null, 2), 'utf8', () => {
                        io.to(`player:${charId}`).emit('character-updated', party[idx]);
                        io.to('dm').emit('party-updated', party);
                        io.to('dm').emit('dm-item-status-alert', {
                            type: 'success',
                            message: `🎉 ${party[idx].name} accepted "${item.name}"!`
                        });
                    });
                }
            } catch (e) {
                console.error("Error in player-accept-item:", e);
            }
        });
    });

    // Player declines sent item from DM
    socket.on('player-decline-item', ({ charId, item }) => {
        const partyPath = getPartyPath();
        fs.readFile(partyPath, 'utf8', (err, data) => {
            if (err) return;
            try {
                let party = JSON.parse(data);
                const idx = party.findIndex(c => c.id === charId);
                const charName = idx !== -1 ? party[idx].name : 'Player';
                io.to('dm').emit('dm-item-status-alert', {
                    type: 'warning',
                    message: `❌ ${charName} declined "${item.name}".`
                });
            } catch (e) {}
        });
    });

    socket.on('award-badge', ({ characterId, badgeId }) => {
        console.log(`Awarding badge ${badgeId} to player ${characterId}`);
        const partyPath = getPartyPath();
        fs.readFile(partyPath, 'utf8', (err, data) => {
            if (err) return;
            try {
                let party = JSON.parse(data);
                const idx = party.findIndex(c => c.id === characterId);
                if (idx !== -1) {
                    if (!party[idx].badges) party[idx].badges = [];
                    if (!party[idx].badges.includes(badgeId)) {
                        party[idx].badges.push(badgeId);
                        fs.writeFile(partyPath, JSON.stringify(party, null, 2), 'utf8', () => {
                            io.to(`player:${characterId}`).emit('character-updated', party[idx]);
                            io.to('dm').emit('party-updated', party);
                            io.emit('badge-awarded-alert', { characterName: party[idx].name, badgeId });
                        });
                    }
                }
            } catch (e) {
                console.error("Failed to award badge:", e);
            }
        });
    });

    // Socket Handler: Real-time PDF Parser Execution & Streaming Log
    socket.on('start-pdf-extraction', (config) => {
        const { filePath, type = 'all', pages, crMin, crMax, spellLevel, rarity } = config || {};
        if (!filePath || !fs.existsSync(filePath)) {
            return socket.emit('pdf-log-line', { type: 'error', text: 'PDF File not found on server.' });
        }

        const args = ['parse_pdf.py', '--file', filePath, '--type', type];
        if (pages) { args.push('--pages'); args.push(pages); }
        if (crMin !== undefined && crMin !== null && crMin !== '') { args.push('--cr-min'); args.push(String(crMin)); }
        if (crMax !== undefined && crMax !== null && crMax !== '') { args.push('--cr-max'); args.push(String(crMax)); }
        if (spellLevel !== undefined && spellLevel !== null && spellLevel !== '') { args.push('--spell-level'); args.push(String(spellLevel)); }
        if (rarity) { args.push('--rarity'); args.push(rarity); }

        const pyProcess = spawn('python', args, { cwd: __dirname });

        pyProcess.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                const cleanLine = line.trim();
                if (!cleanLine) return;
                
                if (cleanLine.startsWith('[PROGRESS:')) {
                    const pctMatch = cleanLine.match(/\[PROGRESS:(\d+)%\]/);
                    const pct = pctMatch ? parseInt(pctMatch[1]) : 0;
                    socket.emit('pdf-log-line', { type: 'progress', pct, text: cleanLine });
                } else if (cleanLine.startsWith('[SAVED]')) {
                    socket.emit('pdf-log-line', { type: 'saved', text: cleanLine });
                } else if (cleanLine.startsWith('[COMPLETED]')) {
                    socket.emit('pdf-log-line', { type: 'completed', text: cleanLine });
                } else {
                    socket.emit('pdf-log-line', { type: 'step', text: cleanLine });
                }
            });
        });

        pyProcess.stderr.on('data', (data) => {
            socket.emit('pdf-log-line', { type: 'warn', text: data.toString().trim() });
        });

        pyProcess.on('close', (code) => {
            socket.emit('pdf-extraction-finished', { code, success: code === 0 });
        });
    });

    socket.on('submit-skill-challenge-roll', (data) => {
        io.emit('skill-challenge-roll-update', data);
    });

    socket.on('close-session-pulse', () => {
        io.emit('session-closed-feedback-pulse');
    });

    socket.on('world-state-changed', (data) => {
        io.emit('world-state-updated', data);
    });

    // --- WAVE 4 REAL-TIME SOCKET EVENTS ---
    socket.on('trigger-scene-transition', (data) => {
        console.log(`Triggering scene transition: ${data.title}`);
        io.emit('play-scene-transition', data);
    });

    socket.on('send-divine-vision', (data) => {
        console.log(`Sending divine revelation to character ${data.targetCharacterId}`);
        io.to(`player:${data.targetCharacterId}`).emit('receive-divine-vision', data);
    });

    socket.on('trigger-madness-effects', (data) => {
        console.log(`Triggering madness visual for character ${data.characterId}`);
        io.to(`player:${data.characterId}`).emit('apply-madness-visual', data);
    });

    socket.on('trigger-ambient-ticker', (text) => {
        io.emit('ambient-ticker-update', text);
    });

    // --- GRAIL BATTLE MAP & DICE SOCKET HANDLERS ---
    socket.on('scene:get', () => {
        const scenesPath = path.join(__dirname, 'data', 'scenes.json');
        if (fs.existsSync(scenesPath)) {
            fs.readFile(scenesPath, 'utf8', (err, data) => {
                if (!err) {
                    try {
                        const parsed = JSON.parse(data);
                        const activeId = parsed.active_scene_id;
                        const activeScene = (parsed.scenes || []).find(s => s.id === activeId) || parsed.scenes[0];
                        socket.emit('scene:data', activeScene);
                    } catch (e) {}
                }
            });
        }
    });

    socket.on('token:move', (data) => {
        const scenesPath = path.join(__dirname, 'data', 'scenes.json');
        if (fs.existsSync(scenesPath)) {
            fs.readFile(scenesPath, 'utf8', (err, rawData) => {
                if (err) return;
                try {
                    let parsed = JSON.parse(rawData);
                    let activeScene = (parsed.scenes || []).find(s => s.id === (data.scene_id || parsed.active_scene_id));
                    if (activeScene && activeScene.tokens) {
                        let tok = activeScene.tokens.find(t => t.id === data.token_id);
                        if (tok) {
                            tok.x = data.x;
                            tok.y = data.y;
                            fs.writeFile(scenesPath, JSON.stringify(parsed, null, 2), (err) => {
                                io.emit('token:moved', data);
                            });
                        }
                    }
                } catch (e) {}
            });
        }
    });

    socket.on('token:nudge', (data) => {
        const { character_id, direction } = data;
        const scenesPath = path.join(__dirname, 'data', 'scenes.json');
        if (fs.existsSync(scenesPath)) {
            fs.readFile(scenesPath, 'utf8', (err, rawData) => {
                if (err) return;
                try {
                    let parsed = JSON.parse(rawData);
                    let activeScene = (parsed.scenes || []).find(s => s.id === parsed.active_scene_id) || parsed.scenes[0];
                    if (activeScene && activeScene.tokens) {
                        let tok = activeScene.tokens.find(t => t.character_id === character_id || t.id === `tok_party_${character_id}`);
                        if (tok) {
                            var step = (activeScene.grid && activeScene.grid.size_px) || 70;
                            if (direction === 'up') tok.y -= step;
                            if (direction === 'down') tok.y += step;
                            if (direction === 'left') tok.x -= step;
                            if (direction === 'right') tok.x += step;

                            fs.writeFile(scenesPath, JSON.stringify(parsed, null, 2), () => {
                                io.emit('token:moved', { scene_id: activeScene.id, token_id: tok.id, x: tok.x, y: tok.y });
                                io.emit('scene:update', activeScene);
                            });
                        }
                    }
                } catch (e) {}
            });
        }
    });

    socket.on('token:elevation', (data) => {
        const { token_id, elevation } = data;
        const scenesPath = path.join(__dirname, 'data', 'scenes.json');
        if (fs.existsSync(scenesPath)) {
            fs.readFile(scenesPath, 'utf8', (err, rawData) => {
                if (err) return;
                try {
                    let parsed = JSON.parse(rawData);
                    let activeScene = (parsed.scenes || []).find(s => s.id === parsed.active_scene_id) || parsed.scenes[0];
                    if (activeScene && activeScene.tokens) {
                        let tok = activeScene.tokens.find(t => t.id === token_id);
                        if (tok) {
                            tok.elevation = parseInt(elevation, 10) || 0;
                            fs.writeFile(scenesPath, JSON.stringify(parsed, null, 2), () => {
                                io.emit('scene:update', activeScene);
                            });
                        }
                    }
                } catch (e) {}
            });
        }
    });

    socket.on('aoe:update', (data) => {
        const scenesPath = path.join(__dirname, 'data', 'scenes.json');
        if (fs.existsSync(scenesPath)) {
            fs.readFile(scenesPath, 'utf8', (err, rawData) => {
                if (err) return;
                try {
                    let parsed = JSON.parse(rawData);
                    let activeScene = (parsed.scenes || []).find(s => s.id === (data.scene_id || parsed.active_scene_id));
                    if (activeScene) {
                        activeScene.aoe_templates = data.templates || [];
                        fs.writeFile(scenesPath, JSON.stringify(parsed, null, 2), () => {
                            io.emit('aoe:updated', data);
                        });
                    }
                } catch (e) {}
            });
        }
    });

    socket.on('dice:roll', (rollData) => {
        console.log('Dice rolled:', rollData);
        io.emit('dice:broadcast', rollData);
    });

    socket.on('measure:draw', (data) => {
        io.emit('measure:broadcast', data);
    });

    socket.on('measure:clear', () => {
        io.emit('measure:clear');
    });

    socket.on('overlay:trigger-cinematic', (data) => {
        io.emit('overlay:cinematic', data);
    });

    socket.on('disconnect', () => {
        console.log(`Socket disconnected: ${socket.id}`);
        if (socket.characterId) {
            const roomName = `player:${socket.characterId}`;
            const room = io.sockets.adapter.rooms.get(roomName);
            const stillHasClients = room && room.size > 0;
            if (!stillHasClients) {
                activeConnections.delete(socket.characterId);
                io.to('dm').emit('player-status-changed', { charId: socket.characterId, connected: false });
            }
        }
    });
});

// In-memory states
let currentEncounterState = []; // The server's memory of the battlefield
let activeCombatIndex = 0; // Index of current active turn
let activeRound = 1; // Battle Round Counter
let projectorState = {
    mapUrl: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?q=80&w=1000', // Default map
    gridScale: 50, // Pixels per grid square
    templates: [],  // Array of active AoE templates
    calibrationMode: false, // Grid alignment toggle
    fogGrid: [], // 2D array of fog state
    dayNightMode: 'Day', // Day, Dawn, Dusk, Night, Midnight
    weatherMode: 'Clear', // Clear, Heavy Rain, Heavy Snow, Sandstorm
    lightSources: {}, // tokenID -> lightRadius
    auras: {} // tokenID -> [{ radius, color, friendly }]
};

// Living Economy Simulation Memory
const econStatePath = path.join(__dirname, 'data', 'economy_state.json');
const econLogPath = path.join(__dirname, 'data', 'economy_log.json');
let economyState = { activeEvent: 'None', scarcity: {} };
let economyLog = {};

function initEconomy() {
    if (fs.existsSync(econStatePath)) {
        try { economyState = JSON.parse(fs.readFileSync(econStatePath, 'utf8')); } catch (e) {}
    } else {
        fs.writeFileSync(econStatePath, JSON.stringify(economyState, null, 2));
    }
    if (fs.existsSync(econLogPath)) {
        try { economyLog = JSON.parse(fs.readFileSync(econLogPath, 'utf8')); } catch (e) {}
    } else {
        const itemsPath = path.join(__dirname, 'data', 'magic_items.json');
        if (fs.existsSync(itemsPath)) {
            try {
                const baseItems = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));
                baseItems.forEach(item => {
                    economyLog[item.name] = [
                        Math.round(item.price * 0.95),
                        Math.round(item.price * 1.02),
                        Math.round(item.price * 0.98),
                        Math.round(item.price * 1.05),
                        item.price
                    ];
                });
            } catch (e) {}
        }
        fs.writeFileSync(econLogPath, JSON.stringify(economyLog, null, 2));
    }
}
initEconomy();

// Level-Up Sandbox Preview Approval Memory
const levelUpPath = path.join(__dirname, 'data', 'level_up_approvals.json');
let levelUpApprovals = {};
if (fs.existsSync(levelUpPath)) {
    try { levelUpApprovals = JSON.parse(fs.readFileSync(levelUpPath, 'utf8')); } catch (e) {}
}

// In-memory sound state and general backup state
let activeSoundTrigger = null;
let currentHandoutImage = null; // Current active handout image path

// ----------------------------------------------------
// API ROUTES: CORE SYSTEM & EXPORTS
// ----------------------------------------------------

// System Status Check
app.get('/api/status', (req, res) => {
    res.json({ status: 'Online', message: 'The DM Command Center is fully operational.' });
});

// Campaign JSON Backup
app.get('/api/campaign/export', (req, res) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    res.attachment('dnd-campaign-backup.zip');

    archive.on('error', (err) => {
        res.status(500).send({ error: err.message });
    });

    archive.pipe(res);

    const dataPath = path.join(__dirname, 'data');
    if (fs.existsSync(dataPath)) {
        archive.directory(dataPath, 'data');
    }

    archive.finalize();
});

// Get Campaign Notes
app.get('/api/notes', (req, res) => {
    const notesPath = path.join(__dirname, 'data', 'campaign_notes.txt');
    fs.readFile(notesPath, 'utf8', (err, data) => {
        if (err) {
            return res.json({ notes: "" });
        }
        res.json({ notes: data });
    });
});

// Save Campaign Notes
app.post('/api/notes/save', (req, res) => {
    const { notes } = req.body;
    const notesPath = path.join(__dirname, 'data', 'campaign_notes.txt');
    
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFile(notesPath, notes || "", 'utf8', (err) => {
        if (err) {
            console.error("Failed to save campaign notes:", err);
            return res.status(500).json({ error: "Failed to save campaign notes." });
        }
        res.json({ success: true, message: "Campaign notes saved successfully!" });
    });
});

// Persistent Session notes files with timestamp & round number
app.get('/api/session-scratchpad', (req, res) => {
    const scratchpadPath = path.join(__dirname, 'data', 'session_notes.json');
    fs.readFile(scratchpadPath, 'utf8', (err, data) => {
        if (err) {
            return res.json([]);
        }
        try {
            res.json(JSON.parse(data));
        } catch (e) {
            res.json([]);
        }
    });
});

app.post('/api/session-scratchpad/save', (req, res) => {
    const newNote = req.body; // { text, round, date }
    const scratchpadPath = path.join(__dirname, 'data', 'session_notes.json');
    let list = [];
    if (fs.existsSync(scratchpadPath)) {
        try {
            list = JSON.parse(fs.readFileSync(scratchpadPath, 'utf8'));
        } catch (e) {
            list = [];
        }
    }
    list.unshift({
        id: 'note_' + Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        date: newNote.date || new Date().toLocaleDateString(),
        round: newNote.round || 1,
        text: newNote.text
    });
    fs.writeFile(scratchpadPath, JSON.stringify(list, null, 2), 'utf8', (err) => {
        if (err) return res.status(500).json({ error: "Failed to write notes." });
        res.json({ success: true, notes: list });
    });
});

// ----------------------------------------------------
// API ROUTES: PLAYER HANDOUTS
// ----------------------------------------------------
app.get('/api/handout', (req, res) => {
    res.json({ handout: currentHandoutImage });
});

app.post('/api/handout', (req, res) => {
    currentHandoutImage = req.body.imagePath || null;
    io.emit('board-state-updated', {
        encounter: currentEncounterState,
        activeCombatIndex: activeCombatIndex,
        activeRound: activeRound,
        soundTrigger: activeSoundTrigger,
        handout: currentHandoutImage
    });
    res.json({ success: true, handout: currentHandoutImage });
});

// ----------------------------------------------------
// API ROUTES: SAVED ENCOUNTERS PREP
// ----------------------------------------------------
app.get('/api/saved-encounters', (req, res) => {
    const file = path.join(__dirname, 'data', 'saved_encounters.json');
    if (!fs.existsSync(file)) return res.json([]);
    fs.readFile(file, 'utf8', (err, data) => {
        if (err) return res.json([]);
        try { res.json(JSON.parse(data)); } catch(e) { res.json([]); }
    });
});

app.post('/api/saved-encounters/save', (req, res) => {
    const file = path.join(__dirname, 'data', 'saved_encounters.json');
    const newEncounter = req.body; // { name, monsters: [{ name, count, id }] }
    let list = [];
    if (fs.existsSync(file)) {
        try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e) {}
    }
    if (!Array.isArray(list)) list = [];
    list.push({ ...newEncounter, id: 'enc_' + Date.now() });
    fs.writeFile(file, JSON.stringify(list, null, 2), 'utf8', (err) => {
        if (err) return res.status(500).json({ error: "Failed to save encounter." });
        res.json({ success: true, encounters: list });
    });
});

// ----------------------------------------------------
// API ROUTES: PARTY MATRIX & LEVEL UP
// ----------------------------------------------------

// Get Party Data
app.get('/api/party', (req, res) => {
    const partyPath = getPartyPath();
    fs.readFile(partyPath, 'utf8', (err, data) => {
        if (err) {
            console.error("Error reading party data:", err);
            return res.status(500).json({ error: "Failed to read party data." });
        }
        res.json(JSON.parse(data));
    });
});

// Load and Cache Class / Subclass Data from folder data/class & data/subclass.json
let cachedClassesData = null;

function getClassesAndSubclasses() {
    if (cachedClassesData) return cachedClassesData;

    const classDir = path.join(__dirname, 'data', 'class');
    const subclassFile = path.join(__dirname, 'data', 'subclass.json');
    const classes = {};
    let subclasses = [];

    // 1. Prefer dedicated data/subclass.json file if present
    if (fs.existsSync(subclassFile)) {
        try {
            const content = JSON.parse(fs.readFileSync(subclassFile, 'utf8'));
            if (Array.isArray(content)) {
                subclasses = content;
            }
        } catch (err) {
            console.error("Error parsing data/subclass.json:", err);
        }
    }

    // 2. Load classes and fallback subclasses from data/class/*.json
    if (fs.existsSync(classDir)) {
        try {
            const files = fs.readdirSync(classDir);
            files.forEach(file => {
                if (file.startsWith('class-') && file.endsWith('.json')) {
                    const filePath = path.join(classDir, file);
                    try {
                        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                        if (content && Array.isArray(content.class)) {
                            content.class.forEach(cls => {
                                if (cls && cls.name) {
                                    classes[cls.name] = cls;
                                    if (subclasses.length === 0 && Array.isArray(cls.subclasses)) {
                                        cls.subclasses.forEach(sub => {
                                            if (sub && sub.name) {
                                                subclasses.push({
                                                    ...sub,
                                                    class: { name: cls.name }
                                                });
                                            }
                                        });
                                    }
                                }
                            });
                        }
                    } catch (err) {
                        console.error(`Error parsing class file ${file}:`, err);
                    }
                }
            });
        } catch (err) {
            console.error("Error reading classes directory:", err);
        }
    }

    // Filter out any Unearthed Arcana (UA), Playtest, or Sidekick subclass entries
    subclasses = subclasses.filter(sc => {
        if (!sc || !sc.name) return false;
        const name = sc.name;
        const source = sc.source || '';
        if (name.includes('UA') || name.includes('(UA)') || name.includes('Playtest') || name.includes('Sidekick')) {
            return false;
        }
        if (source.startsWith('UA') || source.includes('Modern') || source.includes('Mystic')) {
            return false;
        }
        return true;
    });

    cachedClassesData = { classes, subclasses };
    return cachedClassesData;
}

// Get SRD Classes
app.get('/api/classes', (req, res) => {
    const data = getClassesAndSubclasses();
    res.json(data.classes);
});

// Get SRD Subclasses
app.get('/api/subclasses', (req, res) => {
    const data = getClassesAndSubclasses();
    res.json(data.subclasses);
});

// Get SRD Wild Shapes & Familiars
app.get('/api/creatures', (req, res) => {
    const creaturesPath = path.join(__dirname, 'data', 'creatures.json');
    if (fs.existsSync(creaturesPath)) {
        res.sendFile(creaturesPath);
    } else {
        res.json({ wild_shapes: [], familiars: [] });
    }
});


// Get Pending Characters Proposed by Players
app.get('/api/pending-characters', (req, res) => {
    const pendingPath = path.join(__dirname, 'data', 'pending_characters.json');
    if (!fs.existsSync(pendingPath)) {
        fs.writeFileSync(pendingPath, '[]', 'utf8');
    }
    fs.readFile(pendingPath, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ error: "Failed to read pending characters." });
        }
        res.json(JSON.parse(data));
    });
});

// Propose a New Character from the Join Page
app.post('/api/pending-characters/propose', (req, res) => {
    const pendingPath = path.join(__dirname, 'data', 'pending_characters.json');
    const proposedChar = req.body;

    if (!proposedChar || !proposedChar.name) {
        return res.status(400).json({ error: "Invalid character data." });
    }

    if (!fs.existsSync(pendingPath)) {
        fs.writeFileSync(pendingPath, '[]', 'utf8');
    }

    fs.readFile(pendingPath, 'utf8', (err, data) => {
        let list = [];
        if (!err) {
            try { list = JSON.parse(data); } catch(e) {}
        }

        // Add proposed character
        proposedChar.id = 'char_' + Date.now();
        list.push(proposedChar);

        fs.writeFile(pendingPath, JSON.stringify(list, null, 2), (writeErr) => {
            if (writeErr) {
                return res.status(500).json({ error: "Failed to save proposal." });
            }

            // Notify DM
            io.to('dm').emit('new-character-proposed', proposedChar);

            res.json({ success: true, message: "Character proposal submitted to DM!", charId: proposedChar.id });
        });
    });
});

// Approve or reject a pending character
app.post('/api/pending-characters/resolve', (req, res) => {
    const { id, approve } = req.body;
    const pendingPath = path.join(__dirname, 'data', 'pending_characters.json');
    const partyPath = getPartyPath();

    if (!fs.existsSync(pendingPath)) {
        return res.status(404).json({ error: "No pending characters found." });
    }

    fs.readFile(pendingPath, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: "Failed to read proposals." });
        let pendingList = [];
        try { pendingList = JSON.parse(data); } catch(e) {}

        const charIdx = pendingList.findIndex(c => c.id === id);
        if (charIdx === -1) {
            return res.status(404).json({ error: "Proposed character not found." });
        }

        const chosenChar = pendingList[charIdx];

        // Remove from pending list
        pendingList.splice(charIdx, 1);

        fs.writeFile(pendingPath, JSON.stringify(pendingList, null, 2), (writeErr) => {
            if (writeErr) return res.status(500).json({ error: "Failed to update pending list." });

            if (approve) {
                // Read and add to official party
                fs.readFile(partyPath, 'utf8', (partyErr, partyData) => {
                    let party = [];
                    if (!partyErr) {
                        try { party = JSON.parse(partyData); } catch(e) {}
                    }
                    party.push(chosenChar);

                    fs.writeFile(partyPath, JSON.stringify(party, null, 2), (saveErr) => {
                        if (saveErr) return res.status(500).json({ error: "Failed to save to party." });
                        io.emit('party-updated', party);
                        res.json({ success: true, action: "approved", message: `${chosenChar.name} has joined the campaign permanently!` });
                    });
                });
            } else {
                res.json({ success: true, action: "nuked", message: `${chosenChar.name} proposal has been nuked.` });
            }
        });
    });
});

// Update & Save Full Party Matrix
app.post('/api/party/save', (req, res) => {
    const partyPath = getPartyPath();
    const newPartyData = req.body;

    if (!Array.isArray(newPartyData)) {
        return res.status(400).json({ error: "Invalid party data format. Must be an array." });
    }

    fs.writeFile(partyPath, JSON.stringify(newPartyData, null, 2), (writeErr) => {
        if (writeErr) {
            console.error("Failed to save party matrix:", writeErr);
            return res.status(500).json({ error: "Failed to save party matrix." });
        }

        // Broadcast updates to all listening rooms in real-time!
        io.to('dm').emit('party-updated', newPartyData);
        newPartyData.forEach(char => {
            io.to(`player:${char.id}`).emit('character-updated', char);
        });

        res.json({ success: true, message: "Party matrix saved successfully." });
    });
});

// Offline-First Player Sync Endpoint
app.post('/api/sync/:characterId', (req, res) => {
    const charId = req.params.characterId;
    const { pendingChanges, lastSyncTimestamp } = req.body;

    const partyPath = getPartyPath();
    const backupsDir = path.join(__dirname, 'data', 'backups');

    // Create backups directory if it doesn't exist
    if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
    }

    // Load permissions
    const permissions = getFieldPermissions();

    fs.readFile(partyPath, 'utf8', (err, partyData) => {
        if (err) return res.status(500).json({ error: "Failed to read party data." });

        let party = JSON.parse(partyData);
        const charIdx = party.findIndex(c => c.id === charId);

        if (charIdx === -1) {
            return res.status(404).json({ error: "Character not found." });
        }

        // 1. Save Pre-Merge Backup
        const backupPath = path.join(backupsDir, `party_${Date.now()}_pre_sync_${charId}.json`);
        fs.writeFileSync(backupPath, JSON.stringify(party, null, 2));

        let character = party[charIdx];
        const conflicts = [];
        const proposals = [];
        const appliedChanges = [];

        // 2. Process Pending Changes
        if (Array.isArray(pendingChanges)) {
            pendingChanges.forEach(change => {
                const field = change.field;
                const permission = permissions[field] || 'player'; // Default to player if unspecified

                if (permission === 'dm') {
                    // Rejected outright
                    console.log(`[Sync] Change rejected (DM-only field): ${field}`);
                } else if (permission === 'dm-confirm') {
                    // Proposed change - store in a "proposals" sub-object for DM approval
                    if (!character.proposals) character.proposals = {};
                    character.proposals[field] = change.newValue;
                    proposals.push({ field, value: change.newValue });
                } else {
                    // Player field: Check for Strict Manual Conflicts
                    const currentValue = character[field];
                    const playerOldValue = change.oldValue;

                    const stringifyIfObject = (val) => (typeof val === 'object' && val !== null) ? JSON.stringify(val) : val;
                    const curStr = stringifyIfObject(currentValue);
                    const oldStr = stringifyIfObject(playerOldValue);
                    const newStr = stringifyIfObject(change.newValue);

                    if (curStr === newStr) {
                        // Already in agreement (e.g. updated via socket first or duplicate sync). Safe!
                        appliedChanges.push({ field, value: change.newValue });
                    } else if (currentValue !== undefined && curStr !== oldStr) {
                        // True conflict (DM or other client edited it to a different value in the meantime)
                        conflicts.push({
                            field: field,
                            dmValue: currentValue,
                            playerValue: change.newValue
                        });
                        console.log(`[Sync Conflict] Conflict on ${field} for ${character.name}: DM=${JSON.stringify(currentValue)}, Player=${JSON.stringify(change.newValue)}`);
                    } else {
                        // Safe merge
                        character[field] = change.newValue;
                        appliedChanges.push({ field, value: change.newValue });
                    }
                }
            });
        }

        party[charIdx] = character;

        // 3. Write back merged data
        fs.writeFile(partyPath, JSON.stringify(party, null, 2), (writeErr) => {
            if (writeErr) {
                console.error("Failed to write synced party:", writeErr);
                return res.status(500).json({ error: "Failed to write synced party data." });
            }

            // Real-time broadcasts
            io.to('dm').emit('party-updated', party);
            io.to(`player:${charId}`).emit('character-updated', character);

            // Notify DM Console of Sync Event
            io.to('dm').emit('player-synced', {
                charId: charId,
                name: character.name,
                appliedCount: appliedChanges.length,
                changes: appliedChanges,
                conflicts: conflicts,
                proposals: proposals
            });

            res.json({
                success: true,
                character: character,
                conflicts: conflicts,
                proposals: proposals
            });
        });
    });
});

// Approve Player Level Up Audit Endpoint
app.post('/api/party/approve-level/:charId', (req, res) => {
    const { charId } = req.params;
    const partyPath = getPartyPath();

    fs.readFile(partyPath, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: "Failed to read party data." });
        let party = JSON.parse(data);
        const charIdx = party.findIndex(c => c.id === charId);

        if (charIdx === -1) {
            return res.status(404).json({ error: "Character not found." });
        }

        party[charIdx].level_up_audit = false;
        if (party[charIdx].unapproved_level) {
            delete party[charIdx].unapproved_level;
        }

        fs.writeFile(partyPath, JSON.stringify(party, null, 2), (writeErr) => {
            if (writeErr) return res.status(500).json({ error: "Failed to save updated party data." });
            
            // Broadcast the approved level change in real-time
            io.emit('party-updated', party);
            io.to(`player:${charId}`).emit('character-updated', party[charIdx]);
            
            res.json({ success: true, message: "Level up successfully audited and approved." });
        });
    });
});

// Get Feat Compendium
app.get('/api/feats', (req, res) => {
    const featsPath = path.join(__dirname, 'data', 'feats.json');
    fs.readFile(featsPath, 'utf8', (err, data) => {
        if (err) {
            return res.json([]);
        }
        res.json(JSON.parse(data));
    });
});

// Level Up Wizard Endpoint
app.post('/api/party/levelup', (req, res) => {
    const { id, hpIncrease, newFeat, increaseStatKey, increaseStatVal } = req.body;
    const partyPath = getPartyPath();

    fs.readFile(partyPath, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: "Failed to read database." });
        
        let party = JSON.parse(data);
        const charIndex = party.findIndex(c => c.id === id);

        if (charIndex === -1) {
            return res.status(404).json({ error: "Character not found." });
        }

        // Apply HP Increase
        party[charIndex].hp += parseInt(hpIncrease || 0);
        
        // Level Up!
        party[charIndex].level += 1;

        if (!party[charIndex].magic_items) party[charIndex].magic_items = [];
        if (!party[charIndex].secrets) party[charIndex].secrets = "";

        // Add Feat
        if (newFeat) {
            if (!party[charIndex].feats) party[charIndex].feats = [];
            if (!party[charIndex].feats.includes(newFeat)) {
                party[charIndex].feats.push(newFeat);
            }
        }

        // Apply ASI
        if (increaseStatKey && increaseStatVal) {
            if (!party[charIndex].stats) {
                party[charIndex].stats = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
            }
            party[charIndex].stats[increaseStatKey.toLowerCase()] = 
                (parseInt(party[charIndex].stats[increaseStatKey.toLowerCase()] || 10)) + parseInt(increaseStatVal);
            
            if (increaseStatKey.toLowerCase() === 'wis') {
                const wisMod = Math.floor((party[charIndex].stats.wis - 10) / 2);
                party[charIndex].passives.perception = 10 + wisMod;
                party[charIndex].passives.insight = 10 + wisMod;
            }
        }

        fs.writeFile(partyPath, JSON.stringify(party, null, 2), (writeErr) => {
            if (writeErr) return res.status(500).json({ error: "Failed to save character level up." });
            res.json({ success: true, message: `${party[charIndex].name} leveled up successfully!` });
        });
    });
});

// Update Secrets Drawer for Character
app.post('/api/party/secrets', (req, res) => {
    const { id, secrets } = req.body;
    const partyPath = getPartyPath();

    fs.readFile(partyPath, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: "Failed to read database." });
        
        let party = JSON.parse(data);
        const charIndex = party.findIndex(c => c.id === id);

        if (charIndex === -1) {
            return res.status(404).json({ error: "Character not found." });
        }

        party[charIndex].secrets = secrets;

        fs.writeFile(partyPath, JSON.stringify(party, null, 2), (writeErr) => {
            if (writeErr) return res.status(500).json({ error: "Failed to save character secrets." });
            res.json({ success: true, message: "Secrets updated." });
        });
    });
});

// Approve All Player Sync Proposals at once
app.post('/api/proposals/approve-all', (req, res) => {
    const partyPath = getPartyPath();
    if (!fs.existsSync(partyPath)) {
        return res.status(404).json({ error: "Party database not found." });
    }

    try {
        const party = JSON.parse(fs.readFileSync(partyPath, 'utf8'));
        let proposalsApproved = 0;

        party.forEach(character => {
            if (character.proposals) {
                const fields = Object.keys(character.proposals);
                fields.forEach(field => {
                    character[field] = character.proposals[field];
                    proposalsApproved++;
                });
                delete character.proposals;
            }
        });

        fs.writeFileSync(partyPath, JSON.stringify(party, null, 2), 'utf8');
        io.emit('party-updated', party); // broadcast to everyone

        res.json({
            success: true,
            message: `Successfully approved and committed all ${proposalsApproved} player sync proposals across the entire party!`,
            count: proposalsApproved
        });
    } catch(e) {
        res.status(500).json({ error: "Failed to approve all proposals.", details: e.message });
    }
});


// ----------------------------------------------------
// API ROUTES: COMBAT TRACKER & CINEMATIC BROADCAST
// ----------------------------------------------------

// Update Battle Board State (DM Console sends updates here)
app.post('/api/update-board', (req, res) => {
    currentEncounterState = req.body;
    syncEncounterToParty(currentEncounterState);
    io.emit('board-state-updated', {
        encounter: currentEncounterState,
        activeCombatIndex: activeCombatIndex,
        activeRound: activeRound,
        soundTrigger: activeSoundTrigger,
        handout: currentHandoutImage
    });
    res.json({ success: true, message: "Board updated." });
});

// Reset Combat Rounds
app.post('/api/combat/reset-round', (req, res) => {
    activeRound = 1;
    activeCombatIndex = 0;
    io.emit('board-state-updated', {
        encounter: currentEncounterState,
        activeCombatIndex: activeCombatIndex,
        activeRound: activeRound,
        soundTrigger: activeSoundTrigger,
        handout: currentHandoutImage
    });
    res.json({ success: true, message: "Rounds reset.", activeRound, activeCombatIndex });
});

// Get Battle Board State
app.get('/api/board-state', (req, res) => {
    res.json({
        encounter: currentEncounterState,
        activeCombatIndex: activeCombatIndex,
        activeRound: activeRound,
        soundTrigger: activeSoundTrigger,
        handout: currentHandoutImage
    });
});

// ----------------------------------------------------
// API ROUTES: DOWNTIME PROJECTS & REFERENCE DATA
// ----------------------------------------------------

// ----------------------------------------------------
// API ROUTES: DOWNTIME PROJECTS & REFERENCE DATA
// ----------------------------------------------------

// Get Reference reference JSON helper files
app.get('/api/reference/:fileName', (req, res) => {
    const file = req.params.fileName + '.json';
    let refPath;
    try {
        refPath = safeJoin(__dirname, 'data', file);
    } catch (e) {
        return res.status(400).json({ error: e.message });
    }
    if (!fs.existsSync(refPath)) return res.json({});
    fs.readFile(refPath, 'utf8', (err, data) => {
        if (err) return res.json({});
        try {
            res.json(JSON.parse(data));
        } catch (e) {
            res.json({});
        }
    });
});

// Save Reference JSON helper files back (for generic save updates on state)
app.post('/api/reference/save/:fileName', (req, res) => {
    const file = req.params.fileName + '.json';
    let refPath;
    try {
        refPath = safeJoin(__dirname, 'data', file);
    } catch (e) {
        return res.status(400).json({ error: e.message });
    }
    fs.writeFile(refPath, JSON.stringify(req.body, null, 2), 'utf8', (err) => {
        if (err) return res.status(500).json({ error: "Failed to write file." });
        res.json({ success: true });
    });
});

// Get Downtime Projects
app.get('/api/downtime', (req, res) => {
    const dtPath = path.join(__dirname, 'data', 'downtime.json');
    fs.readFile(dtPath, 'utf8', (err, data) => {
        if (err) {
            return res.json([]);
        }
        res.json(JSON.parse(data));
    });
});

// Get Bulk Monster Bestiary Files - Handled by monstersRouter via dataCache

// Update Downtime Projects (The Grinding Mechanic)
app.post('/api/downtime/update', (req, res) => {
    const { id, pointsToAdd } = req.body;
    const dtPath = path.join(__dirname, 'data', 'downtime.json');

    fs.readFile(dtPath, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: "Failed to read database." });
        
        let dtData = JSON.parse(data);
        const projectIndex = dtData.findIndex(p => p.id === id);
        
        if (projectIndex !== -1) {
            dtData[projectIndex].current_points += pointsToAdd;
            if (dtData[projectIndex].current_points > dtData[projectIndex].max_points) {
                dtData[projectIndex].current_points = dtData[projectIndex].max_points;
            }
            if (dtData[projectIndex].current_points < 0) {
                dtData[projectIndex].current_points = 0;
            }
            
            fs.writeFile(dtPath, JSON.stringify(dtData, null, 2), (writeErr) => {
                if (writeErr) return res.status(500).json({ error: "Failed to save progress." });
                res.json({ success: true, message: "Progress logged." });
            });
        } else {
            res.status(404).json({ error: "Project not found." });
        }
    });
});

// Add New Downtime Project
app.post('/api/downtime/add', (req, res) => {
    const { character, project, max_points } = req.body;
    const dtPath = path.join(__dirname, 'data', 'downtime.json');

    fs.readFile(dtPath, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: "Failed to read database." });

        let dtData = JSON.parse(data);

        const newProject = {
            id: 'dt_' + Date.now(),
            character: character,
            project: project,
            current_points: 0,
            max_points: parseInt(max_points)
        };

        dtData.push(newProject);

        fs.writeFile(dtPath, JSON.stringify(dtData, null, 2), (writeErr) => {
            if (writeErr) return res.status(500).json({ error: "Failed to save new project." });
            res.json({ success: true, message: "Project added." });
        });
    });
});

// ----------------------------------------------------
// SMART INGESTION PIPELINE (TEXT, MD, JSON FORMATTERS)
// ----------------------------------------------------

function ensureDirExists(filePath) {
    const dirname = path.dirname(filePath);
    if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true });
    }
}

function appendToJsonFile(filePath, newData) {
    ensureDirExists(filePath);
    let list = [];
    if (fs.existsSync(filePath)) {
        try {
            const content = fs.readFileSync(filePath, 'utf8').trim();
            if (content) {
                list = JSON.parse(content);
                if (!Array.isArray(list)) {
                    list = [list];
                }
            }
        } catch (e) {
            list = [];
        }
    }
    list.push(newData);
    fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf8');
}

function writeSpellMarkdown(folderPath, name, content) {
    const slug = name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    const fileName = `${slug || 'unknown-spell'}.md`;
    const filePath = path.join(folderPath, fileName);
    ensureDirExists(filePath);
    fs.writeFileSync(filePath, content, 'utf8');
    return filePath;
}

// Fuzzy Property Extractor for chaotic JSON keys
function getFuzzyProp(obj, ...keys) {
    if (!obj || typeof obj !== 'object') return undefined;
    const normalizedMap = {};
    for (const k of Object.keys(obj)) {
        const norm = k.toLowerCase().replace(/[\s_\-]/g, '');
        if (!(norm in normalizedMap)) {
            normalizedMap[norm] = k;
        }
    }
    for (const key of keys) {
        const normKey = key.toLowerCase().replace(/[\s_\-]/g, '');
        if (normKey in normalizedMap) {
            return obj[normalizedMap[normKey]];
        }
    }
    return undefined;
}

// Helper to strip HTML tags and pull D&D Beyond description paragraphs
function parseHTMLSection(html) {
    const items = [];
    if (!html || typeof html !== 'string') return items;

    const paragraphs = html.split(/<\/p>\s*<p>|<br\s*\/?>/gi);
    paragraphs.forEach(p => {
        let content = p.replace(/<p>|<\/p>/gi, '').trim();
        if (!content) return;

        const nameMatch = content.match(/^(?:<strong><em>|<em><strong>|<strong>|<em>)?([A-Za-z0-9\s,\-()'/]+?)(?:\.<\/strong><\/em>|\.<\/em><\/strong>|\.<\/strong>|\.<\/em>|\*\*\.|\.|\s*-\s*|:)(.*)/i);
        if (nameMatch) {
            const name = nameMatch[1].replace(/<[^>]+>/g, '').trim();
            const description = nameMatch[2].replace(/<[^>]+>/g, '').trim();
            items.push({ name, desc: description });
        } else {
            const text = content.replace(/<[^>]+>/g, '').trim();
            if (text) {
                if (items.length > 0) {
                    items[items.length - 1].desc += ' ' + text;
                } else {
                    items.push({ name: 'Detail', desc: text });
                }
            }
        }
    });

    return items;
}

function classifyText(text) {
    let monsterScore = 0;
    let spellScore = 0;
    let playerScore = 0;
    let itemScore = 0;

    const lowerText = text.toLowerCase();

    if (/\b(?:armor class|ac)\b/i.test(lowerText)) monsterScore += 3;
    if (/\b(?:hit points|hp)\b/i.test(lowerText)) monsterScore += 3;
    if (/\b(?:challenge rating|cr|challenge)\b/i.test(lowerText)) monsterScore += 3;
    if (/\bspeed\b/i.test(lowerText)) monsterScore += 1;
    if (/\benses\b/i.test(lowerText)) monsterScore += 1;
    if (/\bstr\s+\d+\s*\(/i.test(lowerText) || /\bstr\s+\(\d+\)/i.test(lowerText) || /\bstr_mod\b/i.test(lowerText)) monsterScore += 4;
    if (/\b(?:actions|legendary actions|reactions|traits)\b/i.test(lowerText)) monsterScore += 3;

    if (/\b(?:casting time|casting-time)\b/i.test(lowerText)) spellScore += 4;
    if (/\b(?:range)\b/i.test(lowerText) && /\b(?:components|duration)\b/i.test(lowerText)) spellScore += 4;
    if (/\b(?:duration)\b/i.test(lowerText)) spellScore += 2;
    if (/\b(?:components)\b/i.test(lowerText)) spellScore += 2;
    if (/\b(?:abjuration|conjuration|divination|enchantment|evocation|illusion|necromancy|transmutation)\b/i.test(lowerText)) spellScore += 3;
    if (/\b(?:\d+(?:st|nd|rd|th)-level|level\s+\d+\s+spell|cantrip)\b/i.test(lowerText)) spellScore += 3;

    if (/\b(?:class\s*&\s*level|class\s+and\s+level)\b/i.test(lowerText)) playerScore += 5;
    if (/\b(?:passive wisdom|passive perception)\b/i.test(lowerText)) playerScore += 4;
    if (/\b(?:background|race|subclass)\b/i.test(lowerText)) playerScore += 2;
    if (/\b(?:proficiency bonus)\b/i.test(lowerText)) playerScore += 3;
    if (/\b(?:initiative|saving throws|skills|character sheet)\b/i.test(lowerText)) playerScore += 2;
    if (/\b(?:experience points|xp)\b/i.test(lowerText) && !/\bchallenge\b/i.test(lowerText)) playerScore += 2;

    if (/\b(?:rarity)\b/i.test(lowerText)) itemScore += 3;
    if (/\b(?:uncommon|rare|very rare|legendary|artifact)\b/i.test(lowerText)) {
        if (!/\b(?:casting time|challenge rating|armor class)\b/i.test(lowerText)) {
            itemScore += 3;
        } else {
            itemScore += 1;
        }
    }
    if (/\b(?:\d+[\s,]*(?:gp|sp|cp|gold pieces))\b/i.test(lowerText)) itemScore += 2;
    if (/\b(?:wondrous item|attunement|requires attunement)\b/i.test(lowerText)) itemScore += 4;

    const scores = [
        { type: 'monster', score: monsterScore },
        { type: 'spell', score: spellScore },
        { type: 'player', score: playerScore },
        { type: 'magic_item', score: itemScore }
    ];

    scores.sort((a, b) => b.score - a.score);

    if (scores[0].score < 2) {
        try {
            const parsed = JSON.parse(text);
            if (getFuzzyProp(parsed, 'ac', 'armorclass') || getFuzzyProp(parsed, 'hp', 'hitpoints') || getFuzzyProp(parsed, 'actions') || getFuzzyProp(parsed, 'challenge', 'cr')) return 'monster';
            if (getFuzzyProp(parsed, 'level') && getFuzzyProp(parsed, 'school') && getFuzzyProp(parsed, 'castingtime')) return 'spell';
            if (getFuzzyProp(parsed, 'class') || getFuzzyProp(parsed, 'race') || getFuzzyProp(parsed, 'passiveperception')) return 'player';
            if (getFuzzyProp(parsed, 'rarity') || getFuzzyProp(parsed, 'cost', 'price') || getFuzzyProp(parsed, 'attunement')) return 'magic_item';
        } catch (e) {}
    }

    return scores[0].type;
}

function parseMonster(text) {
    let json = null;
    try {
        json = JSON.parse(text);
    } catch (e) {}

    if (json && typeof json === 'object') {
        const name = getFuzzyProp(json, 'name') || "Unknown Monster";
        const meta = getFuzzyProp(json, 'meta') || '';
        
        let size = getFuzzyProp(json, 'size') || "Medium";
        let type = getFuzzyProp(json, 'type') || "humanoid";
        let alignment = getFuzzyProp(json, 'alignment') || "any alignment";

        if (meta && typeof meta === 'string') {
            const metaMatch = meta.match(/(Tiny|Small|Medium|Large|Huge|Gargantuan)\s+([a-z\s\-]+?)\s*(?:\(([^)]+)\))?\s*,\s*([a-z\s\-]+)/i);
            if (metaMatch) {
                size = metaMatch[1].trim();
                type = metaMatch[2].trim() + (metaMatch[3] ? ` (${metaMatch[3]})` : '');
                alignment = metaMatch[4].trim();
            }
        }

        const acRaw = getFuzzyProp(json, 'armorclass', 'ac') || "10";
        const hpRaw = getFuzzyProp(json, 'hitpoints', 'hp') || "10";
        const speed = getFuzzyProp(json, 'speed') || "30 ft.";

        const stats = {
            str: parseInt(getFuzzyProp(json, 'str') || 10, 10),
            dex: parseInt(getFuzzyProp(json, 'dex') || 10, 10),
            con: parseInt(getFuzzyProp(json, 'con') || 10, 10),
            int: parseInt(getFuzzyProp(json, 'int') || 10, 10),
            wis: parseInt(getFuzzyProp(json, 'wis') || 10, 10),
            cha: parseInt(getFuzzyProp(json, 'cha') || 10, 10)
        };

        const savesRaw = getFuzzyProp(json, 'savingthrows', 'saves') || '';
        const savingThrows = Array.isArray(savesRaw) ? savesRaw : (savesRaw ? String(savesRaw).split(',').map(s => s.trim()) : []);

        const skillsRaw = getFuzzyProp(json, 'skills') || '';
        const skills = Array.isArray(skillsRaw) ? skillsRaw : (skillsRaw ? String(skillsRaw).split(',').map(s => s.trim()) : []);

        const senses = getFuzzyProp(json, 'senses') || "passive Perception 10";
        const languages = getFuzzyProp(json, 'languages') || "common";
        const crRaw = getFuzzyProp(json, 'challengerating', 'cr', 'challenge') || "0";

        const abilitiesRaw = getFuzzyProp(json, 'traits', 'abilities', 'specialabilities') || '';
        const abilities = Array.isArray(abilitiesRaw) ? abilitiesRaw : parseHTMLSection(abilitiesRaw);

        const actionsRaw = getFuzzyProp(json, 'actions') || '';
        const actions = Array.isArray(actionsRaw) ? actionsRaw : parseHTMLSection(actionsRaw);

        const legendaryRaw = getFuzzyProp(json, 'legendaryactions') || '';
        const legendaryActions = Array.isArray(legendaryRaw) ? legendaryRaw : parseHTMLSection(legendaryRaw);

        return {
            id: 'mon_' + Date.now(),
            name,
            size,
            type,
            alignment,
            ac: parseInt(acRaw, 10) || 10,
            hp: parseInt(hpRaw, 10) || 10,
            speed,
            stats,
            savingThrows,
            skills,
            senses,
            languages,
            challengeRating: String(crRaw),
            abilities,
            actions,
            legendaryActions,
            legendary_actions: getFuzzyProp(json, 'legendary_actions') || (legendaryActions.length > 0 ? 3 : 0),
            legendary_resistances: getFuzzyProp(json, 'legendary_resistances') || (text.includes("Legendary Resistance") ? 3 : 0)
        };
    }

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const data = {
        id: 'mon_' + Date.now(),
        name: "Unknown Monster",
        size: "Medium",
        type: "humanoid",
        alignment: "any alignment",
        ac: 10,
        hp: 10,
        speed: "30 ft.",
        stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        savingThrows: [],
        skills: [],
        senses: "passive Perception 10",
        languages: "common",
        challengeRating: "0",
        abilities: [],
        actions: [],
        legendaryActions: [],
        legendary_actions: 0,
        legendary_resistances: 0
    };

    if (lines.length > 0) {
        data.name = lines[0].replace(/[#*_\-[\]]/g, '').trim();
    }

    const sizeTypeAlignRegex = /(Tiny|Small|Medium|Large|Huge|Gargantuan)\s+([a-z\s\-]+?)\s*(?:\(([^)]+)\))?\s*,\s*([a-z\s\-]+)/i;
    const matchSize = text.match(sizeTypeAlignRegex);
    if (matchSize) {
        data.size = matchSize[1].trim();
        data.type = matchSize[2].trim() + (matchSize[3] ? ` (${matchSize[3]})` : '');
        data.alignment = matchSize[4].trim();
    }

    const acMatch = text.match(/(?:Armor Class|AC)\s*[:*-]*\s*(\d+)/i);
    if (acMatch) {
        data.ac = parseInt(acMatch[1], 10);
    }

    const hpMatch = text.match(/(?:Hit Points|HP)\s*[:*-]*\s*(\d+)/i);
    if (hpMatch) {
        data.hp = parseInt(hpMatch[1], 10);
    }

    const speedMatch = text.match(/Speed\s*[:*-]*\s*([^\n]+)/i);
    if (speedMatch) {
        data.speed = speedMatch[1].trim();
    }

    const statNames = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
    statNames.forEach(stat => {
        const reg = new RegExp(`\\b${stat}\\b\\s*[:*-]*\\s*(\\d+)`, 'i');
        const m = text.match(reg);
        if (m) {
            data.stats[stat] = parseInt(m[1], 10);
        }
    });

    const tableStatsMatch = text.match(/(?:STR|DEX|CON|INT|WIS|CHA)[\s|]+(?:STR|DEX|CON|INT|WIS|CHA)[^\n]*\n+([^\n]+)/i);
    if (tableStatsMatch) {
        const numbers = tableStatsMatch[1].match(/\b(\d+)\s*(?:\(([-+]\d+)\))?/g);
        if (numbers && numbers.length >= 6) {
            statNames.forEach((stat, idx) => {
                const val = parseInt(numbers[idx], 10);
                if (!isNaN(val)) {
                    data.stats[stat] = val;
                }
            });
        }
    }

    if (text.includes("Legendary Resistance")) {
        data.legendary_resistances = 3;
    }

    let currentSection = 'abilities';
    
    lines.forEach((line, index) => {
        if (index === 0 || line.match(/^(Tiny|Small|Medium|Large|Huge|Gargantuan)/i)) return;
        if (line.match(/^(Armor Class|AC|Hit Points|HP|Speed|STR|DEX|CON|INT|WIS|CHA|Saving Throws|Saves|Skills|Senses|Languages|Challenge|CR)/i)) return;
        if (line.match(/^\d+\s*\([-+]\d+\)/) || line.match(/^[|\s]*(?:STR|DEX|CON|INT|WIS|CHA)[|\s]*$/i)) return;

        if (line.match(/^Actions\s*$/i) || line.match(/^##+\s*Actions/i) || line.match(/^\*\*Actions\*\*/i)) {
            currentSection = 'actions';
            return;
        }
        if (line.match(/^Legendary Actions\s*$/i) || line.match(/^##+\s*Legendary Actions/i) || line.match(/^\*\*Legendary Actions\*\*/i)) {
            currentSection = 'legendaryActions';
            data.legendary_actions = 3;
            return;
        }

        const itemMatch = line.match(/^(?:\*\*|\*|__)?([A-Z][A-Za-z0-9\s,\-()]+)(?:\*\*|\*|__)?\s*[:.]\s*(.*)$/);
        if (itemMatch) {
            const name = itemMatch[1].trim();
            const description = itemMatch[2].trim();
            const item = { name, desc: description };
            if (currentSection === 'legendaryActions') {
                data.legendaryActions.push(item);
            } else {
                data.actions.push(item);
            }
        } else {
            const list = currentSection === 'legendaryActions' ? data.legendaryActions : data.actions;
            if (list.length > 0) {
                list[list.length - 1].desc += ' ' + line;
            }
        }
    });

    return data;
}

function parseSpell(text) {
    let json = null;
    try {
        json = JSON.parse(text);
    } catch (e) {}

    let name = "Unknown Spell";
    let level = "Cantrip";
    let school = "Universal";
    let castingTime = "1 action";
    let range = "Self";
    let components = "V, S";
    let duration = "Instantaneous";
    let description = "";

    if (json && typeof json === 'object') {
        name = json.name || name;
        level = json.level !== undefined ? String(json.level) : level;
        school = json.school || school;
        castingTime = json.castingTime || json.casting_time || castingTime;
        range = json.range || range;
        components = json.components || components;
        duration = json.duration || duration;
        description = json.description || json.desc || "";
    } else {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length > 0) {
            name = lines[0].replace(/[#*_\-[\]]/g, '').trim();
        }

        const levelSchoolRegex = /(?:(\d+)(?:st|nd|rd|th)-level\s+(\w+)|(\w+)\s+cantrip|level\s+(\d+)\s+(\w+))/i;
        const matchLS = text.match(levelSchoolRegex);
        if (matchLS) {
            if (matchLS[3]) {
                level = "Cantrip";
                school = matchLS[3];
            } else if (matchLS[1]) {
                level = matchLS[1];
                school = matchLS[2];
            } else if (matchLS[4]) {
                level = matchLS[4];
                school = matchLS[5];
            }
        }

        const ctMatch = text.match(/Casting Time\s*[:*-]*\s*([^\n]+)/i);
        if (ctMatch) castingTime = ctMatch[1].trim();

        const rangeMatch = text.match(/Range\s*[:*-]*\s*([^\n]+)/i);
        if (rangeMatch) range = rangeMatch[1].trim();

        const compMatch = text.match(/Components\s*[:*-]*\s*([^\n]+)/i);
        if (compMatch) components = compMatch[1].trim();

        const durMatch = text.match(/Duration\s*[:*-]*\s*([^\n]+)/i);
        if (durMatch) duration = durMatch[1].trim();

        description = lines.filter((line, idx) => {
            if (idx === 0) return false;
            if (line.match(/^(Casting Time|Range|Components|Duration|Level|School)/i)) return false;
            if (line.match(levelSchoolRegex)) return false;
            return true;
        }).join('\n\n');
    }

    const markdown = `---
name: "${name}"
level: ${level === "Cantrip" ? 0 : parseInt(level) || 1}
school: "${school}"
casting_time: "${castingTime}"
range: "${range}"
components: "${components}"
duration: "${duration}"
---

## Description
${description}
`;

    return {
        structured: { name, level, school, castingTime, range, components, duration, description },
        markdown
    };
}

function parsePlayer(text) {
    try {
        const json = JSON.parse(text);
        if (json && typeof json === 'object') {
            return {
                id: 'char_' + Date.now(),
                name: json.name || "Unknown Hero",
                class: json.class || "Adventurer",
                race: json.race || "Human",
                level: parseInt(json.level || json.lvl || 1, 10),
                hp: parseInt(json.hp || json.hitPoints || 30, 10),
                ac: parseInt(json.ac || json.armorClass || 10, 10),
                passives: json.passives || {
                    perception: parseInt(json.passivePerception || json.passive || 10, 10),
                    insight: 10,
                    investigation: 10
                },
                magic_items: Array.isArray(json.magic_items) ? json.magic_items : (Array.isArray(json.magicItems) ? json.magicItems : []),
                secrets: json.secrets || "",
                art: json.art || "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?q=80&w=400",
                stats: json.stats || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
                spell_slots: json.spell_slots || [0, 2, 0, 0, 0, 0], // Lvl 0 to 5 max slots
                current_slots: json.current_slots || [0, 2, 0, 0, 0, 0], // Lvl 0 to 5 current
                resources: json.resources || [] // generic class resource tracking
            };
        }
    } catch (e) {}

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const data = {
        id: 'char_' + Date.now(),
        name: "Unknown Hero",
        class: "Adventurer",
        race: "Human",
        level: 1,
        hp: 30,
        ac: 10,
        passives: { perception: 10, insight: 10, investigation: 10 },
        magic_items: [],
        secrets: "",
        art: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?q=80&w=400",
        stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        spell_slots: [0, 2, 0, 0, 0, 0],
        current_slots: [0, 2, 0, 0, 0, 0],
        resources: []
    };

    if (lines.length > 0) {
        data.name = lines[0].replace(/[#*_\-[\]]/g, '').trim();
    }

    const classLevelRegex = /(?:Class|Class & Level)\s*[:*-]*\s*([A-Za-z]+)\s*(?:Level)?\s*(\d+)?/i;
    const clMatch = text.match(classLevelRegex);
    if (clMatch) {
        data.class = clMatch[1].trim();
        if (clMatch[2]) data.level = parseInt(clMatch[2], 10);
    }

    const raceMatch = text.match(/Race\s*[:*-]*\s*([A-Za-z]+)/i);
    if (raceMatch) {
        data.race = raceMatch[1].trim();
    }

    const passiveMatch = text.match(/(?:Passive Wisdom|Passive Perception|Passive)\s*[:*-]*\s*(\d+)/i);
    if (passiveMatch) {
        data.passives.perception = parseInt(passiveMatch[1], 10);
    }

    const hpMatch = text.match(/(?:Hit Points|HP)\s*[:*-]*\s*(\d+)/i);
    if (hpMatch) {
        data.hp = parseInt(hpMatch[1], 10);
    }

    const acMatch = text.match(/(?:Armor Class|AC)\s*[:*-]*\s*(\d+)/i);
    if (acMatch) {
        data.ac = parseInt(acMatch[1], 10);
    }

    const statNames = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
    statNames.forEach(stat => {
        const reg = new RegExp(`\\b${stat}\\b\\s*[:*-]*\\s*(\\d+)`, 'i');
        const m = text.match(reg);
        if (m) {
            data.stats[stat] = parseInt(m[1], 10);
        }
    });

    return data;
}

function parseMagicItem(text) {
    try {
        const json = JSON.parse(text);
        if (json && typeof json === 'object') {
            return {
                name: json.name || "Unknown Magic Item",
                price: parseInt(json.price || json.cost || 100, 10),
                rarity: json.rarity || "uncommon",
                type: json.type || "Wondrous Item",
                requires_attunement: json.requires_attunement || false,
                properties: json.properties || ""
            };
        }
    } catch (e) {}

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const data = {
        name: "Unknown Magic Item",
        price: 100,
        rarity: "uncommon",
        type: "Wondrous Item",
        requires_attunement: false,
        properties: ""
    };

    if (lines.length > 0) {
        data.name = lines[0].replace(/[#*_\-[\]]/g, '').trim();
    }

    const rarityMatch = text.match(/\b(common|uncommon|rare|very rare|legendary|artifact)\b/i);
    if (rarityMatch) {
        data.rarity = rarityMatch[1].toLowerCase();
    }

    const costMatch = text.match(/(?:Cost|Price|Value)\s*[:*-]*\s*(\d+)/i);
    if (costMatch) {
        data.price = parseInt(costMatch[1], 10);
    } else {
        const gpMatch = text.match(/(\d+)\s*(?:gp|gold)/i);
        if (gpMatch) data.price = parseInt(gpMatch[1], 10);
    }

    if (text.toLowerCase().includes("requires attunement")) {
        data.requires_attunement = true;
    }

    return data;
}

app.post('/api/ingest/parse-text', (req, res) => {
    let text = '';
    if (typeof req.body === 'string') {
        text = req.body;
    } else if (req.body && typeof req.body === 'object') {
        text = req.body.text || req.body.payload || req.body.raw || JSON.stringify(req.body);
    }

    if (!text || text.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'No text provided.' });
    }

    const type = classifyText(text);
    let resultData = null;
    let savePath = '';

    try {
        if (type === 'monster') {
            resultData = parseMonster(text);
            savePath = path.join(__dirname, 'data', 'monsters', 'beastiary.json');
            appendToJsonFile(savePath, resultData);
        } else if (type === 'spell') {
            const spellInfo = parseSpell(text);
            resultData = spellInfo.structured;
            const savedFilePath = writeSpellMarkdown(
                path.join(__dirname, 'data', 'spells'),
                spellInfo.structured.name,
                spellInfo.markdown
            );
            savePath = path.relative(__dirname, savedFilePath);
        } else if (type === 'player') {
            resultData = parsePlayer(text);
            savePath = getPartyPath();
            appendToJsonFile(savePath, resultData);
        } else if (type === 'magic_item') {
            resultData = parseMagicItem(text);
            savePath = path.join(__dirname, 'data', 'magic_items.json');
            appendToJsonFile(savePath, resultData);
        }

        const relativeSavePath = path.isAbsolute(savePath) ? path.relative(__dirname, savePath) : savePath;

        return res.status(200).json({
            success: true,
            detected: type,
            savedTo: relativeSavePath.replace(/\\/g, '/'),
            data: resultData
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            error: 'An error occurred during smart parsing.',
            details: error.message
        });
    }
});

// Helper to convert copper pieces (cp) from items.json to dynamic gold equivalent (gp)
// "Convert copper to gold (value/100), and any leftover convert to silver (value/10). any additional left over round up to nearest silver"
function convertCpToGpPrice(cpValue) {
    if (!cpValue) return 0;
    if (typeof cpValue === 'string') return cpValue;
    const gold = Math.floor(cpValue / 100);
    const leftoverCp = cpValue % 100;
    const silver = Math.ceil(leftoverCp / 10);
    return gold + (silver / 10);
}

// Helper to calculate adjusted prices based on macroeconomic events and scarcity
function getAdjustedPrice(item) {
    let price = item.price || 0;
    if (item.value !== undefined) {
        price = convertCpToGpPrice(item.value);
    }
    let mult = 1.0;
    
    // Scarcity adjustment from Living Economy State
    if (economyState && economyState.scarcity && economyState.scarcity[item.name]) {
        mult *= economyState.scarcity[item.name];
    }
    
    // Active Macro Event adjustments
    if (economyState && economyState.activeEvent === "War Breaks Out") {
        const lower = item.name.toLowerCase();
        if (lower.includes('armor') || lower.includes('sword') || lower.includes('shield') || lower.includes('weapon') || lower.includes('glaive') || lower.includes('+1')) {
            mult *= 1.30; // armor & weapons +30%
        } else if (lower.includes('potion') || lower.includes('elixir') || lower.includes('healing')) {
            mult *= 1.20; // healing & potions +20%
        }
    } else if (economyState && economyState.activeEvent === "Winter Season") {
        const lower = item.name.toLowerCase();
        if (lower.includes('cloak') || lower.includes('boots') || lower.includes('robe') || lower.includes('ring')) {
            mult *= 1.50; // winter gear & cloaks +50%
        }
    } else if (economyState && economyState.activeEvent === "Summer Season") {
        const lower = item.name.toLowerCase();
        if (lower.includes('ring') || lower.includes('goggles')) {
            mult *= 1.15; // summer exploration gear +15%
        }
    } else if (economyState && economyState.activeEvent === "Abundant Harvest") {
        const lower = item.name.toLowerCase();
        if (lower.includes('potion') || lower.includes('elixir') || lower.includes('oil') || lower.includes('healing')) {
            mult *= 0.85; // alchemist potions -15%
        }
    }
    
    return Math.max(0.1, Math.round(price * mult * 10) / 10);
}

// Get Items for the Bazaar (Dynamic Macro Economy-Aware prices from items.json)
app.get('/api/bazaar', (req, res) => {
    const itemsPath = path.join(__dirname, 'data', 'items.json');
    const hbItemsPath = path.join(__dirname, 'data', 'homebrew', 'items.json');
    
    let baseItems = [];
    if (fs.existsSync(itemsPath)) {
        try {
            const raw = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));
            baseItems = raw.item || [];
        } catch (e) {}
    }

    let hbItems = [];
    if (fs.existsSync(hbItemsPath)) {
        try {
            const raw = JSON.parse(fs.readFileSync(hbItemsPath, 'utf8'));
            hbItems = raw.item || [];
        } catch (e) {}
    }

    const merged = baseItems.concat(hbItems);
    const adjusted = merged.map(item => {
        const basePrice = convertCpToGpPrice(item.value || 0);
        // Ensure price is mapped for downstream code compatibility
        item.price = basePrice;
        
        const adjustedPrice = getAdjustedPrice(item);
        if (!economyLog[item.name]) {
            // Generate a small mock trend if no history exists yet
            economyLog[item.name] = [
                Math.round(basePrice * 0.95 * 10) / 10,
                Math.round(basePrice * 1.02 * 10) / 10,
                Math.round(basePrice * 0.98 * 10) / 10,
                Math.round(basePrice * 1.05 * 10) / 10,
                basePrice
            ];
        }
        return {
            ...item,
            originalPrice: basePrice,
            price: adjustedPrice,
            priceTrend: economyLog[item.name]
        };
    });

    res.json(adjusted);
});

// Get Procedural Synth Music Scale Presets
app.get('/api/music-presets', (req, res) => {
    const musicPresetsPath = path.join(__dirname, 'data', 'music_presets.json');
    if (fs.existsSync(musicPresetsPath)) {
        res.sendFile(musicPresetsPath);
    } else {
        res.json({});
    }
});

// Get current economy state & trend logs
app.get('/api/economy-state', (req, res) => {
    res.json({
        state: economyState,
        log: economyLog
    });
});

// Post Active Macro Event (DM command panel)
app.post('/api/economy/event', (req, res) => {
    const { eventName } = req.body;
    economyState.activeEvent = eventName || 'None';
    
    fs.writeFileSync(econStatePath, JSON.stringify(economyState, null, 2));
    
    // Recalculate and push to price logs
    const itemsPath = path.join(__dirname, 'data', 'magic_items.json');
    const hbItemsPath = path.join(__dirname, 'data', 'homebrew', 'magic_items.json');
    let base = [];
    if (fs.existsSync(itemsPath)) {
        try { base = JSON.parse(fs.readFileSync(itemsPath, 'utf8')); } catch(e){}
    }
    let hb = [];
    if (fs.existsSync(hbItemsPath)) {
        try { hb = JSON.parse(fs.readFileSync(hbItemsPath, 'utf8')); } catch(e){}
    }
    const all = base.concat(hb);
    all.forEach(item => {
        const adjusted = getAdjustedPrice(item);
        if (!economyLog[item.name]) {
            economyLog[item.name] = [item.price, item.price, item.price, item.price, item.price];
        }
        economyLog[item.name].push(adjusted);
        if (economyLog[item.name].length > 10) economyLog[item.name].shift();
    });
    fs.writeFileSync(econLogPath, JSON.stringify(economyLog, null, 2));

    io.emit('economy-updated', { state: economyState, log: economyLog });
    res.json({ success: true, message: `Active economy macro event set to: ${eventName}`, state: economyState });
});

// Post item purchase (triggers scarcity increase)
app.post('/api/economy/purchase', (req, res) => {
    const { itemName } = req.body;
    if (!itemName) return res.status(400).json({ error: "No item name specified." });

    if (!economyState.scarcity) economyState.scarcity = {};
    const currentScarcity = economyState.scarcity[itemName] || 1.0;
    
    economyState.scarcity[itemName] = Math.min(2.0, currentScarcity + 0.15); // +15% scarcity per buy
    fs.writeFileSync(econStatePath, JSON.stringify(economyState, null, 2));

    // Update log
    const itemsPath = path.join(__dirname, 'data', 'magic_items.json');
    const hbItemsPath = path.join(__dirname, 'data', 'homebrew', 'magic_items.json');
    let base = [];
    if (fs.existsSync(itemsPath)) {
        try { base = JSON.parse(fs.readFileSync(itemsPath, 'utf8')); } catch(e){}
    }
    let hb = [];
    if (fs.existsSync(hbItemsPath)) {
        try { hb = JSON.parse(fs.readFileSync(hbItemsPath, 'utf8')); } catch(e){}
    }
    const match = base.concat(hb).find(i => i.name === itemName);
    if (match) {
        const adjusted = getAdjustedPrice(match);
        if (!economyLog[itemName]) {
            economyLog[itemName] = [match.price, match.price, match.price, match.price, match.price];
        }
        economyLog[itemName].push(adjusted);
        if (economyLog[itemName].length > 10) economyLog[itemName].shift();
        fs.writeFileSync(econLogPath, JSON.stringify(economyLog, null, 2));
    }

    io.emit('economy-updated', { state: economyState, log: economyLog });
    res.json({ success: true, message: `Scarcity factor for ${itemName} increased.` });
});

// Post item sell back (floods market)
app.post('/api/economy/sell', (req, res) => {
    const { itemName } = req.body;
    if (!itemName) return res.status(400).json({ error: "No item name specified." });

    if (!economyState.scarcity) economyState.scarcity = {};
    const currentScarcity = economyState.scarcity[itemName] || 1.0;
    
    economyState.scarcity[itemName] = Math.max(0.6, currentScarcity - 0.15); // -15% scarcity per sell (more supply)
    fs.writeFileSync(econStatePath, JSON.stringify(economyState, null, 2));

    // Update log
    const itemsPath = path.join(__dirname, 'data', 'magic_items.json');
    const hbItemsPath = path.join(__dirname, 'data', 'homebrew', 'magic_items.json');
    let base = [];
    if (fs.existsSync(itemsPath)) {
        try { base = JSON.parse(fs.readFileSync(itemsPath, 'utf8')); } catch(e){}
    }
    let hb = [];
    if (fs.existsSync(hbItemsPath)) {
        try { hb = JSON.parse(fs.readFileSync(hbItemsPath, 'utf8')); } catch(e){}
    }
    const match = base.concat(hb).find(i => i.name === itemName);
    if (match) {
        const adjusted = getAdjustedPrice(match);
        if (!economyLog[itemName]) {
            economyLog[itemName] = [match.price, match.price, match.price, match.price, match.price];
        }
        economyLog[itemName].push(adjusted);
        if (economyLog[itemName].length > 10) economyLog[itemName].shift();
        fs.writeFileSync(econLogPath, JSON.stringify(economyLog, null, 2));
    }

    io.emit('economy-updated', { state: economyState, log: economyLog });
    res.json({ success: true, message: `Scarcity factor for ${itemName} decreased.` });
});

// Get pending level-up requests
app.get('/api/level-up/approvals', (req, res) => {
    res.json(levelUpApprovals);
});

// Submit player level-up sandbox choices
app.post('/api/level-up/submit', (req, res) => {
    const { charId, name, choices } = req.body;
    if (!charId) return res.status(400).json({ error: "Missing character ID." });

    levelUpApprovals[charId] = {
        name: name,
        choices: choices,
        timestamp: Date.now()
    };
    fs.writeFileSync(levelUpPath, JSON.stringify(levelUpApprovals, null, 2));
    io.emit('level-up-submitted', { charId, approvals: levelUpApprovals });
    res.json({ success: true, message: "Sandbox level-up options queued for DM approval!" });
});

// Approve player level-up and update party.json
app.post('/api/level-up/approve', (req, res) => {
    const { charId } = req.body;
    if (!charId || !levelUpApprovals[charId]) {
        return res.status(400).json({ error: "Invalid approval request." });
    }

    const approval = levelUpApprovals[charId];
    const partyPath = getPartyPath();
    if (fs.existsSync(partyPath)) {
        try {
            const party = JSON.parse(fs.readFileSync(partyPath, 'utf8'));
            const idx = party.findIndex(c => c.id === charId);
            if (idx !== -1) {
                const char = party[idx];
                char.level = approval.choices.newLevel || char.level;
                char.hp_max = (char.hp_max || 0) + (parseInt(approval.choices.hpIncrease) || 0);
                char.hp_current = char.hp_max; // Fully rest HP on level-up!

                if (approval.choices.chosenAsi) {
                    Object.keys(approval.choices.chosenAsi).forEach(stat => {
                        if (char.stats && char.stats[stat] !== undefined) {
                            char.stats[stat] += approval.choices.chosenAsi[stat];
                        }
                    });
                }

                if (approval.choices.chosenFeat) {
                    if (!char.feats) char.feats = [];
                    if (!char.feats.includes(approval.choices.chosenFeat)) {
                        char.feats.push(approval.choices.chosenFeat);
                    }
                }

                if (approval.choices.selectedSpells && approval.choices.selectedSpells.length > 0) {
                    if (!char.spells) char.spells = [];
                    approval.choices.selectedSpells.forEach(sp => {
                        if (!char.spells.includes(sp)) char.spells.push(sp);
                    });
                }

                fs.writeFileSync(partyPath, JSON.stringify(party, null, 2));
                
                // Clear request
                delete levelUpApprovals[charId];
                fs.writeFileSync(levelUpPath, JSON.stringify(levelUpApprovals, null, 2));

                io.emit('level-up-approved', { charId, character: char, approvals: levelUpApprovals });
                return res.json({ success: true, message: `Approved level-up for ${char.name}!`, character: char });
            }
        } catch (e) {
            return res.status(500).json({ error: "Failed to apply level-up choice.", details: e.message });
        }
    }
    res.status(404).json({ error: "Character not found." });
});

// Simple in-memory cache to make lookups extremely fast
const spellCache = new Map();

// Helper to normalize strings for robust fuzzy comparison
const normalizeSpellName = (name) => {
    if (!name) return '';
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
};

// Helper to format levels
const formatSpellLevel = (level) => {
    if (!level) return '';
    const lvlStr = String(level).trim().toLowerCase();
    if (lvlStr === 'cantrip' || lvlStr === '0' || lvlStr === '0th' || lvlStr === '0-level') {
        return 'Cantrip';
    }
    const num = parseInt(lvlStr, 10);
    if (isNaN(num)) {
        return lvlStr.charAt(0).toUpperCase() + lvlStr.slice(1);
    }
    const suffix = (num === 1) ? 'st' : (num === 2) ? 'nd' : (num === 3) ? 'rd' : 'th';
    return `${num}${suffix}-level`;
};

// Helper to fetch data via HTTPS GET with timeout
const fetchHttpsJson = (url) => {
    const https = require('https');
    return new Promise((resolve, reject) => {
        const req = https.get(url, { timeout: 4000 }, (res) => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                return reject(new Error(`Request failed with status ${res.statusCode}`));
            }
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', (err) => reject(err));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
};

// Parser for local .md spell files
const parseLocalMarkdown = (fileName, content) => {
    const lines = content.split(/\r?\n/);
    const spell = {
        name: path.basename(fileName, '.md').replace(/[-_]+/g, ' '),
        level: '',
        school: '',
        casting_time: '',
        range: '',
        components: '',
        duration: '',
        description: ''
    };

    let inFrontMatter = false;
    const frontMatterLines = [];
    const bodyLines = [];

    const hasDashes = content.trim().startsWith('---');

    if (hasDashes) {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === '---') {
                if (!inFrontMatter && frontMatterLines.length === 0 && i === 0) {
                    inFrontMatter = true;
                    continue;
                } else if (inFrontMatter) {
                    inFrontMatter = false;
                    continue;
                }
            }
            if (inFrontMatter) {
                frontMatterLines.push(lines[i]);
            } else {
                bodyLines.push(lines[i]);
            }
        }
    } else {
        // No frontmatter dashes. Parse lines at the beginning containing colons as frontmatter,
        // until we reach a line that does not contain a colon (ignoring empty lines) or starts with a heading.
        let bodyStarted = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (bodyStarted) {
                bodyLines.push(lines[i]);
            } else {
                if (line === '') {
                    continue; // Skip leading empty lines
                }
                if (line.startsWith('#')) {
                    bodyStarted = true;
                    bodyLines.push(lines[i]);
                } else if (line.indexOf(':') !== -1) {
                    frontMatterLines.push(lines[i]);
                } else {
                    bodyStarted = true;
                    bodyLines.push(lines[i]);
                }
            }
        }
    }

    frontMatterLines.forEach(line => {
        const index = line.indexOf(':');
        if (index !== -1) {
            const key = line.slice(0, index).trim().toLowerCase().replace(/[\s_-]+/g, '_');
            const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
            
            if (key === 'name') spell.name = value;
            else if (key === 'level') spell.level = formatSpellLevel(value);
            else if (key === 'school') spell.school = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
            else if (key === 'casting_time' || key === 'casting') spell.casting_time = value;
            else if (key === 'range') spell.range = value;
            else if (key === 'components') spell.components = value;
            else if (key === 'duration') spell.duration = value;
        }
    });

    const bodyText = bodyLines.join('\n');
    const extractField = (regexes, fallback) => {
        for (const regex of regexes) {
            const match = bodyText.match(regex);
            if (match && match[1]) return match[1].trim();
        }
        return fallback;
    };

    spell.name = extractField([/^#\s+(.+)$/m, /\*\*Name\*\*:\s*([^\n]+)/i], spell.name);
    spell.level = formatSpellLevel(extractField([/\*\*Level\*\*:\s*([^\n]+)/i], spell.level));
    spell.school = extractField([/\*\*School\*\*:\s*([^\n]+)/i], spell.school);

    // Super intelligent fallback: if school/level are still missing, scan for italicized subheader (e.g. "_2nd-level evocation_")
    if (!spell.level || !spell.school) {
        const italicMatch = bodyText.match(/_(Cantrip|(\d+)(?:st|nd|rd|th)-level)\s+(\w+)_/i);
        if (italicMatch) {
            if (!spell.level) {
                spell.level = italicMatch[1].toLowerCase() === 'cantrip' ? 'Cantrip' : formatSpellLevel(italicMatch[2]);
            }
            if (!spell.school) {
                spell.school = italicMatch[3].charAt(0).toUpperCase() + italicMatch[3].slice(1).toLowerCase();
            }
        }
    }
    spell.casting_time = extractField([/\*\*Casting Time\*\*:\s*([^\n]+)/i], spell.casting_time);
    spell.range = extractField([/\*\*Range\*\*:\s*([^\n]+)/i], spell.range);
    spell.components = extractField([/\*\*Components\*\*:\s*([^\n]+)/i], spell.components);
    spell.duration = extractField([/\*\*Duration\*\*:\s*([^\n]+)/i], spell.duration);

    let description = bodyText
        .replace(/^#\s+.+$/gm, '')
        .replace(/\*\*(Level|School|Casting Time|Casting|Range|Components|Duration)\*\*:\s*[^\n]+/gi, '')
        .trim();

    spell.description = description || 'No description available.';
    return spell;
};

// GET Route /api/spells - Handled by spellsRouter via dataCache

// GET Route /api/spells/lookup/:spellName
app.get('/api/spells/lookup/:spellName', (req, res) => {
    const { spellName } = req.params;
    if (!spellName) {
        return res.status(400).json({ error: 'Spell name parameter is required' });
    }

    const normalizedTarget = normalizeSpellName(spellName);

    if (spellCache.has(normalizedTarget)) {
        return res.json(spellCache.get(normalizedTarget));
    }

    const localFolder = path.join(__dirname, 'data', 'spells');
    const hbFolder = path.join(__dirname, 'data', 'homebrew', 'spells');
    
    const folders = [];
    if (fs.existsSync(localFolder)) folders.push(localFolder);
    if (fs.existsSync(hbFolder)) folders.push(hbFolder);

    let localFileMatch = null;
    let matchedFolder = null;

    const scanFolders = (index) => {
        if (index >= folders.length) {
            // No local match, proceed to online scrape fallback
            fetchOnlineFallback();
            return;
        }

        const folder = folders[index];
        fs.readdir(folder, (dirErr, files) => {
            if (!dirErr && files) {
                const mdFiles = files.filter(f => f.endsWith('.md'));
                for (const file of mdFiles) {
                    const nameWithoutExt = path.basename(file, '.md');
                    if (normalizeSpellName(nameWithoutExt) === normalizedTarget) {
                        localFileMatch = file;
                        matchedFolder = folder;
                        break;
                    }
                }
            }

            if (localFileMatch) {
                const filePath = path.join(matchedFolder, localFileMatch);
                fs.readFile(filePath, 'utf-8', (readErr, fileContent) => {
                    if (readErr) {
                        return res.status(500).json({ error: "Failed to read local spell file." });
                    }
                    const parsedSpell = parseLocalMarkdown(localFileMatch, fileContent);
                    parsedSpell.isHomebrew = matchedFolder.includes('homebrew');
                    spellCache.set(normalizedTarget, parsedSpell);
                    return res.json(parsedSpell);
                });
            } else {
                scanFolders(index + 1);
            }
        });
    };

    const fetchOnlineFallback = () => {
        // Online Scrape Fallback via Open5e HTTPS REST API
        const open5eUrl = `https://api.open5e.com/spells/?search=${encodeURIComponent(spellName)}`;
        fetchHttpsJson(open5eUrl)
            .then(searchData => {
                if (searchData && searchData.results && searchData.results.length > 0) {
                    let matchedResult = searchData.results.find(
                        item => normalizeSpellName(item.name) === normalizedTarget
                    );

                    if (!matchedResult) {
                        matchedResult = searchData.results.find(
                            item => normalizeSpellName(item.name).includes(normalizedTarget)
                        ) || searchData.results[0];
                    }

                    if (matchedResult) {
                        let components = matchedResult.components || '';
                        if (matchedResult.material) {
                            const mStr = String(matchedResult.material).trim();
                            if (mStr) {
                                components = `${components} (${mStr})`;
                            }
                        }
                        const parsed = {
                            name: matchedResult.name,
                            level: formatSpellLevel(matchedResult.level),
                            school: matchedResult.school || '',
                            casting_time: matchedResult.casting_time || '',
                            range: matchedResult.range || '',
                            components: components,
                            duration: matchedResult.duration || '',
                            description: matchedResult.desc || ''
                        };
                        spellCache.set(normalizedTarget, parsed);
                        return res.json(parsed);
                    }
                }
                return res.status(404).json({ error: "Spell not found locally or in online database." });
            })
            .catch(err => {
                console.error("Open5e API search failure:", err);
                return res.status(404).json({ error: "Spell not found locally, and online DB check failed." });
            });
    };

    // Begin folder scan
    scanFolders(0);
});


// ----------------------------------------------------
// UTILITIES: IMPROVISED DAMAGE, HAZARDS & SOUNDS
// ----------------------------------------------------

// Improvised Damage Cheat Sheet Data
app.get('/api/improv', (req, res) => {
    const matrix = [
        { level: "1st-4th", setback: "1d10 (5)", moderate: "2d10 (11)", dangerous: "4d10 (22)", deadly: "10d10 (55)" },
        { level: "5th-10th", setback: "2d10 (11)", moderate: "4d10 (22)", dangerous: "10d10 (55)", deadly: "18d10 (99)" },
        { level: "11th-16th", setback: "4d10 (22)", moderate: "10d10 (55)", dangerous: "18d10 (99)", deadly: "24d10 (132)" },
        { level: "17th-20th", setback: "10d10 (55)", moderate: "18d10 (99)", dangerous: "24d10 (132)", deadly: "24d10 (132) + 10d10 per level" }
    ];
    res.json(matrix);
});

// Procedural Hazards / Trap Generator
app.get('/api/hazards/generate', (req, res) => {
    const triggers = ["Step on a pressure plate", "Opening a door/chest", "Breaking a magical barrier", "Disturbing an idol/relic", "Stepping into a pool/liquid", "Whispering a forbidden phrase"];
    const effects = [
        "A heavy iron grate slams down, trapping targets. DC 15 Dex save or take 2d10 bludgeoning.",
        "Poison darts shoot from the walls. DC 14 Dex save, taking 4d10 poison damage on a failed save, or half on success.",
        "A cloud of toxic green sand fills the room. DC 15 Con save or be Blinded & Poisoned.",
        "Searing radiant fire blasts from runes. DC 16 Dex save or take 6d10 radiant damage.",
        "The ceiling begins to lower. Initiative 10 active hazard, dealing 3d10 damage to anyone who hasn't escaped each round.",
        "A hidden pit trap opens up. DC 15 Dexterity save or fall 30 ft. onto spikes (3d6 fall + 2d10 piercing)."
    ];
    const severities = ["Setback", "Moderate", "Dangerous", "Deadly"];

    const trigger = triggers[Math.floor(Math.random() * triggers.length)];
    const effect = effects[Math.floor(Math.random() * effects.length)];
    const severity = severities[Math.floor(Math.random() * severities.length)];

    res.json({
        name: `${severity} Trap`,
        severity: severity,
        trigger: trigger,
        effect: effect,
        dc: Math.floor(Math.random() * 5) + 12 // DC 12 to 16
    });
});

// Legacy sound trigger endpoint removed - Soundboard uses /api/sounds and sockets/index.js


// ----------------------------------------------------
// ELGATO STREAM DECK API & NAVIGATION
// ----------------------------------------------------

// Endpoint: Next Turn
app.get('/api/streamdeck/next', (req, res) => {
    if (currentEncounterState.length > 0) {
        let attempts = 0;
        let nextIndex = activeCombatIndex;
        let foundLive = false;
        
        while (attempts < currentEncounterState.length) {
            nextIndex = nextIndex + 1;
            if (nextIndex >= currentEncounterState.length) {
                nextIndex = 0;
                activeRound += 1;
            }
            attempts++;
            
            const nextCombatant = currentEncounterState[nextIndex];
            if (nextCombatant) {
                // Keep dead players for Down states, but skip fully defeated monsters/hazards
                const isMonsterDead = nextCombatant.type === 'monster' && nextCombatant.isDefeated;
                if (!isMonsterDead) {
                    foundLive = true;
                    break;
                }
            }
        }

        if (foundLive) {
            activeCombatIndex = nextIndex;
        } else {
            activeCombatIndex = (activeCombatIndex + 1) % currentEncounterState.length;
            if (activeCombatIndex === 0) activeRound += 1;
        }
        
        io.emit('board-state-updated', {
            encounter: currentEncounterState,
            activeCombatIndex: activeCombatIndex,
            activeRound: activeRound,
            soundTrigger: activeSoundTrigger,
            handout: currentHandoutImage
        });
        
        res.json({ success: true, message: `Turn advanced to ${currentEncounterState[activeCombatIndex].name}`, activeCombatIndex, activeRound });
    } else {
        res.status(400).json({ error: "No combat active." });
    }
});

// Endpoint: Previous Turn
app.get('/api/streamdeck/prev', (req, res) => {
    if (currentEncounterState.length > 0) {
        let attempts = 0;
        let prevIndex = activeCombatIndex;
        let foundLive = false;
        
        while (attempts < currentEncounterState.length) {
            prevIndex = prevIndex - 1;
            if (prevIndex < 0) {
                prevIndex = currentEncounterState.length - 1;
                activeRound = Math.max(1, activeRound - 1);
            }
            attempts++;
            
            const prevCombatant = currentEncounterState[prevIndex];
            if (prevCombatant) {
                const isMonsterDead = prevCombatant.type === 'monster' && prevCombatant.isDefeated;
                if (!isMonsterDead) {
                    foundLive = true;
                    break;
                }
            }
        }

        if (foundLive) {
            activeCombatIndex = prevIndex;
        } else {
            activeCombatIndex = (activeCombatIndex - 1 + currentEncounterState.length) % currentEncounterState.length;
        }
        
        io.emit('board-state-updated', {
            encounter: currentEncounterState,
            activeCombatIndex: activeCombatIndex,
            activeRound: activeRound,
            soundTrigger: activeSoundTrigger,
            handout: currentHandoutImage
        });
        
        res.json({ success: true, message: `Turn rewound to ${currentEncounterState[activeCombatIndex].name}`, activeCombatIndex, activeRound });
    } else {
        res.status(400).json({ error: "No combat active." });
    }
});

// Endpoint: Spawn Fireball (Spawns a red sphere template on projector)
app.get('/api/streamdeck/fireball', (req, res) => {
    const newTemplate = {
        id: 'temp_' + Date.now(),
        type: 'circle',
        radius: 20, // 20 ft radius
        color: '#ef4444', // Red Fire
        x: 200,
        y: 200,
        name: 'Fireball'
    };
    projectorState.templates.push(newTemplate);
    res.json({ success: true, message: "Spawned Fireball AoE template.", projectorState });
});

// Endpoint: Clear All Projector Templates
app.get('/api/streamdeck/clear', (req, res) => {
    projectorState.templates = [];
    res.json({ success: true, message: "Cleared all active spell templates." });
});




// ----------------------------------------------------
// WAVE 3 ADVANCED DND ENGINE ENDPOINTS
// ----------------------------------------------------

// In-memory turn clock history for Combat Analytics
let turnDurationHistory = []; // { characterId, name, durationSeconds, timestamp }

app.get('/api/session-config', (req, res) => {
    const p = path.join(__dirname, 'data', 'session_config.json');
    fs.readFile(p, 'utf8', (err, data) => {
        if (err) return res.json({ shotClockSeconds: 60, shotClockEnabled: true });
        try { res.json(JSON.parse(data)); } catch(e) { res.json({ shotClockSeconds: 60, shotClockEnabled: true }); }
    });
});

app.post('/api/session-config', (req, res) => {
    const p = path.join(__dirname, 'data', 'session_config.json');
    fs.writeFile(p, JSON.stringify(req.body, null, 2), 'utf8', (err) => {
        if (err) return res.status(500).json({ error: "Failed to write config" });
        io.emit('session-config-updated', req.body);
        res.json({ success: true });
    });
});

app.get('/api/session/feedback', (req, res) => {
    const p = path.join(__dirname, 'data', 'session_feedback.json');
    fs.readFile(p, 'utf8', (err, data) => {
        if (err) return res.json([]);
        try { res.json(JSON.parse(data)); } catch(e) { res.json([]); }
    });
});

app.post('/api/session/feedback', (req, res) => {
    const p = path.join(__dirname, 'data', 'session_feedback.json');
    fs.readFile(p, 'utf8', (err, data) => {
        let list = [];
        if (!err) {
            try { list = JSON.parse(data); } catch(e) {}
        }
        list.push({ ...req.body, timestamp: new Date().toISOString() });
        fs.writeFile(p, JSON.stringify(list, null, 2), 'utf8', (writeErr) => {
            if (writeErr) return res.status(500).json({ error: "Failed" });
            io.to('dm').emit('feedback-received', list);
            res.json({ success: true });
        });
    });
});

app.get('/api/bounties', (req, res) => {
    const p = path.join(__dirname, 'data', 'bounties.json');
    fs.readFile(p, 'utf8', (err, data) => {
        if (err) return res.json([]);
        try { res.json(JSON.parse(data)); } catch(e) { res.json([]); }
    });
});

app.post('/api/bounties', (req, res) => {
    const p = path.join(__dirname, 'data', 'bounties.json');
    fs.writeFile(p, JSON.stringify(req.body, null, 2), 'utf8', (err) => {
        if (err) return res.status(500).json({ error: "Failed" });
        io.emit('bounties-updated', req.body);
        res.json({ success: true });
    });
});

app.post('/api/bounties/claim', (req, res) => {
    const { bountyId } = req.body;
    const p = path.join(__dirname, 'data', 'bounties.json');
    fs.readFile(p, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: "Failed to read" });
        try {
            let list = JSON.parse(data);
            const item = list.find(b => b.id === bountyId);
            if (item) {
                item.status = 'in_progress';
                fs.writeFile(p, JSON.stringify(list, null, 2), 'utf8', () => {
                    io.emit('bounties-updated', list);
                    res.json({ success: true });
                });
            } else {
                res.status(404).json({ error: "Not found" });
            }
        } catch(e) { res.status(500).json({ error: "Failed" }); }
    });
});

app.post('/api/bounties/resolve', (req, res) => {
    const { bountyId, status } = req.body;
    const p = path.join(__dirname, 'data', 'bounties.json');
    fs.readFile(p, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: "Failed to read" });
        try {
            let list = JSON.parse(data);
            const item = list.find(b => b.id === bountyId);
            if (item) {
                item.status = status;
                fs.writeFile(p, JSON.stringify(list, null, 2), 'utf8', () => {
                    if (status === 'completed' && item.reward_gold) {
                        const invPath = path.join(__dirname, 'data', 'party_inventory.json');
                        fs.readFile(invPath, 'utf8', (invErr, invData) => {
                            if (!invErr) {
                                try {
                                    let inv = JSON.parse(invData);
                                    inv.gold = (parseInt(inv.gold) || 0) + parseInt(item.reward_gold);
                                    fs.writeFile(invPath, JSON.stringify(inv, null, 2), 'utf8', () => {
                                        io.emit('party-inventory-updated', inv);
                                    });
                                } catch(e){}
                            }
                        });
                    }
                    io.emit('bounties-updated', list);
                    res.json({ success: true });
                });
            } else {
                res.status(404).json({ error: "Not found" });
            }
        } catch(e) { res.status(500).json({ error: "Failed" }); }
    });
});

app.get('/api/house-rules', (req, res) => {
    const p = path.join(__dirname, 'data', 'house_rules.json');
    fs.readFile(p, 'utf8', (err, data) => {
        if (err) return res.json({});
        try { res.json(JSON.parse(data)); } catch(e) { res.json({}); }
    });
});

app.post('/api/house-rules', (req, res) => {
    const p = path.join(__dirname, 'data', 'house_rules.json');
    fs.writeFile(p, JSON.stringify(req.body, null, 2), 'utf8', (err) => {
        if (err) return res.status(500).json({ error: "Failed" });
        io.emit('house-rules-updated', req.body);
        res.json({ success: true });
    });
});

app.get('/api/world-state', (req, res) => {
    const p = path.join(__dirname, 'data', 'world_state.json');
    fs.readFile(p, 'utf8', (err, data) => {
        if (err) return res.json({});
        try { res.json(JSON.parse(data)); } catch(e) { res.json({}); }
    });
});

app.post('/api/world-state', (req, res) => {
    const p = path.join(__dirname, 'data', 'world_state.json');
    fs.writeFile(p, JSON.stringify(req.body, null, 2), 'utf8', (err) => {
        if (err) return res.status(500).json({ error: "Failed" });
        io.emit('world-state-updated', req.body);
        res.json({ success: true });
    });
});

app.get('/api/prophecies', (req, res) => {
    const p = path.join(__dirname, 'data', 'prophecies.json');
    fs.readFile(p, 'utf8', (err, data) => {
        if (err) return res.json([]);
        try { res.json(JSON.parse(data)); } catch(e) { res.json([]); }
    });
});

app.post('/api/prophecies', (req, res) => {
    const p = path.join(__dirname, 'data', 'prophecies.json');
    fs.writeFile(p, JSON.stringify(req.body, null, 2), 'utf8', (err) => {
        if (err) return res.status(500).json({ error: "Failed" });
        io.emit('prophecies-updated', req.body);
        res.json({ success: true });
    });
});

app.get('/api/broadsheets', (req, res) => {
    const p = path.join(__dirname, 'data', 'broadsheets.json');
    fs.readFile(p, 'utf8', (err, data) => {
        if (err) return res.json([]);
        try { res.json(JSON.parse(data)); } catch(e) { res.json([]); }
    });
});

app.post('/api/broadsheets', (req, res) => {
    const p = path.join(__dirname, 'data', 'broadsheets.json');
    fs.writeFile(p, JSON.stringify(req.body, null, 2), 'utf8', (err) => {
        if (err) return res.status(500).json({ error: "Failed" });
        io.emit('broadsheets-updated', req.body);
        res.json({ success: true });
    });
});

app.get('/api/knowledge', (req, res) => {
    const p = path.join(__dirname, 'data', 'knowledge_tracker.json');
    fs.readFile(p, 'utf8', (err, data) => {
        if (err) return res.json([]);
        try { res.json(JSON.parse(data)); } catch(e) { res.json([]); }
    });
});

app.post('/api/knowledge', (req, res) => {
    const p = path.join(__dirname, 'data', 'knowledge_tracker.json');
    fs.writeFile(p, JSON.stringify(req.body, null, 2), 'utf8', (err) => {
        if (err) return res.status(500).json({ error: "Failed" });
        io.emit('knowledge-updated', req.body);
        res.json({ success: true });
    });
});

app.get('/api/factions', (req, res) => {
    const p = path.join(__dirname, 'data', 'factions.json');
    fs.readFile(p, 'utf8', (err, data) => {
        if (err) return res.json({ factions: [] });
        try { res.json(JSON.parse(data)); } catch(e) { res.json({ factions: [] }); }
    });
});

app.post('/api/factions', (req, res) => {
    const p = path.join(__dirname, 'data', 'factions.json');
    fs.writeFile(p, JSON.stringify(req.body, null, 2), 'utf8', (err) => {
        if (err) return res.status(500).json({ error: "Failed" });
        io.emit('factions-updated', req.body);
        res.json({ success: true });
    });
});

app.get('/api/campaign/parties', (req, res) => {
    const dir = path.join(__dirname, 'data');
    fs.readdir(dir, (err, files) => {
        if (err) return res.json(['party.json']);
        const partyFiles = files.filter(f => f.startsWith('party') && f.endsWith('.json'));
        if (partyFiles.length === 0) partyFiles.push('party.json');
        res.json(partyFiles);
    });
});

app.post('/api/campaign/switch-party', (req, res) => {
    const { partyFile } = req.body;
    if (partyFile && partyFile.endsWith('.json') && partyFile.startsWith('party')) {
        activePartyFileName = partyFile;
        const pPath = getPartyPath();
        fs.readFile(pPath, 'utf8', (err, data) => {
            if (!err) {
                try {
                    const party = JSON.parse(data);
                    io.emit('party-updated', party);
                } catch(e){}
            }
        });
        res.json({ success: true, activeParty: activePartyFileName });
    } else {
        res.status(400).json({ error: "Invalid party file name" });
    }
});

app.get('/api/combat/analytics', (req, res) => {
    res.json(turnDurationHistory);
});

app.post('/api/combat/record-turn-time', (req, res) => {
    const { characterId, name, durationSeconds } = req.body;
    if (characterId && durationSeconds !== undefined) {
        turnDurationHistory.push({
            characterId,
            name: name || "Unknown",
            durationSeconds: parseInt(durationSeconds),
            timestamp: new Date().toISOString()
        });
        if (turnDurationHistory.length > 100) turnDurationHistory.shift();
    }
    res.json({ success: true });
});

app.get('/api/wiki/entities', (req, res) => {
    const partyPath = getPartyPath();
    const npcPath = path.join(__dirname, 'data', 'npc_tables.json');
    const factionsPath = path.join(__dirname, 'data', 'factions.json');
    const customLorePath = path.join(__dirname, 'data', 'custom_lore.json');
    let entities = [];
    try {
        if (fs.existsSync(customLorePath)) {
            const custom = JSON.parse(fs.readFileSync(customLorePath, 'utf8'));
            entities = entities.concat(custom.map(x => ({ ...x, type: 'lore' })));
        }
        if (fs.existsSync(partyPath)) {
            const party = JSON.parse(fs.readFileSync(partyPath, 'utf8'));
            entities = entities.concat(party.map(x => ({ id: x.id, name: x.name, description: `Level ${x.level} ${x.race} ${x.class}. Secrets: ${x.secrets || 'None'}`, type: 'player' })));
        }
        if (fs.existsSync(factionsPath)) {
            const factionsRaw = JSON.parse(fs.readFileSync(factionsPath, 'utf8'));
            const factionsList = Array.isArray(factionsRaw) ? factionsRaw : (factionsRaw.factions || []);
            entities = entities.concat(factionsList.map(x => ({ id: x.id, name: x.name, description: x.description || x.lore || '', type: 'faction' })));
        }
    } catch(e) {
        console.error("Wiki extraction error:", e);
    }
    res.json(entities);
});

app.post('/api/wiki/save', (req, res) => {
    const { name, description, category } = req.body;
    const customLorePath = path.join(__dirname, 'data', 'custom_lore.json');
    fs.readFile(customLorePath, 'utf8', (err, data) => {
        let list = [];
        if (!err) {
            try { list = JSON.parse(data); } catch(e){}
        }
        const existingIdx = list.findIndex(x => x.name.toLowerCase() === name.toLowerCase());
        const entry = {
            id: 'wiki_' + Date.now(),
            name,
            description,
            category: category || 'General',
            updatedAt: new Date().toISOString()
        };
        if (existingIdx !== -1) {
            list[existingIdx] = entry;
        } else {
            list.push(entry);
        }
        fs.writeFile(customLorePath, JSON.stringify(list, null, 2), 'utf8', () => {
            io.emit('wiki-updated', list);
            res.json({ success: true, entry });
        });
    });
});

app.post('/api/economy/deduct-lifestyle', (req, res) => {
    const partyPath = getPartyPath();
    const invPath = path.join(__dirname, 'data', 'party_inventory.json');
    const econPath = path.join(__dirname, 'data', 'economy_log.json');
    fs.readFile(partyPath, 'utf8', (err, partyData) => {
        if (err) return res.status(500).json({ error: "Failed to read party" });
        try {
            const party = JSON.parse(partyData);
            let totalCost = 0;
            const rates = {
                "Wretched": 0,
                "Squalid": 0.1,
                "Poor": 0.2,
                "Modest": 1,
                "Comfortable": 2,
                "Wealthy": 4,
                "Aristocratic": 10
            };
            const details = [];
            party.forEach(char => {
                const style = char.lifestyle || "Modest";
                const cost = rates[style] !== undefined ? rates[style] : 1;
                totalCost += cost;
                details.push({ name: char.name, lifestyle: style, cost });
            });
            fs.readFile(invPath, 'utf8', (invErr, invData) => {
                if (invErr) return res.json({ success: false, error: "No inventory file found." });
                try {
                    let inv = JSON.parse(invData);
                    const oldGold = inv.gold || 0;
                    if (oldGold < totalCost) {
                        details.forEach(d => {
                            d.downgraded = true;
                            d.cost = 0.2;
                        });
                        totalCost = party.length * 0.2;
                    }
                    inv.gold = Math.max(0, oldGold - totalCost);
                    fs.writeFile(invPath, JSON.stringify(inv, null, 2), 'utf8', (writeErr) => {
                        if (writeErr) return res.status(500).json({ error: "Write failed" });
                        fs.readFile(econPath, 'utf8', (eErr, eData) => {
                            let econLog = [];
                            if (!eErr) {
                                try { econLog = JSON.parse(eData); } catch(e){}
                            }
                            const entry = {
                                timestamp: new Date().toISOString(),
                                type: 'Lifestyle Deduction',
                                description: `Deducted daily lifestyle expenses for party.`,
                                totalDeducted: totalCost,
                                previousGold: oldGold,
                                currentGold: inv.gold,
                                details
                            };
                            econLog.push(entry);
                            fs.writeFile(econPath, JSON.stringify(econLog, null, 2), 'utf8', () => {
                                io.emit('party-inventory-updated', inv);
                                io.emit('economy-log-updated', econLog);
                                res.json({ success: true, totalCost, currentGold: inv.gold, details });
                            });
                        });
                    });
                } catch(e) { res.status(500).json({ error: "Parse error" }); }
            });
        } catch(e) { res.status(500).json({ error: "Parse error" }); }
    });
});


// ====================================================
// WAVE 4: THE DEEP DIG ENDPOINTS & WEB SOCKETS
// ====================================================

// Clues page routing
app.get('/clues', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'clues.html'));
});

// 1. Investigation Board Endpoints
app.get('/api/investigation-board', (req, res) => {
    const p = path.join(__dirname, 'data', 'investigation_board.json');
    fs.readFile(p, 'utf8', (err, data) => {
        if (err) return res.json({ nodes: [], connections: [] });
        try { res.json(JSON.parse(data)); } catch (e) { res.json({ nodes: [], connections: [] }); }
    });
});

app.post('/api/investigation-board/save', (req, res) => {
    const p = path.join(__dirname, 'data', 'investigation_board.json');
    fs.writeFile(p, JSON.stringify(req.body, null, 2), 'utf8', (err) => {
        if (err) return res.status(500).json({ error: "Failed to save board" });
        io.emit('investigation-board-updated', req.body);
        res.json({ success: true });
    });
});

// 2. Homebrew Monsters Saving
app.post('/api/homebrew/monsters', (req, res) => {
    const monsterName = req.body.name || "Unnamed Monster";
    const fileName = `${monsterName.toLowerCase().replace(/[^a-z0-9]/g, '_')}.json`;
    const hbDir = path.join(__dirname, 'data', 'homebrew', 'monsters');
    
    if (!fs.existsSync(hbDir)) {
        fs.mkdirSync(hbDir, { recursive: true });
    }
    
    const p = path.join(hbDir, fileName);
    fs.writeFile(p, JSON.stringify(req.body, null, 2), 'utf8', (err) => {
        if (err) return res.status(500).json({ error: "Failed to save custom monster" });
        res.json({ success: true, fileName });
    });
});

// 3. Custom Trap Designer
app.post('/api/traps/save', (req, res) => {
    const p = path.join(__dirname, 'data', 'traps.json');
    fs.writeFile(p, JSON.stringify(req.body, null, 2), 'utf8', (err) => {
        if (err) return res.status(500).json({ error: "Failed to save trap library" });
        res.json({ success: true });
    });
});

// Homebrew Items REST Endpoints
app.get('/api/homebrew/items', (req, res) => {
    const hbItemsFile = path.join(__dirname, 'data', 'homebrew', 'magic_items.json');
    if (fs.existsSync(hbItemsFile)) {
        try {
            const items = JSON.parse(fs.readFileSync(hbItemsFile, 'utf8'));
            return res.json(items);
        } catch (e) {}
    }
    res.json([]);
});

app.post('/api/homebrew/items', (req, res) => {
    const item = req.body;
    if (!item || !item.name) {
        return res.status(400).json({ error: "Item name is required." });
    }
    const hbDir = path.join(__dirname, 'data', 'homebrew');
    if (!fs.existsSync(hbDir)) {
        fs.mkdirSync(hbDir, { recursive: true });
    }
    const hbItemsFile = path.join(hbDir, 'magic_items.json');
    let items = [];
    if (fs.existsSync(hbItemsFile)) {
        try {
            items = JSON.parse(fs.readFileSync(hbItemsFile, 'utf8'));
        } catch (e) {}
    }
    if (!Array.isArray(items)) items = [];
    
    if (!item.id) {
        item.id = 'hb_item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    }
    item.isHomebrew = true;
    item.source = item.source || 'Homebrew';

    const existingIdx = items.findIndex(i => (i.id && i.id === item.id) || i.name.toLowerCase() === item.name.toLowerCase());
    if (existingIdx !== -1) {
        items[existingIdx] = item;
    } else {
        items.push(item);
    }

    fs.writeFile(hbItemsFile, JSON.stringify(items, null, 2), 'utf8', (err) => {
        if (err) return res.status(500).json({ error: "Failed to save homebrew item" });
        res.json({ success: true, item, items });
    });
});

app.delete('/api/homebrew/items/:id', (req, res) => {
    const itemId = req.params.id;
    const hbItemsFile = path.join(__dirname, 'data', 'homebrew', 'magic_items.json');
    if (!fs.existsSync(hbItemsFile)) return res.json({ success: true, items: [] });
    try {
        let items = JSON.parse(fs.readFileSync(hbItemsFile, 'utf8'));
        items = items.filter(i => i.id !== itemId && i.name !== itemId);
        fs.writeFileSync(hbItemsFile, JSON.stringify(items, null, 2), 'utf8');
        res.json({ success: true, items });
    } catch (e) {
        res.status(500).json({ error: "Failed to delete homebrew item" });
    }
});

// PDF Parser Upload & Inspection Endpoints
app.post('/api/pdf-parser/upload', (req, res) => {
    const { fileName, base64Data } = req.body || {};
    if (!fileName || !base64Data) {
        return res.status(400).json({ error: "fileName and base64Data are required." });
    }

    const uploadsDir = path.join(__dirname, 'data', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const safeName = fileName.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const filePath = path.join(uploadsDir, safeName);
    const buffer = Buffer.from(base64Data.replace(/^data:application\/pdf;base64,/, ''), 'base64');

    fs.writeFile(filePath, buffer, (err) => {
        if (err) return res.status(500).json({ error: "Failed to save PDF upload file." });

        // Run inspect CLI to get page count & title
        const exec = require('child_process').exec;
        exec(`python parse_pdf.py --info --file "${filePath}"`, { cwd: __dirname }, (error, stdout, stderr) => {
            let info = { page_count: 0, title: safeName, file_size_bytes: buffer.length };
            try {
                if (stdout) {
                    const parsedInfo = JSON.parse(stdout.trim());
                    if (!parsedInfo.error) info = parsedInfo;
                }
            } catch (e) {}

            res.json({ success: true, filePath, fileName: safeName, info });
        });
    });
});

app.post('/api/pdf-parser/inspect', (req, res) => {
    const { filePath } = req.body || {};
    if (!filePath || !fs.existsSync(filePath)) {
        return res.status(400).json({ error: "Valid filePath is required." });
    }

    const exec = require('child_process').exec;
    exec(`python parse_pdf.py --info --file "${filePath}"`, { cwd: __dirname }, (error, stdout, stderr) => {
        try {
            if (stdout) {
                const info = JSON.parse(stdout.trim());
                return res.json({ success: true, info });
            }
        } catch (e) {}
        res.json({ success: false, error: "Failed to inspect PDF." });
    });
});

// Draft Duplicate Detection Endpoint


// ====================================================
// V2: HYBRID BETWEEN-SESSION ENDPOINTS
// ====================================================

// Post Sealed Envelopes (Called on Session End)
app.post('/api/session/end', (req, res) => {
    const { envelopes, nextSessionDate } = req.body;

    // 1. Save envelopes to disk for reference
    const envelopeData = {
        session_id: `session_${new Date().toISOString().split('T')[0]}`,
        created_at: new Date().toISOString(),
        envelopes: envelopes || []
    };

    const envPath = path.join(__dirname, 'data', 'sealed_envelopes.json');
    fs.writeFileSync(envPath, JSON.stringify(envelopeData, null, 2));

    // 2. Push to connected players in real-time if online
    envelopes.forEach(envelope => {
        const targets = envelope.target === 'all'
            ? [] // Handled dynamically below or sent to room
            : (Array.isArray(envelope.target) ? envelope.target : [envelope.target]);

        if (envelope.target === 'all') {
            io.emit('sealed-envelope', envelope);
        } else {
            targets.forEach(playerId => {
                io.to(`player:${playerId}`).emit('sealed-envelope', envelope);
            });
        }
    });

    // 3. Update next session date inside world_state
    const worldPath = path.join(__dirname, 'data', 'world_state.json');
    let worldState = { calendar_day: 1, current_year: 1492 };
    if (fs.existsSync(worldPath)) {
        try {
            worldState = JSON.parse(fs.readFileSync(worldPath, 'utf8'));
        } catch(e) {}
    }
    worldState.next_session_date = nextSessionDate;
    worldState.last_session_ended = new Date().toISOString();
    fs.writeFileSync(worldPath, JSON.stringify(worldState, null, 2));

    res.json({ success: true, envelopes_pushed: envelopes.length });
});

// Sync and merge from offline hybrid sessions (Session Reconnect)
app.post('/api/session/merge', (req, res) => {
    const {
        characterId,
        character_edits,
        skill_results,
        journal_entries,
        tavern_posts
    } = req.body;

    const partyPath = getPartyPath();
    fs.readFile(partyPath, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: "Failed to read party database" });

        let party = JSON.parse(data);
        const charIdx = party.findIndex(c => c.id === characterId);
        if (charIdx === -1) {
            return res.status(404).json({ error: "Character not found" });
        }

        let character = party[charIdx];
        const conflicts = [];

        // Apply Character edits with conflict tracking
        if (Array.isArray(character_edits)) {
            character_edits.forEach(edit => {
                const serverValue = character[edit.field];
                const clientOldValue = edit.oldValue;
                const clientNewValue = edit.newValue;

                // Rules-based Auto resolution bypass checks
                const dmAuthoritative = [
                    'level', 'xp', 'max_hp', 'class', 'subclass',
                    'proficiency_bonus', 'inspiration', 'conditions', 'death_saves',
                    'gold', 'platinum', 'electrum'
                ];
                const playerAuthoritative = [
                    'prepared_spells', 'spell_order', 'notes',
                    'personality_traits', 'ideals', 'bonds', 'flaws',
                    'backstory', 'appearance', 'journal_entries', 'equipment_order',
                    'theme', 'wishlist', 'magic_items', 'inventory'
                ];

                if (dmAuthoritative.includes(edit.field)) {
                    // DM Wins - bypass save, log nothing
                } else if (playerAuthoritative.includes(edit.field)) {
                    // Player Wins - override directly
                    character[edit.field] = clientNewValue;
                } else if (serverValue !== undefined && JSON.stringify(serverValue) !== JSON.stringify(clientOldValue)) {
                    // True ambiguous conflict (e.g. HP, spell slots, stats)
                    conflicts.push({
                        field: edit.field,
                        server_value: serverValue,
                        client_old_value: clientOldValue,
                        client_new_value: clientNewValue,
                        timestamp: edit.timestamp
                    });
                } else {
                    // Safe merge
                    character[edit.field] = clientNewValue;
                }
            });
        }

        // Handle skill challenge logs
        if (Array.isArray(skill_results)) {
            const skillPath = path.join(__dirname, 'data', 'skill_challenge_results.json');
            let savedResults = [];
            if (fs.existsSync(skillPath)) {
                try { savedResults = JSON.parse(fs.readFileSync(skillPath, 'utf8')); } catch(e){}
            }
            skill_results.forEach(res => {
                savedResults.push(res);
                io.to('dm').emit('skill-challenge-result-whisper', {
                    characterName: character.name,
                    ...res
                });
            });
            fs.writeFileSync(skillPath, JSON.stringify(savedResults, null, 2));
        }

        // Process Journal Entries
        if (Array.isArray(journal_entries)) {
            const journalPath = path.join(__dirname, 'data', 'journal_archive.json');
            let savedJournals = [];
            if (fs.existsSync(journalPath)) {
                try { savedJournals = JSON.parse(fs.readFileSync(journalPath, 'utf8')); } catch(e){}
            }
            journal_entries.forEach(entry => {
                savedJournals.push(entry);
                io.to('dm').emit('journal-entry-whisper', {
                    characterName: character.name,
                    ...entry
                });
            });
            fs.writeFileSync(journalPath, JSON.stringify(savedJournals, null, 2));
        }

        party[charIdx] = character;

        fs.writeFile(partyPath, JSON.stringify(party, null, 2), (writeErr) => {
            if (writeErr) return res.status(500).json({ error: "Failed to update party data" });

            io.to('dm').emit('party-updated', party);
            io.to(`player:${characterId}`).emit('character-updated', character);

            res.json({
                success: true,
                conflicts: conflicts,
                edits_applied: character_edits ? character_edits.length - conflicts.length : 0
            });
        });
    });
});

// Resolve Conflicts manual overrides endpoint
app.post('/api/session/resolve-conflicts', (req, res) => {
    const { characterId, resolutions } = req.body;
    const partyPath = getPartyPath();

    fs.readFile(partyPath, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: "Failed to read party" });

        let party = JSON.parse(data);
        const idx = party.findIndex(c => c.id === characterId);
        if (idx === -1) return res.status(404).json({ error: "Character not found" });

        let character = party[idx];
        if (Array.isArray(resolutions)) {
            resolutions.forEach(r => {
                character[r.field] = r.value;
            });
        }

        party[idx] = character;
        fs.writeFile(partyPath, JSON.stringify(party, null, 2), () => {
            io.to('dm').emit('party-updated', party);
            io.to(`player:${characterId}`).emit('character-updated', character);
            res.json({ success: true });
        });
    });
});


// ----------------------------------------------------
// START SERVER
// ----------------------------------------------------
server.listen(PORT, '0.0.0.0', () => {
    console.log(`===========================================`);
    console.log(`  DM Command Center Initialized`);
    console.log(` Dashboard running at: http://localhost:${PORT}`);
    console.log(` Player Join Page:     http://${localIP}:${PORT}/join`);
    console.log(` Player Mirror:        http://localhost:${PORT}/player.html`);
    console.log(` Table Projector:      http://localhost:${PORT}/projector.html`);
    console.log(` Press [Ctrl + C] in this terminal to shut down.`);
    console.log(`===========================================`);
});