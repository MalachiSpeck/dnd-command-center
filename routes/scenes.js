const express = require('express');
const router = express.Router();
const path = require('path');

function getOrCreateSceneForMap(parsedData, mapUrl, sceneName, syncFn) {
    if (!parsedData.scenes) parsedData.scenes = [];
    
    let existingScene = parsedData.scenes.find(s => s.background_url === mapUrl);
    if (existingScene) {
        if (sceneName && (!existingScene.name || existingScene.name === 'New Battlemap')) {
            existingScene.name = sceneName;
        }
        parsedData.active_scene_id = existingScene.id;
        return typeof syncFn === 'function' ? syncFn(existingScene) : existingScene;
    }
    
    const basename = path.basename(mapUrl);
    const cleanName = sceneName || basename.replace(/^\d+_/, '').replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ');

    const newSceneId = 'scene_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const newScene = {
        id: newSceneId,
        name: cleanName,
        width_px: 2800,
        height_px: 2100,
        background_color: "#121824",
        background_url: mapUrl,
        grid: {
            type: "square",
            size_px: 70,
            offset_x: 0,
            offset_y: 0,
            color: "#ffffff",
            opacity: 0.2,
            visible: true
        },
        walls: [],
        lights: [],
        tokens: [],
        drawings: [],
        templates: [],
        fog: {
            mode: "off",
            revealed_polygons: []
        },
        aoe_templates: []
    };
    
    parsedData.scenes.push(newScene);
    parsedData.active_scene_id = newSceneId;
    return typeof syncFn === 'function' ? syncFn(newScene) : newScene;
}

module.exports = function scenesRouter(scenesStore, syncPartyAndEncounterToScene) {
    // GET active scene data
    router.get('/scene', async (req, res) => {
        try {
            const parsed = await scenesStore.get();
            const activeId = parsed.active_scene_id;
            let activeScene = (parsed.scenes || []).find(s => s.id === activeId) || (parsed.scenes && parsed.scenes[0]);
            if (activeScene && typeof syncPartyAndEncounterToScene === 'function') {
                activeScene = syncPartyAndEncounterToScene(activeScene);
            }
            return res.json(activeScene || {});
        } catch (e) {
            console.error('[Routes/Scenes] Error in GET /api/scene:', e);
            return res.status(500).json({ error: "Failed to read scenes" });
        }
    });

    // Add Token
    router.post('/token/add', async (req, res) => {
        const { name, disposition, size_cells, hp_max, color } = req.body;
        if (!name) return res.status(400).json({ error: "Missing token name" });

        try {
            let newToken = null;
            let targetScene = null;
            await scenesStore.update(parsed => {
                let activeScene = (parsed.scenes || []).find(s => s.id === parsed.active_scene_id) || (parsed.scenes && parsed.scenes[0]);
                if (!activeScene) return;
                if (!activeScene.tokens) activeScene.tokens = [];

                const isHostile = disposition === 'hostile';
                newToken = {
                    id: `tok_manual_${Date.now()}`,
                    name: name,
                    x: isHostile ? 1120 : 420,
                    y: 560,
                    size_cells: parseInt(size_cells || '1', 10),
                    color: color || (isHostile ? '#ef4444' : '#3b82f6'),
                    vision_radius_ft: 60,
                    disposition: disposition || 'hostile',
                    hp_current: parseInt(hp_max || '20', 10),
                    hp_max: parseInt(hp_max || '20', 10),
                    conditions: []
                };

                activeScene.tokens.push(newToken);
                targetScene = activeScene;
            });

            if (scenesStore.io && targetScene) {
                scenesStore.io.emit('scene:update', targetScene);
            }

            return res.json({ success: true, token: newToken, scene: targetScene });
        } catch (e) {
            return res.status(500).json({ error: "Failed to update scene tokens" });
        }
    });

    // Clear Tokens
    router.post('/scene/clear-tokens', async (req, res) => {
        try {
            let targetScene = null;
            await scenesStore.update(parsed => {
                let activeScene = (parsed.scenes || []).find(s => s.id === parsed.active_scene_id) || (parsed.scenes && parsed.scenes[0]);
                if (activeScene) {
                    activeScene.tokens = [];
                    targetScene = activeScene;
                }
            });

            if (scenesStore.io && targetScene) {
                scenesStore.io.emit('scene:update', targetScene);
            }

            return res.json({ success: true, scene: targetScene });
        } catch (e) {
            return res.status(500).json({ error: "Failed to clear tokens" });
        }
    });

    // Clear Lights
    router.post('/scene/clear-lights', async (req, res) => {
        try {
            let targetScene = null;
            await scenesStore.update(parsed => {
                let activeScene = (parsed.scenes || []).find(s => s.id === parsed.active_scene_id) || (parsed.scenes && parsed.scenes[0]);
                if (activeScene) {
                    activeScene.lights = [];
                    targetScene = activeScene;
                }
            });

            if (scenesStore.io && targetScene) {
                scenesStore.io.emit('scene:update', targetScene);
            }

            return res.json({ success: true, scene: targetScene });
        } catch (e) {
            return res.status(500).json({ error: "Failed to clear lights" });
        }
    });

    // Select Active Scene
    router.post('/scene/select', async (req, res) => {
        const { mapUrl, sceneId } = req.body;
        try {
            let targetScene = null;
            let activeId = 'scene_default';
            await scenesStore.update(parsed => {
                if (!parsed.scenes) parsed.scenes = [];
                if (sceneId) {
                    targetScene = parsed.scenes.find(s => s.id === sceneId);
                }
                if (!targetScene && mapUrl) {
                    targetScene = parsed.scenes.find(s => s.background_url === mapUrl);
                }
                if (!targetScene && mapUrl) {
                    targetScene = getOrCreateSceneForMap(parsed, mapUrl, null, syncPartyAndEncounterToScene);
                } else if (targetScene) {
                    parsed.active_scene_id = targetScene.id;
                    if (typeof syncPartyAndEncounterToScene === 'function') {
                        targetScene = syncPartyAndEncounterToScene(targetScene);
                    }
                }
                activeId = parsed.active_scene_id;
            });

            if (scenesStore.io && targetScene) {
                scenesStore.io.emit('scene:update', targetScene);
            }

            if (targetScene) {
                return res.json({ success: true, active_scene_id: activeId, scene: targetScene });
            } else {
                return res.status(404).json({ error: "Target scene or map not found" });
            }
        } catch (e) {
            return res.status(500).json({ error: "Failed to select scene" });
        }
    });

    return router;
};
