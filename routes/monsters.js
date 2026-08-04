const express = require('express');
const router = express.Router();
const dataCache = require('../services/dataCache');

// GET /api/monsters
router.get('/', (req, res) => {
    const query = req.query.q || req.query.search || '';
    const monsters = dataCache.getMonsters(query);
    res.json(monsters);
});

// GET /api/monsters/:id
router.get('/:name', (req, res) => {
    const name = decodeURIComponent(req.params.name).toLowerCase();
    const monster = dataCache.getMonsters().find(m => m.name && m.name.toLowerCase() === name);
    if (!monster) return res.status(404).json({ error: 'Monster not found' });
    res.json(monster);
});

module.exports = router;
