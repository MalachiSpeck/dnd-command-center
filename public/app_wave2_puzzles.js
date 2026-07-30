// --- PUSH HANDOUT TO PLAYERS WINDOW SYSTEM ---
window.pushPlayerViewHandoutImage = function() {
    const url = prompt("Enter Handout Image URL / Path (e.g. maps, Wanted posters):");
    if (!url) return;

    fetch('/api/handout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePath: url })
    }).then(() => {
        alert("Handout pushed to Player Mirror successfully!");
        activeHandoutPath = url;
        logCombatAction(`[Handout Pushed] Sunk player visual handouts: ${url}`);
    });
};

window.dismissPlayerViewHandout = function() {
    fetch('/api/handout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePath: null })
    }).then(() => {
        alert("Handout dismissed.");
        activeHandoutPath = null;
    });
};

// --- PUZZLE & RIDDLES BANK SYSTEM ---
window.openPuzzlesBankModal = function() {
    const modal = document.getElementById('puzzles-bank-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    renderPuzzlesBankList();
};

function renderPuzzlesBankList() {
    const container = document.getElementById('puzzles-list-rows');
    if (!container) return;

    fetch('/api/reference/puzzles')
        .then(res => res.json())
        .then(data => {
            const list = Array.isArray(data) ? data : [];
            container.innerHTML = list.map((p, idx) => `
                <div style="background:var(--bg-abyss); border:1px solid var(--border-iron); border-radius:6px; padding:12px; margin-bottom:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <strong style="color:var(--text-main); font-size:1.1rem; font-family:'Cinzel', serif;">${p.title}</strong>
                        <div style="display:flex; gap:5px;">
                            <button class="btn-primary" style="padding:2px 8px; font-size:0.75rem;" onclick="pushPuzzleTextAsHandout(${idx})">Push Handout</button>
                            <button class="btn-danger" style="padding:2px 8px; font-size:0.75rem;" onclick="revealPuzzleSolution(${idx})">Answer</button>
                        </div>
                    </div>
                    <div style="font-size:0.85rem; line-height:1.45; color:var(--text-main); margin-bottom:8px; white-space:pre-wrap;">${p.setup_text}</div>
                    
                    <div id="puzzle-answer-box-${idx}" style="display:none; background:#111019; border:1px dashed var(--arcane-violet); padding:8px; border-radius:4px; font-size:0.8rem; color:var(--gold-amber); margin-bottom:8px;">
                        <strong>Solution:</strong> ${p.solution}
                    </div>

                    <div style="display:flex; flex-direction:column; gap:4px; border-top:1px solid var(--border-iron); padding-top:6px;">
                        <strong>Hints:</strong>
                        ${(p.hints || []).map((h, hIdx) => `
                            <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem; color:var(--text-muted);">
                                <span id="puzzle-hint-text-${idx}-${hIdx}" style="visibility:hidden;">${h}</span>
                                <button class="btn-primary" style="padding:1px 4px; font-size:0.6rem; height:18px;" onclick="document.getElementById('puzzle-hint-text-${idx}-${hIdx}').style.visibility='visible'">Show Hint ${hIdx+1}</button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('');
        });
}

window.revealPuzzleSolution = function(idx) {
    const box = document.getElementById(`puzzle-answer-box-${idx}`);
    if (box) {
        box.style.display = box.style.display === 'none' ? 'block' : 'none';
    }
};

window.pushPuzzleTextAsHandout = function(idx) {
    fetch('/api/reference/puzzles')
        .then(res => res.json())
        .then(data => {
            const puzzle = data[idx];
            if (puzzle) {
                // Generate a temporary stylized text card pushed as handout
                const stylizedCard = `https://dummyimage.com/600x400/0f0f13/fbbf24.png&text=${encodeURIComponent(puzzle.title + '\\n\\n' + puzzle.setup_text.substring(0, 80) + '...')}`;
                fetch('/api/handout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ imagePath: stylizedCard })
                }).then(() => {
                    alert("Puzzle pushed to players mirror screen.");
                });
            }
        });
};
