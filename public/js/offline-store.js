// IndexedDB Offline Storage Wrapper
const DB_NAME = 'dnd-dm-command-center-db';
const DB_VERSION = 2; // Bump version to 2 for Sealed Envelopes, Tavern Posts, and Journals

class OfflineStore {
    constructor() {
        this.db = null;
    }

    async init() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error('IndexedDB opening error:', event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create stores if they don't exist
                if (!db.objectStoreNames.contains('characters')) {
                    db.createObjectStore('characters', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('spells')) {
                    db.createObjectStore('spells', { keyPath: 'name' });
                }
                if (!db.objectStoreNames.contains('feats')) {
                    db.createObjectStore('feats', { keyPath: 'name' });
                }
                if (!db.objectStoreNames.contains('conditions')) {
                    db.createObjectStore('conditions', { keyPath: 'name' });
                }
                if (!db.objectStoreNames.contains('pendingChanges')) {
                    db.createObjectStore('pendingChanges', { autoIncrement: true });
                }
                if (!db.objectStoreNames.contains('sessionNotes')) {
                    db.createObjectStore('sessionNotes', { keyPath: 'id', autoIncrement: true });
                }
                
                // NEW STORES FOR HYBRID SYNC ENGINE V2
                if (!db.objectStoreNames.contains('sealedEnvelopes')) {
                    db.createObjectStore('sealedEnvelopes', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('tavernPosts')) {
                    db.createObjectStore('tavernPosts', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('journalEntries')) {
                    db.createObjectStore('journalEntries', { keyPath: 'id' });
                }
                
                console.log('IndexedDB stores created or updated for V2.');
            };
        });
    }

    // Generic transaction helper
    async getStore(storeName, mode = 'readonly') {
        const db = await this.init();
        const tx = db.transaction(storeName, mode);
        return tx.objectStore(storeName);
    }

    // Save item
    async put(storeName, item) {
        const store = await this.getStore(storeName, 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.put(item);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    // Get item by key
    async get(storeName, key) {
        const store = await this.getStore(storeName, 'readonly');
        return new Promise((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    // Delete item by key
    async delete(storeName, key) {
        const store = await this.getStore(storeName, 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e.target.error);
        });
    }

    // Get all items in store
    async getAll(storeName) {
        const store = await this.getStore(storeName, 'readonly');
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    // Clear entire store
    async clear(storeName) {
        const store = await this.getStore(storeName, 'readwrite');
        return new Promise((resolve, reject) => {
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e.target.error);
        });
    }

    // --- Specific Pending Changes Queue Helpers ---
    async addPendingChange(change) {
        // change format: { charId, field, oldValue, newValue, timestamp }
        return this.put('pendingChanges', {
            ...change,
            timestamp: change.timestamp || Date.now()
        });
    }

    async getPendingChanges() {
        return this.getAll('pendingChanges');
    }

    async clearPendingChanges() {
        return this.clear('pendingChanges');
    }

    // --- Sealed Envelopes Store Methods ---
    async saveEnvelope(envelope) {
        if (envelope.revealed === undefined) envelope.revealed = false;
        envelope.received_at = Date.now();
        return this.put('sealedEnvelopes', envelope);
    }

    async getDueEnvelopes() {
        const now = new Date().toISOString();
        const all = await this.getAll('sealedEnvelopes');
        const due = all.filter(env => !env.revealed && env.reveal_after <= now);
        due.sort((a, b) => a.reveal_after.localeCompare(b.reveal_after));
        return due;
    }

    async markRevealed(envelopeId) {
        const env = await this.get('sealedEnvelopes', envelopeId);
        if (env) {
            env.revealed = true;
            env.revealed_at = Date.now();
            await this.put('sealedEnvelopes', env);
        }
    }

    async getUnrevealedCount() {
        const now = new Date().toISOString();
        const all = await this.getAll('sealedEnvelopes');
        return all.filter(env => !env.revealed && env.reveal_after <= now).length;
    }

    async getAllEnvelopes() {
        return this.getAll('sealedEnvelopes');
    }

    async forceRevealAll() {
        const all = await this.getAll('sealedEnvelopes');
        let count = 0;
        for (const env of all) {
            if (!env.revealed) {
                env.revealed = true;
                env.revealed_at = Date.now();
                env.force_revealed = true;
                await this.put('sealedEnvelopes', env);
                count++;
            }
        }
        return count;
    }

    // --- Last Sync Metadata Stores ---
    async getLastGDriveSync() {
        const meta = await this.get('sessionNotes', 'last_gdrive_sync');
        return meta ? meta.value : null;
    }

    async setLastGDriveSync(timestamp) {
        return this.put('sessionNotes', { id: 'last_gdrive_sync', value: timestamp });
    }

    // --- Sync Specific Clear ---
    async clearSyncedChanges(syncedArray) {
        const pending = await this.getPendingChanges();
        // Clear matching items by comparing properties
        await this.clear('pendingChanges');
        for (const item of pending) {
            const isSynced = syncedArray.some(s => 
                s.timestamp === item.timestamp && 
                s.field === item.field && 
                s.charId === item.charId
            );
            if (!isSynced) {
                await this.addPendingChange(item);
            }
        }
    }
}

// Global single instance for app use
window.offlineStore = new OfflineStore();
