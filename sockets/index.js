const fs = require('fs');
const path = require('path');

module.exports = function setupSockets(io, partyStore) {
    io.on('connection', (socket) => {
        // Join Room (DM, Player, Projector)
        socket.on('join-room', (data) => {
            const room = typeof data === 'string' ? data : (data && data.room ? data.room : 'players');
            socket.join(room);
            if (data && data.characterName) {
                socket.characterName = data.characterName;
            }
            io.emit('player-connected-update', { id: socket.id, room, characterName: socket.characterName });
        });

        // Player Stats / Sheet Update
        socket.on('player-update', async (updateData) => {
            if (!updateData) return;
            try {
                await partyStore.update(party => {
                    const idx = party.findIndex(p => p.id === updateData.id || p.name === updateData.name);
                    if (idx !== -1) {
                        party[idx] = { ...party[idx], ...updateData };
                    } else if (updateData.name) {
                        party.push(updateData);
                    }
                });
                io.emit('party-updated-sync', updateData);
            } catch (e) {
                console.error('[Socket] Error on player-update:', e.message);
            }
        });

        // Whispers
        socket.on('whisper-to-player', (data) => {
            io.emit('whisper-received', data);
        });

        socket.on('whisper-to-dm', (data) => {
            io.to('dm').emit('dm-whisper-received', data);
        });

        // Legendary Resistance
        socket.on('trigger-legendary-resistance', (data) => {
            io.emit('legendary-resistance-triggered', data);
        });

        // Homebrew Proposals
        socket.on('propose-homebrew-item', (item) => {
            io.to('dm').emit('homebrew-item-proposed', item);
        });

        // Badges
        socket.on('award-badge', (data) => {
            io.emit('badge-awarded', data);
        });

        // Skill Challenges
        socket.on('submit-skill-challenge-roll', (data) => {
            io.emit('skill-challenge-roll-submitted', data);
        });

        // Map Tokens & Overlays
        socket.on('token:move', (data) => {
            socket.broadcast.emit('token:moved', data);
        });

        socket.on('token:nudge', (data) => {
            socket.broadcast.emit('token:nudged', data);
        });

        socket.on('dice:roll', (data) => {
            io.emit('dice:rolled', data);
        });

        // Remote Soundboard Activation
        socket.on('sounds:trigger', (soundData) => {
            io.emit('sounds:play', soundData);
        });

        socket.on('overlay:trigger-cinematic', (data) => {
            io.emit('overlay:cinematic-triggered', data);
        });

        // Wild Shape & Companion Updates
        socket.on('update-wild-shape', (data) => {
            io.emit('wild-shape-updated', data);
        });

        socket.on('update-companions', (data) => {
            io.emit('companions-updated', data);
        });

        socket.on('update-polymorph', (data) => {
            io.emit('polymorph-updated', data);
        });

        socket.on('update-resource-vault', async (data) => {
            if (!data || (!data.characterId && !data.characterName)) return;
            try {
                await partyStore.update(party => {
                    const char = party.find(p => (data.characterId && p.id === data.characterId) || (data.characterName && p.name === data.characterName));
                    if (char) {
                        char.resource_vault = data.resource_vault || char.resource_vault;
                    }
                });
                io.emit('resource-vault-updated', data);
            } catch (e) {
                console.error('[Socket] Error on update-resource-vault:', e.message);
            }
        });


        socket.on('disconnect', () => {

            io.emit('player-disconnected', { id: socket.id });
        });
    });
};
