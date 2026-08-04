/**
 * GRAIL Dynamic Lighting & Fog of War Engine (PixiJS 8 compatible)
 * Raycasted polygon shadows, token sight masking, persistent explored memory fog.
 */

window.LightingFogEngine = (function () {
  var exploredPolygons = [];

  /**
   * Compute sight/light visibility polygon from a point (px, py) against wall segments
   */
  function computeVisibilityPolygon(originX, originY, maxRadius, walls) {
    var segments = [];

    // Add wall segments that block sight
    walls.forEach(w => {
      if (!w.points || w.points.length < 4) return;
      if (w.type === 'door' && w.state === 'open') return; // Open doors don't block light
      if (w.type === 'window') return; // Windows allow light/sight

      for (var i = 0; i < w.points.length - 2; i += 2) {
        segments.push({
          p1: { x: w.points[i], y: w.points[i + 1] },
          p2: { x: w.points[i + 2], y: w.points[i + 3] }
        });
      }
    });

    // Add bounding box segments at maxRadius around origin
    var bbox = [
      { p1: { x: originX - maxRadius, y: originY - maxRadius }, p2: { x: originX + maxRadius, y: originY - maxRadius } },
      { p1: { x: originX + maxRadius, y: originY - maxRadius }, p2: { x: originX + maxRadius, y: originY + maxRadius } },
      { p1: { x: originX + maxRadius, y: originY + maxRadius }, p2: { x: originX - maxRadius, y: originY + maxRadius } },
      { p1: { x: originX - maxRadius, y: originY + maxRadius }, p2: { x: originX - maxRadius, y: originY - maxRadius } }
    ];
    segments = segments.concat(bbox);

    // Collect all ray endpoints
    var points = [];
    segments.forEach(s => {
      points.push(s.p1, s.p2);
    });

    // Generate angles for rays
    var angles = [];
    points.forEach(p => {
      var angle = Math.atan2(p.y - originY, p.x - originX);
      angles.push(angle - 0.0001, angle, angle + 0.0001);
    });

    // Raycast intersections
    var intersects = [];
    angles.forEach(angle => {
      var dx = Math.cos(angle);
      var dy = Math.sin(angle);

      var ray = { p1: { x: originX, y: originY }, p2: { x: originX + dx * maxRadius, y: originY + dy * maxRadius } };
      var closest = null;
      var minT1 = Infinity;

      segments.forEach(s => {
        var hit = getIntersection(ray, s);
        if (hit && hit.param < minT1) {
          minT1 = hit.param;
          closest = hit;
        }
      });

      if (closest) {
        intersects.push({ x: closest.x, y: closest.y, angle: angle });
      }
    });

    // Sort intersection points by angle to form continuous polygon
    intersects.sort((a, b) => a.angle - b.angle);
    return intersects;
  }

  /**
   * Ray-segment intersection calculation
   */
  function getIntersection(ray, segment) {
    var r_px = ray.p1.x, r_py = ray.p1.y;
    var r_dx = ray.p2.x - ray.p1.x, r_dy = ray.p2.y - ray.p1.y;

    var s_px = segment.p1.x, s_py = segment.p1.y;
    var s_dx = segment.p2.x - segment.p1.x, s_dy = segment.p2.y - segment.p1.y;

    var r_mag = Math.sqrt(r_dx * r_dx + r_dy * r_dy);
    var s_mag = Math.sqrt(s_dx * s_dx + s_dy * s_dy);

    if (r_dx / r_mag === s_dx / s_mag && r_dy / r_mag === s_dy / s_mag) return null;

    var T2 = (r_dx * (s_py - r_py) + r_dy * (r_px - s_px)) / (s_dx * r_dy - s_dy * r_dx);
    var T1 = (s_px + s_dx * T2 - r_px) / r_dx;

    if (isNaN(T1)) T1 = (s_py + s_dy * T2 - r_py) / r_dy;

    if (T1 < 0) return null;
    if (T2 < 0 || T2 > 1) return null;

    return {
      x: r_px + r_dx * T1,
      y: r_py + r_dy * T1,
      param: T1
    };
  }

  /**
   * Render Light Sources onto PixiJS Light Graphics container
   */
  function renderLightingLayer(graphicsObj, lights, walls, gridPxPerFt) {
    if (!graphicsObj) return;
    graphicsObj.clear();

    lights.forEach(light => {
      var pxPerFt = gridPxPerFt || 14; // 70px / 5ft = 14px/ft
      var brightPx = (light.bright_radius_ft || 20) * pxPerFt;
      var dimPx = (light.dim_radius_ft || 40) * pxPerFt;
      var maxRadius = Math.max(brightPx, dimPx);

      var lx = light.x;
      var ly = light.y;

      // Calculate light shadow polygon if produces_shadows is true
      var poly = light.produces_shadows ? computeVisibilityPolygon(lx, ly, maxRadius, walls) : null;

      // Draw light pool
      var hexColor = light.color ? parseInt(light.color.replace('#', ''), 16) : 0xffaa44;

      if (poly && poly.length > 2) {
        var points = [];
        poly.forEach(p => points.push(p.x, p.y));
        graphicsObj.poly(points);
        graphicsObj.fill({ color: hexColor, alpha: 0.35 });
      } else {
        graphicsObj.circle(lx, ly, maxRadius);
        graphicsObj.fill({ color: hexColor, alpha: 0.35 });
      }
    });
  }

  /**
   * Render Token Vision Masking & Persistent Memory Fog
   */
  function renderFogOfWarLayer(fogGraphics, sceneWidth, sceneHeight, tokens, walls, fogMode, gridPxPerFt) {
    if (!fogGraphics) return;
    fogGraphics.clear();

    if (fogMode === 'off') return;

    // Fill whole canvas with dark unexplored fog
    fogGraphics.rect(0, 0, sceneWidth, sceneHeight);
    fogGraphics.fill({ color: 0x070b19, alpha: 0.96 });

    if (fogMode === 'vision') {
      var pxPerFt = gridPxPerFt || 14;
      var sightedTokens = tokens.filter(t => (t.vision_radius_ft > 0 || t.disposition === 'friendly'));

      var currentSightPolys = [];

      // Calculate sight polygons for active tokens
      sightedTokens.forEach(t => {
        var radius = (t.vision_radius_ft || 60) * pxPerFt;
        var poly = computeVisibilityPolygon(t.x, t.y, radius, walls);
        if (poly && poly.length > 2) {
          var pts = [];
          poly.forEach(p => pts.push(p.x, p.y));
          currentSightPolys.push(pts);

          // Add to persistent explored memory fog
          if (exploredPolygons.length < 150) {
            exploredPolygons.push(pts);
          }
        }
      });

      // 1. Cut out explored memory fog (visited areas in semi-dark state)
      exploredPolygons.forEach(pts => {
        fogGraphics.poly(pts);
        fogGraphics.cut();
      });

      // 2. Overlay semi-dark tint for explored areas out of direct line of sight
      fogGraphics.rect(0, 0, sceneWidth, sceneHeight);
      fogGraphics.fill({ color: 0x070b19, alpha: 0.5 });

      // 3. Cut out 100% bright active line of sight
      currentSightPolys.forEach(pts => {
        fogGraphics.poly(pts);
        fogGraphics.cut();
      });
    }
  }

  function resetMemoryFog() {
    exploredPolygons = [];
  }

  return {
    computeVisibilityPolygon: computeVisibilityPolygon,
    renderLightingLayer: renderLightingLayer,
    renderFogOfWarLayer: renderFogOfWarLayer,
    resetMemoryFog: resetMemoryFog
  };

})();
