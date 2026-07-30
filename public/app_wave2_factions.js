// --- FACTION REPUTATION PANEL MODULE ---
window.openFactionReputationModal = function() {
    const modal = document.getElementById('faction-rep-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    renderFactionReputationList();
};

function renderFactionReputationList() {
    const container = document.getElementById('faction-reputation-rows');
    if (!container) return;

    fetch('/api/reference/factions')
        .then(res => res.json())
        .then(data => {
            const list = data.factions || [];
            container.innerHTML = list.map(f => {
                let tier = 'Neutral';
                let color = '#94a3b8';

                if (f.reputation >= 8) { tier = 'Allied'; color = '#22c55e'; }
                else if (f.reputation >= 3) { tier = 'Friendly'; color = '#10b981'; }
                else if (f.reputation <= -8) { tier = 'Hostile'; color = 'var(--crimson-rage)'; }
                else if (f.reputation <= -3) { tier = 'Unfriendly'; color = '#ef4444'; }

                return `
                    <div style="background:var(--bg-abyss); border:1px solid var(--border-iron); padding:10px; border-radius:6px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong style="color:var(--text-main); font-size:1rem;">${f.name}</strong>
                            <p style="margin:2px 0 0 0; color:var(--text-muted); font-size:0.75rem;">${f.description}</p>
                            <span style="font-size:0.75rem; font-weight:bold; color:${color}; text-transform:uppercase;">${tier} (${f.reputation})</span>
                        </div>
                        <div style="display:flex; gap:5px;">
                            <button class="btn-primary" style="padding:4px 8px; font-size:0.8rem; background:#22c55e;" onclick="adjustFactionReputation('${f.name}', 1)">+</button>
                            <button class="btn-danger" style="padding:4px 8px; font-size:0.8rem; background:#ef4444;" onclick="adjustFactionReputation('${f.name}', -1)">-</button>
                        </div>
                    </div>
                `;
            }).join('');
        });
}

window.adjustFactionReputation = function(factionName, delta) {
    fetch('/api/reference/factions')
        .then(res => res.json())
        .then(data => {
            const list = data.factions || [];
            const faction = list.find(f => f.name === factionName);
            if (faction) {
                faction.reputation = Math.max(-10, Math.min(10, faction.reputation + delta));
                
                // Save updated array list
                fetch('/api/reference/save/factions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ factions: list })
                }).then(() => {
                    renderFactionReputationList();
                    logCombatAction(`[Faction Rep] Adjust reputation of ${factionName} by ${delta >= 0 ? '+' : ''}${delta}`);
                });
            }
        });
};
