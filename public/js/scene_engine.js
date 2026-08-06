/**
 * GRAIL PixiJS 8 Battle Map Engine (`scene_engine.js`)
 * Implements 8 z-ordered render layers, pan/zoom, grid snapping, token dragging,
 * 3D Euclidean range solver, elevation tags, video battlemaps (.webm/.mp4),
 * touch pinch-to-zoom, auto-fit, and 360° rotatable 5e AoE templates with creature blast detection.
 */

window.GrailSceneEngine = (function () {
  var app = null;
  var worldContainer = null;
  var layers = {};
  var currentScene = null;
  var isDM = false;
  var socket = null;
  var activeTool = 'select'; // 'select', 'measure', 'wall_opaque', 'wall_door', 'light', 'template'

  var dragToken = null;
  var dragOffset = { x: 0, y: 0 };
  var dragAoE = null;
  var dragAoERotation = null;

  var measureStart = null;
  var wallStart = null;

  // Selected AoE Tool Configuration
  var selectedAoEConfig = {
    shape: 'sphere', // 'sphere', 'cone', 'line', 'cube'
    size_ft: 20,
    rotation_deg: 0
  };

  /**
   * Initialize PixiJS 8 Battle Map Application inside target DOM element
   */
  async function init(containerEl, isDMMode, socketRef) {
    isDM = !!isDMMode;
    socket = socketRef || window.socket || (typeof io === 'function' ? io() : null);

    if (!containerEl) return;
    containerEl.innerHTML = ''; // Clear container

    app = new PIXI.Application();
    await app.init({
      width: containerEl.clientWidth || 1200,
      height: containerEl.clientHeight || 700,
      backgroundColor: 0x0f172a,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      antialias: true
    });

    containerEl.appendChild(app.canvas);

    // Create World Container (Handles Panning & Zooming)
    worldContainer = new PIXI.Container();
    worldContainer.eventMode = 'static';
    app.stage.addChild(worldContainer);

    // Initialize 8 Z-Ordered Layers
    layers.background = new PIXI.Container(); layers.background.zIndex = 0;
    layers.tiles = new PIXI.Container();      layers.tiles.zIndex = 10;
    layers.grid = new PIXI.Graphics();        layers.grid.zIndex = 20;
    layers.drawing = new PIXI.Graphics();     layers.drawing.zIndex = 30;
    layers.tokens = new PIXI.Container();     layers.tokens.zIndex = 40;
    layers.lighting = new PIXI.Graphics();   layers.lighting.zIndex = 50;
    layers.fog = new PIXI.Graphics();        layers.fog.zIndex = 60;
    layers.ui = new PIXI.Container();         layers.ui.zIndex = 70;

    Object.keys(layers).forEach(k => worldContainer.addChild(layers[k]));
    worldContainer.sortChildren();

    setupInteractions(containerEl);
    setupSocketListeners();

    window.addEventListener('resize', onResize);

    return app;
  }

  function onResize() {
    if (!app || !app.canvas || !app.canvas.parentNode) return;
    var parent = app.canvas.parentNode;
    if (parent.clientWidth > 0 && parent.clientHeight > 0) {
      app.renderer.resize(parent.clientWidth, parent.clientHeight);
    }
  }

  /**
   * Load and render a scene state object
   */
  function loadScene(sceneData) {
    if (!sceneData) return;
    if (sceneData.scenes && Array.isArray(sceneData.scenes)) {
      var activeId = sceneData.active_scene_id;
      sceneData = sceneData.scenes.find(s => s.id === activeId) || sceneData.scenes[0] || sceneData;
    }
    currentScene = sceneData;

    renderBackground();
    renderGrid();
    renderWalls();
    renderTokens();
    renderAoETemplates();
    renderLightingAndFog();

    // Auto-fit initial view if container is small (e.g. mobile sheet or mini viewport)
    if (app && app.canvas && app.canvas.parentNode) {
      var parent = app.canvas.parentNode;
      if (parent.clientWidth < 800) {
        zoomFit();
      }
    }
  }

  /**
   * Render Background (Supports Images & Looping WebM/MP4 Video Maps)
   */
  function renderBackground() {
    layers.background.removeChildren();
    var bgUrl = currentScene.background_url;

    if (bgUrl) {
      var isVideo = /\.(webm|mp4|mov|m4v)$/i.test(bgUrl) || /^data:video\//i.test(bgUrl);

      if (isVideo) {
        var videoEl = document.createElement('video');
        videoEl.src = bgUrl;
        videoEl.autoplay = true;
        videoEl.loop = true;
        videoEl.muted = true;
        videoEl.playsInline = true;
        videoEl.crossOrigin = 'anonymous';

        var onVideoReady = () => {
          try {
            var texture = PIXI.Texture.from(videoEl);
            var sprite = new PIXI.Sprite(texture);
            sprite.width = currentScene.width_px || 2800;
            sprite.height = currentScene.height_px || 2100;
            layers.background.removeChildren();
            layers.background.addChild(sprite);
          } catch (e) {
            console.warn('Video map playback failed:', e);
            drawColorBackground();
          }
        };

        videoEl.play().then(onVideoReady).catch(() => onVideoReady());
      } else {
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
          try {
            var texture = PIXI.Texture.from(img);
            var sprite = new PIXI.Sprite(texture);
            sprite.width = currentScene.width_px || img.width || 2800;
            sprite.height = currentScene.height_px || img.height || 2100;
            layers.background.removeChildren();
            layers.background.addChild(sprite);
          } catch (e) {
            console.warn('Image texture creation failed:', e);
            drawColorBackground();
          }
        };
        img.onerror = function (err) {
          console.warn('Image load error:', err);
          drawColorBackground();
        };
        img.src = bgUrl;
      }
    } else {
      drawColorBackground();
    }
  }

  function drawColorBackground() {
    var bg = new PIXI.Graphics();
    var hex = currentScene.background_color ? parseInt(currentScene.background_color.replace('#', ''), 16) : 0x1e293b;
    bg.rect(0, 0, currentScene.width_px || 2800, currentScene.height_px || 2100);
    bg.fill({ color: hex });
    layers.background.addChild(bg);
  }

  function renderGrid() {
    var g = layers.grid;
    g.clear();
    if (!currentScene.grid || !currentScene.grid.visible) return;

    var size = currentScene.grid.size_px || 70;
    var width = currentScene.width_px || 2800;
    var height = currentScene.height_px || 2100;
    var hexColor = currentScene.grid.color ? parseInt(currentScene.grid.color.replace('#', ''), 16) : 0xffffff;
    var alpha = currentScene.grid.opacity || 0.2;

    for (var x = 0; x <= width; x += size) {
      g.moveTo(x, 0); g.lineTo(x, height);
    }
    for (var y = 0; y <= height; y += size) {
      g.moveTo(0, y); g.lineTo(width, y);
    }
    g.stroke({ width: 1, color: hexColor, alpha: alpha });
  }

  function renderWalls() {
    var g = layers.drawing;
    g.clear();

    if (!isDM) return;
    if (!currentScene.walls) return;

    currentScene.walls.forEach(w => {
      if (!w.points || w.points.length < 4) return;
      var strokeColor = 0xef4444; // Default opaque wall = red
      if (w.type === 'door') strokeColor = w.state === 'open' ? 0x22c55e : 0xeab308; // Door = yellow/green
      if (w.type === 'window') strokeColor = 0x38bdf8; // Window = cyan

      g.moveTo(w.points[0], w.points[1]);
      for (var i = 2; i < w.points.length; i += 2) {
        g.lineTo(w.points[i], w.points[i + 1]);
      }
      g.stroke({ width: 4, color: strokeColor, alpha: 0.85 });
    });
  }

  /**
   * Render Tokens (with Initials, HP, and Elevation Badges)
   */
  function renderTokens() {
    layers.tokens.removeChildren();
    if (!currentScene.tokens) return;

    var gridSize = (currentScene.grid && currentScene.grid.size_px) || 70;

    currentScene.tokens.forEach(tok => {
      var container = new PIXI.Container();
      container.x = tok.x;
      container.y = tok.y;
      container.eventMode = 'static';
      container.cursor = 'pointer';
      container.tokenId = tok.id;

      var tokenSizePx = (tok.size_cells || 1) * gridSize;
      var radius = tokenSizePx / 2;

      // Token Body Circle
      var circle = new PIXI.Graphics();
      var bodyColor = tok.color ? parseInt(tok.color.replace('#', ''), 16) : (tok.disposition === 'hostile' ? 0xef4444 : 0x3b82f6);
      circle.circle(radius, radius, radius - 4);
      circle.fill({ color: bodyColor });
      circle.stroke({ width: 3, color: 0xffffff });
      container.addChild(circle);

      // AoE Blast Target Highlight Ring
      if (tok.in_aoe) {
        var highlightRing = new PIXI.Graphics();
        highlightRing.circle(radius, radius, radius + 6);
        highlightRing.stroke({ width: 4, color: 0xef4444, alpha: 0.95 });
        container.addChild(highlightRing);
      }

      // Token Initials Text
      var initials = 'PC';
      if (tok.name) {
        var parts = tok.name.trim().split(/\s+/);
        if (parts.length >= 2) {
          initials = (parts[0][0] + parts[1][0]).toUpperCase();
        } else {
          initials = tok.name.substring(0, 2).toUpperCase();
        }
      }
      var text = new PIXI.Text({
        text: initials,
        style: { fontFamily: 'sans-serif', fontSize: Math.max(16, radius * 0.8), fill: 0xffffff, fontWeight: 'bold' }
      });
      text.anchor.set(0.5);
      text.x = radius;
      text.y = radius;
      container.addChild(text);

      // HP Ring / Badge
      if (tok.hp_max) {
        var hpRatio = Math.max(0, Math.min(1, (tok.hp_current || 0) / tok.hp_max));
        var hpBar = new PIXI.Graphics();
        hpBar.rect(0, tokenSizePx - 8, tokenSizePx * hpRatio, 6);
        hpBar.fill({ color: hpRatio > 0.5 ? 0x22c55e : (hpRatio > 0.2 ? 0xeab308 : 0xef4444) });
        container.addChild(hpBar);
      }

      // Elevation Tag Badge (e.g. 🪽 +15 ft)
      if (tok.elevation && tok.elevation !== 0) {
        var elevText = new PIXI.Text({
          text: `🪽 ${tok.elevation > 0 ? '+' : ''}${tok.elevation}ft`,
          style: { fontFamily: 'sans-serif', fontSize: 13, fill: 0x38bdf8, fontWeight: 'bold' }
        });
        elevText.anchor.set(0.5, 1);
        elevText.x = radius;
        elevText.y = -6;
        container.addChild(elevText);
      }

      // Dragging Logic
      container.on('pointerdown', (e) => onTokenPointerDown(e, tok, container));

      layers.tokens.addChild(container);
    });
  }

  function onTokenPointerDown(e, tok, tokenContainer) {
    if (activeTool !== 'select') return;
    e.stopPropagation();

    var clientX = e.clientX || (e.global ? e.global.x : 0);
    var clientY = e.clientY || (e.global ? e.global.y : 0);

    dragToken = { tokData: tok, container: tokenContainer };
    var worldPt = screenToWorld(clientX, clientY);
    dragOffset.x = worldPt.x - tokenContainer.x;
    dragOffset.y = worldPt.y - tokenContainer.y;
  }

  /**
   * WASD / Arrow Key Keyboard Panning
   */
  window.addEventListener('keydown', (e) => {
    if (!worldContainer) return;
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'SELECT')) {
      return;
    }

    var key = e.key.toLowerCase();
    var step = 60;

    if (key === 'w' || key === 'arrowup') {
      worldContainer.y += step;
    } else if (key === 's' || key === 'arrowdown') {
      worldContainer.y -= step;
    } else if (key === 'a' || key === 'arrowleft') {
      worldContainer.x += step;
    } else if (key === 'd' || key === 'arrowright') {
      worldContainer.x -= step;
    } else if (key === ' ') {
      zoomFit();
    }
  });

  function renderLightingAndFog() {
    var gridPx = (currentScene.grid && currentScene.grid.size_px) || 70;
    var pxPerFt = gridPx / 5;

    if (window.LightingFogEngine) {
      window.LightingFogEngine.renderLightingLayer(
        layers.lighting,
        currentScene.lights || [],
        currentScene.walls || [],
        pxPerFt
      );

      window.LightingFogEngine.renderFogOfWarLayer(
        layers.fog,
        currentScene.width_px || 2800,
        currentScene.height_px || 2100,
        currentScene.tokens || [],
        currentScene.walls || [],
        currentScene.fog ? currentScene.fog.mode : 'vision',
        pxPerFt
      );
    }
  }

  /**
   * Mouse & Touch Interaction Setup (Pan, Wheel Zoom, Touch Pinch Zoom, Touch Drag, Measurement, AoE)
   */
  function setupInteractions(containerEl) {
    var isPanning = false;
    var lastPos = { x: 0, y: 0 };
    var touchStartDist = 0;
    var touchStartScale = 1;

    // Mouse Wheel Zoom
    containerEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      var zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      var newScale = worldContainer.scale.x * zoomFactor;
      newScale = Math.max(0.05, Math.min(3.0, newScale));

      worldContainer.scale.set(newScale);
    }, { passive: false });

    // Touch Pinch-to-Zoom & Drag-to-Pan
    containerEl.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        touchStartDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        touchStartScale = worldContainer.scale.x;
      } else if (e.touches.length === 1) {
        isPanning = true;
        lastPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    }, { passive: false });

    containerEl.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && touchStartDist > 0) {
        e.preventDefault();
        var dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        var newScale = touchStartScale * (dist / touchStartDist);
        newScale = Math.max(0.05, Math.min(3.0, newScale));
        worldContainer.scale.set(newScale);
      } else if (e.touches.length === 1 && isPanning) {
        var dx = e.touches[0].clientX - lastPos.x;
        var dy = e.touches[0].clientY - lastPos.y;
        worldContainer.x += dx;
        worldContainer.y += dy;
        lastPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    }, { passive: false });

    containerEl.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) touchStartDist = 0;
      if (e.touches.length === 0) isPanning = false;
    });

    containerEl.addEventListener('mousedown', (e) => {
      var worldPt = screenToWorld(e.clientX, e.clientY);

      if (e.button === 1 || (e.button === 0 && activeTool === 'pan')) {
        isPanning = true;
        lastPos = { x: e.clientX, y: e.clientY };
      } else if (e.button === 0 && activeTool === 'measure') {
        measureStart = worldPt;
      } else if (e.button === 0 && (activeTool === 'wall_opaque' || activeTool === 'wall_door')) {
        wallStart = worldPt;
      } else if (e.button === 0 && activeTool === 'light') {
        if (!currentScene.lights) currentScene.lights = [];
        currentScene.lights.push({
          id: 'l_' + Date.now(),
          x: Math.round(worldPt.x),
          y: Math.round(worldPt.y),
          bright_radius_ft: 20,
          dim_radius_ft: 40,
          color: '#ffaa44',
          flicker: 'torch',
          produces_shadows: true
        });
        renderLightingAndFog();
      } else if (e.button === 0 && activeTool === 'template') {
        addAoETemplate(worldPt.x, worldPt.y);
      }
    });

    window.addEventListener('mousemove', (e) => {
      var worldPt = screenToWorld(e.clientX, e.clientY);

      if (isPanning) {
        var dx = e.clientX - lastPos.x;
        var dy = e.clientY - lastPos.y;
        worldContainer.x += dx;
        worldContainer.y += dy;
        lastPos = { x: e.clientX, y: e.clientY };
      } else if (dragToken) {
        dragToken.container.x = worldPt.x - dragOffset.x;
        dragToken.container.y = worldPt.y - dragOffset.y;
      } else if (dragAoE) {
        dragAoE.x = Math.round(worldPt.x - dragOffset.x);
        dragAoE.y = Math.round(worldPt.y - dragOffset.y);
        renderAoETemplates();
      } else if (dragAoERotation) {
        var angleRad = Math.atan2(worldPt.y - dragAoERotation.y, worldPt.x - dragAoERotation.x);
        var deg = Math.round((angleRad * 180 / Math.PI + 360) % 360);
        dragAoERotation.rotation_deg = deg;
        renderAoETemplates();
      } else if (measureStart) {
        drawMeasurementLine(measureStart, worldPt);
      } else if (wallStart) {
        drawWallPreview(wallStart, worldPt, activeTool === 'wall_door' ? 0xeab308 : 0xef4444);
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (isPanning) isPanning = false;

      if (dragToken) {
        var gridSize = (currentScene.grid && currentScene.grid.size_px) || 70;
        var snappedX = Math.round(dragToken.container.x / gridSize) * gridSize;
        var snappedY = Math.round(dragToken.container.y / gridSize) * gridSize;

        dragToken.container.x = snappedX;
        dragToken.container.y = snappedY;
        dragToken.tokData.x = snappedX;
        dragToken.tokData.y = snappedY;

        if (socket) {
          socket.emit('token:move', {
            scene_id: currentScene.id,
            token_id: dragToken.tokData.id,
            x: snappedX,
            y: snappedY
          });
        }

        renderLightingAndFog();
        dragToken = null;
      }

      if (dragAoE || dragAoERotation) {
        if (socket) socket.emit('aoe:update', { scene_id: currentScene.id, templates: currentScene.aoe_templates });
        dragAoE = null;
        dragAoERotation = null;
      }

      if (wallStart) {
        var endPt = screenToWorld(e.clientX, e.clientY);
        if (!currentScene.walls) currentScene.walls = [];
        currentScene.walls.push({
          id: 'w_' + Date.now(),
          type: activeTool === 'wall_door' ? 'door' : 'opaque',
          state: activeTool === 'wall_door' ? 'closed' : undefined,
          points: [Math.round(wallStart.x), Math.round(wallStart.y), Math.round(endPt.x), Math.round(endPt.y)]
        });
        wallStart = null;
        renderWalls();
        renderLightingAndFog();
      }

      if (measureStart) {
        measureStart = null;
      }
    });
  }

  function screenToWorld(clientX, clientY) {
    if (!app || !app.canvas) return { x: 0, y: 0 };
    var rect = app.canvas.getBoundingClientRect();
    var x = (clientX - rect.left - worldContainer.x) / worldContainer.scale.x;
    var y = (clientY - rect.top - worldContainer.y) / worldContainer.scale.y;
    return { x: x, y: y };
  }

  /**
   * 3D Euclidean Distance Solver Measurement Tool
   */
  function drawMeasurementLine(p1, p2) {
    var gridPx = (currentScene && currentScene.grid && currentScene.grid.size_px) || 70;
    var dx = p2.x - p1.x;
    var dy = p2.y - p1.y;
    var distPx = Math.sqrt(dx * dx + dy * dy);
    var dist2DFt = Math.round((distPx / gridPx) * 5);

    var tok1 = findTokenNearPoint(p1.x, p1.y);
    var tok2 = findTokenNearPoint(p2.x, p2.y);
    var z1 = tok1 ? (tok1.elevation || 0) : 0;
    var z2 = tok2 ? (tok2.elevation || 0) : 0;
    var dz = Math.abs(z1 - z2);

    var dist3DFt = Math.round(Math.sqrt(dist2DFt * dist2DFt + dz * dz) * 10) / 10;

    drawMeasurementLineLocal(p1, p2, dist2DFt, dz > 0 ? dist3DFt : null);

    if (isDM && socket) {
      socket.emit('measure:draw', { p1: p1, p2: p2, distFt: dist2DFt, dist3DFt: dz > 0 ? dist3DFt : null });
    }
  }

  function findTokenNearPoint(x, y) {
    if (!currentScene || !currentScene.tokens) return null;
    var gridPx = (currentScene.grid && currentScene.grid.size_px) || 70;
    return currentScene.tokens.find(t => {
      var cx = t.x + (t.size_cells || 1) * gridPx / 2;
      var cy = t.y + (t.size_cells || 1) * gridPx / 2;
      return Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) < gridPx;
    });
  }

  function drawMeasurementLineLocal(p1, p2, dist2DFt, dist3DFt) {
    if (!layers.ui) return;
    layers.ui.removeChildren();

    var g = new PIXI.Graphics();
    g.moveTo(p1.x, p1.y);
    g.lineTo(p2.x, p2.y);
    g.stroke({ width: 3, color: 0x38bdf8, alpha: 0.9 });

    var labelText = dist3DFt ? `${dist2DFt} ft (${dist3DFt} ft 3D)` : `${dist2DFt} ft`;

    var text = new PIXI.Text({
      text: labelText,
      style: { fontFamily: 'sans-serif', fontSize: 18, fill: 0x38bdf8, fontWeight: 'bold' }
    });
    text.x = (p1.x + p2.x) / 2;
    text.y = (p1.y + p2.y) / 2 - 18;
    layers.ui.addChild(g);
    layers.ui.addChild(text);
  }

  function drawWallPreview(p1, p2, color) {
    layers.ui.removeChildren();
    var g = new PIXI.Graphics();
    g.moveTo(p1.x, p1.y);
    g.lineTo(p2.x, p2.y);
    g.stroke({ width: 4, color: color, alpha: 0.9 });
    layers.ui.addChild(g);
  }

  /**
   * 360° Rotatable AoE Templates Engine (Cone, Sphere, Line, Cube) with Smart Creature Blast Detection
   */
  function addAoETemplate(x, y) {
    if (!currentScene.aoe_templates) currentScene.aoe_templates = [];
    var t = {
      id: 'aoe_' + Date.now(),
      shape: selectedAoEConfig.shape,
      size_ft: selectedAoEConfig.size_ft,
      x: Math.round(x),
      y: Math.round(y),
      rotation_deg: selectedAoEConfig.rotation_deg || 0,
      color: '#ef4444'
    };
    currentScene.aoe_templates.push(t);
    renderAoETemplates();
    if (socket) socket.emit('aoe:update', { scene_id: currentScene.id, templates: currentScene.aoe_templates });
  }

  function renderAoETemplates() {
    layers.ui.removeChildren();
    if (!currentScene || !currentScene.aoe_templates) return;

    var gridPx = (currentScene.grid && currentScene.grid.size_px) || 70;
    var pxPerFt = gridPx / 5;
    var affectedTokenNames = [];

    // Reset token in_aoe flags
    if (currentScene.tokens) {
      currentScene.tokens.forEach(tok => tok.in_aoe = false);
    }

    currentScene.aoe_templates.forEach(tpl => {
      var container = new PIXI.Container();
      container.x = tpl.x;
      container.y = tpl.y;

      var rad = (tpl.rotation_deg || 0) * Math.PI / 180;
      var sizePx = tpl.size_ft * pxPerFt;

      var g = new PIXI.Graphics();
      var colorHex = parseInt((tpl.color || '#ef4444').replace('#', ''), 16);

      if (tpl.shape === 'sphere') {
        g.circle(0, 0, sizePx);
        g.fill({ color: colorHex, alpha: 0.35 });
        g.stroke({ width: 2, color: 0xfca5a5 });
      } else if (tpl.shape === 'cone') {
        var halfAngle = 30 * Math.PI / 180;
        var a1 = rad - halfAngle;
        var a2 = rad + halfAngle;

        g.moveTo(0, 0);
        g.arc(0, 0, sizePx, a1, a2);
        g.lineTo(0, 0);
        g.fill({ color: colorHex, alpha: 0.35 });
        g.stroke({ width: 2, color: 0xfca5a5 });
      } else if (tpl.shape === 'line') {
        var widthPx = 5 * pxPerFt;
        g.rect(0, -widthPx / 2, sizePx, widthPx);
        g.fill({ color: colorHex, alpha: 0.35 });
        g.stroke({ width: 2, color: 0xfca5a5 });
        g.rotation = rad;
      } else if (tpl.shape === 'cube') {
        g.rect(-sizePx / 2, -sizePx / 2, sizePx, sizePx);
        g.fill({ color: colorHex, alpha: 0.35 });
        g.stroke({ width: 2, color: 0xfca5a5 });
        g.rotation = rad;
      }

      container.addChild(g);

      // Rotation Handle Grip (360° Drag handle)
      var handle = new PIXI.Graphics();
      var handleDist = tpl.shape === 'sphere' ? sizePx : sizePx + 15;
      var hx = Math.cos(rad) * handleDist;
      var hy = Math.sin(rad) * handleDist;

      handle.circle(hx, hy, 9);
      handle.fill({ color: 0xfbbf24 });
      handle.stroke({ width: 2, color: 0xffffff });
      handle.eventMode = 'static';
      handle.cursor = 'grab';

      handle.on('pointerdown', (e) => {
        e.stopPropagation();
        dragAoERotation = tpl;
      });

      container.addChild(handle);

      // Interactive Remove Button Badge ('✕')
      var removeBtn = new PIXI.Graphics();
      var rx = 0;
      var ry = -sizePx / 2 - 25;
      removeBtn.circle(rx, ry, 14);
      removeBtn.fill({ color: 0xef4444 });
      removeBtn.stroke({ width: 2, color: 0xffffff });
      removeBtn.eventMode = 'static';
      removeBtn.cursor = 'pointer';

      var removeXText = new PIXI.Text({
        text: '✕',
        style: { fontFamily: 'sans-serif', fontSize: 14, fill: 0xffffff, fontWeight: 'bold' }
      });
      removeXText.anchor.set(0.5);
      removeXText.x = rx;
      removeXText.y = ry;
      removeXText.eventMode = 'none';
      removeBtn.addChild(removeXText);

      var onRemoveClick = (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        removeAoETemplateById(tpl.id, tpl);
      };

      removeBtn.on('pointerdown', onRemoveClick);
      removeBtn.on('pointertap', onRemoveClick);
      removeBtn.on('click', onRemoveClick);

      container.addChild(removeBtn);

      // Template Dragging
      g.eventMode = 'static';
      g.cursor = 'move';
      g.on('pointerdown', (e) => {
        e.stopPropagation();
        dragAoE = tpl;
        var worldPt = screenToWorld(e.clientX, e.clientY);
        dragOffset.x = worldPt.x - tpl.x;
        dragOffset.y = worldPt.y - tpl.y;
      });

      // Target Collision Test against Tokens
      if (currentScene.tokens) {
        currentScene.tokens.forEach(tok => {
          var tokCx = tok.x + (tok.size_cells || 1) * gridPx / 2;
          var tokCy = tok.y + (tok.size_cells || 1) * gridPx / 2;

          var dist = Math.sqrt((tokCx - tpl.x) * (tokCx - tpl.x) + (tokCy - tpl.y) * (tokCy - tpl.y));
          if (dist <= sizePx) {
            tok.in_aoe = true;
            if (!affectedTokenNames.includes(tok.name)) affectedTokenNames.push(tok.name);
          }
        });
      }

      layers.ui.addChild(container);

      // Render Target Summary Badge Overlay
      var summaryText = affectedTokenNames.length > 0
        ? `🔥 ${tpl.size_ft}ft ${tpl.shape.toUpperCase()} hits (${affectedTokenNames.length}): ${affectedTokenNames.join(', ')}`
        : `🔥 ${tpl.size_ft}ft ${tpl.shape.toUpperCase()} Template`;

      var text = new PIXI.Text({
        text: summaryText,
        style: { fontFamily: 'sans-serif', fontSize: 16, fill: 0xffffff, fontWeight: 'bold' }
      });
      text.x = tpl.x;
      text.y = tpl.y - (sizePx / 2) - 25;
      layers.ui.addChild(text);
    });

    renderTokens();
  }

  function clearAoETemplates() {
    if (!currentScene) return;
    currentScene.aoe_templates = [];
    renderAoETemplates();
    if (socket) socket.emit('aoe:update', { scene_id: currentScene.id, templates: [] });
  }

  function setupSocketListeners() {
    if (!socket) return;

    socket.on('scene:update', function (updatedScene) {
      loadScene(updatedScene);
    });

    socket.on('token:moved', function (data) {
      if (!currentScene || currentScene.id !== data.scene_id) return;
      var tok = (currentScene.tokens || []).find(t => t.id === data.token_id);
      if (tok) {
        tok.x = data.x;
        tok.y = data.y;
        renderTokens();
        renderLightingAndFog();
      }
    });

    socket.on('measure:draw', function (data) {
      if (data && data.p1 && data.p2) {
        drawMeasurementLineLocal(data.p1, data.p2, data.distFt || 0, data.dist3DFt || null);
      }
    });

    socket.on('measure:clear', function () {
      if (layers.ui) layers.ui.removeChildren();
    });

    socket.on('aoe:updated', function (data) {
      if (currentScene && data && data.templates) {
        currentScene.aoe_templates = data.templates;
        renderAoETemplates();
      }
    });
  }

  function setTool(toolName) {
    activeTool = toolName;
    if (layers.ui) layers.ui.removeChildren();
    if (isDM && socket && toolName !== 'measure') {
      socket.emit('measure:clear');
    }
  }

  function setAoEConfig(shape, size_ft, rotation_deg) {
    if (shape) selectedAoEConfig.shape = shape;
    if (size_ft) selectedAoEConfig.size_ft = parseInt(size_ft, 10);
    if (rotation_deg !== undefined) selectedAoEConfig.rotation_deg = parseInt(rotation_deg, 10);
  }

  function zoomIn() {
    if (!worldContainer) return;
    var newScale = Math.min(3.0, worldContainer.scale.x * 1.25);
    worldContainer.scale.set(newScale);
  }

  function zoomOut() {
    if (!worldContainer) return;
    var newScale = Math.max(0.05, worldContainer.scale.x * 0.8);
    worldContainer.scale.set(newScale);
  }

  function zoomFit() {
    if (!worldContainer || !currentScene || !app || !app.canvas) return;
    var parent = app.canvas.parentNode;
    if (!parent) return;
    var sceneWidth = currentScene.width_px || 2800;
    var sceneHeight = currentScene.height_px || 2100;
    var fitScale = Math.min((parent.clientWidth || 400) / sceneWidth, (parent.clientHeight || 300) / sceneHeight);
    fitScale = Math.max(0.05, Math.min(1.0, fitScale));

    worldContainer.scale.set(fitScale);
    worldContainer.x = 0;
    worldContainer.y = 0;
  }

  function centerOnToken(characterId) {
    if (!worldContainer || !currentScene || !currentScene.tokens || !app || !app.canvas) return;
    var parent = app.canvas.parentNode;
    var tok = currentScene.tokens.find(t => t.character_id === characterId || t.id === `tok_party_${characterId}`);
    if (tok && parent) {
      var gridSize = (currentScene.grid && currentScene.grid.size_px) || 70;
      var tokCx = tok.x + (tok.size_cells || 1) * gridSize / 2;
      var tokCy = tok.y + (tok.size_cells || 1) * gridSize / 2;

      var scale = worldContainer.scale.x || 0.3;
      worldContainer.x = (parent.clientWidth / 2) - (tokCx * scale);
      worldContainer.y = (parent.clientHeight / 2) - (tokCy * scale);
    }
  }

  function removeAoETemplateById(id, tplObj) {
    if (!currentScene || !currentScene.aoe_templates) return;
    if (id) {
      currentScene.aoe_templates = currentScene.aoe_templates.filter(t => t.id !== id && t !== tplObj);
    } else if (tplObj) {
      currentScene.aoe_templates = currentScene.aoe_templates.filter(t => t !== tplObj);
    }
    renderAoETemplates();
    if (socket) socket.emit('aoe:update', { scene_id: currentScene.id, templates: currentScene.aoe_templates });
  }

  function resize() {
    onResize();
  }

  return {
    init: init,
    loadScene: loadScene,
    setTool: setTool,
    setAoEConfig: setAoEConfig,
    clearAoETemplates: clearAoETemplates,
    removeAoETemplateById: removeAoETemplateById,
    zoomIn: zoomIn,
    zoomOut: zoomOut,
    zoomFit: zoomFit,
    centerOnToken: centerOnToken,
    resize: resize
  };

})();
