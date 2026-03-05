import { db } from './firebase.js';
import { collection, addDoc, getDocs, query } from 'firebase/firestore';

export const SNAP_POINTS = [];

// Tier definitions: { xRange, yMin, yMax, count }
const TIERS = [
  { xRange: 0.15, yMin: 1.25, yMax: 1.45, count: 30 },  // Tier 1 — tight core
  { xRange: 0.24, yMin: 1.22, yMax: 1.50, count: 80 },  // Tier 2 — mid canopy
  { xRange: 0.34, yMin: 1.18, yMax: 1.55, count: 140 }, // Tier 3 — full canopy
];

const snapGrid = [
  // Wide canopy — all available from the start
  [-0.30, 1.28], [-0.24, 1.26], [-0.18, 1.25], [-0.10, 1.26], [-0.04, 1.25], [0.04, 1.25], [0.10, 1.26], [0.18, 1.25], [0.24, 1.26], [0.30, 1.28],
  [-0.32, 1.33], [-0.25, 1.31], [-0.18, 1.30], [-0.11, 1.29], [-0.04, 1.28], [0.04, 1.28], [0.11, 1.29], [0.18, 1.30], [0.25, 1.31], [0.32, 1.33],
  [-0.33, 1.38], [-0.26, 1.36], [-0.19, 1.35], [-0.12, 1.34], [-0.05, 1.33], [0.05, 1.33], [0.12, 1.34], [0.19, 1.35], [0.26, 1.36], [0.33, 1.38],
  [-0.31, 1.43], [-0.24, 1.41], [-0.17, 1.40], [-0.10, 1.39], [-0.03, 1.38], [0.03, 1.38], [0.10, 1.39], [0.17, 1.40], [0.24, 1.41], [0.31, 1.43],
  [-0.29, 1.48], [-0.22, 1.46], [-0.15, 1.45], [-0.08, 1.44], [-0.02, 1.43], [0.02, 1.43], [0.08, 1.44], [0.15, 1.45], [0.22, 1.46], [0.29, 1.48],
  [-0.26, 1.52], [-0.19, 1.50], [-0.12, 1.49], [-0.05, 1.48], [0.05, 1.48], [0.12, 1.49], [0.19, 1.50], [0.26, 1.52],
  [-0.22, 1.55], [-0.15, 1.54], [-0.08, 1.53], [0.08, 1.53], [0.15, 1.54], [0.22, 1.55],
  [-0.18, 1.58], [-0.10, 1.57], [0.0, 1.56], [0.10, 1.57], [0.18, 1.58],
];

snapGrid.forEach(([x, y], i) => {
  const z = (Math.random() - 0.5) * 0.04;
  SNAP_POINTS.push({ x, y, z, tier: 0 });
});

const takenSnapPoints = {};

const TIER_OPEN_THRESHOLD = 0.8;

function getActiveTier() {
  const tier0Count = TIERS[0].count;
  const tier1Count = TIERS[1].count;
  const tier0Taken = SNAP_POINTS.filter(p => p.tier === 0).filter((p, i) => takenSnapPoints[SNAP_POINTS.indexOf(p)]).length;
  const tier1Taken = SNAP_POINTS.filter(p => p.tier === 1).filter((p, i) => takenSnapPoints[SNAP_POINTS.indexOf(p)]).length;
  if (tier0Taken < tier0Count * TIER_OPEN_THRESHOLD) return 0;
  if (tier1Taken < tier1Count * TIER_OPEN_THRESHOLD) return 1;
  return 2;
}

function getNearestSnapPoint(tapX, tapY) {
  const activeTier = getActiveTier();
  let nearest = null;
  let nearestDist = Infinity;
  SNAP_POINTS.forEach((point, index) => {
    if (takenSnapPoints[index]) return;
    if (point.tier > activeTier) return;
    const xDist = Math.abs(point.x - tapX) * 0.8;
    const yDist = Math.abs(point.y - tapY);
    const dist = Math.sqrt(xDist * xDist + yDist * yDist);
    if (dist < nearestDist) { nearestDist = dist; nearest = { point, index }; }
  });
  if (!nearest) {
    const tier = TIERS[Math.min(activeTier, TIERS.length - 1)];
    const x = (Math.random() - 0.5) * tier.xRange * 2;
    const y = tier.yMin + Math.random() * (tier.yMax - tier.yMin);
    return { point: { x, y, z: (Math.random() - 0.5) * 0.04, tier: activeTier }, index: -1 };
  }
  return nearest;
}

