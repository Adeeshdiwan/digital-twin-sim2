import { SimulationEngine } from './engine/SimulationEngine';
import { Crane } from './entities/Crane';
import { Bay } from './entities/Bay';
import { Bin } from './entities/Bin';
import { Conveyor } from './entities/Conveyor';
import { Item } from './entities/Item';
import { CraneController } from './control/CraneController';
import { SensorSystem } from './sensors/SensorSystem';
import { SystemEvent, events } from './engine/EventDispatcher';
import { SequenceBoard } from './entities/SequenceBoard';
import type { SequenceBoardState } from './entities/SequenceBoard';
import './style.css';

document.addEventListener('DOMContentLoaded', () => {
  const engine = new SimulationEngine('simCanvas');

  // Get actual dimensions
  const simCanvas = document.getElementById('simCanvas') as HTMLCanvasElement;
  const canvasWidth = simCanvas.parentElement?.clientWidth || (window.innerWidth - 350);

  // Initialize Entities
  // Conveyor at the top, spanning at least default 2000 or full canvas width
  const conveyor = new Conveyor(0, 85, Math.max(2000, canvasWidth));

  // 15 Destination Bins located before the conveyor drop-off (far right)
  const bins: Bin[] = [];
  const binSpacing = 58; // wider gap to fit FW Bin text
  const binStartX = canvasWidth - (15 * binSpacing) - 20;
  for (let i = 0; i < 15; i++) {
    const binX = binStartX + i * binSpacing;
    const bin = new Bin(`Bin-${i + 1}`, binX, 130, i + 1);
    bin.width = 50; // thicker bins
    bins.push(bin);
  }
  conveyor.bins = bins;

  // 5 Bays spanning horizontally, perfectly filling the entire width of the screen
  const bays: Bay[] = [];
  const padding = 60; 
  const spacing = 40; 
  
  const availableWidthForBays = canvasWidth - (2 * padding);
  const bayWidth = (availableWidthForBays - (4 * spacing)) / 5;
  const startX = padding;

  // Define 5 generic bays
  const materials = [
    { name: 'Bay 1', color: '#b0b0b0' },
    { name: 'Bay 2', color: '#f5f5dc' },
    { name: 'Bay 3', color: '#808080' },
    { name: 'Bay 4', color: '#e6ddc5' },
    { name: 'Bay 5', color: '#a89f91' }
  ];

  for (let i = 0; i < 5; i++) {
    const bayX = startX + (i * (bayWidth + spacing));
    const bayName = materials[i].name;
    const bay = new Bay(bayName, bayX, 600, i + 1);
    bay.width = bayWidth;

    // Add items to bays (fixed 10 items for stable testing)
    const numItems = 10;
    for (let j = 0; j < numItems; j++) {
      // Initialize with target Bin 1 or 0 (will be overridden on pick)
      bay.addItem(new Item(`I-${i + 1}0${j}`, materials[i].name, materials[i].color, 0, 0, 40, i + 1));
    }
    bays.push(bay);
  }

  // Excavator in the middle at fixed ground level — never moves vertically
  const crane = new Crane(200, 480);


  const controller = new CraneController(crane, conveyor);
  const sensorSystem = new SensorSystem(crane, conveyor);

  // Update sensor system detection zones for the new layout
  sensorSystem.breakBeamX = 350;
  sensorSystem.weightSensorZone = { startX: 450, endX: 600 };

  // Add entities to engine draw/update loop
  for (const bay of bays) {
    engine.addEntity(bay);
  }
  for (const bin of bins) {
    engine.addEntity(bin);
  }
  engine.addEntity(conveyor);
  engine.addEntity(sensorSystem);
  // Path overlay — drawn below the excavator
  engine.addEntity({
    update: (dt) => controller.update(dt),
    draw: (ctx) => controller.draw(ctx)
  });
  engine.addEntity(crane); // excavator on top


  engine.start();

  // --- Sequence Board (canvas entity) ---
  const seqBoardState: SequenceBoardState = {
    queue: [],
    statuses: [],
    materialNames: materials.map(m => m.name),
    isRunning: false
  };
  const sequenceBoard = new SequenceBoard(seqBoardState);
  // Insert before crane so board is always behind the excavator
  engine.addEntity(sequenceBoard);

  // --- UI Binding ---
  setupUI(controller, bays, conveyor);
  setupEventLogging();
  setupDraggablePanel();
  setupSequencePlanner(controller, bays, seqBoardState);
});

