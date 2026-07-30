// public/js/conflict-resolver.js

async function resolveConflicts(conflicts) {
    if (!conflicts || conflicts.length === 0) return;

    return new Promise((resolve) => {
        // Show fullscreen modal for resolution
        const overlay = document.createElement('div');
        overlay.className = 'envelope-fullscreen conflict-resolver-modal';
        overlay.style.zIndex = '3500';

        let innerHtml = `
            <div style="max-width: 480px; width:100%; background:#141419; border: 1.5px solid var(--crimson-rage); border-radius: 8px; padding:20px; box-sizing:border-box; max-height: 80vh; overflow-y:auto; box-shadow: 0 10px 30px rgba(0,0,0,0.85);">
                <h3 style="font-family:'Cinzel', serif; color:var(--crimson-rage); margin-top:0; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                    <span>Sync Conflict Detected</span>
                    <span style="font-size:0.6rem; background:rgba(239, 68, 68, 0.1); padding:2px 8px; border-radius:4px;">Action Needed</span>
                </h3>
                <p style="font-size:0.75rem; color:var(--text-muted); line-height:1.4; margin-bottom:15px;">
                    Both you and the DM edited these stats or sheets between sessions. Choose which version to persist on your character profile:
                </p>
                <div id="conflicts-items-list" style="display:flex; flex-direction:column; gap:14px; margin-bottom:20px;">
        `;

        conflicts.forEach((c, index) => {
            innerHtml += `
                <div style="background:#0d0d12; border:1px solid var(--border-iron); border-radius:6px; padding:12px; font-size:0.8rem;" class="conflict-item-row" data-field="${c.field}">
                    <div style="font-family:'Cinzel', serif; color:var(--gold-amber); margin-bottom:8px; text-transform:uppercase; font-size:0.75rem; font-weight:bold;">Field: ${c.field.replace('_', ' ')}</div>
                    
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                        <button onclick="selectConflictOption(this, ${index}, 'client')" style="text-align:left; background:rgba(139, 92, 246, 0.1); border:1px solid var(--arcane-violet); color:white; border-radius:4px; padding:8px; cursor:pointer;" class="conflict-opt btn-client active">
                            <strong style="display:block; font-size:0.65rem; color:var(--arcane-violet); text-transform:uppercase;">My Changes</strong>
                            <span style="font-size:0.85rem; font-weight:bold;">${JSON.stringify(c.client_new_value)}</span>
                        </button>
                        
                        <button onclick="selectConflictOption(this, ${index}, 'server')" style="text-align:left; background:rgba(255,255,255,0.03); border:1px solid var(--border-iron); color:#cbd5e1; border-radius:4px; padding:8px; cursor:pointer;" class="conflict-opt btn-server">
                            <strong style="display:block; font-size:0.65rem; color:var(--text-muted); text-transform:uppercase;">DM Version</strong>
                            <span style="font-size:0.85rem; font-weight:bold;">${JSON.stringify(c.server_value)}</span>
                        </button>
                    </div>
                </div>
            `;
        });

        innerHtml += `
                </div>
                <button onclick="submitConflictResolutions(this)" style="width:100%; background:var(--success-green); border:none; color:white; padding:10px; border-radius:4px; font-weight:bold; font-family:'Cinzel', serif; font-size:0.85rem; cursor:pointer; letter-spacing:0.5px;">Resolve & Merge Profile</button>
            </div>
        `;

        overlay.innerHTML = innerHtml;
        document.body.appendChild(overlay);

        window.conflictDataRef = {
            conflicts,
            resolutions: conflicts.map(() => 'client'), // Default to keeping client mine
            resolveCallback: resolve,
            overlayRef: overlay
        };
    });
}

function selectConflictOption(button, index, choice) {
    const parent = button.parentElement;
    parent.querySelectorAll('.conflict-opt').forEach(b => {
        b.classList.remove('active');
        b.style.borderColor = 'var(--border-iron)';
        b.style.background = 'rgba(255,255,255,0.03)';
    });

    button.classList.add('active');
    if (choice === 'client') {
        button.style.borderColor = 'var(--arcane-violet)';
        button.style.background = 'rgba(139, 92, 246, 0.1)';
    } else {
        button.style.borderColor = 'var(--gold-amber)';
        button.style.background = 'rgba(251, 191, 36, 0.1)';
    }

    window.conflictDataRef.resolutions[index] = choice;
}

async function submitConflictResolutions(submitBtn) {
    const ref = window.conflictDataRef;
    if (!ref) return;

    submitBtn.disabled = true;
    submitBtn.innerText = "Processing Decisions...";

    const resolutionsPayload = ref.conflicts.map((c, idx) => {
        const choice = ref.resolutions[idx];
        return {
            field: c.field,
            resolution: choice,
            value: choice === 'client' ? c.client_new_value : c.server_value
        };
    });

    // Send payload back to parent callback
    ref.overlayRef.remove();
    ref.resolveCallback(resolutionsPayload);
    window.conflictDataRef = null;
}
