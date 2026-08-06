const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { promises: fsp } = require('fs');
const { readJsonSafe } = require('../services/jsonStore');

module.exports = function campaignRouter(io) {
    const rootDataDir = path.join(__dirname, '..', 'data');

    // 1. Continuity & Retcon Tracker
    router.get('/continuity', async (req, res) => {
        const p = path.join(rootDataDir, 'continuity.json');
        const data = await readJsonSafe(p, [], 'Continuity');
        return res.json(data);
    });

    router.post('/continuity/save', async (req, res) => {
        const p = path.join(rootDataDir, 'continuity.json');
        try {
            await fsp.writeFile(p, JSON.stringify(req.body, null, 2), 'utf8');
            return res.json({ success: true });
        } catch (e) {
            return res.status(500).json({ error: "Failed to save continuity" });
        }
    });

    // 2. Travel Formations
    router.get('/formations', async (req, res) => {
        const p = path.join(rootDataDir, 'formations.json');
        const data = await readJsonSafe(p, { active: "Dungeon Crawl", presets: {} }, 'Formations');
        return res.json(data);
    });

    router.post('/formations/save', async (req, res) => {
        const p = path.join(rootDataDir, 'formations.json');
        try {
            await fsp.writeFile(p, JSON.stringify(req.body, null, 2), 'utf8');
            return res.json({ success: true });
        } catch (e) {
            return res.status(500).json({ error: "Failed to save formations" });
        }
    });

    // 3. Spell Interactions Rules
    router.get('/spell-interactions', async (req, res) => {
        const p = path.join(rootDataDir, 'spell_interactions.json');
        const data = await readJsonSafe(p, [], 'SpellInteractions');
        return res.json(data);
    });

    // 4. Dice Statistics Logger
    router.get('/dice-statistics', async (req, res) => {
        const p = path.join(rootDataDir, 'dice_log.json');
        const data = await readJsonSafe(p, [], 'DiceStats');
        return res.json(data);
    });

    router.post('/dice-statistics/log', async (req, res) => {
        const p = path.join(rootDataDir, 'dice_log.json');
        try {
            const list = await readJsonSafe(p, [], 'DiceStatsLog');
            list.push(req.body);
            if (list.length > 500) list.shift();
            await fsp.writeFile(p, JSON.stringify(list, null, 2), 'utf8');
            return res.json({ success: true });
        } catch (e) {
            return res.status(500).json({ error: "Failed to log dice statistic" });
        }
    });

    // 5. Character Memorial Hall
    router.get('/character-memorials', async (req, res) => {
        const p = path.join(rootDataDir, 'memorial.json');
        const data = await readJsonSafe(p, [], 'Memorials');
        return res.json(data);
    });

    router.post('/character-memorials/add', async (req, res) => {
        const p = path.join(rootDataDir, 'memorial.json');
        try {
            const list = await readJsonSafe(p, [], 'MemorialsAdd');
            list.push(req.body);
            await fsp.writeFile(p, JSON.stringify(list, null, 2), 'utf8');
            return res.json({ success: true });
        } catch (e) {
            return res.status(500).json({ error: "Failed to add memorial" });
        }
    });

    // 6. Branching Dialogue Trees
    router.get('/dialogue-trees', async (req, res) => {
        const p = path.join(rootDataDir, 'dialogues.json');
        const data = await readJsonSafe(p, {}, 'Dialogues');
        return res.json(data);
    });

    router.post('/dialogue-trees/save', async (req, res) => {
        const p = path.join(rootDataDir, 'dialogues.json');
        try {
            await fsp.writeFile(p, JSON.stringify(req.body, null, 2), 'utf8');
            return res.json({ success: true });
        } catch (e) {
            return res.status(500).json({ error: "Failed to save dialogues" });
        }
    });

    // 7. Downtime Projects
    router.get('/downtime', async (req, res) => {
        const dtPath = path.join(rootDataDir, 'downtime.json');
        const data = await readJsonSafe(dtPath, [], 'Downtime');
        return res.json(data);
    });

    router.post('/downtime/update', async (req, res) => {
        const { id, pointsToAdd } = req.body;
        const dtPath = path.join(rootDataDir, 'downtime.json');
        try {
            const dtData = await readJsonSafe(dtPath, [], 'DowntimeUpdate');
            const projectIndex = dtData.findIndex(p => p.id === id);
            if (projectIndex !== -1) {
                dtData[projectIndex].current_points += pointsToAdd;
                if (dtData[projectIndex].current_points > dtData[projectIndex].max_points) {
                    dtData[projectIndex].current_points = dtData[projectIndex].max_points;
                }
                if (dtData[projectIndex].current_points < 0) {
                    dtData[projectIndex].current_points = 0;
                }
                await fsp.writeFile(dtPath, JSON.stringify(dtData, null, 2), 'utf8');
                return res.json({ success: true, message: "Progress logged." });
            } else {
                return res.status(404).json({ error: "Project not found." });
            }
        } catch (e) {
            return res.status(500).json({ error: "Failed to save progress." });
        }
    });

    router.post('/downtime/add', async (req, res) => {
        const { character, project, max_points } = req.body;
        const dtPath = path.join(rootDataDir, 'downtime.json');
        try {
            const dtData = await readJsonSafe(dtPath, [], 'DowntimeAdd');
            const newProject = {
                id: 'dt_' + Date.now(),
                character,
                project,
                current_points: 0,
                max_points: parseInt(max_points, 10)
            };
            dtData.push(newProject);
            await fsp.writeFile(dtPath, JSON.stringify(dtData, null, 2), 'utf8');
            return res.json({ success: true, message: "Project added." });
        } catch (e) {
            return res.status(500).json({ error: "Failed to save new project." });
        }
    });

    return router;
};
