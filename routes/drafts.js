const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { promises: fsp } = require('fs');

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

module.exports = function draftsRouter(io) {
    const rootDataDir = path.join(__dirname, '..', 'data');

    // List all drafts in staging folder
    router.get('/drafts', async (req, res) => {
        const draftsDir = path.join(rootDataDir, 'drafts');
        const categories = ['spells', 'monsters', 'magic_items'];
        const result = { spells: [], monsters: [], magic_items: [] };

        if (!fs.existsSync(draftsDir)) {
            return res.json(result);
        }

        try {
            for (const cat of categories) {
                const catDir = path.join(draftsDir, cat);
                if (fs.existsSync(catDir)) {
                    const files = await fsp.readdir(catDir);
                    result[cat] = files || [];
                }
            }
            return res.json(result);
        } catch (err) {
            console.error('[Routes/Drafts] Error listing drafts:', err);
            return res.json(result);
        }
    });

    // Check duplicate draft names
    router.get('/drafts/check-duplicates', async (req, res) => {
        const draftsDir = path.join(rootDataDir, 'drafts');
        const existingNames = new Set();

        const itemsPath = path.join(rootDataDir, 'items.json');
        if (fs.existsSync(itemsPath)) {
            try {
                const itemsData = JSON.parse(await fsp.readFile(itemsPath, 'utf8'));
                const list = Array.isArray(itemsData) ? itemsData : (itemsData.item || []);
                list.forEach(i => i.name && existingNames.add(i.name.toLowerCase()));
            } catch (e) {}
        }

        const hbItemsPath = path.join(rootDataDir, 'homebrew', 'magic_items.json');
        if (fs.existsSync(hbItemsPath)) {
            try {
                const hbList = JSON.parse(await fsp.readFile(hbItemsPath, 'utf8'));
                hbList.forEach(i => i.name && existingNames.add(i.name.toLowerCase()));
            } catch (e) {}
        }

        const monstersDir = path.join(rootDataDir, 'monsters');
        if (fs.existsSync(monstersDir)) {
            try {
                const mFiles = await fsp.readdir(monstersDir);
                mFiles.forEach(f => existingNames.add(f.replace('.json', '').replace(/_/g, ' ').toLowerCase()));
            } catch (e) {}
        }

        const duplicates = [];
        for (const cat of ['spells', 'monsters', 'magic_items']) {
            const catDir = path.join(draftsDir, cat);
            if (fs.existsSync(catDir)) {
                try {
                    const files = await fsp.readdir(catDir);
                    files.forEach(file => {
                        const cleanName = file.replace(/\.(json|md)$/, '').replace(/_/g, ' ').toLowerCase();
                        if (existingNames.has(cleanName)) {
                            duplicates.push({ category: cat, fileName: file, cleanName });
                        }
                    });
                } catch (e) {}
            }
        }

        return res.json({ success: true, duplicates });
    });

    // Read a specific draft's contents
    router.get('/drafts/:type/:fileName', async (req, res) => {
        const { type, fileName } = req.params;
        let targetPath;
        try {
            targetPath = safeJoin(rootDataDir, 'drafts', type, fileName);
        } catch (e) {
            return res.status(400).json({ error: e.message });
        }

        if (!fs.existsSync(targetPath)) {
            return res.status(404).json({ error: "Draft file not found." });
        }

        try {
            const data = await fsp.readFile(targetPath, 'utf8');
            if (type === 'spells') {
                return res.send(data);
            } else {
                return res.json(JSON.parse(data));
            }
        } catch (e) {
            return res.status(500).json({ error: "Failed to read or parse draft file." });
        }
    });

    // Delete/Reject a specific draft
    router.delete('/drafts/:type/:fileName', async (req, res) => {
        const { type, fileName } = req.params;
        let targetPath;
        try {
            targetPath = safeJoin(rootDataDir, 'drafts', type, fileName);
        } catch (e) {
            return res.status(400).json({ error: e.message });
        }

        if (!fs.existsSync(targetPath)) {
            return res.status(404).json({ error: "Draft not found." });
        }

        try {
            await fsp.unlink(targetPath);
            return res.json({ success: true, message: "Draft discarded successfully." });
        } catch (e) {
            return res.status(500).json({ error: "Failed to delete draft." });
        }
    });

    // Approve and save a draft to the Homebrew repository
    router.post('/drafts/approve', async (req, res) => {
        const { type, fileName, data } = req.body;
        if (!type || !fileName || !data) {
            return res.status(400).json({ error: "Missing required approval fields." });
        }

        const homebrewDir = path.join(rootDataDir, 'homebrew');
        let draftPath;
        try {
            draftPath = safeJoin(rootDataDir, 'drafts', type, fileName);
        } catch (e) {
            return res.status(400).json({ error: e.message });
        }

        if (!fs.existsSync(homebrewDir)) {
            await fsp.mkdir(homebrewDir, { recursive: true });
        }

        try {
            if (type === 'spells') {
                const spellsHBDir = path.join(homebrewDir, 'spells');
                if (!fs.existsSync(spellsHBDir)) await fsp.mkdir(spellsHBDir, { recursive: true });

                const targetPath = path.join(spellsHBDir, fileName);
                await fsp.writeFile(targetPath, data, 'utf8');
                if (fs.existsSync(draftPath)) await fsp.unlink(draftPath);
                return res.json({ success: true, message: "Spell approved and moved to Homebrew!" });

            } else if (type === 'monsters') {
                const monstersHBDir = path.join(homebrewDir, 'monsters');
                if (!fs.existsSync(monstersHBDir)) await fsp.mkdir(monstersHBDir, { recursive: true });

                const targetPath = path.join(monstersHBDir, fileName);
                await fsp.writeFile(targetPath, JSON.stringify(data, null, 2), 'utf8');
                if (fs.existsSync(draftPath)) await fsp.unlink(draftPath);
                return res.json({ success: true, message: "Monster approved and moved to Homebrew!" });

            } else if (type === 'magic_items') {
                const itemsHBFile = path.join(homebrewDir, 'magic_items.json');
                let homebrewItems = [];
                if (fs.existsSync(itemsHBFile)) {
                    try {
                        homebrewItems = JSON.parse(await fsp.readFile(itemsHBFile, 'utf8'));
                    } catch (e) {}
                }
                homebrewItems.push(data);
                await fsp.writeFile(itemsHBFile, JSON.stringify(homebrewItems, null, 2), 'utf8');
                if (fs.existsSync(draftPath)) await fsp.unlink(draftPath);
                return res.json({ success: true, message: "Magic Item approved and saved to Homebrew!" });
            } else {
                return res.status(400).json({ error: "Invalid type specified." });
            }
        } catch (err) {
            console.error('[Routes/Drafts] Approve failed:', err);
            return res.status(500).json({ error: "Failed to process draft approval." });
        }
    });

    // Approve All staged drafts at once
    router.post('/drafts/approve-all', async (req, res) => {
        const homebrewDir = path.join(rootDataDir, 'homebrew');
        const draftsDir = path.join(rootDataDir, 'drafts');

        if (!fs.existsSync(homebrewDir)) {
            await fsp.mkdir(homebrewDir, { recursive: true });
        }

        let spellsApproved = 0;
        let monstersApproved = 0;
        let itemsApproved = 0;

        try {
            // 1. Spells
            const spellsDraftDir = path.join(draftsDir, 'spells');
            const spellsHBDir = path.join(homebrewDir, 'spells');
            if (fs.existsSync(spellsDraftDir)) {
                if (!fs.existsSync(spellsHBDir)) await fsp.mkdir(spellsHBDir, { recursive: true });
                const files = (await fsp.readdir(spellsDraftDir)).filter(f => f.endsWith('.md'));
                for (const file of files) {
                    const src = path.join(spellsDraftDir, file);
                    const dst = path.join(spellsHBDir, file);
                    await fsp.copyFile(src, dst);
                    await fsp.unlink(src);
                    spellsApproved++;
                }
            }

            // 2. Monsters
            const monstersDraftDir = path.join(draftsDir, 'monsters');
            const monstersHBDir = path.join(homebrewDir, 'monsters');
            if (fs.existsSync(monstersDraftDir)) {
                if (!fs.existsSync(monstersHBDir)) await fsp.mkdir(monstersHBDir, { recursive: true });
                const files = (await fsp.readdir(monstersDraftDir)).filter(f => f.endsWith('.json'));
                for (const file of files) {
                    const src = path.join(monstersDraftDir, file);
                    const dst = path.join(monstersHBDir, file);
                    await fsp.copyFile(src, dst);
                    await fsp.unlink(src);
                    monstersApproved++;
                }
            }

            // 3. Magic Items
            const itemsDraftDir = path.join(draftsDir, 'magic_items');
            const itemsHBFile = path.join(homebrewDir, 'magic_items.json');
            if (fs.existsSync(itemsDraftDir)) {
                const files = (await fsp.readdir(itemsDraftDir)).filter(f => f.endsWith('.json'));
                let homebrewItems = [];
                if (fs.existsSync(itemsHBFile)) {
                    try { homebrewItems = JSON.parse(await fsp.readFile(itemsHBFile, 'utf8')); } catch (e) {}
                }
                for (const file of files) {
                    const src = path.join(itemsDraftDir, file);
                    try {
                        const itemData = JSON.parse(await fsp.readFile(src, 'utf8'));
                        if (Array.isArray(itemData)) homebrewItems = homebrewItems.concat(itemData);
                        else homebrewItems.push(itemData);
                        await fsp.unlink(src);
                        itemsApproved++;
                    } catch (e) {}
                }
                await fsp.writeFile(itemsHBFile, JSON.stringify(homebrewItems, null, 2), 'utf8');
            }

            return res.json({
                success: true,
                message: `Approved all staged drafts: ${spellsApproved} spells, ${monstersApproved} monsters, and ${itemsApproved} magic items saved to active library.`,
                spells: spellsApproved,
                monsters: monstersApproved,
                items: itemsApproved
            });
        } catch (err) {
            console.error('[Routes/Drafts] Approve-all failed:', err);
            return res.status(500).json({ error: "Failed to approve all drafts." });
        }
    });

    return router;
};
