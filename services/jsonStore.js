const fs = require('fs');
const path = require('path');

/**
 * Synchronously reads a JSON file safely.
 * If file is missing -> returns fallback.
 * If file is corrupted -> logs error, backs up corrupted file to .corrupted_TIMESTAMP.bak, and returns fallback.
 */
function readJsonSafeSync(filePath, fallback = null, label = '') {
    const tag = label ? `[${label}]` : '[JSON Store]';
    if (!fs.existsSync(filePath)) {
        return fallback;
    }
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        console.error(`${tag} Corrupted or invalid JSON in ${filePath}:`, err.message);
        try {
            const backupPath = `${filePath}.corrupted_${Date.now()}.bak`;
            fs.copyFileSync(filePath, backupPath);
            console.warn(`${tag} Preserved corrupted file backup at: ${backupPath}`);
        } catch (backupErr) {
            console.error(`${tag} Failed to write corrupted backup copy:`, backupErr.message);
        }
        return fallback;
    }
}

/**
 * Asynchronously reads a JSON file safely.
 * If file is missing -> returns fallback.
 * If file is corrupted -> logs error, backs up corrupted file to .corrupted_TIMESTAMP.bak, and returns fallback.
 */
function readJsonSafe(filePath, fallback = null, label = '') {
    return new Promise((resolve) => {
        const tag = label ? `[${label}]` : '[JSON Store]';
        fs.access(filePath, fs.constants.F_OK, (accessErr) => {
            if (accessErr) return resolve(fallback);
            fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) {
                    console.error(`${tag} Failed to read ${filePath}:`, err.message);
                    return resolve(fallback);
                }
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed);
                } catch (parseErr) {
                    console.error(`${tag} Corrupted or invalid JSON in ${filePath}:`, parseErr.message);
                    const backupPath = `${filePath}.corrupted_${Date.now()}.bak`;
                    fs.copyFile(filePath, backupPath, () => {
                        console.warn(`${tag} Preserved corrupted file backup at: ${backupPath}`);
                        resolve(fallback);
                    });
                }
            });
        });
    });
}

module.exports = {
    readJsonSafeSync,
    readJsonSafe
};
