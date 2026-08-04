const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const soundsBaseDir = path.join(__dirname, '..', 'public', 'sounds');

// GET /api/sounds - Dynamically scans public/sounds/ subdirectories
router.get('/', (req, res) => {
    if (!fs.existsSync(soundsBaseDir)) {
        fs.mkdirSync(soundsBaseDir, { recursive: true });
    }

    const categories = ['ambience', 'weather', 'music', 'combat', 'sfx', 'spells'];
    const result = {};

    categories.forEach(cat => {
        const catDir = path.join(soundsBaseDir, cat);
        result[cat] = [];
        if (fs.existsSync(catDir)) {
            try {
                const files = fs.readdirSync(catDir);
                files.forEach(f => {
                    const ext = path.extname(f).toLowerCase();
                    if (['.mp3', '.wav', '.ogg', '.m4a', '.flac'].includes(ext)) {
                        const cleanName = f.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ');
                        result[cat].push({
                            filename: f,
                            name: cleanName,
                            url: `/sounds/${cat}/${f}`,
                            category: cat
                        });
                    }
                });
            } catch (e) {}
        }
    });

    res.json(result);
});

module.exports = router;
