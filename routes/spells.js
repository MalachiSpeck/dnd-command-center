const express = require('express');
const router = express.Router();
const dataCache = require('../services/dataCache');

// GET /api/spells
router.get('/', (req, res) => {
    const query = req.query.q || req.query.search || '';
    const spells = dataCache.getSpells(query);
    res.json(spells);
});

// GET /api/spells/:name
router.get('/:name', (req, res) => {
    const name = decodeURIComponent(req.params.name).toLowerCase();
    const spell = dataCache.getSpells().find(s => s.name && s.name.toLowerCase() === name);
    if (!spell) return res.status(404).json({ error: 'Spell not found' });
    res.json(spell);
});

module.exports = router;
