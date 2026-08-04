const fs = require('fs');
const path = require('path');

class DataCache {
    constructor() {
        this.dataDir = path.join(__dirname, '..', 'data');
        this.monsters = [];
        this.spells = [];
        this.items = [];
        this.races = [];
        this.feats = [];
        this.rules = [];
        this.conditions = [];
        this.isLoaded = false;
    }

    /**
     * Load all JSON and MD datasets into memory on server boot.
     */
    init() {
        console.log('[DataCache] Initializing in-memory dataset cache...');
        const startTime = Date.now();

        this.loadMonsters();
        this.loadSpells();
        this.loadItems();
        this.loadRaces();
        this.loadFeats();
        this.loadRules();

        this.isLoaded = true;
        console.log(`[DataCache] Loaded in ${Date.now() - startTime}ms! (Monsters: ${this.monsters.length}, Spells: ${this.spells.length}, Items: ${this.items.length})`);
    }

    loadMonsters() {
        this.monsters = [];
        const monstersDir = path.join(this.dataDir, 'monsters');
        const homebrewDir = path.join(this.dataDir, 'homebrew', 'monsters');

        const readDirQuiet = (dir) => {
            if (!fs.existsSync(dir)) return;
            try {
                const files = fs.readdirSync(dir);
                for (const file of files) {
                    if (file.endsWith('.json')) {
                        try {
                            const content = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
                            if (Array.isArray(content)) {
                                this.monsters.push(...content);
                            } else if (content && content.monster) {
                                if (Array.isArray(content.monster)) {
                                    this.monsters.push(...content.monster);
                                } else {
                                    this.monsters.push(content.monster);
                                }
                            } else if (content) {
                                this.monsters.push(content);
                            }
                        } catch (e) {
                            // ignore malformed files
                        }
                    }
                }
            } catch (e) {}
        };

        readDirQuiet(monstersDir);
        readDirQuiet(homebrewDir);
    }

    loadSpells() {
        this.spells = [];
        const spellsDir = path.join(this.dataDir, 'spells');

        if (fs.existsSync(spellsDir)) {
            try {
                const files = fs.readdirSync(spellsDir);
                for (const file of files) {
                    const filePath = path.join(spellsDir, file);
                    if (file.endsWith('.json')) {
                        try {
                            const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                            if (Array.isArray(content)) {
                                this.spells.push(...content);
                            } else if (content && content.spell) {
                                if (Array.isArray(content.spell)) {
                                    this.spells.push(...content.spell);
                                } else {
                                    this.spells.push(content.spell);
                                }
                            }
                        } catch (e) {}
                    } else if (file.endsWith('.md')) {
                        try {
                            const text = fs.readFileSync(filePath, 'utf8');
                            const nameMatch = text.match(/^#\s+(.+)$/m) || text.match(/^Name:\s*(.+)$/im);
                            const name = nameMatch ? nameMatch[1].trim() : file.replace('.md', '');
                            this.spells.push({ name, description: text, isMd: true, filename: file });
                        } catch (e) {}
                    }
                }
            } catch (e) {}
        }
    }

    loadItems() {
        this.items = [];
        const itemFiles = ['items.json', 'items-base.json', 'magic_items.json', 'fluff-items.json'];
        for (const file of itemFiles) {
            const fullPath = path.join(this.dataDir, file);
            if (fs.existsSync(fullPath)) {
                try {
                    const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
                    if (Array.isArray(content)) {
                        this.items.push(...content);
                    } else if (content && content.item) {
                        this.items.push(...content.item);
                    }
                } catch (e) {}
            }
        }
    }

    loadRaces() {
        this.races = [];
        const raceFile = path.join(this.dataDir, 'races.json');
        if (fs.existsSync(raceFile)) {
            try {
                const content = JSON.parse(fs.readFileSync(raceFile, 'utf8'));
                if (Array.isArray(content)) this.races = content;
                else if (content && content.race) this.races = content.race;
            } catch (e) {}
        }
    }

    loadFeats() {
        this.feats = [];
        const featFile = path.join(this.dataDir, 'feats.json');
        if (fs.existsSync(featFile)) {
            try {
                const content = JSON.parse(fs.readFileSync(featFile, 'utf8'));
                if (Array.isArray(content)) this.feats = content;
                else if (content && content.feat) this.feats = content.feat;
            } catch (e) {}
        }
    }

    loadRules() {
        this.rules = [];
        this.conditions = [];
        const rulesFile = path.join(this.dataDir, 'rules_reference.json');
        const condFile = path.join(this.dataDir, 'conditions.json');

        if (fs.existsSync(rulesFile)) {
            try { this.rules = JSON.parse(fs.readFileSync(rulesFile, 'utf8')); } catch (e) {}
        }
        if (fs.existsSync(condFile)) {
            try { this.conditions = JSON.parse(fs.readFileSync(condFile, 'utf8')); } catch (e) {}
        }
    }

    // --- GETTERS ---
    getMonsters(query = '') {
        if (!query) return this.monsters;
        const q = query.toLowerCase();
        return this.monsters.filter(m => m.name && m.name.toLowerCase().includes(q));
    }

    getSpells(query = '') {
        if (!query) return this.spells;
        const q = query.toLowerCase();
        return this.spells.filter(s => s.name && s.name.toLowerCase().includes(q));
    }

    getItems(query = '') {
        if (!query) return this.items;
        const q = query.toLowerCase();
        return this.items.filter(i => i.name && i.name.toLowerCase().includes(q));
    }

    getRaces() { return this.races; }
    getFeats() { return this.feats; }
    getRules() { return this.rules; }
    getConditions() { return this.conditions; }

    reload() {
        this.init();
    }
}

module.exports = new DataCache();
