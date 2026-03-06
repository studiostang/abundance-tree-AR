import { db } from './firebase.js';
import { collection, addDoc, getDocs, query } from 'firebase/firestore';

export const SNAP_POINTS = [];

// Tier definitions: { xRange, yMin, yMax, count }
const TIERS = [
  { xRange: 0.20, yMin: 1.30, yMax: 1.60, count: 30 },  // Tier 1 — tight core
  { xRange: 0.35, yMin: 1.28, yMax: 1.80, count: 80 },  // Tier 2 — mid canopy
  { xRange: 0.50, yMin: 1.25, yMax: 2.10, count: 140 }, // Tier 3 — full canopy
];

const snapGrid = [
  // Base layer — narrow, sits just above trunk
  [-0.15, 1.30], [-0.08, 1.28], [0.0, 1.27], [0.08, 1.28], [0.15, 1.30],

  // Lower canopy — starts widening
  [-0.25, 1.38], [-0.18, 1.35], [-0.10, 1.33], [-0.03, 1.32], [0.03, 1.32], [0.10, 1.33], [0.18, 1.35], [0.25, 1.38],

  // Mid-lower — widest zone
  [-0.38, 1.46], [-0.28, 1.44], [-0.20, 1.42], [-0.12, 1.40], [-0.04, 1.39], [0.04, 1.39], [0.12, 1.40], [0.20, 1.42], [0.28, 1.44], [0.38, 1.46],

  // Mid canopy — still wide
  [-0.40, 1.54], [-0.30, 1.52], [-0.22, 1.50], [-0.14, 1.48], [-0.05, 1.47], [0.05, 1.47], [0.14, 1.48], [0.22, 1.50], [0.30, 1.52], [0.40, 1.54],

  // Upper-mid — starting to taper
  [-0.35, 1.63], [-0.26, 1.61], [-0.18, 1.59], [-0.10, 1.57], [-0.03, 1.56], [0.03, 1.56], [0.10, 1.57], [0.18, 1.59], [0.26, 1.61], [0.35, 1.63],

  // Upper canopy — tapering inward
  [-0.28, 1.72], [-0.20, 1.70], [-0.13, 1.68], [-0.06, 1.67], [0.06, 1.67], [0.13, 1.68], [0.20, 1.70], [0.28, 1.72],

  // High canopy — narrow
  [-0.20, 1.82], [-0.13, 1.80], [-0.07, 1.78], [0.0, 1.77], [0.07, 1.78], [0.13, 1.80], [0.20, 1.82],

  // Near tips — very narrow
  [-0.14, 1.92], [-0.08, 1.90], [-0.03, 1.88], [0.03, 1.88], [0.08, 1.90], [0.14, 1.92],

  // Branch tips — sparse and reaching
  [-0.10, 2.02], [-0.05, 2.00], [0.0, 1.98], [0.05, 2.00], [0.10, 2.02],

  // Very tip — just a few
  [-0.06, 2.10], [0.0, 2.08], [0.06, 2.10],
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
  const sizeScale = 0.7 + Math.random() * 0.8;
  el.setAttribute('width', (0.10 * sizeScale).toFixed(3));
  el.setAttribute('height', (0.05 * sizeScale).toFixed(3));
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
      setTimeout(() => { fadeOpacity(el, 0, 0.60, 1500); setTimeout(() => fadeOpacity(el, 0.60, 0.80, 8000), 1600); }, Math.floor(i / 5) * 80);
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
    {
      'left-top':     { xMin: -0.20, xMax: -0.05, yMin: 1.45, yMax: 1.60 },
      'left-bottom':  { xMin: -0.20, xMax: -0.05, yMin: 1.28, yMax: 1.45 },
      'center-top':   { xMin: -0.05, xMax:  0.05, yMin: 1.45, yMax: 1.60 },
      'center-bottom':{ xMin: -0.05, xMax:  0.05, yMin: 1.28, yMax: 1.45 },
      'right-top':    { xMin:  0.05, xMax:  0.20, yMin: 1.45, yMax: 1.60 },
      'right-bottom': { xMin:  0.05, xMax:  0.20, yMin: 1.28, yMax: 1.45 },
    },
    {
      'left-top':     { xMin: -0.35, xMax: -0.08, yMin: 1.55, yMax: 1.80 },
      'left-bottom':  { xMin: -0.35, xMax: -0.08, yMin: 1.28, yMax: 1.55 },
      'center-top':   { xMin: -0.08, xMax:  0.08, yMin: 1.55, yMax: 1.80 },
      'center-bottom':{ xMin: -0.08, xMax:  0.08, yMin: 1.28, yMax: 1.55 },
      'right-top':    { xMin:  0.08, xMax:  0.35, yMin: 1.55, yMax: 1.80 },
      'right-bottom': { xMin:  0.08, xMax:  0.35, yMin: 1.28, yMax: 1.55 },
    },
    {
      'left-top':     { xMin: -0.50, xMax: -0.10, yMin: 1.65, yMax: 2.10 },
      'left-bottom':  { xMin: -0.50, xMax: -0.10, yMin: 1.25, yMax: 1.65 },
      'center-top':   { xMin: -0.10, xMax:  0.10, yMin: 1.65, yMax: 2.10 },
      'center-bottom':{ xMin: -0.10, xMax:  0.10, yMin: 1.25, yMax: 1.65 },
      'right-top':    { xMin:  0.10, xMax:  0.50, yMin: 1.65, yMax: 2.10 },
      'right-bottom': { xMin:  0.10, xMax:  0.50, yMin: 1.25, yMax: 1.65 },
    },
  ];

  // Determine which zone was tapped
  const xZone = tapX < -0.15 ? 'left' : tapX > 0.15 ? 'right' : 'center';
  const yZone = tapY > 1.40 ? 'top' : 'bottom';
  const zone = TIER_ZONES[tier][xZone + '-' + yZone];

  // Minimum distance between leaves
  const MIN_DIST = 0.12;
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