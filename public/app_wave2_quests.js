// --- QUESTS AND TARGET OBJECTIVES TRACKER ---
window.openQuestsTrackerModal = function() {
    const modal = document.getElementById('quests-tracker-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    renderQuestsTrackerList();
};

function renderQuestsTrackerList() {
    const container = document.getElementById('quests-list-rows');
    if (!container) return;

    fetch('/api/reference/quests')
        .then(res => res.json())
        .then(quests => {
            const list = Array.isArray(quests) ? quests : [];
            container.innerHTML = list.map((q, qIdx) => {
                const statusColor = q.status === 'active' ? 'var(--gold-amber)' : (q.status === 'complete' ? '#22c55e' : '#ef4444');
                const objectivesHtml = (q.objectives || []).map((o, oIdx) => `
                    <div style="display:flex; align-items:center; gap:8px; font-size:0.8rem; color:var(--text-main); margin-top:4px;">
                        <input type="checkbox" ${o.complete ? 'checked' : ''} onchange="toggleQuestObjectiveCompletion(${qIdx}, ${oIdx})" style="cursor:pointer;">
                        <span style="${o.complete ? 'text-decoration:line-through; color:var(--text-muted);' : ''}">${o.text}</span>
                    </div>
                `).join('');

                return `
                    <div style="background:var(--bg-abyss); border:1px solid var(--border-iron); border-radius:6px; padding:12px; margin-bottom:10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                            <strong style="color:var(--text-main); font-size:1.1rem; font-family:'Cinzel', serif;">${q.title}</strong>
                            <span style="font-size:0.75rem; font-weight:bold; color:${statusColor}; text-transform:uppercase;">${q.status}</span>
                        </div>
                        <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:8px;">Giver: ${q.giver}</div>
                        <div style="border-top:1px solid var(--border-iron); padding-top:6px;">
                            <strong>Objectives:</strong>
                            ${objectivesHtml}
                        </div>
                    </div>
                `;
            }).join('');
        });
}

window.toggleQuestObjectiveCompletion = function(qIdx, oIdx) {
    fetch('/api/reference/quests')
        .then(res => res.json())
        .then(quests => {
            const list = Array.isArray(quests) ? quests : [];
            if (list[qIdx] && list[qIdx].objectives && list[qIdx].objectives[oIdx] !== undefined) {
                list[qIdx].objectives[oIdx].complete = !list[qIdx].objectives[oIdx].complete;

                // Check if all objectives are complete
                const allDone = list[qIdx].objectives.every(o => o.complete);
                if (allDone) {
                    list[qIdx].status = 'complete';
                    logCombatAction(`[Quest Completed] "${list[qIdx].title}" is now marked completed!`);
                } else {
                    list[qIdx].status = 'active';
                }

                // Save back to JSON
                fetch('/api/reference/save/quests', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(list)
                }).then(() => {
                    renderQuestsTrackerList();
                });
            }
        });
};