const COLOR_MAP = {
  'pale-yellow': '#FFF9A0',
  'peach':       '#FFAA80',
  'turquoise':   '#7FFFD4',
  'lime':        '#CCFF90',
  'purple':      '#D4AAFF',
  'pink':        '#FFB7C5',
};

// Calculate rotation based on x position (leaf tip points outward from trunk)
function getLeafRotation(x) {
  const normalized = x / 0.675;
  const baseAngle = normalized * 90 + 90;
  const randomVariation = (Math.random() * 80) - 40;
  return '0 0 ' + (baseAngle + randomVariation);
}


export async function loadLeaves() {
  const q = query(collection(db, 'leaves'));
  const snapshot = await getDocs(q);
  const leaves = [];
  snapshot.forEach(doc => {
    leaves.push({ id: doc.id, ...doc.data() });
  });
  return leaves;
}

// Render a single leaf onto a canvas and return a data URL
async function renderLeafCanvas(leaf) {
  const font = new FontFace('MyFont', 'url(/Myfont1-Regular.ttf)');
  await font.load();
  document.fonts.add(font);

  return new Promise((resolve) => {
    const color = COLOR_MAP[leaf.color] || '#ffffff';
    const src = '/Leaf-' + leaf.leafNumber + '.png';
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.shadowColor = color;
      ctx.shadowBlur = 25;
      for (let i = 0; i < 8; i++) ctx.drawImage(img, 0, 0);
      ctx.shadowBlur = 0;
      ctx.drawImage(img, 0, 0);

      const maxWidth = img.width * 0.65;
      const lineHeight = 68;
      const maxLines = 3;

      ctx.fillStyle = 'rgba(60, 40, 20, 0.85)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '60px MyFont';

      const words = leaf.message.split(' ');
      const lines = [];
      let currentLine = '';
      words.forEach(word => {
        const testLine = currentLine ? currentLine + ' ' + word : word;
        if (ctx.measureText(testLine).width > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      });
      lines.push(currentLine);

      const displayLines = lines.slice(0, maxLines);
      if (lines.length > maxLines) {
        let lastLine = displayLines[maxLines - 1];
        while (ctx.measureText(lastLine + '...').width > maxWidth && lastLine.length > 0) {
          lastLine = lastLine.slice(0, -1);
        }
        displayLines[maxLines - 1] = lastLine + '...';
      }

      const totalHeight = displayLines.length * lineHeight;
      const textStartY = (img.height / 2) - (totalHeight / 2) + (lineHeight / 2);
      displayLines.forEach((line, i) => {
        ctx.fillText(line, img.width * 0.57, textStartY + i * lineHeight);
      });

      resolve(canvas.toDataURL());
    };
    img.src = src;
  });
}

// Smoothly animate a leaf element's material opacity
function fadeOpacity(el, from, to, durationMs) {
  const start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / durationMs);
    const opacity = from + (to - from) * t;
    if (el.object3D) {
      el.object3D.traverse(child => {
        if (child.material) {
          child.material.opacity = opacity;
          child.material.needsUpdate = true;
        }
      });
    }
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// Spawn a leaf element in AR at a given snap point
async function spawnLeafElement(leaf, point, initialOpacity, pulse) {
  const dataURL = await renderLeafCanvas(leaf);
  const rotation = getLeafRotation(point.x);

  const el = document.createElement('a-image');
  el.classList.add('ar-leaf');
  el.setAttribute('src', dataURL);
  el.setAttribute('position', (point.x * 0.3) + ' ' + (point.y - 1.2) + ' ' + point.z);
  el.setAttribute('width', '0.10');
  el.setAttribute('height', '0.05');
  el.setAttribute('transparent', 'true');
  el.setAttribute('material', 'alphaTest: 0.1; transparent: true; opacity: ' + initialOpacity);
  el.setAttribute('rotation', rotation);
  el.dataset.message = leaf.message;
  el.dataset.leafId = leaf.id;
  el.dataset.leafNumber = leaf.leafNumber || '';
  el.dataset.color = leaf.color || '';
  el.dataset.timestamp = leaf.timestamp || '';
  el.dataset.arX = String(point.x);
  el.dataset.arY = String(point.y);

  const target = document.querySelector('[mindar-image-target]');
  target.appendChild(el);

  if (pulse) {
    setTimeout(() => {
      const obj = el.object3D;
      if (!obj) return;
      obj.scale.set(1, 1, 1);
      setTimeout(() => obj.scale.set(1.8, 1.8, 1), 50);
      setTimeout(() => obj.scale.set(0.9, 0.9, 1), 500);
      setTimeout(() => obj.scale.set(1.3, 1.3, 1), 800);
      setTimeout(() => obj.scale.set(1, 1, 1), 1200);
      // After pulse ends, fade from 1.0 down to resting opacity 0.80
      setTimeout(() => fadeOpacity(el, 1.0, 0.80, 2500), 1400);
    }, 200);
  }

  return el;
}

