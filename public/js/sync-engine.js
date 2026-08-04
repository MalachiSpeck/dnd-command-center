// D&D DM Command Center - Client-Side Sync Engine & PWA Controller

class SyncEngine {
    constructor() {
        this.isOnline = navigator.onLine;
        this.charId = null;
        this.pingInterval = null;
        this.offlineBanner = null;
    }

    async init(charId) {
        this.charId = charId;
        console.log(`[Sync Engine] Initialized for character: ${charId}`);

        // Set up the offline banner element
        this.createOfflineBanner();

        // Register Service Worker if supported
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then((reg) => {
                    console.log('[Sync Engine] Service Worker registered:', reg.scope);
                    // Ensure the Service Worker updates itself if a new version is available
                    reg.update();
                })
                .catch((err) => console.error('[Sync Engine] SW Registration failed:', err));
        }

        // Listen for browser online/offline events
        window.addEventListener('online', () => this.handleNetworkChange(true));
        window.addEventListener('offline', () => this.handleNetworkChange(false));

        // Start background server availability check
        this.startServerPinger();

        // Run initial sync check
        await this.checkAndSync();
    }

    createOfflineBanner() {
        if (document.getElementById('sync-status-banner')) return;

        const banner = document.createElement('div');
        banner.id = 'sync-status-banner';
        banner.style.position = 'fixed';
        banner.style.top = '0';
        banner.style.left = '0';
        banner.style.width = '100%';
        banner.style.padding = '8px 16px';
        banner.style.textAlign = 'center';
        banner.style.fontSize = '0.85rem';
        banner.style.fontWeight = '600';
        banner.style.zIndex = '9999';
        banner.style.display = 'none';
        banner.style.transition = 'all 0.3s ease';

        document.body.prepend(banner);
        this.offlineBanner = banner;
    }

    updateBanner(status, message) {
        if (this.offlineBanner) {
            this.offlineBanner.innerText = message;
        }

        const pill = document.getElementById('pwa-network-pill');
        const dot = document.getElementById('pwa-dot');
        const text = document.getElementById('pwa-status-text');

        if (status === 'offline') {
            if (this.offlineBanner) {
                this.offlineBanner.style.display = 'block';
                this.offlineBanner.style.backgroundColor = '#7f1d1d'; // Crimson red
                this.offlineBanner.style.color = '#fecaca';
            }
            if (pill && dot && text) {
                pill.style.background = 'rgba(239, 68, 68, 0.15)';
                pill.style.borderColor = '#ef4444';
                pill.style.color = '#fca5a5';
                dot.style.background = '#ef4444';
                dot.style.boxShadow = '0 0 6px #ef4444';
                text.innerText = 'Offline Mode (Saved on Device)';
            }
        } else if (status === 'syncing') {
            console.log(`[Sync Engine] Background Syncing: ${message}`);
            if (this.offlineBanner) this.offlineBanner.style.display = 'none';
            if (pill && dot && text) {
                pill.style.background = 'rgba(245, 158, 11, 0.15)';
                pill.style.borderColor = '#fbbf24';
                pill.style.color = '#fde047';
                dot.style.background = '#fbbf24';
                dot.style.boxShadow = '0 0 6px #fbbf24';
                text.innerText = 'Syncing...';
            }
        } else if (status === 'success') {
            console.log(`[Sync Engine] Background Sync Success: ${message}`);
            if (this.offlineBanner) this.offlineBanner.style.display = 'none';
            if (pill && dot && text) {
                pill.style.background = 'rgba(34, 197, 94, 0.15)';
                pill.style.borderColor = '#22c55e';
                pill.style.color = '#4ade80';
                dot.style.background = '#22c55e';
                dot.style.boxShadow = '0 0 6px #22c55e';
                text.innerText = 'Online';
            }
        }
    }

    async handleNetworkChange(online) {
        this.isOnline = online;
        console.log(`[Sync Engine] Browser reporting: ${online ? 'ONLINE' : 'OFFLINE'}`);
        await this.checkAndSync();
    }

    startServerPinger() {
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(async () => {
            await this.checkAndSync();
        }, 15000); // Check every 15 seconds
    }

    async checkAndSync() {
        if (!navigator.onLine) {
            this.updateBanner('offline', 'Offline Mode — Changes are saved locally and will sync next session');
            return;
        }

        try {
            // Ping server
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            const response = await fetch('/api/party', { signal: controller.signal });
            clearTimeout(timeoutId);

            if (response.ok) {
                // Server is reachable! Push pending changes
                await this.performSync();
            } else {
                this.updateBanner('offline', 'Offline Mode — Server unreachable');
            }
        } catch (err) {
            console.log('[Sync Engine] Server unreachable (offline)');
            this.updateBanner('offline', 'Offline Mode — Server unreachable');
        }
    }

    async performSync() {
        const pending = await window.offlineStore.getPendingChanges();

        if (pending.length > 0) {
            this.updateBanner('syncing', `Syncing ${pending.length} changes with DM server...`);
            console.log(`[Sync Engine] Syncing ${pending.length} queued changes:`, pending);

            try {
                const response = await fetch(`/api/sync/${this.charId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        pendingChanges: pending,
                        lastSyncTimestamp: Date.now()
                    })
                });

                if (response.ok) {
                    const result = await response.json();
                    console.log('[Sync Engine] Sync response:', result);

                    // Clear pending changes in IndexedDB
                    await window.offlineStore.clearPendingChanges();

                    // Update local character cache in IndexedDB
                    if (result.character) {
                        await window.offlineStore.put('characters', result.character);
                    }

                    // Handle strict conflict reports (logged silently to console for background telemetry)
                    if (result.conflicts && result.conflicts.length > 0) {
                        console.warn('[Sync Engine] Sync Conflicts encountered:', result.conflicts);
                        // Silenced red warning boxes on player sheet to allow seamless uninterrupted tabletop edits
                        /*
                        result.conflicts.forEach(conflict => {
                            this.showConflictAlert(conflict);
                        });
                        */
                    }

                    this.updateBanner('success', `Sync Complete! Merged ${pending.length} updates.`);
                    
                    // Trigger UI re-render on the sheet
                    if (window.onSyncComplete) {
                        window.onSyncComplete(result.character);
                    }
                } else {
                    this.updateBanner('offline', 'Sync failed on server side');
                }
            } catch (err) {
                console.error('[Sync Engine] Sync post failed:', err);
                this.updateBanner('offline', 'Failed to transmit changes');
            }
        } else {
            // No local pending edits, just pull latest character state
            try {
                const response = await fetch('/api/party');
                if (response.ok) {
                    const party = await response.json();
                    const matched = party.find(c => c.id === this.charId);
                    if (matched) {
                        await window.offlineStore.put('characters', matched);
                        if (window.onSyncComplete) {
                            window.onSyncComplete(matched);
                        }
                    }
                }
            } catch (e) {
                console.warn('[Sync Engine] Simple fetch failed:', e);
            }
        }

        // Cache spell/feat references dynamically if they are modified
        this.cacheReferences();
    }

    async cacheReferences() {
        try {
            // Spells
            const spellsRes = await fetch('/api/spells');
            if (spellsRes.ok) {
                const spells = await spellsRes.json();
                if (Array.isArray(spells)) {
                    spells.forEach(s => window.offlineStore.put('spells', s));
                }
            }

            // Feats
            const featsRes = await fetch('/api/feats');
            if (featsRes.ok) {
                const feats = await featsRes.json();
                if (Array.isArray(feats)) {
                    feats.forEach(f => window.offlineStore.put('feats', f));
                }
            }

            // Conditions
            const condsRes = await fetch('/api/reference/conditions');
            if (condsRes.ok) {
                const conds = await condsRes.json();
                if (Array.isArray(conds)) {
                    conds.forEach(c => window.offlineStore.put('conditions', c));
                }
            }
        } catch (e) {
            console.log('[Sync Engine] Failed to cache references (offline)');
        }
    }

    showConflictAlert(conflict) {
        // Build a persistent in-app notice for conflicts
        const container = document.getElementById('conflict-notices-container') || this.createConflictContainer();
        const alertDiv = document.createElement('div');
        alertDiv.className = 'conflict-notice';
        alertDiv.style.backgroundColor = '#450a0a';
        alertDiv.style.border = '1px solid #f87171';
        alertDiv.style.padding = '12px';
        alertDiv.style.borderRadius = '6px';
        alertDiv.style.marginTop = '10px';
        alertDiv.style.color = '#fecaca';
        alertDiv.style.fontSize = '0.85rem';
        alertDiv.style.display = 'flex';
        alertDiv.style.justifyContent = 'space-between';
        alertDiv.style.alignItems = 'center';

        alertDiv.innerHTML = `
            <div>
                <strong>Conflict on ${conflict.field}:</strong> 
                DM set "${conflict.dmValue}", you tried to set "${conflict.playerValue}". 
                <span style="text-decoration: underline">DM value kept.</span>
            </div>
            <button onclick="this.parentElement.remove()" style="background: none; border: none; color: #f87171; cursor: pointer; font-size: 1.2rem; font-weight: bold; margin-left: 10px;">&times;</button>
        `;

        container.appendChild(alertDiv);
    }

    createConflictContainer() {
        const div = document.createElement('div');
        div.id = 'conflict-notices-container';
        div.style.position = 'fixed';
        div.style.bottom = '20px';
        div.style.right = '20px';
        div.style.zIndex = '99999';
        div.style.maxWidth = '400px';
        div.style.display = 'flex';
        div.style.flexDirection = 'column';
        div.style.gap = '8px';
        document.body.appendChild(div);
        return div;
    }

    // Records a local edit into IndexedDB, triggers calc, and schedules sync
    async recordLocalEdit(character, field, oldValue, newValue) {
        // Save locally to indexedDB first
        character[field] = newValue;

        // Recalculate derived stats instantly
        const calculatedChar = window.characterEngine.calculate(character);

        await window.offlineStore.put('characters', calculatedChar);

        // Queue change
        await window.offlineStore.addPendingChange({
            charId: this.charId,
            field: field,
            oldValue: oldValue,
            newValue: newValue,
            timestamp: Date.now()
        });

        // Inform sheet to re-render
        if (window.onSyncComplete) {
            window.onSyncComplete(calculatedChar);
        }

        // Try to trigger immediate sync
        await this.checkAndSync();
    }
}

window.syncEngine = new SyncEngine();
