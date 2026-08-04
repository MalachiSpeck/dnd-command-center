/**
 * DM Dashboard Scene & Lighting Control Panel (`app_scene_dm.js`)
 * Integrated into DM Toolbox -> Projector Tab.
 */

(function () {
  var socket = null;
  var currentScene = null;

  // 1. Ensure Global Standalone File Input Exists
  function ensureFileInput() {
    var input = document.getElementById('global-map-upload-input');
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.id = 'global-map-upload-input';
      input.accept = 'image/*,video/*,.webm,.mp4,.mov';
      input.style.display = 'none';
      document.body.appendChild(input);

      input.addEventListener('change', function () {
        if (!input.files || !input.files[0]) return;
        var file = input.files[0];
        handleFileUpload(file);
      });
    }
    return input;
  }

  function handleFileUpload(file) {
    var uploadBtn = document.getElementById('btn-upload-map-img');
    if (uploadBtn) {
      uploadBtn.innerText = '⏳ Uploading Map...';
      uploadBtn.disabled = true;
    }

    var reader = new FileReader();
    reader.onload = function (e) {
      var base64Data = e.target.result;

      fetch('/api/upload-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          image_data: base64Data,
          scene_name: file.name.replace(/\.[^/.]+$/, "")
        })
      })
      .then(async res => {
        var text = await res.text();
        try {
          return JSON.parse(text);
        } catch (err) {
          throw new Error('Server returned HTTP ' + res.status + '. Please restart your node server (`node server.js`).');
        }
      })
      .then(data => {
        if (uploadBtn) {
          uploadBtn.innerText = '📤 Choose & Upload Map File';
          uploadBtn.disabled = false;
        }
        if (data && data.success) {
          if (data.scene) {
            currentScene = data.scene;
            if (window.GrailSceneEngine) window.GrailSceneEngine.loadScene(data.scene);
          }
          if (window.refreshMapList) window.refreshMapList();
          alert('Map uploaded successfully! Applied as active battle map.');
        } else {
          alert('Error uploading map: ' + (data ? data.error : 'Unknown error'));
        }
      })
      .catch(err => {
        if (uploadBtn) {
          uploadBtn.innerText = '📤 Choose & Upload Map File';
          uploadBtn.disabled = false;
        }
        alert('Upload failed: ' + err.message);
      });
    };
    reader.readAsDataURL(file);
  }

  // 2. Global Trigger Function for Top Bar & Projector Tab Buttons
  window.triggerMapUploadInput = function () {
    var input = ensureFileInput();
    input.click();
  };

  // 3. Handle Drag-and-Drop Files on Map Drop Zone
  window.handleMapFileDrop = function (e) {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // 4. Global Function to Spawn Token onto Battle Map
  window.spawnTokenToMap = function () {
    var nameEl = document.getElementById('spawn-token-name');
    var typeEl = document.getElementById('spawn-token-type');
    var sizeEl = document.getElementById('spawn-token-size');

    var name = nameEl ? nameEl.value.trim() : '';
    if (!name) return alert('Please enter a token name!');

    var disposition = typeEl ? typeEl.value : 'hostile';
    var size = sizeEl ? sizeEl.value : '1';

    fetch('/api/token/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name,
        disposition: disposition,
        size_cells: size,
        hp_max: 30
      })
    })
    .then(async res => {
      var text = await res.text();
      try {
        return JSON.parse(text);
      } catch (err) {
        throw new Error('Server returned HTTP ' + res.status + '. Please restart your node server (`node server.js`).');
      }
    })
    .then(data => {
      if (data && data.success) {
        if (nameEl) nameEl.value = '';
      } else {
        alert('Failed to add token: ' + (data ? data.error : 'Unknown error'));
      }
    })
    .catch(err => alert('Error adding token: ' + err.message));
  };

  // 5. Global Functions to Clear Tokens, Lights, Walls, and Toggle Fog of War
  window.clearAllTokensFromMap = function () {
    if (!confirm('Are you sure you want to remove all tokens from the map?')) return;
    fetch('/api/scene/clear-tokens', { method: 'POST' })
      .then(async res => {
        var text = await res.text();
        try {
          return JSON.parse(text);
        } catch (err) {
          throw new Error('Server returned HTTP ' + res.status + '. Please restart your node server (`node server.js`).');
        }
      })
      .then(data => {
        if (!data || !data.success) alert('Failed to clear tokens.');
      })
      .catch(err => alert('Error clearing tokens: ' + err.message));
  };

  window.clearAllLightsFromMap = function () {
    if (!confirm('Are you sure you want to remove all light sources from the map?')) return;
    fetch('/api/scene/clear-lights', { method: 'POST' })
      .then(async res => {
        var text = await res.text();
        try {
          return JSON.parse(text);
        } catch (err) {
          throw new Error('Server returned HTTP ' + res.status + '. Please restart your node server (`node server.js`).');
        }
      })
      .then(data => {
        if (!data || !data.success) alert('Failed to clear lights.');
      })
      .catch(err => alert('Error clearing lights: ' + err.message));
  };

  window.clearAllWallsFromMap = function () {
    if (!confirm('Are you sure you want to remove all walls from the map?')) return;
    fetch('/api/scene/clear-walls', { method: 'POST' })
      .then(async res => {
        var text = await res.text();
        try {
          return JSON.parse(text);
        } catch (err) {
          throw new Error('Server returned HTTP ' + res.status + '. Please restart your node server (`node server.js`).');
        }
      })
      .then(data => {
        if (!data || !data.success) alert('Failed to clear walls.');
      })
      .catch(err => alert('Error clearing walls: ' + err.message));
  };

  window.toggleFogOfWarMode = function () {
    fetch('/api/scene/toggle-fog', { method: 'POST' })
      .then(async res => {
        var text = await res.text();
        try {
          return JSON.parse(text);
        } catch (err) {
          throw new Error('Server returned HTTP ' + res.status + '. Please restart your node server (`node server.js`).');
        }
      })
      .then(data => {
        if (data && data.success) {
          alert('Fog of War mode: ' + (data.mode === 'off' ? 'OFF (Clean Full Map Revealed)' : 'ON (Dynamic Token Sight Fog)'));
        } else {
          alert('Failed to toggle fog.');
        }
      })
      .catch(err => alert('Error toggling fog: ' + err.message));
  };

  window.updateDmAoEConfig = function () {
    var shapeEl = document.getElementById('dm-aoe-shape');
    var sizeEl = document.getElementById('dm-aoe-size');
    var shape = shapeEl ? shapeEl.value : 'sphere';
    var size = sizeEl ? sizeEl.value : '20';
    if (window.GrailSceneEngine) {
      window.GrailSceneEngine.setAoEConfig(shape, size, 0);
    }
  };

  window.clearAoETemplatesFromMap = function () {
    if (window.GrailSceneEngine) {
      window.GrailSceneEngine.clearAoETemplates();
    }
  };

  function init(socketRef) {
    socket = socketRef || window.socket || (typeof io === 'function' ? io() : null);

    // Remove any floating widget if present
    var floatingWidget = document.getElementById('dm-scene-palette');
    if (floatingWidget) floatingWidget.remove();

    ensureFileInput();
    setupToolPaletteBindings();

    // Initialize DM Map Viewport Canvas inside Projector Drawer Tab
    var dmCanvasContainer = document.getElementById('dm-map-canvas-container');
    if (dmCanvasContainer && window.GrailSceneEngine) {
      window.GrailSceneEngine.init(dmCanvasContainer, true, socket);

      // Auto-resize PixiJS canvas whenever the DM drawer tab opens or resizes
      if (typeof ResizeObserver === 'function') {
        var ro = new ResizeObserver(function () {
          if (window.GrailSceneEngine) window.GrailSceneEngine.resize();
        });
        ro.observe(dmCanvasContainer);
      }
    }

    if (socket) {
      socket.on('scene:data', function (scene) {
        currentScene = scene;
        refreshMapList();
        if (window.GrailSceneEngine) window.GrailSceneEngine.loadScene(scene);
      });

      socket.on('scene:update', function (scene) {
        currentScene = scene;
        refreshMapList();
        if (window.GrailSceneEngine) window.GrailSceneEngine.loadScene(scene);
      });
    }

    fetch('/api/scene')
      .then(res => res.json())
      .then(scene => {
        if (scene) {
          currentScene = scene;
          refreshMapList();
          if (window.GrailSceneEngine) window.GrailSceneEngine.loadScene(scene);
        }
      })
      .catch(err => console.warn('Could not fetch initial scene:', err));

    refreshMapList();
  }

  function setupToolPaletteBindings() {
    var tabContainer = document.getElementById('tab-content-projector');
    if (!tabContainer) return;

    var toolBtns = tabContainer.querySelectorAll('.dm-tool-btn');
    toolBtns.forEach(btn => {
      btn.addEventListener('click', function () {
        toolBtns.forEach(b => {
          b.classList.remove('active');
          b.style.background = '#1e293b';
        });
        this.classList.add('active');
        this.style.background = '#3b82f6';

        var selectedTool = this.getAttribute('data-tool');
        if (window.GrailSceneEngine) {
          window.GrailSceneEngine.setTool(selectedTool);
        }
      });
    });
  }

  window.refreshMapList = function () {
    var select = document.getElementById('dm-scene-select');
    if (!select) return;

    fetch('/api/maps')
      .then(res => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(data => {
        if (!data || !Array.isArray(data.maps) || data.maps.length === 0) {
          select.innerHTML = '<option value="">-- No maps found in /public/maps --</option>';
          return;
        }

        select.innerHTML = '';
        data.maps.forEach(m => {
          var opt = document.createElement('option');
          opt.value = m.url;
          opt.setAttribute('data-scene-id', m.scene_id || '');
          var icon = m.isVideo ? '🎥 ' : '🖼️ ';
          opt.textContent = icon + m.name + ' (' + m.filename + ')';
          
          if (currentScene && (currentScene.background_url === m.url || currentScene.id === m.scene_id)) {
            opt.selected = true;
          } else if (!currentScene && data.active_background_url === m.url) {
            opt.selected = true;
          }
          select.appendChild(opt);
        });
      })
      .catch(err => {
        console.warn('Could not refresh maps list:', err);
        select.innerHTML = '<option value="">⚠️ Server update pending - Please restart node server (`node server.js`)</option>';
      });
  };

  window.onDmSelectMap = function (mapUrl) {
    if (!mapUrl) return;
    fetch('/api/scene/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapUrl: mapUrl })
    })
    .then(res => res.json())
    .then(data => {
      if (data && data.success && data.scene) {
        currentScene = data.scene;
        if (window.GrailSceneEngine) window.GrailSceneEngine.loadScene(data.scene);
        refreshMapList();
      } else {
        alert('Failed to switch active map scene.');
      }
    })
    .catch(err => alert('Error selecting map: ' + err.message));
  };

  function updateSceneSelectorDropdown() {
    window.refreshMapList();
  }

  window.DMSceneController = {
    init: init
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(init, 50);
  } else {
    document.addEventListener('DOMContentLoaded', function () { init(); });
  }

})();