export async function spawnLeavesInAR(pendingLeaf) {
  const leaves = await loadLeaves();
  const target = document.querySelector('[mindar-image-target]');

  if (!target) {
    console.error('No AR target found');
    return;
  }

  const font = new FontFace('MyFont', 'url(/Myfont1-Regular.ttf)');
  await font.load();
  document.fonts.add(font);

 // Reset taken snap points
  Object.keys(takenSnapPoints).forEach(k => delete takenSnapPoints[k]);
  
  // Assign snap points to existing leaves, leaving last 3 free
  leaves.forEach((leaf, index) => {
    if (index >= SNAP_POINTS.length - 3) return;
    takenSnapPoints[index] = leaf.id;
  });

  // Spawn existing leaves at opacity 0, then fade in
  const spawnPromises = leaves.map((leaf, index) => {
    const point = (typeof leaf.x === 'number' && typeof leaf.y === 'number')
      ? { x: leaf.x, y: leaf.y, z: leaf.z || 0 }
      : SNAP_POINTS[index % SNAP_POINTS.length];
    return spawnLeafElement(leaf, point, 0, false);
  });

  await Promise.all(spawnPromises.filter(Boolean));

  // Fade in batches of 5 leaves, 80ms between batches, 0 → 0.80 over 1.5s
  setTimeout(() => {
    document.querySelectorAll('.ar-leaf').forEach((el, i) => {
      setTimeout(() => fadeOpacity(el, 0, 0.80, 1500), Math.floor(i / 5) * 80);
    });
  }, 50);

  console.log('Spawned ' + leaves.length + ' existing leaves');

  // If there's a pending leaf (from form submission), set up tap-to-place
  if (pendingLeaf) {
    window._pendingLeaf = pendingLeaf;
    window._tapToPlaceActive = true;
  }
}

