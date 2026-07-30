// public/js/procedural-music.js
// Procedural Battle Music Generator using Web Audio API

class ProceduralMusicEngine {
    constructor() {
        this.audioCtx = null;
        this.isPlaying = false;
        this.presets = {};
        this.activePreset = 'dark_encounter';
        this.intensity = 1; // 1 (low) to 4 (boss / critical)
        this.tempo = 120;
        this.currentBeat = 0;
        this.schedulerTimer = null;
        this.nextNoteTime = 0.0;
        this.scheduleAheadTime = 0.1; // How far ahead to schedule audio (sec)
        this.lookahead = 25.0; // How frequently to call scheduler (ms)
        this.masterVolumeNode = null;
        this.soundSources = [];
    }

    async init() {
        try {
            const res = await fetch('/api/music-presets');
            if (res.ok) {
                this.presets = await res.json();
            } else {
                this.presets = {
                    "dark_encounter": {
                        "name": "Dark Encounter",
                        "scale": [55.0, 58.27, 61.74, 65.41, 73.42, 82.41, 87.31, 98.0],
                        "base_tempo": 120,
                        "bass_type": "sawtooth",
                        "lead_type": "triangle",
                        "rhythm": [1, 0, 1, 0, 1, 1, 0, 1]
                    }
                };
            }
        } catch (e) {
            console.warn("Failed to load music presets, using fallback.", e);
        }
    }

    start() {
        if (this.isPlaying) return;
        
        // Create audio context on user gesture
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterVolumeNode = this.audioCtx.createGain();
            this.masterVolumeNode.gain.setValueAtTime(0.15, this.audioCtx.currentTime); // moderate default volume
            this.masterVolumeNode.connect(this.audioCtx.destination);
        }

        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        this.isPlaying = true;
        this.currentBeat = 0;
        this.nextNoteTime = this.audioCtx.currentTime;
        
        // Retrieve base tempo from preset
        const currentPresetData = this.presets[this.activePreset] || this.presets['dark_encounter'];
        this.tempo = currentPresetData ? (currentPresetData.base_tempo || 120) : 120;

