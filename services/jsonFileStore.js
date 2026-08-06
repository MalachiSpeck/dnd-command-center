const { promises: fsp } = require('fs');
const path = require('path');

/**
 * JsonFileStore — Generalized thread-safe, cached in-memory JSON file store.
 * Supports serialized write queue, atomic temp file writes, and optional Socket.io broadcasts.
 */
class JsonFileStore {
    /**
     * @param {string | (() => string)} pathOrFn Absolute path or function returning absolute path to the target JSON file.
     * @param {any} fallback Fallback data if file is missing or corrupted.
     * @param {import('socket.io').Server} [io] Optional Socket.io instance for broadcasts.
     * @param {string} [broadcastEvent] Optional socket event name to emit on update.
     */
    constructor(pathOrFn, fallback = {}, io = null, broadcastEvent = '') {
        this.pathFn = typeof pathOrFn === 'function' ? pathOrFn : () => pathOrFn;
        this.fallback = fallback;
        this.io = io;
        this.broadcastEvent = broadcastEvent;
        this._cache = null;
        this._cachedFor = null;
        this._writeQueue = Promise.resolve();
    }

    /** Force next get() to re-read from disk */
    invalidate() {
        this._cache = null;
        this._cachedFor = null;
    }

    /** Read data from cache or disk */
    async get() {
        const filePath = this.pathFn();
        if (this._cache !== null && this._cachedFor === filePath) {
            return this._cache;
        }
        try {
            const data = await fsp.readFile(filePath, 'utf8');
            this._cache = JSON.parse(data);
        } catch (err) {
            if (err.code === 'ENOENT') {
                this._cache = Array.isArray(this.fallback) ? [...this.fallback] : { ...this.fallback };
            } else {
                console.error(`[JsonFileStore] Error reading ${filePath}:`, err.message);
                try {
                    const backupPath = `${filePath}.corrupted_${Date.now()}.bak`;
                    await fsp.copyFile(filePath, backupPath);
                    console.warn(`[JsonFileStore] Created corruption backup at ${backupPath}`);
                } catch (bErr) {}
                this._cache = Array.isArray(this.fallback) ? [...this.fallback] : { ...this.fallback };
            }
        }
        this._cachedFor = filePath;
        return this._cache;
    }

    /** Mutate data under a serialized write queue and write back atomically */
    update(mutator, customEvent = null) {
        this._writeQueue = this._writeQueue.then(async () => {
            const filePath = this.pathFn();
            let data;
            try {
                data = await this.get();
            } catch (err) {
                this.invalidate();
                throw err;
            }

            let result;
            try {
                result = await mutator(data);
            } catch (err) {
                this.invalidate();
                throw err;
            }

            try {
                const tmpPath = filePath + '.tmp';
                await fsp.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
                await fsp.rename(tmpPath, filePath);
            } catch (err) {
                this.invalidate();
                throw err;
            }

            const eventName = customEvent || this.broadcastEvent;
            if (this.io && eventName) {
                this.io.emit(eventName, data);
            }
            return result;
        });

        const external = this._writeQueue;
        this._writeQueue = external.catch(() => {});
        return external;
    }
}

module.exports = { JsonFileStore };
