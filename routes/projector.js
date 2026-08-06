const express = require('express');
const router = express.Router();
const path = require('path');
const { promises: fsp } = require('fs');
const fs = require('fs');

module.exports = function projectorRouter(getProjectorState, setProjectorState, io) {
    const fogPath = path.join(__dirname, '..', 'data', 'fog_state.json');

    // Get Projector Canvas State
    router.get('/projector-state', (req, res) => {
        return res.json(getProjectorState());
    });

    // Get Projector Active Map Image
    router.get('/projector/map', (req, res) => {
        const state = getProjectorState();
        return res.json({ mapUrl: state.mapUrl });
    });

    // Update Projector Canvas State
    router.post('/projector-state', (req, res) => {
        const newState = { ...getProjectorState(), ...req.body };
        setProjectorState(newState);
        if (io) io.emit('projector-state-updated', newState);
        return res.json({ success: true, message: "Projector state updated.", state: newState });
    });

    // Persistent Fog of War State
    router.get('/projector/fog', async (req, res) => {
        if (!fs.existsSync(fogPath)) return res.json({ fogGrid: [] });
        try {
            const data = await fsp.readFile(fogPath, 'utf8');
            return res.json(JSON.parse(data));
        } catch (e) {
            return res.json({ fogGrid: [] });
        }
    });

    router.post('/projector/fog', async (req, res) => {
        const { fogGrid } = req.body;
        const currentState = getProjectorState();
        currentState.fogGrid = fogGrid;
        setProjectorState(currentState);

        try {
            const tmpPath = fogPath + '.tmp';
            await fsp.writeFile(tmpPath, JSON.stringify({ fogGrid }, null, 2), 'utf8');
            await fsp.rename(tmpPath, fogPath);
            if (io) io.emit('projector-state-updated', currentState);
            return res.json({ success: true, fogGrid });
        } catch (err) {
            console.error('[Routes/Projector] Failed to persist fog state:', err);
            return res.status(500).json({ error: "Failed to persist fog state" });
        }
    });

    return router;
};
