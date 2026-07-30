// public/js/gdrive-client.js

class GDriveClient {
    constructor() {
        this.CLIENT_ID = "YOUR_OAUTH_CLIENT_ID_PLACEHOLDER.apps.googleusercontent.com"; // Placeholders loaded or configurable
        this.ROOT_FOLDER_ID = "YOUR_SHARED_ROOT_FOLDER_ID_PLACEHOLDER";
        this.isSignedIn = false;
        this.folderCache = {};
    }

    async init(clientId, rootFolderId) {
        if (clientId) this.CLIENT_ID = clientId;
        if (rootFolderId) this.ROOT_FOLDER_ID = rootFolderId;

        return new Promise((resolve, reject) => {
            if (typeof gapi === 'undefined') {
                console.warn("Google API script 'gapi' is not loaded yet.");
                resolve(false);
                return;
            }

            gapi.load('client:auth2', async () => {
                try {
                    await gapi.client.init({
                        clientId: this.CLIENT_ID,
                        scope: 'https://www.googleapis.com/auth/drive.file',
                        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
                    });

                    const authInst = gapi.auth2.getAuthInstance();
                    this.isSignedIn = authInst.isSignedIn.get();

                    authInst.isSignedIn.listen((signedIn) => {
                        this.isSignedIn = signedIn;
                        document.dispatchEvent(new CustomEvent('gdrive-auth-change', { detail: signedIn }));
                    });

                    resolve(this.isSignedIn);
                } catch (err) {
                    console.error("GDrive init failed:", err);
                    reject(err);
                }
            });
        });
    }

    async signIn() {
        const authInst = gapi.auth2.getAuthInstance();
        await authInst.signIn();
        this.isSignedIn = true;
        return this.isSignedIn;
    }

    async signOut() {
        const authInst = gapi.auth2.getAuthInstance();
        await authInst.signOut();
        this.isSignedIn = false;
        return this.isSignedIn;
    }

    async findFolder(name, parentId = null) {
        const parent = parentId || this.ROOT_FOLDER_ID;
        const cacheKey = `${parent}/${name}`;

        if (this.folderCache[cacheKey]) return this.folderCache[cacheKey];

        const response = await gapi.client.drive.files.list({
            q: `name='${name}' and '${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
            spaces: 'drive'
        });

        if (response.result.files && response.result.files.length > 0) {
            this.folderCache[cacheKey] = response.result.files[0].id;
            return response.result.files[0].id;
        }
        return null;
    }

    // Auto-initializes path directory structures if they don't exist
    async resolvePath(folderPath) {
        const parts = folderPath.split('/');
        let currentId = this.ROOT_FOLDER_ID;

        for (const part of parts) {
            let folderId = await this.findFolder(part, currentId);
            if (!folderId) {
                // Auto create folder on flight
                folderId = await this.createFolder(part, currentId);
            }
            currentId = folderId;
        }
        return currentId;
    }

    async createFolder(name, parentId) {
        const response = await gapi.client.drive.files.create({
            resource: {
                name: name,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentId]
            },
            fields: 'id'
        });
        return response.result.id;
    }

    async listFiles(folderPath, modifiedAfter = null) {
        const folderId = await this.resolvePath(folderPath);
        if (!folderId) return [];

        let query = `'${folderId}' in parents and trashed=false and mimeType='application/json'`;
        if (modifiedAfter) {
            query += ` and modifiedTime > '${modifiedAfter}'`;
        }

        const response = await gapi.client.drive.files.list({
            q: query,
            fields: 'files(id, name, modifiedTime, size)',
            orderBy: 'modifiedTime desc',
            spaces: 'drive'
        });

        return response.result.files || [];
    }

    async readFile(fileId) {
        const response = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media'
        });
        return response.result;
    }

    async createFile(folderPath, fileName, jsonContent) {
        const folderId = await this.resolvePath(folderPath);
        if (!folderId) throw new Error(`Folder resolution failed: ${folderPath}`);

        const metadata = {
            name: fileName,
            mimeType: 'application/json',
            parents: [folderId]
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([JSON.stringify(jsonContent, null, 2)], { type: 'application/json' }));

        const token = gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().access_token;

        const response = await fetch(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
            {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: form
            }
        );

        return response.json();
    }

    async updateFile(fileId, jsonContent) {
        const token = gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().access_token;

        const response = await fetch(
            `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
            {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(jsonContent, null, 2)
            }
        );

        return response.json();
    }
}

// Global Single Instance
window.gdriveClient = new GDriveClient();
