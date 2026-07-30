// --- MULTI-SESSION CAMPAIGN STORY TIMELINE ---
window.openStoryTimelineModal = function() {
    const modal = document.getElementById('story-timeline-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    renderStoryTimeline();
};

function renderStoryTimeline() {
    const container = document.getElementById('story-timeline-dots-rows');
    if (!container) return;

    fetch('/api/reference/timeline')
        .then(res => res.json())
        .then(data => {
            const list = Array.isArray(data) ? data : [];
            container.innerHTML = list.map(item => {
                let color = 'var(--arcane-violet)';
                if (item.type === 'combat') color = 'var(--crimson-rage)';
                else if (item.type === 'discovery') color = 'var(--gold-amber)';
                else if (item.type === 'death') color = 'black';

                return `
                    <div style="display:flex; gap:15px; margin-bottom:12px; position:relative; padding-left:12px; border-left: 2px solid ${color};">
                        <div style="position:absolute; left:-6px; top:3px; width:10px; height:10px; border-radius:50%; background:${color}; box-shadow:0 0 5px ${color};"></div>
                        <div>
                            <span style="font-weight:bold; font-size:0.75rem; color:var(--text-muted);">${item.date}</span>
                            <div style="font-size:0.85rem; color:var(--text-main); margin-top:2px;">${item.event}</div>
                        </div>
                    </div>
                `;
            }).join('');
        });
}

window.addEventToCampaignStoryTimeline = function() {
    const text = prompt("Enter significant campaign milestone event:");
    if (!text) return;

    fetch('/api/reference/campaign_state')
        .then(res => res.json())
        .then(state => {
            const dateStr = `${state.day} ${state.month} ${state.year}`;
            
            fetch('/api/reference/timeline')
                .then(res => res.json())
                .then(data => {
                    const list = Array.isArray(data) ? data : [];
                    list.push({
                        date: dateStr,
                        event: text,
                        type: 'story'
                    });

                    fetch('/api/reference/save/timeline', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(list)
                    }).then(() => {
                        renderStoryTimeline();
                        logCombatAction(`[Timeline] Logged milestone: "${text}"`);
                    });
                });
        });
};
