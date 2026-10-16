/**
 * GRAIL Spatial Audio Engine (Web Audio API)
 * Dynamic positional ambient sound emitters with distance falloff.
 */

window.SpatialAudioEngine = (function () {
  var audioCtx = null;
  var isMuted = false;
  var listenerPos = { x: 0, y: 0 };
  var activeNodes = {}; // emitterId -> { gainNode, sourceNode, soundKey }

  function getAudioContext() {
    if (!audioCtx) {
      var AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  /**
   * Procedural Audio Synthesizers for Standalone Fallback Ambience
   */
  function createProceduralSound(ctx, soundKey) {
    var bufferSize = ctx.sampleRate * 2;
    var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    var data = buffer.getChannelData(0);

    if (soundKey === 'waterfall' || soundKey === 'river') {
      var lastOut = 0.0;
      for (var i = 0; i < bufferSize; i++) {
        var white = Math.random() * 2 - 1;
        data[i] = (lastOut + (0.02 * white)) / 1.02; // Brown noise
        lastOut = data[i];
        data[i] *= 3.5;
      }
    } else if (soundKey === 'fire' || soundKey === 'campfire') {
      for (var i = 0; i < bufferSize; i++) {
        var white = (Math.random() * 2 - 1) * 0.1;
        // Random crackle pops
        if (Math.random() < 0.0015) {
          white += (Math.random() * 2 - 1) * 0.9;
        }
        data[i] = white;
      }
    } else if (soundKey === 'blizzard' || soundKey === 'wind') {
      var b0 = 0, b1 = 0, b2 = 0;
      for (var i = 0; i < bufferSize; i++) {
        var white = Math.random() * 2 - 1;
        b0 = 0.99 * b0 + white * 0.05;
        b1 = 0.95 * b1 + white * 0.05;
        b2 = 0.85 * b2 + white * 0.05;
        data[i] = (b0 + b1 + b2) * 0.4;
      }
    } else if (soundKey === 'cave_drone' || soundKey === 'dungeon') {
      for (var i = 0; i < bufferSize; i++) {
        var t = i / ctx.sampleRate;
        data[i] = Math.sin(2 * Math.PI * 55 * t) * 0.3 + Math.sin(2 * Math.PI * 110 * t) * 0.15 + (Math.random() * 0.02);
      }
    } else {
      // Gentle tavern / ambient murmur
      for (var i = 0; i < bufferSize; i++) {
        var t = i / ctx.sampleRate;
        data[i] = Math.sin(2 * Math.PI * 180 * t) * 0.15 + (Math.random() * 0.05);
      }
    }

    var source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  function setListenerPosition(x, y) {
    listenerPos.x = x;
    listenerPos.y = y;
    updateAllGains();
  }

  function updateAllGains() {
    if (!audioCtx) return;

    Object.keys(activeNodes).forEach(id => {
      var item = activeNodes[id];
      if (!item || !item.gainNode) return;

      if (isMuted) {
        item.gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        return;
      }

      var dx = listenerPos.x - item.emitter.x;
      var dy = listenerPos.y - item.emitter.y;
      var distPx = Math.sqrt(dx * dx + dy * dy);

      var radiusPx = item.radiusPx || 400;
      var maxVol = item.emitter.volume !== undefined ? item.emitter.volume : 0.8;

      var falloffRatio = Math.max(0, 1 - (distPx / radiusPx));
      var targetGain = maxVol * (falloffRatio * falloffRatio); // Smooth quadratic falloff

      item.gainNode.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.1);
    });
  }

  function syncSceneEmitters(emitters, gridPx) {
    var ctx = getAudioContext();
    if (!ctx) return;

    var currentIds = (emitters || []).map(e => e.id);

    // Stop nodes no longer in scene
    Object.keys(activeNodes).forEach(id => {
      if (!currentIds.includes(id)) {
        try {
          activeNodes[id].sourceNode.stop();
          activeNodes[id].sourceNode.disconnect();
          activeNodes[id].gainNode.disconnect();
        } catch (e) {}
        delete activeNodes[id];
      }
    });

    if (!emitters || emitters.length === 0) return;

    var pxPerFt = (gridPx || 70) / 5;

    emitters.forEach(emitter => {
      var radiusPx = (emitter.radius_ft || 30) * pxPerFt;

      if (activeNodes[emitter.id]) {
        // Update existing node properties
        activeNodes[emitter.id].emitter = emitter;
        activeNodes[emitter.id].radiusPx = radiusPx;
      } else {
        // Create new procedural sound source
        try {
          var gainNode = ctx.createGain();
          gainNode.gain.setValueAtTime(0, ctx.currentTime);
          gainNode.connect(ctx.destination);

          var sourceNode = createProceduralSound(ctx, emitter.sound_key || 'waterfall');
          sourceNode.connect(gainNode);
          sourceNode.start(0);

          activeNodes[emitter.id] = {
            emitter: emitter,
            radiusPx: radiusPx,
            gainNode: gainNode,
            sourceNode: sourceNode,
            soundKey: emitter.sound_key
          };
        } catch (err) {
          console.warn('Could not start spatial audio node:', err);
        }
      }
    });

    updateAllGains();
  }

  function setMuted(muted) {
    isMuted = !!muted;
    updateAllGains();
  }

  function toggleMute() {
    isMuted = !isMuted;
    updateAllGains();
    return isMuted;
  }

  return {
    init: getAudioContext,
    setListenerPosition: setListenerPosition,
    syncSceneEmitters: syncSceneEmitters,
    setMuted: setMuted,
    toggleMute: toggleMute,
    getListenerPosition: function () { return listenerPos; }
  };
})();
