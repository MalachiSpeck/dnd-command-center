const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { promises: fsp } = require('fs');

module.exports = function mapsRouter(scenesStore) {
    // List all available battle maps
    router.get('/maps', async (req, res) => {
        const mapsDir = path.join(__dirname, '..', 'public', 'maps');
        if (!fs.existsSync(mapsDir)) {
            await fsp.mkdir(mapsDir, { recursive: true });
        }

        try {
            const files = await fsp.readdir(mapsDir);
            const validExts = ['.jpg', '.jpeg', '.png', '.webp', '.webm', '.mp4', '.mov', '.m4v'];
            const mapFiles = (files || []).filter(f => validExts.includes(path.extname(f).toLowerCase()));

            const parsedScenes = await scenesStore.get();
            let scenesUpdated = false;

            mapFiles.forEach(f => {
                const mapUrl = `/maps/${f}`;
                const exists = (parsedScenes.scenes || []).some(s => s.background_url === mapUrl);
                if (!exists) {
                    const cleanName = f.replace(/^\d+_/, '').replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ');
                    const newId = 'scene_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
                    if (!parsedScenes.scenes) parsedScenes.scenes = [];
                    parsedScenes.scenes.push({
                        id: newId,
                        name: cleanName,
                        width_px: 2800,
                        height_px: 2100,
                        background_color: "#121824",
                        background_url: mapUrl,
                        grid: { type: "square", size_px: 70, offset_x: 0, offset_y: 0, color: "#ffffff", opacity: 0.2, visible: true },
                        walls: [],
                        lights: [],
                        tokens: [],
                        drawings: [],
                        templates: [],
                        fog: { mode: "off", revealed_polygons: [] },
                        aoe_templates: []
                    });
                    scenesUpdated = true;
                }
            });

            if (scenesUpdated) {
                await scenesStore.update(p => p);
            }

            const result = mapFiles.map(f => {
                const mapUrl = `/maps/${f}`;
                const matchingScene = (parsedScenes.scenes || []).find(s => s.background_url === mapUrl);
                return {
                    filename: f,
                    url: mapUrl,
                    name: matchingScene ? matchingScene.name : f.replace(/^\d+_/, '').replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' '),
                    scene_id: matchingScene ? matchingScene.id : null,
                    isVideo: /\.(webm|mp4|mov|m4v)$/i.test(f)
                };
            });

            const activeScene = (parsedScenes.scenes || []).find(s => s.id === parsedScenes.active_scene_id);

            return res.json({
                maps: result,
                active_scene_id: parsedScenes.active_scene_id,
                active_background_url: activeScene ? activeScene.background_url : null
            });

        } catch (err) {
            console.error('[Routes/Maps] Error listing maps:', err);
            return res.status(500).json({ error: "Failed to read maps directory" });
        }
    });

    // Upload custom map image or video
    router.post('/upload-map', async (req, res) => {
        const fileName = (req.body && (req.body.fileName || req.body.filename)) || '';
        const fileData = (req.body && (req.body.fileData || req.body.image_data)) || '';
        const sceneName = (req.body && (req.body.sceneName || req.body.scene_name)) || '';
        if (!fileName || !fileData) {
            return res.status(400).json({ error: "fileName and fileData (base64) are required." });
        }

        const mapsDir = path.join(__dirname, '..', 'public', 'maps');
        if (!fs.existsSync(mapsDir)) {
            await fsp.mkdir(mapsDir, { recursive: true });
        }

        const safeName = fileName.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
        const targetPath = path.join(mapsDir, safeName);
        const mapUrl = `/maps/${safeName}`;

        try {
            const base64Clean = fileData.replace(/^data:(image|video)\/[a-zA-Z0-9]+;base64,/, '');
            const buffer = Buffer.from(base64Clean, 'base64');
            await fsp.writeFile(targetPath, buffer);

            let newScene = null;
            await scenesStore.update(parsed => {
                if (!parsed.scenes) parsed.scenes = [];
                let matching = parsed.scenes.find(s => s.background_url === mapUrl);
                if (!matching) {
                    const cleanName = sceneName || safeName.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ');
                    matching = {
                        id: 'scene_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
                        name: cleanName,
                        width_px: 2800,
                        height_px: 2100,
                        background_color: "#121824",
                        background_url: mapUrl,
                        grid: { type: "square", size_px: 70, offset_x: 0, offset_y: 0, color: "#ffffff", opacity: 0.2, visible: true },
                        walls: [],
                        lights: [],
                        tokens: [],
                        drawings: [],
                        templates: [],
                        fog: { mode: "off", revealed_polygons: [] },
                        aoe_templates: []
                    };
                    parsed.scenes.push(matching);
                }
                parsed.active_scene_id = matching.id;
                newScene = matching;
            }, 'scene:update');

            return res.json({
                success: true,
                message: `Uploaded map ${safeName} successfully.`,
                mapUrl,
                scene: newScene
            });

        } catch (err) {
            console.error('[Routes/Maps] Upload failed:', err);
            return res.status(500).json({ error: "Failed to save uploaded map file." });
        }
    });

    return router;
};