// Called when visitor taps the AR scene to place their leaf
async function placeLeafAtTap(tapX, tapY) {
  if (!window._tapToPlaceActive || !window._pendingLeaf) return;
  window._tapToPlaceActive = false;

  const leaf = window._pendingLeaf;

  // Get current leaf count to determine active tier
  const existingLeaves = Array.from(document.querySelectorAll('.ar-leaf'));
  const leafCount = existingLeaves.length;

  // Tier boundaries with soft blend at 80%
  const tier = leafCount < 40 ? 0 : leafCount < 80 ? 1 : 2;

  // Zone bounds per tier — each tier expands outward
  const TIER_ZONES = [
    // Tier 1 — tight central canopy
    {
      'left-top':     { xMin: -0.45, xMax: -0.12, yMin: 1.40, yMax: 1.52 },
      'left-bottom':  { xMin: -0.45, xMax: -0.12, yMin: 1.28, yMax: 1.40 },
      'center-top':   { xMin: -0.12, xMax:  0.12, yMin: 1.40, yMax: 1.52 },
      'center-bottom':{ xMin: -0.12, xMax:  0.12, yMin: 1.28, yMax: 1.40 },
      'right-top':    { xMin:  0.12, xMax:  0.45, yMin: 1.40, yMax: 1.52 },
      'right-bottom': { xMin:  0.12, xMax:  0.45, yMin: 1.28, yMax: 1.40 },
    },
    // Tier 2 — mid canopy
    {
      'left-top':     { xMin: -0.65, xMax: -0.15, yMin: 1.42, yMax: 1.58 },
      'left-bottom':  { xMin: -0.65, xMax: -0.15, yMin: 1.26, yMax: 1.42 },
      'center-top':   { xMin: -0.15, xMax:  0.15, yMin: 1.42, yMax: 1.58 },
      'center-bottom':{ xMin: -0.15, xMax:  0.15, yMin: 1.26, yMax: 1.42 },
      'right-top':    { xMin:  0.15, xMax:  0.65, yMin: 1.42, yMax: 1.58 },
      'right-bottom': { xMin:  0.15, xMax:  0.65, yMin: 1.26, yMax: 1.42 },
    },
    // Tier 3 — full canopy
    {
      'left-top':     { xMin: -0.85, xMax: -0.18, yMin: 1.44, yMax: 1.65 },
      'left-bottom':  { xMin: -0.85, xMax: -0.18, yMin: 1.24, yMax: 1.44 },
      'center-top':   { xMin: -0.18, xMax:  0.18, yMin: 1.44, yMax: 1.65 },
      'center-bottom':{ xMin: -0.18, xMax:  0.18, yMin: 1.24, yMax: 1.44 },
      'right-top':    { xMin:  0.18, xMax:  0.85, yMin: 1.44, yMax: 1.65 },
      'right-bottom': { xMin:  0.18, xMax:  0.85, yMin: 1.24, yMax: 1.44 },
    },
  ];

  // Determine which zone was tapped
  const xZone = tapX < -0.15 ? 'left' : tapX > 0.15 ? 'right' : 'center';
  const yZone = tapY > 1.40 ? 'top' : 'bottom';
  const zone = TIER_ZONES[tier][xZone + '-' + yZone];

  // Minimum distance between leaves
  const MIN_DIST = 0.08;
  const placedPositions = existingLeaves.map(el => ({
    x: parseFloat(el.dataset.arX),
    y: parseFloat(el.dataset.arY),
  })).filter(p => !isNaN(p.x) && !isNaN(p.y));

  // Try up to 10 times to find non-overlapping spot
  let point = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const x = zone.xMin + Math.random() * (zone.xMax - zone.xMin);
    const y = zone.yMin + Math.random() * (zone.yMax - zone.yMin);
    const tooClose = placedPositions.some(p =>
      Math.sqrt(Math.pow(p.x - x, 2) + Math.pow(p.y - y, 2)) < MIN_DIST
    );
    if (!tooClose) { point = { x, y, z: (Math.random() - 0.5) * 0.04 }; break; }
  }

  // Fallback if all attempts overlap
  if (!point) {
    point = {
      x: zone.xMin + Math.random() * (zone.xMax - zone.xMin),
      y: zone.yMin + Math.random() * (zone.yMax - zone.yMin),
      z: (Math.random() - 0.5) * 0.04,
    };
  }

  await spawnLeafElement(leaf, point, 1, true);

  try {
    const docRef = await addDoc(collection(db, 'leaves'), {
      leafNumber: leaf.leafNumber,
      message: leaf.message,
      color: leaf.color,
      timestamp: Date.now(),
      approved: false,
      x: point.x,
      y: point.y,
      z: point.z,
    });
    console.log('Leaf saved with ID: ', docRef.id);
  } catch (e) {
    console.error('Error saving leaf: ', e);
  }

  window._pendingLeaf = null;
  window.dispatchEvent(new CustomEvent('leafPlaced'));
}

export async function saveLeaf(leafNumber, message, color) {
  try {
    const docRef = await addDoc(collection(db, 'leaves'), {
      leafNumber: leafNumber,
      message: message,
      color: color,
      timestamp: Date.now(),
      approved: false
    });
    console.log('Leaf saved with ID: ', docRef.id);
    return docRef.id;
  } catch (e) {
    console.error('Error saving leaf: ', e);
    throw e;
  }
}

// Hide MindAR scanning UI
const hideMindarUI = setInterval(() => {
  const scanningEl = document.querySelector('.mindar-ui-scanning');
  const overlayEl = document.querySelector('.mindar-ui-overlay');
  if (scanningEl) scanningEl.style.display = 'none';
  if (overlayEl) overlayEl.style.display = 'none';
}, 100);

window.saveLeaf = saveLeaf;
window.spawnLeavesInAR = spawnLeavesInAR;
window.placeLeafAtTap = placeLeafAtTap;