function setupDraggablePanel() {
  const panel = document.getElementById('controlsOverlay');
  const handle = document.getElementById('dragHandle');
  if (!panel || !handle) return;

  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  handle.addEventListener('mousedown', (e) => {
    isDragging = true;
    offsetX = e.clientX - panel.getBoundingClientRect().left;
    offsetY = e.clientY - panel.getBoundingClientRect().top;

    // Explicitly set right to auto so we can use left positioning
    panel.style.right = 'auto';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    // Calculate new position
    let newLeft = e.clientX - offsetX;
    let newTop = e.clientY - offsetY;

    // Optional: Keep inside window bounds
    const maxLeft = window.innerWidth - panel.offsetWidth;
    const maxTop = window.innerHeight - panel.offsetHeight;

    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
    newTop = Math.max(0, Math.min(newTop, maxTop));

    panel.style.left = `${newLeft}px`;
    panel.style.top = `${newTop}px`;
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
}

function setupUI(controller: CraneController, bays: Bay[], conveyor: Conveyor) {
  // Pre-load the alarm audio at maximum volume
  const alarmAudio = new Audio('/alert.mp3.mp3');
  alarmAudio.volume = 1.0;

  let anomalyMode = false;
  const anomalyBtn = document.getElementById('btnAnomalyToggle');
  anomalyBtn?.addEventListener('click', () => {
      anomalyMode = !anomalyMode;
      if (anomalyMode) {
          anomalyBtn.innerText = "Anomaly Mode: ON";
          anomalyBtn.style.background = "rgba(255, 51, 51, 0.2)";
          anomalyBtn.style.color = "#ff3333";
          anomalyBtn.style.borderColor = "#ff3333";
      } else {
          anomalyBtn.innerText = "Anomaly Mode: OFF";
          anomalyBtn.style.background = "#222";
          anomalyBtn.style.color = "#aaa";
          anomalyBtn.style.borderColor = "#555";
      }
  });

  // Map buttons directly to their respective bays
  for (let i = 0; i < bays.length; i++) {
    const btn = document.getElementById(`btnPickBay${i + 1}`);
    btn?.addEventListener('click', () => {
        if (anomalyMode) {
            const otherBays = bays.filter(b => b !== bays[i]);
            const randomWrongBay = otherBays[Math.floor(Math.random() * otherBays.length)];
            events.emit(SystemEvent.CRANE_STATE_CHANGED, { state: 'ANOMALY', reason: `Commanded ${bays[i].id}, rerouting to ${randomWrongBay.id}`});
            controller.commandPickAndPlace(randomWrongBay, true);
        } else {
            controller.commandPickAndPlace(bays[i], false);
        }
    });
  }

  const craneStateTxt = document.getElementById('craneStateTxt');
  events.on(SystemEvent.CRANE_STATE_CHANGED, (e: any) => {
    if (craneStateTxt) {
      craneStateTxt.textContent = e.state;
      craneStateTxt.style.backgroundColor = (e.state === 'ERROR' || e.state === 'ANOMALY') ? '#ff3333' : '#333';
    }
  });

  // ── ANOMALY ALARM + CONVEYOR HALT ──────────────────────────────
  const goAheadBtn = document.getElementById('btnGoAhead') as HTMLButtonElement | null;

  events.on('ANOMALY_START', () => {
    conveyor.isHalted = true;
    alarmAudio.currentTime = 0;
    alarmAudio.loop = true;
    alarmAudio.play().catch(() => {});
    if (goAheadBtn) goAheadBtn.style.display = 'block'; // reveal button
  });

  events.on('ANOMALY_CLEAR', () => {
    // Start cinematic fade on all wrong material items
    conveyor.items
      .filter(item => item.isWrongMaterial)
      .forEach(item => { item.isFading = true; });
    // Resume conveyor after fade completes (~1.8s)
    setTimeout(() => {
      conveyor.isHalted = false;
    }, 1800);
    alarmAudio.pause();
    alarmAudio.currentTime = 0;
    if (goAheadBtn) goAheadBtn.style.display = 'none';
  });

  goAheadBtn?.addEventListener('click', () => {
    events.emit('ANOMALY_CLEAR', {});
  });

  events.on(SystemEvent.SENSOR_TRIGGERED, (data: any) => {
    const elId = `sensor-${data.sensor}`;
    const el = document.getElementById(elId);
    if (el) {
      if (data.active) {
        el.classList.add('active');
        el.classList.remove('inactive');
      } else {
        el.classList.remove('active');
        el.classList.add('inactive');
      }
    }
  });

  events.on(SystemEvent.METRICS_CALCULATED, (data: any) => {
    const distEl = document.getElementById('metric-distance');
    const timeEl = document.getElementById('metric-time');
    if (distEl) distEl.innerText = `${data.distance} m`;
    if (timeEl) timeEl.innerText = `${data.time} s`;
  });
}

function setupEventLogging() {
  const logContainer = document.getElementById('eventLogs');

  const addLog = (msg: string, type: 'info' | 'success' | 'warning' = 'info') => {
    if (!logContainer) return;
    const div = document.createElement('div');
    const time = new Date().toLocaleTimeString();
    div.className = `log-entry ${type}`;
    div.innerText = `[${time}] ${msg}`;
    logContainer.prepend(div);
  };

  events.on(SystemEvent.EVENT_PICK_DETECTED, (data: any) => {
    addLog(`Item ${data.itemId} picked from ${data.bayId}`, 'info');
  });

  events.on(SystemEvent.EVENT_ITEM_IN_TRANSIT, (data: any) => {
    addLog(`Item ${data.itemId} is in transit on crane`, 'info');
  });

  events.on(SystemEvent.EVENT_PLACEMENT_DETECTED, (data: any) => {
    addLog(`Item ${data.itemId} placement detected on conveyor`, 'warning');
  });

  events.on(SystemEvent.EVENT_PLACEMENT_VERIFIED, (data: any) => {
    addLog(`Placement VERIFIED for item ${data.itemId}`, 'success');
  });

  events.on(SystemEvent.CRANE_STATE_CHANGED, (data: any) => {
    if (data.state === 'ERROR') {
      addLog(`SYSTEM ERROR: ${data.reason}`, 'warning');
    }
  });
}

function setupSequencePlanner(controller: CraneController, bays: Bay[], boardState: SequenceBoardState) {
  const seqSourceBay = document.getElementById('seqSourceBay') as HTMLSelectElement;
  const seqTargetBin = document.getElementById('seqTargetBin') as HTMLSelectElement;
  const btnSeqAdd    = document.getElementById('btnSeqAdd') as HTMLButtonElement;
  const seqPreview   = document.getElementById('seqPreview')!;
  const seqStatus    = document.getElementById('seqStatus') as HTMLElement;
  const btnSeqStart  = document.getElementById('btnSeqStart') as HTMLButtonElement;
  const btnSeqClear  = document.getElementById('btnSeqClear') as HTMLButtonElement;

  // Populate the 15 bin options
  for (let i = 1; i <= 15; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `FW Bin ${i}`;
    seqTargetBin.appendChild(opt);
  }

  // Queue of specific routing pairs: bay index (0-based) to bin index (0-based)
  let seqQueue: { bayIdx: number, binIdx: number }[] = [];
  let isRunning = false;
  let currentStep = 0;

  // Sync queue + statuses into the canvas board state
  function syncBoardState() {
    boardState.queue = [...seqQueue];
    boardState.statuses = seqQueue.map((_, i) => {
      if (i < currentStep) return 'done';
      if (i === currentStep && isRunning) return 'active';
      return 'pending';
    });
    boardState.isRunning = isRunning;
  }

  // ── Add routing step to queue ───────────────────────────────────────
  btnSeqAdd.addEventListener('click', () => {
    if (isRunning) return;
    const bayIdx = parseInt(seqSourceBay.value, 10);
    const binIdx = parseInt(seqTargetBin.value, 10) - 1; // 0-based
    seqQueue.push({ bayIdx, binIdx });
    updatePreview();
    syncBoardState();
  });

  // ── Preview updater ──────────────────────────────────────────────────
  function updatePreview() {
    if (seqQueue.length === 0) {
      seqPreview.textContent = '— select route above —';
      seqPreview.style.color = '#555';
    } else {
      seqPreview.textContent = seqQueue.map(q => `Bay ${q.bayIdx + 1}➔FW${q.binIdx + 1}`).join(' | ');
      seqPreview.style.color = '#60a5fa';
    }
  }

  // ── Enable / disable all planner UI ─────────────────────────────────
  function setRunning(running: boolean) {
    isRunning = running;
    boardState.isRunning = running;
    btnSeqStart.disabled = running;
    btnSeqClear.disabled = running;
    btnSeqStart.style.opacity = running ? '0.45' : '1';
    btnSeqAdd.disabled = running;
    btnSeqAdd.style.opacity = running ? '0.4' : '1';
    seqSourceBay.disabled = running;
    seqTargetBin.disabled = running;
    
    // Also grey out the individual pick buttons while sequence runs
    for (let i = 1; i <= 5; i++) {
      const pb = document.getElementById(`btnPickBay${i}`) as HTMLButtonElement | null;
      if (pb) { pb.disabled = running; pb.style.opacity = running ? '0.4' : '1'; }
    }
    seqStatus.style.display = running ? 'block' : 'none';
    if (!running) seqStatus.textContent = '';
  }

  // ── Run next step in the queue ───────────────────────────────────────
  function runNext() {
    if (currentStep >= seqQueue.length) {
      // Mark all steps done before stopping
      syncBoardState();
      // Sequence complete
      setRunning(false);
      seqStatus.textContent = `✔ Sequence complete (${seqQueue.length} bay${seqQueue.length > 1 ? 's' : ''})`;
      seqStatus.style.display = 'block';
      seqStatus.style.color = '#00c850';
      // Reset queue and preview after a short delay
      setTimeout(() => {
        seqQueue = [];
        currentStep = 0;
        updatePreview();
        seqStatus.style.display = 'none';
      }, 3000);
      return;
    }

    const { bayIdx, binIdx } = seqQueue[currentStep];
    const bay = bays[bayIdx];

    seqStatus.style.color = '#ffa500';
    seqStatus.textContent =
      `Running step ${currentStep + 1}/${seqQueue.length}: Bay ${bayIdx + 1} ➔ FW Bin ${binIdx + 1}`;

    syncBoardState();

    if (bay.items.length === 0) {
      // Bay empty – skip to next
      seqStatus.textContent = `⚠ Bay ${bayIdx + 1} empty, skipping…`;
      currentStep++;
      setTimeout(runNext, 800);
      return;
    }

    // Assign dynamic target bin ID to the top item before picking
    const topItem = bay.peekItem();
    if (topItem) {
      topItem.targetBinId = binIdx + 1;
    }

    controller.commandPickAndPlace(bay, false);
  }

  // ── Listen for COMPLETE to advance the queue ─────────────────────────
  events.on(SystemEvent.CRANE_STATE_CHANGED, (data: any) => {
    if (!isRunning) return;
    if (data.state === 'COMPLETE' || data.state === 'ERROR') {
      currentStep++;
      // Small delay so the crane can reach home before starting next pick
      setTimeout(runNext, 600);
    }
  });

  // ── Start button ─────────────────────────────────────────────────────
  btnSeqStart.addEventListener('click', () => {
    if (isRunning || seqQueue.length === 0) return;
    currentStep = 0;
    seqStatus.style.color = '#ffa500';
    setRunning(true);
    syncBoardState();
    runNext();
  });

  // ── Clear button ─────────────────────────────────────────────────────
  btnSeqClear.addEventListener('click', () => {
    if (isRunning) return;
    seqQueue = [];
    currentStep = 0;
    boardState.queue = [];
    boardState.statuses = [];
    boardState.isRunning = false;
    updatePreview();
    seqStatus.style.display = 'none';
  });

  updatePreview();
  syncBoardState();
}
