// --- IN-GAME CALENDAR & TIME TRACKER SYSTEM ---
window.advanceCampaignCalendarTime = function(amountHours) {
    fetch('/api/reference/campaign_state')
        .then(res => res.json())
        .then(state => {
            let hr = (state.hour || 8) + amountHours;
            let day = state.day || 15;
            let month = state.month || "Mirtul";
            let year = state.year || 1493;

            // Simple Forgotten Realms calendar logic: 30 days per month
            while (hr >= 24) {
                hr -= 24;
                day += 1;
                // Auto-advance point trackers on active Downtime Grinds
                advanceDowntimeGrindTrackersOnDayPassed();
            }

            if (day > 30) {
                day = 1;
                const months = ["Hammer", "Alturiak", "Ches", "Tarsakh", "Mirtul", "Kythorn", "Flamerule", "Eleasis", "Eleint", "Marpenoth", "Uktar", "Nightal"];
                let idx = months.indexOf(month);
                idx = (idx + 1) % 12;
                month = months[idx];
                if (idx === 0) year += 1;
            }

            const updatedState = { ...state, hour: hr, day, month, year };
            
            fetch('/api/reference/save/campaign_state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedState)
            }).then(() => {
                renderCampaignHeaderCalendarWidgets(updatedState);
                logCombatAction(`[Calendar Advanced] Forwarded clock by +${amountHours} hours. Date: ${day} ${month} ${year}, ${hr}:00`);
            });
        });
};

function renderCampaignHeaderCalendarWidgets(state) {
    const calendarLabel = document.getElementById('global-calendar-date-display');
    if (calendarLabel) {
        calendarLabel.innerText = `${state.day} ${state.month} ${state.year} | Time: ${String(state.hour).padStart(2, '0')}:00`;
    }
}

async function advanceDowntimeGrindTrackersOnDayPassed() {
    try {
        const response = await fetch('/api/downtime');
        const projects = await response.json();

        // Increment each incomplete active project by 1 point per day
        for (const proj of projects) {
            if (proj.current_points < proj.max_points) {
                await fetch('/api/downtime/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: proj.id, pointsToAdd: 1 })
                });
            }
        }
    } catch(e) {}
}

// --- SHORT REST & LONG REST CAMPAIGN CONTROLLERS ---
window.triggerShortRestRestorativeProcess = function() {
    pushToUndoStack();
    activeEncounter.forEach(com => {
        if (com.type === 'player') {
            // Restore second wind, action surge, warlock slots, channel divinity
            com.reactionUsed = false;
            logCombatAction(`[Short Rest] ${com.name} completed a short rest.`);
        }
    });
    alert("Short Rest completed. Short rest abilities restored!");
    advanceCampaignCalendarTime(1);
    renderCombatTracker();
    broadcastToPlayers();
};

window.triggerLongRestRestorativeProcess = function() {
    pushToUndoStack();
    activeEncounter.forEach(com => {
        if (com.type === 'player') {
            // Restore full health values
            com.currentDamage = 0;
            com.isDefeated = false;
            com.isFuckedUp = false;
            com.reactionUsed = false;
            com.deathSaves = { successes: 0, failures: 0 };
            logCombatAction(`[Long Rest] ${com.name} restored to full health & features!`);
        }
    });

    // Reset local spell slots cache back to max indicators
    Object.keys(localSpellSlotsCache).forEach(charId => {
        const maxSlots = localSpellSlotsCache[charId];
        // Fully restore spell slots cache values
        if (maxSlots) {
            maxSlots[1] = 4;
            maxSlots[2] = 3;
            maxSlots[3] = 3;
            maxSlots[4] = 3;
            maxSlots[5] = 2;
        }

        // Push full heal and slots restore to the server & players sheet!
        if (window.socket && window.localPartyData) {
            const char = window.localPartyData.find(c => c.id === charId);
            if (char) {
                const maxHp = char.hp_max || char.hp || 30;
                window.socket.emit('player-update', {
                    charId: charId,
                    updatedData: {
                        hp_current: maxHp,
                        hp_temp: 0,
                        spell_slots: {
                            1: 4,
                            2: 3,
                            3: 3,
                            4: 3,
                            5: 2
                        },
                        death_saves: { successes: 0, failures: 0 }
                    }
                });
            }
        }
    });

    alert("Long Rest completed. All hit points and spell slots fully restored!");
    advanceCampaignCalendarTime(8);
    loadPartyMatrix();
    renderCombatTracker();
    broadcastToPlayers();
};
