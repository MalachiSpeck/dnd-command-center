# DM COMMAND CENTER — THE ULTIMATE USER MANUAL
*An End-to-End System Guide for the Dungeon Master Console & Player Sheets PWA*

Welcome to the **D&D Command Center**, a modern, zero-dependency, local-first tabletop campaign engine. This system is designed specifically for **in-person hybrid play**—bringing the speed, automation, and convenience of digital management directly to physical game tables.

This manual details every feature, screen, workflow, and technical system built into both the **Dungeon Master (DM) Dashboard** and the **Player Character Sheets**.

---

## TABLE OF CONTENTS
1. [System Concept & Architecture](#1-system-concept--architecture)
2. [Quick-Start: Launching the Table](#2-quick-start-launching-the-table)
3. [The Player PWA Sheet: Features & Controls](#3-the-player-pwa-sheet-features--controls)
4. [Background Synchronization & The Permission Matrix](#4-background-synchronization--the-permission-matrix)
5. [The Dungeon Master Dashboard: Deep Dive](#5-the-dungeon-master-dashboard-deep-dive)
6. [Advanced DM Features (Waves 2, 3, & 4)](#6-advanced-dm-features-waves-2-3--4)
7. [Appendix: Flat-File Database Rules & Schema Reference](#7-appendix-flat-file-database-rules--schema-reference)

---

## 1. SYSTEM CONCEPT & ARCHITECTURE

Unlike corporate virtual tabletops (VTTs) designed for remote play over the internet, the **D&D Command Center** is optimized for **local, physical tables**. It turns any laptop or tablet into a local host, spinning up a local LAN server that other devices at your table (laptops, phones, or tablet screens) connect to over local Wi-Fi.

### The Hybrid Play Design Principle:
- **No Internet Required:** The entire platform operates over your local tabletop Wi-Fi. It is offline-first.
- **Physical Focus:** It automates math, spell lookups, status tracking, and notes so players spend their time looking at each other and the DM, rather than getting lost in deep, laggy digital menus.
- **Zero Storage Bloat:** Runs natively in your web browser. Built on raw, high-performance HTML5, CSS3 variables, and vanilla ES6+ Javascript.

---

## 2. QUICK-START: LAUNCHING THE TABLE

To launch your campaign server, follow these simple steps:

### Step 1: Fire up the local server
Open your terminal/command prompt, navigate to your root folder, and start the Node.js server:
```bash
cd C:\Users\mattm\Desktop\dnd-command-center
node server.js
```
The console will boot up and report:
`Server running on http://<YOUR_LAN_IP>:3000`

### Step 2: Accessing the DM Console
On the DM's host laptop, open a web browser and go to:
`http://localhost:3000`

### Step 3: Getting Players Connected
On the main DM Console, a custom-generated **QR Code** and connection URL are displayed.
1. Have players connect their phones or tablets to the **same Wi-Fi router** as the host.
2. Have them scan the QR code using their camera or type:
   `http://<YOUR_LAN_IP>:3000/join`
3. The players will land on a dynamic roster page. Clicking their character name spins up their custom interactive sheet.

---

## 3. THE PLAYER PWA SHEET: FEATURES & CONTROLS

The Player Sheet is an offline-first **Progressive Web App (PWA)**. Once loaded, it can be saved directly to a player's home screen as a standalone app.

### A. Key Interface Tabs
1. **Core Stats tab:** Houses the primary stats, custom avatars, calculated ability modifiers, passive scores, initiative bonus, and movement speeds.
2. **Combat & Resources:**
   - **HP Tracker:** Interactive current HP and Temp HP inputs with quick-add/damage modifiers.
   - **Death Saves Counter:** Lets down-and-out characters tick off their success/failure boxes.
   - **Spell Slots Grid:** A grid of active and expended spell slots. Expended slots change colors. Tap button controls let players cast and recover slots on-the-fly.
   - **Active Conditions:** Lists all 5e conditions (Concentrating, Poisoned, Restrained, Blinded, Exhaustion, etc.) currently affecting the player, dynamically modifying their abilities.
3. **Spellbook Tab:** Houses a searchable list of the player's spell cards. It supports:
   - **Prepared/Known Toggle:** Lets casters quickly configure their active list.
   - **Detailed Description Popups:** Click any spell card to open a sepia parchment grimoire popup showing casting time, range, components, duration, and mechanical rules.
4. **Inventory & Items:** Lists a player's carried equipment, equipped weapons/armor (which automatically recalculate AC and speed), and custom secret items.
5. **Details & Wishlist:** Allows players to write down private notes, campaign diaries, and secret items they are searching for (wishlists), syncing directly to the DM screen.

### B. Interactive Combat Features
- **Instant Death Saves & Stabilize Alerts:** If a player ticks off their third death save failure, a dramatic warning alert is sent to the DM Console. If they succeed and stabilize, the "Down But Not Out" flag is updated.
- **Exhaustion Wheel:** Tracks the 6 deadly levels of exhaustion. Moving the dial to Level 6 automatically flags the character as deceased and sets off alarms.
- **Short & Long Rest buttons:** Tap these at the table to automatically reset spell slots, resource charges, short-rest abilities, and hit points according to standard 5e rules.

### C. Walter Kammerer 5e App Character Importer
To make setting up a new character completely effortless, players can instantly load a pre-configured character directly into their sheet:
1. Tap the **Import 5e** button in the header of the character sheet.
2. Select a character `.json` file exported from the popular **Fifth Edition Character Sheet app** (by Walter Kammerer) or any standard 5e JSON format.
3. The system instantly parses the file in the browser, showing a beautiful parchment preview card of the parsed stats: Name, Race, Class, Level, Max Hit Points, Armor Class, Abilities (STR/DEX/CON/INT/WIS/CHA), and count of Equipment, Known Spells, and Feats.
4. Click **Confirm & Import**. The import engine automatically:
   - Merges the character's core stats into their current sheet while safely retaining their assigned seat ID (`char_1`, `char_2`, etc.).
   - Computes their optimal spell slot limits and resets current spell slots to full charges.
   - Clears temporary visual effects and updates current HP to max.
   - Queues any edited `"dm-confirm"` fields (like stats and level) in the dynamic **Proposals Queue** on the DM Dashboard so the DM can audit and verify the import.
   - Triggers a background sync to keep everyone at the table in perfect alignment instantly!

---

## 4. BACKGROUND SYNCHRONIZATION & THE PERMISSION MATRIX

The biggest innovation in our player sheet is the **Field-Level Permission and Sync Engine**. It is completely background-silent—players can edit anything they want, whenever they want, and it will update instantly on their screen without interrupting gameplay.

### How It Works:
1. **Local Instant Edits:** When a player makes an edit (e.g. checks off a spell slot or subtracts HP), the local character engine recalculates all derived values and saves them immediately to **IndexedDB** on their device. The interface updates instantly.
2. **Silent Background Syncing:** In the background, `sync-engine.js` queues these changes and pushes them to the server via `/api/sync`.
   - **No Flashing Banners:** Standard background syncs are entirely whisper-silent. Players will *never* see annoying loading bars or popup banners cluttering their sheet during game play.
   - **Seamless Offline Support:** If the table's local Wi-Fi router gets disconnected, a subtle red notification bar tells the player they are in offline mode. They can continue editing their sheet normally—changes are securely saved to IndexedDB and will silently sync the second the table's Wi-Fi is restored!

### The Field-Level Permission Schema (`field_permissions.json`)
To preserve DM authority, fields are processed according to safe permissions:
- **`player` fields:** (HP current, Spell slots current, Inventory, Prepared Spells, Notes). These are automatically merged into `party.json` on the server and synced in real-time.
- **`dm-confirm` fields:** (Level, Stats/Ability scores, Max HP, Feats, Classes). Players can modify these on their screen (e.g. while planning a level-up or simulating a custom stat adjustment). However, on the server, these edits are kept inside a secure `proposals` block. The player sheet calculates and displays these proposed stats locally so the player can use them, but the core server database is not permanently updated until the DM audits and approves them!
- **`dm` fields:** (Magic Items list, Dungeon Secrets). These can *only* be edited by the DM on the DM console. Player edits on these fields are ignored.

### Resolving Race-Conditions Silently
Unlike old architectures where players got bombarded with red "Conflict" warnings and screen resets, our updated server uses a sophisticated state comparison:
- If a background HTTP sync arrives and find the server has already been updated to the new state (e.g., via the real-time WebSocket channel), it is registered as already-synced and proceeds **silently** without ever popping up an warning.

---

## 5. THE DUNGEON MASTER DASHBOARD: DEEP DIVE

The Dungeon Master Dashboard is your digital tactical screen. It provides complete oversight and real-time control over the game table.

### Screen Layout Sections
- **Tactical Party Matrix:** Displayed at the top of the dashboard. Shows a real-time status bar for every connected character (Name, Current/Max HP, Armor Class, Passive Perception/Insight, and Active Conditions). 
  - Connected players feature a green beacon glowing on their portrait.
  - Injured players turn orange. Downed players flash crimson.
- **Campaign Command Logs:** Real-time logging of all active player events (e.g., rolls, HP changes, slot casting, stabilized states).
- **Control Bar (Stream Deck Sim):** A custom physical-deck simulator allowing the DM to trigger instant atmospheric tones, visual overlays, or tabletop transitions with a single tap.

---

## 6. ADVANCED DM FEATURES (WAVES 2, 3, & 4)

Beyond simple stat tracking, the DM Dashboard is supercharged with an incredible suite of interactive tools:

### A. The PDF Rule Staging Grimoire
Instead of manually typing in rule statistics, custom monsters, or magic items, the system utilizes a powerful PDF Parser:
1. Run `parse_pdf.py` to stage custom homebrew or rule snippets.
2. Open the **Review Dashboard** modal from the DM Console.
3. Select staged Drafts. Review spelling, format descriptions, and recalculate statistics in a beautiful sepia editor.
4. Click **Approve & Save** to permanently commit the custom spell, monster, or item directly into your global campaign databases.

### B. Dynamic Sync Proposals Queue
To audit leveling and character adjustments:
1. Open the **Proposals Queue** tab in the Review modal.
2. View pending character edits (e.g. *Grizz proposed level increase to 7* or *Furfur proposed increasing Strength to 14*).
3. Tap **Approve** to commit the change permanently to the master database, or **Reject** to roll it back.
4. Approved updates are pushed to the player’s sheet in real-time with zero page reloads.

### C. Draggable Mystery Corkboard (Investigation Board)
Unravel investigations and master plots like a real detective:
- Create nodes representing **Evidence**, **NPCs**, or **Clues** with descriptions and custom titles.
- Drag, arrange, and drop nodes on a physical-looking corkboard canvas.
- Establish connections (clue links) between nodes using customizable string colors (Red for main suspects, Yellow for associations).
- Toggle nodes as "Discovered" or "Hidden" to reveal clues to players as they investigate.

### D. Tactical Marching Order (Formations)
Track spatial geometry during dungeon crawls or wilderness travels:
- Easily save and load tactical presets (*Dungeon Crawl*, *Open Road*, *Stealth*).
- Formations specify who scouts ahead, who stays safe in the center, and who covers the rear.
- Display formation grids and marching spacing on the main table projection screen.

### E. Native Sound-Synth Engine
No massive MP3 files, no streaming lag:
- Features a built-in **Web Audio API Tone Synthesizer**.
- Synthesizes crisp, immersive table sounds on-the-fly:
  - *Heroic Fanfare:* Triadic ascending trumpets.
  - *Menacing Growl:* Dual sawtooth oscillator rumble for boss appearances.
  - *Chime & Success chime:* Sine wave chords for discoveries.
  - *Failure drone:* Dissonant descending chords.

### F. Tabletop Immersive Overlays
Engage your table with dramatic theater-of-the-mind cues:
- **Cinematic Title Card:** Slide a pitch-black cinematic screen with gold borders over player devices to transition scenes or announce a new location.
- **Divine Vision:** Push private, glowing scroll-overlay messages (divine visions or telepathic whispers) directly to a target player's sheet, blocking out their screen with a dramatic effect.
- **Madness/Sanity Visuals:** Push sanity-warping visuals and screen-shake directly onto a player's screen when they fail madness saving throws.

---

## 7. APPENDIX: FLAT-FILE DATABASE RULES & SCHEMA REFERENCE

To keep your files perfectly safe and manually editable, the system stores all campaign data inside human-readable JSON files inside the `/data/` directory.

### Core Database Files Guide
- `party.json`: Stores all core player character stats, spell slots, inventory, and pending proposals.
- `investigation_board.json`: Serializes the visual corkboard node coordinates, connection strings, and clue text.
- `formations.json`: Holds your tactical marching order arrangements and spacing configurations.
- `continuity.json`: Houses table retcons and corrections so your game's history is never blurred.
- `field_permissions.json`: Configures permission mappings (`player` vs `dm-confirm` vs `dm`).

### Rules of Safe Editing:
1. **Manual Edits:** You can open and edit any JSON database file in a standard text editor (like VS Code or Notepad) while the server is offline or online.
2. **Pre-Sync Backups:** Every single time a player triggers an offline sync, a full, timestamped pre-merge backup of the database is automatically saved inside `/data/backups/`. If a player accidentally overwrites their inventory, you can easily restore their pre-sync file in seconds!

---

*This manual was compiled and finalized in the campaign workspace on 2026-08-25.*
*Go forth and tell legendary stories!*
