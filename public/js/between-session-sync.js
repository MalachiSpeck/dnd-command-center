// public/js/between-session-sync.js

class BetweenSessionSync {
    constructor(store, gdriveClient, characterId) {
        this.store = store;
        this.gdrive = gdriveClient;
        this.characterId = characterId;
        this.syncInterval = null;
    }

    async sync() {
        if (!this.gdrive.isSignedIn) {
            console.log('Sync skipped — Google Drive not authenticated.');
            return { synced: false, reason: 'not_authenticated' };
        }

        try {
            const lastSync = await this.store.getLastGDriveSync();
            const results = {
                tavern_posts_pulled: 0,
                tavern_posts_pushed: 0,
                journals_pushed: 0,
                skill_results_pushed: 0,
                character_edits_pushed: 0,
                reactive_content_pulled: 0
            };

            // 1. PULL: Tavern message posts
            const tavernFiles = await this.gdrive.listFiles('between-session/tavern-board', lastSync);
            for (const file of tavernFiles) {
                const post = await this.gdrive.readFile(file.id);
                // Save post in local store
                await this.store.put('tavernPosts', post);
                results.tavern_posts_pulled++;
            }

            // 2. PULL: Reactive Content from DM Console
            const reactiveFiles = await this.gdrive.listFiles('between-session/reactive-content', lastSync);
            for (const file of reactiveFiles) {
                const content = await this.gdrive.readFile(file.id);
                if (content.target === 'all' || content.target === this.characterId || 
                    (Array.isArray(content.target) && content.target.includes(this.characterId))) {
                    
                    // Create unrevealed instant sealed envelope
                    await this.store.saveEnvelope({
                        id: `reactive_${file.id}`,
                        type: content.type,
                        reveal_after: new Date().toISOString(), // Reveal immediately
                        content: content.content,
                        revealed: false
                    });
                    results.reactive_content_pulled++;
                }
            }

            // 3. PUSH: Pending modifications
            const pending = await this.store.getPendingChanges();
            
            // Push skill challenges
            const skillResults = pending.filter(p => p.type === 'skill_challenge_result');
            for (const res of skillResults) {
                await this.gdrive.createFile(
                    'between-session/skill-results',
                    `challenge_${res.envelope_id}_${this.characterId}.json`,
                    res
                );
                results.skill_results_pushed++;
            }

            // Push Character Edits
            const charEdits = pending.filter(p => p.type === 'character_edit' || p.field);
            if (charEdits.length > 0) {
                await this.gdrive.createFile(
                    'between-session/character-edits',
                    `${this.characterId}_edits_${Date.now()}.json`,
                    {
                        characterId: this.characterId,
                        edits: charEdits,
                        timestamp: Date.now()
                    }
                );
                results.character_edits_pushed += charEdits.length;
            }

            // Push Journal Entries
            const journals = pending.filter(p => p.type === 'journal_entry');
            for (const j of journals) {
                await this.gdrive.createFile(
                    `between-session/journals/${this.characterId}`,
                    `session_${j.session_number || 'downtime'}_${Date.now()}.json`,
                    j
                );
                // Cache locally too
                await this.store.put('journalEntries', j);
                results.journals_pushed++;
            }

            // Push Tavern board posts
            const myTavernPosts = pending.filter(p => p.type === 'tavern_post');
            for (const t of myTavernPosts) {
                await this.gdrive.createFile(
                    'between-session/tavern-board',
                    `post_${Date.now()}.json`,
                    t
                );
                await this.store.put('tavernPosts', t);
                results.tavern_posts_pushed++;
            }

            // Clear flushed changes from local queue
            const flushed = [...skillResults, ...charEdits, ...journals, ...myTavernPosts];
            if (flushed.length > 0) {
                await this.store.clearSyncedChanges(flushed);
            }

            // Update timestamp
            await this.store.setLastGDriveSync(new Date().toISOString());
            console.log("Sync sequence processed successfully:", results);

            // Fire event to re-render campfire components
            document.dispatchEvent(new CustomEvent('sync-done', { detail: results }));

            return { synced: true, results };
        } catch (e) {
            console.error("BetweenSessionSync sequence failed:", e);
            return { synced: false, reason: e.message };
        }
    }

    startPeriodicSync(intervalMs = 300000) {
        this.stopPeriodicSync();
        this.syncInterval = setInterval(() => this.sync(), intervalMs);
        this.sync(); // Initial run
    }

    stopPeriodicSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }
}
