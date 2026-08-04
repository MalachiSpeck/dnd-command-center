// services/partyStore.js 
// 
// Single source of truth for reading/writing the active party.json file. 
// 
// Solves three long-standing issues in the original ad-hoc code: 
// 1. DRY -- ~10 different route/socket handlers duplicated the same 
// fs.readFile -> JSON.parse -> mutate -> fs.writeFile dance. 
// 2. Races -- concurrent requests could each read the same version of 
// party.json, mutate independently, and clobber each other on 
// write. All mutations now serialise through a promise queue. 
// 3. Churn -- every request re-read the JSON from disk. The store keeps 
// an in-memory cache and invalidates it on every write. 
// 
// Usage: 
// const store = new PartyStore(getPartyPath, io); 
// const party = await store.get(); 
// cached read 
// await store.update(party => { party[0].hp_current = 5; }); 
// queued write // store.invalidate(); 
// e.g. after 
// 
// party file 
// 
// is swapped 
// 
// via active- 
// 
// party switch 
// 
// The mutator callback may be sync or async. Mutate the passed-in party 
// object in place; the store handles serialisation, disk write, and the 
// socket.io 'party-updated' broadcast for you. Return a value if the caller 
// needs it back.

const { promises: fsp } = require('fs');

class PartyStore {
    /**
     * @param {() => string} pathFn Returns the absolute path to the current active party.json file.
     * @param {import('socket.io').Server} io Socket.io server for broadcasts.
     */
    constructor(pathFn, io) {
        this.pathFn = pathFn;
        this.io = io;
        this._cache = null;
        this._cachedFor = null; /* path the cache was loaded from */
        this._writeQueue = Promise.resolve();
    }

/** Force the next `get()` to re-read from disk. */
invalidate() {
    this._cache = null;
    this._cachedFor = null;
}

/**
 * Read party.json (from cache when possible). Returns the parsed array.
 * Callers must NOT mutate the returned object outside of `update()` --
 * doing so would break the cache invariant.
 */
async get() {
    const path = this.pathFn();
    if (this._cache && this._cachedFor === path) return this._cache;
    try {
        const data = await fsp.readFile(path, 'utf8');
        this._cache = JSON.parse(data);
    } catch (err) {
        if (err.code === 'ENOENT') {
            this._cache = [];
        } else {
            throw err;
        }
    }
    this._cachedFor = path;
    return this._cache;
}

/**
 * Run `mutator(party)` under a serialised write lock, then persist the
 * result and broadcast 'party-updated' to all sockets.
 */
update(mutator) {
    this._writeQueue = this._writeQueue.then(async () => {
        const path = this.pathFn();
        let party;
        try {
            party = await this.get();
        } catch (err) {
            this.invalidate();
            throw err;
        }

        let result;
        try {
            result = await mutator(party);
        } catch (err) {
            this.invalidate();       // party may be partially mutated
            throw err;
        }

        try {
            await fsp.writeFile(path, JSON.stringify(party, null, 2));
        } catch (err) {
            this.invalidate();
            throw err;
        }

        if (this.io) {
            this.io.emit('party-updated', party);
        }
        return result;
    });

    const external = this._writeQueue;
    this._writeQueue = external.catch(() => {});
    return external;
}
}
module.exports = { PartyStore };