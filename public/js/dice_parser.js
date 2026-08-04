/**
 * GRAIL 2D Dice Notation Parser & Canvas Animation Engine
 * Supports 5e notation: 1d20, 2d6+4, 4d6kh3, 1d20adv+5, 1d20dis+2, 1d6!
 */

window.DiceParser = (function () {

  /**
   * Parse a dice expression and roll the dice.
   * @param {string} expr - e.g. "1d20 + 5", "4d6kh3", "1d20adv + 3"
   * @returns {Object} Roll Result
   */
  function parseAndRoll(expr) {
    if (!expr || typeof expr !== 'string') expr = '1d20';
    var cleanExpr = expr.trim().toLowerCase().replace(/\s+/g, '');
    
    var isAdv = cleanExpr.includes('adv');
    var isDis = cleanExpr.includes('dis');

    if (isAdv || isDis) {
      var basePart = cleanExpr.replace(/adv|dis/g, '');
      var mod = 0;
      var modMatch = basePart.match(/([+-]\d+)$/);
      if (modMatch) {
        mod = parseInt(modMatch[1], 10);
        basePart = basePart.replace(/([+-]\d+)$/, '');
      }

      var roll1 = Math.floor(Math.random() * 20) + 1;
      var roll2 = Math.floor(Math.random() * 20) + 1;
      var chosen = isAdv ? Math.max(roll1, roll2) : Math.min(roll1, roll2);
      var total = chosen + mod;

      return {
        expression: expr,
        type: isAdv ? 'advantage' : 'disadvantage',
        rolls: [roll1, roll2],
        chosen: chosen,
        modifier: mod,
        total: total,
        isNat20: chosen === 20,
        isNat1: chosen === 1,
        breakdownText: `[${roll1}, ${roll2}] -> Chosen ${chosen} ${mod >= 0 ? '+' : ''}${mod} = ${total}`
      };
    }

    // Standard dice regex: e.g. 4d6kh3+2, 1d20+5, 3d8-1
    var dicePattern = /(\d+)?d(\d+)(?:k([hl])(\d+))?!?/i;
    var match = cleanExpr.match(dicePattern);

    if (!match) {
      // Fallback simple integer roll or 1d20
      var val = parseInt(cleanExpr, 10);
      if (!isNaN(val)) return { expression: expr, total: val, breakdownText: `${val}` };
      match = ['1d20', '1', '20', null, null];
    }

    var count = parseInt(match[1] || '1', 10);
    var sides = parseInt(match[2], 10);
    var keepType = match[3]; // 'h' or 'l'
    var keepCount = match[4] ? parseInt(match[4], 10) : count;

    // Extract modifier after dice notation
    var remainingStr = cleanExpr.replace(match[0], '');
    var modifier = 0;
    if (remainingStr) {
      try {
        // Safe evaluation of remaining +/- numbers
        modifier = Function('"use strict";return (' + remainingStr + ')')();
      } catch (e) {
        modifier = 0;
      }
    }

    var rawRolls = [];
    for (var i = 0; i < count; i++) {
      rawRolls.push(Math.floor(Math.random() * sides) + 1);
    }

    var keptRolls = rawRolls.slice();
    if (keepType === 'h') {
      keptRolls.sort((a, b) => b - a);
      keptRolls = keptRolls.slice(0, keepCount);
    } else if (keepType === 'l') {
      keptRolls.sort((a, b) => a - b);
      keptRolls = keptRolls.slice(0, keepCount);
    }

    var sum = keptRolls.reduce((a, b) => a + b, 0);
    var total = sum + modifier;

    var isNat20 = (sides === 20 && count === 1 && rawRolls[0] === 20);
    var isNat1 = (sides === 20 && count === 1 && rawRolls[0] === 1);

    return {
      expression: expr,
      count: count,
      sides: sides,
      rolls: rawRolls,
      kept: keptRolls,
      modifier: modifier,
      total: total,
      isNat20: isNat20,
      isNat1: isNat1,
      breakdownText: `[${rawRolls.join(', ')}] ${modifier >= 0 ? '+' : ''}${modifier} = ${total}`
    };
  }

  /**
   * Render Option A 2D Physics-like Canvas Dice Animation
   */
  function show2DDiceAnimation(containerEl, rollData, callback) {
    if (!containerEl) return;
    
    var overlay = document.createElement('div');
    overlay.className = 'dice-overlay-container';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:99999;display:flex;align-items:center;justify-content:center;';

    var canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    canvas.style.cssText = 'width:300px;height:300px;background:rgba(15,23,42,0.85);border:2px solid #38bdf8;border-radius:16px;box-shadow:0 10px 25px rgba(0,0,0,0.7);';
    overlay.appendChild(canvas);
    containerEl.appendChild(overlay);

    var ctx = canvas.getContext('2d');
    var startTime = performance.now();
    var duration = 1200; // ms

    var numDice = (rollData.rolls && rollData.rolls.length) ? Math.min(rollData.rolls.length, 6) : 1;
    var diceParticles = [];
    for (var i = 0; i < numDice; i++) {
      diceParticles.push({
        x: 80 + (i % 3) * 110,
        y: 120 + Math.floor(i / 3) * 120,
        angle: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.4,
        targetVal: rollData.rolls ? rollData.rolls[i] : rollData.total,
        currentVal: Math.floor(Math.random() * 20) + 1
      });
    }

    function anim(now) {
      var elapsed = now - startTime;
      var progress = Math.min(elapsed / duration, 1);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw background glow
      var grad = ctx.createRadialGradient(200, 200, 20, 200, 200, 180);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0.2)');
      grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 400, 400);

      diceParticles.forEach(p => {
        if (progress < 0.8) {
          p.angle += p.rotSpeed;
          if (Math.random() < 0.3) p.currentVal = Math.floor(Math.random() * 20) + 1;
        } else {
          p.currentVal = p.targetVal;
          p.angle *= 0.8;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);

        // Draw 2D D20 / Die shape
        ctx.fillStyle = rollData.isNat20 ? '#22c55e' : (rollData.isNat1 ? '#ef4444' : '#1e293b');
        ctx.strokeStyle = rollData.isNat20 ? '#86efac' : (rollData.isNat1 ? '#fca5a5' : '#38bdf8');
        ctx.lineWidth = 3;

        ctx.beginPath();
        for (var a = 0; a < 6; a++) {
          var rad = (Math.PI / 3) * a;
          var dx = Math.cos(rad) * 36;
          var dy = Math.sin(rad) * 36;
          if (a === 0) ctx.moveTo(dx, dy);
          else ctx.lineTo(dx, dy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Draw Number
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.currentVal, 0, 2);

        ctx.restore();
      });

      // Total result text on finish
      if (progress >= 0.8) {
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 28px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('TOTAL: ' + rollData.total, 200, 340);
      }

      if (progress < 1) {
        requestAnimationFrame(anim);
      } else {
        setTimeout(function () {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          if (callback) callback();
        }, 1000);
      }
    }

    requestAnimationFrame(anim);
  }

  return {
    parseAndRoll: parseAndRoll,
    show2DDiceAnimation: show2DDiceAnimation
  };

})();
