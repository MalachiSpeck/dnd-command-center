// public/js/session-reconnect.js

async function handleSessionReconnect() {
    showBanner('reconnecting', 'Syncing between-session data...');

    // 1. Force-reveal remaining sealed envelopes (End of week expiration / session restart)
    const forceRevealed = await window.offlineStore.forceRevealAll();
    if (forceRevealed > 0) {
        showToast(`${forceRevealed} sealed messages opened & revealed.`);
    }

    // 2. Perform background pull from GDrive
    if (window.syncEngineV2) {
        await window.syncEngineV2.sync();
    }

    // 3. Consolidated push-merge state back to Local Server
    const pendingChanges = await window.offlineStore.getPendingChanges();

    const mergePayload = {
        characterId: charId,
        character_edits: pendingChanges.filter(c => c.type === 'character_edit' || c.field),
        skill_results: pendingChanges.filter(c => c.type === 'skill_challenge_result'),
        journal_entries: pendingChanges.filter(c => c.type === 'journal_entry'),
        tavern_posts: pendingChanges.filter(c => c.type === 'tavern_post'),
        last_gdrive_sync: await window.offlineStore.getLastGDriveSync()
    };

    try {
        const response = await fetch('/api/session/merge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mergePayload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server returned error status ${response.status}: ${errorText}`);
        }

        const mergeResult = await response.json();

        // 4. Handle sync conflict outcomes (Phase 6) silently (never disturb the player)
        if (mergeResult && mergeResult.conflicts && mergeResult.conflicts.length > 0) {
            console.warn('[Sync] Silent merge conflicts auto-resolved with player-first priority:', mergeResult.conflicts);
            const resolutions = mergeResult.conflicts.map(c => ({
                field: c.field,
                resolution: 'client',
                value: c.client_new_value
            }));
            
            // Post resolutions back to local server to finalize profiles
            await fetch('/api/session/resolve-conflicts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    characterId: charId,
                    resolutions: resolutions
                })
            });
        }

        // 5. Download authoritative finalized profile state
        const freshPartyRes = await fetch(`/api/party`);
        if (freshPartyRes.ok) {
            const freshParty = await freshPartyRes.json();
            if (Array.isArray(freshParty)) {
                const freshChar = freshParty.find(c => c.id === charId);
                if (freshChar) {
                    character = freshChar;
                    await window.offlineStore.put('characters', character);
                    renderCharacterSheet();
                }
            } else {
                console.warn("[Sync] /api/party response was not a valid array:", freshParty);
            }
        } else {
            console.warn("[Sync] Failed to fetch finalized party profiles:", freshPartyRes.status);
        }

        // 6. Clear local changes queue as merge is complete
        await window.offlineStore.clearPendingChanges();

        showToast("Synchronized successfully! Real-time session resumed.");
        showBanner('connected');

    } catch (err) {
        console.error("LAN Session merge sequence failed:", err);
        let msg = err.message || err;
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('fetch failed')) {
            msg = "Cannot reach laptop server. Check Wi-Fi & Firewall (Port 3000)";
        }
        showBanner('offline', `Sync failed: ${msg}`);
    }
}

function showBanner(status, textOverride = '') {
    const bannerText = document.getElementById('pwa-status-text');
    const modeBadge = document.getElementById('pwa-mode-badge');
    if (!bannerText) return;

    if (status === 'connected') {
        bannerText.innerText = textOverride || "Status: Live Sync Enabled";
        if (modeBadge) {
            modeBadge.innerText = "LIVE MODE";
            modeBadge.style.backgroundColor = "var(--success-green)";
        }
    } else if (status === 'reconnecting') {
        bannerText.innerText = textOverride || "Status: Synchronizing changes...";
        if (modeBadge) {
            modeBadge.innerText = "SYNCING";
            modeBadge.style.backgroundColor = "var(--gold-amber)";
        }
    } else {
        bannerText.innerText = textOverride || "Status: Sandbox Offline Mode";
        if (modeBadge) {
            modeBadge.innerText = "OFFLINE";
            modeBadge.style.backgroundColor = "var(--crimson-rage)";
        }
    }
}

function showToast(message) {
    const container = document.getElementById('toast-notification-container') || createToastContainer();
    const toast = document.createElement('div');
    toast.style = `
        background: #1e1b4b; 
        border: 1px solid var(--arcane-violet); 
        color: white; 
        padding: 10px 16px; 
        border-radius: 6px; 
        font-size: 0.8rem; 
        box-shadow: 0 4px 15px rgba(0,0,0,0.6);
        animation: slideInNotification 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    `;
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => {
        if (toast.parentElement) toast.remove();
    }, 5000);
}

function createToastContainer() {
    const div = document.createElement('div');
    div.id = 'toast-notification-container';
    div.style = "position:fixed; bottom:80px; right:20px; z-index:99999; display:flex; flex-direction:column; gap:8px;";
    document.body.appendChild(div);
    return div;
}
