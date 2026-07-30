// --- SHUTTLE PARTY INVENTORY & WEIGHT CAPACITY MANAGER ---
window.openPartyInventoryModal = function() {
    const modal = document.getElementById('inventory-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    renderPartyInventory();
};

function renderPartyInventory() {
    const container = document.getElementById('inventory-items-rows');
    if (!container) return;

    fetch('/api/reference/party_inventory')
        .then(res => res.json())
        .then(data => {
            const list = data.items || [];
            let totalWeight = 0;
            const cap = data.weight_capacity || 300;

            let html = '';
            list.forEach((item, idx) => {
                const itemW = (item.weight || 0) * (item.quantity || 1);
                totalWeight += itemW;

                html += `
                    <div style="background:var(--bg-abyss); border:1px solid var(--border-iron); border-radius:4px; padding:8px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; font-size:0.85rem;">
                        <div>
                            <strong>${item.name}</strong> (x${item.quantity})
                            <div style="font-size:0.75rem; color:var(--text-muted);">Weight: ${item.weight} lbs | Val: ${item.value} gp</div>
                        </div>
                        <div style="display:flex; gap:4px;">
                            <button class="btn-primary" style="padding:2px 6px; font-size:0.7rem;" onclick="adjustInventoryItemQty(${idx}, 1)">+</button>
                            <button class="btn-danger" style="padding:2px 6px; font-size:0.7rem;" onclick="adjustInventoryItemQty(${idx}, -1)">-</button>
                        </div>
                    </div>
                `;
            });

            container.innerHTML = html;

            // Render weight progress bar indicator
            const bar = document.getElementById('inventory-capacity-bar');
            const percent = Math.min(100, (totalWeight / cap) * 100);
            if (bar) {
                bar.style.width = `${percent}%`;
                bar.style.background = percent >= 90 ? 'var(--crimson-rage)' : 'var(--arcane-violet)';
            }

            const label = document.getElementById('inventory-capacity-label');
            if (label) {
                label.innerText = `Carry: ${totalWeight} lbs / ${cap} lbs capacity`;
            }

            const goldDisp = document.getElementById('inventory-gold-display-box');
            if (goldDisp) {
                goldDisp.innerText = `${data.gold || 0} gp`;
            }
        });
}

window.adjustInventoryItemQty = function(idx, delta) {
    fetch('/api/reference/party_inventory')
        .then(res => res.json())
        .then(data => {
            const list = data.items || [];
            if (list[idx]) {
                list[idx].quantity += delta;
                if (list[idx].quantity <= 0) {
                    list.splice(idx, 1);
                }

                // Save back to JSON
                fetch('/api/reference/save/party_inventory', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                }).then(() => {
                    renderPartyInventory();
                });
            }
        });
};

window.dividePartyGoldTreasureEvenly = function() {
    fetch('/api/reference/party_inventory')
        .then(res => res.json())
        .then(data => {
            const totalGold = data.gold || 0;
            const count = localPartyData.length || 4;
            const share = Math.floor(totalGold / count);
            const remainder = totalGold % count;

            alert(`Dividing ${totalGold} gp evenly among ${count} party members:\n\nEach gets: ${share} gp\nLeftovers in chest: ${remainder} gp`);
            
            data.gold = remainder;
            fetch('/api/reference/save/party_inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            }).then(() => {
                renderPartyInventory();
                logCombatAction(`[Gold Split] Shared treasure pool split: ${share} gp paid to each player.`);
            });
        });
};
