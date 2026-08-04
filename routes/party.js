const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

module.exports = function(partyStore, getPartyPath) {
    // GET /api/party
    router.get('/party', async (req, res) => {
        try {
            const party = await partyStore.get();
            res.json(party);
        } catch (err) {
            res.status(500).json({ error: 'Failed to read party data' });
        }
    });

    // POST /api/party/save
    router.post('/party/save', async (req, res) => {
        try {
            const newParty = req.body;
            if (!Array.isArray(newParty)) {
                return res.status(400).json({ error: 'Invalid party payload, must be an array' });
            }
            await partyStore.update(party => {
                party.length = 0;
                party.push(...newParty);
            });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to save party data' });
        }
    });

    // POST /api/sync/:characterId
    router.post('/sync/:characterId', async (req, res) => {
        try {
            const charId = req.params.characterId;
            const updates = req.body;
            await partyStore.update(party => {
                const char = party.find(c => String(c.id) === String(charId) || c.name === charId);
                if (char) {
                    Object.assign(char, updates);
                }
            });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to sync character' });
        }
    });

    // GET /api/pending-characters
    router.get('/pending-characters', (req, res) => {
        const filePath = path.join(__dirname, '..', 'data', 'pending_characters.json');
        if (fs.existsSync(filePath)) {
            fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) return res.json([]);
                try { res.json(JSON.parse(data)); } catch (e) { res.json([]); }
            });
        } else {
            res.json([]);
        }
    });

    return router;
};
