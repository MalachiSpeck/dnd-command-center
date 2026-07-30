// public/js/journal.js

let currentJournalPrompt = null;

async function renderJournalPanel() {
    const promptContainer = document.getElementById('campfire-journal-prompt-root');
    const pastContainer = document.getElementById('campfire-journal-past-root');
    if (!promptContainer || !pastContainer) return;

    // Determine current active prompt by pulling unrevealed dream or message prompts
    const envelopes = await window.offlineStore.getAllEnvelopes();
    const unrevealedPromptEnv = envelopes.find(env => env.revealed && env.content && env.content.journal_prompt);
    
    if (unrevealedPromptEnv) {
        currentJournalPrompt = unrevealedPromptEnv.content.journal_prompt;
        promptContainer.innerHTML = `
            <div class="journal-prompt-card">
                <div class="journal-prompt-title">Weekly Prompt Spotlight</div>
                <div class="journal-prompt-text">"${currentJournalPrompt}"</div>
                <textarea id="campfire-journal-compose-textarea" class="journal-compose-area" placeholder="Deeply reflect on this week's occurrence or dream..."></textarea>
                <button class="dream-continue" style="width:100%; margin-top:10px;" onclick="saveJournalEntry()">Seal & Send Entry</button>
            </div>
        `;
    } else {
        currentJournalPrompt = null;
        promptContainer.innerHTML = `
            <div class="journal-prompt-card" style="border-style: solid; border-color: var(--border-iron);">
                <div class="journal-prompt-title" style="color: var(--text-muted);">No Spotlight Prompts</div>
                <div class="journal-prompt-text" style="color: var(--text-muted); font-size: 0.75rem;">You have answered all prompt spotlights! You can write a free-form entry below.</div>
                <textarea id="campfire-journal-compose-textarea" class="journal-compose-area" placeholder="Record your downtime thoughts or secret plots..."></textarea>
                <button class="dream-continue" style="width:100%; margin-top:10px;" onclick="saveJournalEntry()">Seal & Send Entry</button>
            </div>
        `;
    }

    // Render Past Entries
    const entries = await window.offlineStore.getAll('journalEntries');
    entries.sort((a,b) => b.timestamp - a.timestamp);

    if (entries.length === 0) {
        pastContainer.innerHTML = `<div style="text-align:center; padding:20px; font-style:italic; color:var(--text-muted); font-size:0.75rem;">No past entries recorded in this diary...</div>`;
        return;
    }

    let html = '';
    entries.forEach(entry => {
        const inspirationBadge = entry.dm_flagged_inspiration ? `<span class="inspiration-badge">Inspiration Awarded</span>` : '';
        html += `
            <div class="journal-past-entry-card">
                ${inspirationBadge}
                <div class="journal-past-entry-title">Session ${entry.session_number || 'Downtime Log'}</div>
                <div class="journal-past-entry-meta">${new Date(entry.timestamp).toLocaleDateString()}</div>
                ${entry.prompt ? `<div style="font-size:0.7rem; color:var(--gold-amber); margin-bottom:6px; font-style:italic;">Prompt: "${entry.prompt}"</div>` : ''}
                <div class="journal-past-entry-text">${entry.entry}</div>
                ${entry.dm_notes ? `<div style="margin-top:8px; border-top:1px dashed #222; padding-top:6px; font-size:0.7rem; color:#a78bfa; font-style:italic;"><strong>DM Notes:</strong> "${entry.dm_notes}"</div>` : ''}
            </div>
        `;
    });
    pastContainer.innerHTML = html;
}

function openJournalWithPrompt(promptText) {
    currentJournalPrompt = promptText;
    const textEl = document.getElementById('campfire-journal-compose-textarea');
    if (textEl) {
        textEl.placeholder = `Prompt response: ${promptText}`;
        textEl.scrollIntoView({ behavior: 'smooth' });
        textEl.focus();
    }
}

async function saveJournalEntry() {
    const textEl = document.getElementById('campfire-journal-compose-textarea');
    if (!textEl || !textEl.value.trim()) return;

    const text = textEl.value.trim();
    const entry = {
        id: `journal_${Date.now()}_${charId}`,
        character_id: charId,
        character_name: character.name || 'Hero',
        session_number: character.level || 1,
        written_at: new Date().toISOString(),
        prompt: currentJournalPrompt,
        entry: text,
        shared_with_party: false,
        dm_flagged_inspiration: false,
        dm_notes: "",
        timestamp: Date.now()
    };

    // Save into Pending Changes and Cache store
    await window.offlineStore.addPendingChange({
        type: 'journal_entry',
        ...entry,
        timestamp: Date.now()
    });
    await window.offlineStore.put('journalEntries', entry);

    textEl.value = '';
    await renderJournalPanel();

    if (window.syncEngineV2) {
        window.syncEngineV2.sync().then(renderJournalPanel);
    }
}