        this.scheduler();
        console.log("Procedural Music Engine Started! Preset:", this.activePreset);
    }

    stop() {
        if (!this.isPlaying) return;
        this.isPlaying = false;
        if (this.schedulerTimer) {
            clearTimeout(this.schedulerTimer);
        }
        this.soundSources.forEach(src => {
            try { src.stop(); } catch(e) {}
        });
        this.soundSources = [];
        console.log("Procedural Music Engine Stopped.");
    }

    setPreset(presetKey) {
        if (this.presets[presetKey]) {
            this.activePreset = presetKey;
            const data = this.presets[presetKey];
            this.tempo = data.base_tempo || 120;
            console.log(`Procedural Preset changed to: ${presetKey} (tempo: ${this.tempo}bpm)`);
        }
    }

    setIntensity(level) {
        this.intensity = Math.max(1, Math.min(4, level));
        console.log("Procedural intensity set to:", this.intensity);
    }

    setVolume(vol) {
        if (this.masterVolumeNode && this.audioCtx) {
            this.masterVolumeNode.gain.setValueAtTime(vol, this.audioCtx.currentTime);
        }
    }

    scheduler() {
        if (!this.isPlaying) return;

        while (this.nextNoteTime < this.audioCtx.currentTime + this.scheduleAheadTime) {
            this.scheduleNote(this.currentBeat, this.nextNoteTime);
            this.advanceBeat();
        }

        this.schedulerTimer = setTimeout(() => this.scheduler(), this.lookahead);
    }

    advanceBeat() {
        // Adjust tempo dynamically based on intensity
        // Level 1: Base tempo, Level 2: +10bpm, Level 3: +20bpm, Level 4 (Deadly): +35bpm
        const pData = this.presets[this.activePreset] || {};
        const base = pData.base_tempo || 120;
        const tempoOffset = (this.intensity === 2) ? 10 : (this.intensity === 3) ? 20 : (this.intensity === 4) ? 35 : 0;
        this.tempo = base + tempoOffset;

        const secondsPerBeat = 60.0 / this.tempo;
        const noteDuration = secondsPerBeat / 2; // eighth notes
        this.nextNoteTime += noteDuration;

        this.currentBeat = (this.currentBeat + 1) % 16; // 16-step sequencer
    }

    scheduleNote(beat, time) {
        const presetData = this.presets[this.activePreset] || {
            scale: [55.0, 58.27, 61.74, 65.41, 73.42, 82.41, 87.31, 98.0],
            bass_type: 'sawtooth',
            lead_type: 'triangle',
            rhythm: [1, 0, 1, 0, 1, 1, 0, 1]
        };

        const scale = presetData.scale;

        // --- LAYER 1: BASS DRONE (Continuous low drone root note, pulses at beat 0, 4, 8, 12)
        if (beat % 4 === 0) {
            this.playBassDrone(scale[0], time, 1.0);
        }

        // --- LAYER 2: SYNTH DRUM BEAT (Rhythm)
        // Base drum rhythm (kick drum synthesizer)
        const kickPattern = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0];
        if (kickPattern[beat % 16] === 1) {
            this.playKick(time);
        }

        // Snares/Hi-Hats added as intensity increases
        if (this.intensity >= 2 && beat % 4 === 2) {
            this.playSnareNoise(time);
        }

        // Hi-hat pulse on high intensity
        if (this.intensity >= 3 && beat % 2 === 1) {
            this.playHiHat(time);
        }

        // Double snare roll on critical intensity
        if (this.intensity === 4 && (beat % 8 === 6 || beat % 8 === 7)) {
            this.playSnareNoise(time);
        }

        // --- LAYER 3: MELODIC ARPEGGIATOR (Leads)
        // Intensity 1: Play only on beat 0, 8
        // Intensity 2: Play on beat 0, 4, 8, 12
        // Intensity 3: Play eighth notes on even beats
        // Intensity 4: Full continuous eighth-note arpeggios
        let playLead = false;
        if (this.intensity === 1 && (beat === 0 || beat === 8)) playLead = true;
        if (this.intensity === 2 && beat % 4 === 0) playLead = true;
        if (this.intensity === 3 && beat % 2 === 0) playLead = true;
        if (this.intensity === 4) playLead = true;

        if (playLead) {
            // Select note arpeggio sequence based on beat
            const scaleLength = scale.length;
            let noteIndex = 0;
            
            // Build procedural arpeggios
            if (this.intensity <= 2) {
                // simple root/fifth bounce
                noteIndex = (beat % 8 === 0) ? 0 : 4;
            } else if (this.intensity === 3) {
                // minor triad outline
                const triad = [0, 2, 4, 7];
                noteIndex = triad[beat % 4];
            } else {
                // fast frantic scale walking
                noteIndex = Math.abs((beat * 3) % scaleLength);
                // Introduce occasional dissonance for critical boss state
                if (beat % 5 === 0 && scaleLength > 5) {
                    noteIndex = 1; // minor second clash!
                }
            }

            const freq = scale[noteIndex % scaleLength] * 4; // Shift up 2 octaves for lead
            this.playLeadSynth(freq, presetData.lead_type || 'triangle', time);
        }
    }

    // --- SYNTH VOICE 1: Bass Drone
    playBassDrone(frequency, startTime, duration) {
        if (!this.audioCtx) return;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        const filter = this.audioCtx.createBiquadFilter();

        osc.type = this.presets[this.activePreset]?.bass_type || 'sawtooth';
        osc.frequency.setValueAtTime(frequency, startTime);

        // Lowpass filter to keep it deep and menacing
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(150 + (this.intensity * 80), startTime); // Opens up at higher intensity

        gain.gain.setValueAtTime(0.0, startTime);
        gain.gain.linearRampToValueAtTime(0.12, startTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration - 0.05);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterVolumeNode);

        osc.start(startTime);
        osc.stop(startTime + duration);
        this.soundSources.push(osc);
    }

    // --- SYNTH VOICE 2: Bass Kick Drum
    playKick(time) {
        if (!this.audioCtx) return;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.frequency.setValueAtTime(120, time);
        osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.15);

        gain.gain.setValueAtTime(0.3, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

        osc.connect(gain);
        gain.connect(this.masterVolumeNode);

        osc.start(time);
        osc.stop(time + 0.16);
    }

    // --- SYNTH VOICE 3: Snare Drum (White Noise Burst)
    playSnareNoise(time) {
        if (!this.audioCtx) return;
        const bufferSize = this.audioCtx.sampleRate * 0.1; // 100ms burst
        const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        
        // Fill buffer with random noise
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noiseNode = this.audioCtx.createBufferSource();
        noiseNode.buffer = buffer;

        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1000, time); // mid-frequency punch

        const gain = this.audioCtx.createGain();
        gain.gain.setValueAtTime(0.08, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

        noiseNode.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterVolumeNode);

        noiseNode.start(time);
        noiseNode.stop(time + 0.1);
    }

    // --- SYNTH VOICE 4: Hi-Hat Synth (Filtered noise spike)
    playHiHat(time) {
        if (!this.audioCtx) return;
        const bufferSize = this.audioCtx.sampleRate * 0.02; // 20ms burst
        const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noiseNode = this.audioCtx.createBufferSource();
        noiseNode.buffer = buffer;

        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(8000, time); // bright sizzle

        const gain = this.audioCtx.createGain();
        gain.gain.setValueAtTime(0.04, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.02);

        noiseNode.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterVolumeNode);

        noiseNode.start(time);
        noiseNode.stop(time + 0.02);
    }

    // --- SYNTH VOICE 5: Melodic Lead Arpeggiator
    playLeadSynth(frequency, type, time) {
        if (!this.audioCtx) return;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        const filter = this.audioCtx.createBiquadFilter();

        osc.type = type;
        osc.frequency.setValueAtTime(frequency, time);

        // Sweeping filter for an analog synthesizer effect
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(600 + (this.intensity * 400), time);
        filter.Q.setValueAtTime(5, time);

        gain.gain.setValueAtTime(0.0, time);
        gain.gain.linearRampToValueAtTime(0.06, time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterVolumeNode);

        osc.start(time);
        osc.stop(time + 0.25);
        this.soundSources.push(osc);
    }

    // --- Triumphant Major Key Resolution Sequence
    playTriumphantMajorResolution() {
        if (!this.isPlaying || !this.audioCtx) return;
        this.stop(); // Stop loop

        // Start dedicated resolution context
        this.audioCtx = this.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const now = this.audioCtx.currentTime;

        const masterGain = this.audioCtx.createGain();
        masterGain.gain.setValueAtTime(0.2, now);
        masterGain.connect(this.audioCtx.destination);

        // Play C Major chord! (C3, E3, G3, C4)
        const notes = [130.81, 164.81, 196.00, 261.63];
        notes.forEach((freq, idx) => {
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + (idx * 0.15)); // Arpeggiate entry

            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.06, now + (idx * 0.15) + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 3.0);

            osc.connect(gain);
            gain.connect(masterGain);

            osc.start(now);
            osc.stop(now + 3.2);
        });

        console.log("Procedural Victory Resolved to Major Chord.");
    }
}

// Global Singleton
window.ProceduralMusicEngine = new ProceduralMusicEngine();
