// public/js/envelope-receiver.js

// Socket listener registry for sealed envelopes pushed from live master dashboard
function initEnvelopeReceiver(socket) {
    if (!socket) return;

    socket.on('sealed-envelope', async (envelope) => {
        console.log(`Received sealed envelope from DM: ${envelope.id} (${envelope.type})`);
        
        // Save envelope inside indexedDB offline cache
        await window.offlineStore.saveEnvelope(envelope);

        // Notify client
        if (typeof showToast === 'function') {
            showToast(`Received sealed parcel from DM: ${envelope.type.replace('_', ' ').toUpperCase()}`);
        }

        // Increment badge counters
        const currentTab = document.querySelector('.tab-content.active');
        if (currentTab && currentTab.id !== 'tab-campfire') {
            updateCampfireBadge();
        }
    });
}
