// --- ADVANCED DRAG & DROP MAP IMAGE FILE LOADER & ZOOM CONTROLLER ---
window.initializeProjectorMapDropzone = function() {
    const mapUrlInput = document.getElementById('projector-map-url');
    if (!mapUrlInput) return;

    // Create drag-and-drop zone visually around map input element
    const dropzone = document.createElement('div');
    dropzone.id = 'map-file-dropzone';
    dropzone.style.cssText = "border: 2px dashed var(--border-iron); border-radius: 6px; padding: 15px; text-align: center; font-size: 0.8rem; color: var(--text-muted); cursor: pointer; margin-top: 10px; background: var(--bg-vault); transition: all 0.3s;";
    dropzone.innerHTML = "Drag & Drop Map Image (.jpg/.png) Here";

    mapUrlInput.parentNode.insertBefore(dropzone, mapUrlInput.nextSibling);

    // Click to choose file trigger
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    dropzone.appendChild(fileInput);

    dropzone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleUploadedMapFile(file, dropzone);
    });

    // Drag events
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--arcane-violet)';
        dropzone.style.background = '#111019';
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.style.borderColor = 'var(--border-iron)';
        dropzone.style.background = 'var(--bg-vault)';
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--border-iron)';
        dropzone.style.background = 'var(--bg-vault)';
        
        const file = e.dataTransfer.files[0];
        if (file) handleUploadedMapFile(file, dropzone);
    });
};

function handleUploadedMapFile(file, dropzone) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const base64Data = event.target.result;
        // Broadcast base64 image data directly as local projector background URL state
        updateProjectorState({ mapUrl: base64Data });
        dropzone.innerText = `Map Uploaded: ${file.name}`;
        dropzone.style.color = '#22c55e';
    };
    reader.readAsDataURL(file);
}


// --- GRID OVERLAY PERSISTENCE & FOG OF WAR PAINTER MODULE ---
let activeFogBrushMode = 'reveal'; // 'reveal', 'hide'
let isPaintingFog = false;

window.initializeFogOfWarPainter = function() {
    const parentContainer = document.getElementById('fog-painter-controls-container');
    if (!parentContainer) return;

    parentContainer.innerHTML = `
        <div style="background: #0f0f13; border: 1px solid var(--border-iron); border-radius: 6px; padding: 10px; margin-top: 10px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                <strong style="color: var(--text-muted); font-size: 0.8rem;">Fog of War Brush</strong>
                <div style="display:flex; gap:4px;">
                    <button class="btn-danger" style="background:#ef4444; font-size:0.7rem; padding: 2px 6px;" onclick="nuclearFogOfWarHideAll()">Hide All</button>
                    <button class="btn-primary" style="background:#10b981; font-size:0.7rem; padding: 2px 6px;" onclick="nuclearFogOfWarRevealAll()">Reveal All</button>
                </div>
            </div>
            <div style="display:flex; gap: 8px; margin-bottom: 10px;">
                <button class="btn-primary" id="btn-fog-reveal" style="font-size:0.75rem; padding: 6px 10px; background:#10b981;" onclick="setFogBrushMode('reveal')">Reveal Brush</button>
                <button class="btn-primary" id="btn-fog-hide" style="font-size:0.75rem; padding: 6px 10px; background:#4b5563;" onclick="setFogBrushMode('hide')">Hide Brush</button>
            </div>
            
            <!-- In-Console fog matrix preview clicker grid -->
            <div id="console-fog-preview-grid" style="display:grid; grid-template-columns: repeat(12, 1fr); gap: 2px; background:black; padding:4px; border-radius:4px;">
                <!-- Filled dynamically by script -->
            </div>
        </div>
    `;
    
    // Sync current fog of war data state on load
    fetch('/api/projector/fog')
        .then(res => res.json())
        .then(data => {
            const hasGrid = Array.isArray(data.fogGrid) && data.fogGrid.length > 0;
            window.fogGridState = hasGrid ? data.fogGrid : Array(12).fill(null).map(() => Array(12).fill(false)); // default revealed grid
            drawConsoleFogPreviewGrid();
        });
};

window.setFogBrushMode = function(mode) {
    activeFogBrushMode = mode;
    document.getElementById('btn-fog-reveal').style.background = mode === 'reveal' ? '#10b981' : '#4b5563';
    document.getElementById('btn-fog-hide').style.background = mode === 'hide' ? '#ef4444' : '#4b5563';
};

function drawConsoleFogPreviewGrid() {
    const grid = document.getElementById('console-fog-preview-grid');
    if (!grid) return;
    grid.innerHTML = '';

    for (let r = 0; r < 12; r++) {
        for (let c = 0; c < 12; c++) {
            const isHidden = (window.fogGridState && window.fogGridState[r] && window.fogGridState[r][c] !== undefined) ? window.fogGridState[r][c] : false;
            const cell = document.createElement('div');
            cell.style.cssText = "aspect-ratio: 1; border-radius: 1px; cursor: pointer; transition: background 0.1s;";
            cell.style.backgroundColor = isHidden ? 'black' : '#8b5cf6';
            
            // Mouse drag painting triggers
            cell.addEventListener('mousedown', () => {
                isPaintingFog = true;
                applyFogBrush(r, c, cell);
            });
            cell.addEventListener('mouseenter', () => {
                if (isPaintingFog) applyFogBrush(r, c, cell);
            });
            grid.appendChild(cell);
        }
    }
    
    // Global mouseup reset
    window.addEventListener('mouseup', () => { isPaintingFog = false; });
}

function applyFogBrush(r, c, cell) {
    if (!window.fogGridState[r]) window.fogGridState[r] = Array(12).fill(false);
    const newVal = activeFogBrushMode === 'hide'; // Hide sets to true (hidden fog divs)
    window.fogGridState[r][c] = newVal;
    cell.style.backgroundColor = newVal ? 'black' : '#8b5cf6';

    // Broadcast updated state to projector and disk persistent storage
    fetch('/api/projector/fog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fogGrid: window.fogGridState })
    });
}

window.nuclearFogOfWarRevealAll = function() {
    window.fogGridState = Array(12).fill(null).map(() => Array(12).fill(false));
    drawConsoleFogPreviewGrid();
    fetch('/api/projector/fog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fogGrid: window.fogGridState })
    });
};

window.nuclearFogOfWarHideAll = function() {
    window.fogGridState = Array(12).fill(null).map(() => Array(12).fill(true));
    drawConsoleFogPreviewGrid();
    fetch('/api/projector/fog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fogGrid: window.fogGridState })
    });
};
