import { db } from './firebase.js';
import { collection, addDoc, getDocs, query } from 'firebase/firestore';

const MAX_LEAVES = 500;

// ---------- Snap point generation ----------

// Deterministic pseudo-random (pure function, no global state)
function seeded(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function buildSnapPoints() {
  const pts = [];

  // Tier 1 (indices 0–24): 25 hand-placed inner branch-line points
  // y: 1.25–1.40, x: ±0.10 — tight cluster along visible branch lines
  [
    [  0.00, 1.30,  0.00 ], [  0.05, 1.35,  0.01 ], [ -0.05, 1.33, -0.01 ],
    [  0.08, 1.28,  0.01 ], [ -0.08, 1.30,  0.00 ], [  0.03, 1.38, -0.01 ],
    [ -0.03, 1.37,  0.01 ], [  0.06, 1.32,  0.02 ], [ -0.06, 1.26, -0.01 ],
    [  0.09, 1.36,  0.00 ], [ -0.09, 1.39,  0.01 ], [  0.02, 1.25,  0.01 ],
    [ -0.02, 1.27, -0.01 ], [  0.07, 1.40,  0.00 ], [ -0.07, 1.34,  0.01 ],
    [  0.04, 1.29, -0.01 ], [ -0.04, 1.31,  0.00 ], [  0.01, 1.36,  0.01 ],
    [ -0.01, 1.32,  0.02 ], [  0.10, 1.27,  0.00 ], [ -0.10, 1.35, -0.01 ],
    [  0.06, 1.25,  0.01 ], [ -0.06, 1.38,  0.00 ], [  0.09, 1.30, -0.01 ],
    [ -0.09, 1.26,  0.01 ],
  ].forEach(([x, y, z]) => pts.push({ x, y, z }));

  // Scatter N points uniformly inside an upward semi-ellipse:
  // centre (0, yMin), extends up to yMax, rx controls x spread
  function scatter(count, rx, yMin, yMax, seedBase) {
    const ry = yMax - yMin;
    const out = [];
    let s = seedBase;
    while (out.length < count) {
      s++;
      const px = (seeded(s * 3) * 2 - 1) * rx;
      const py = yMin + seeded(s * 3 + 1) * ry;
      const dy = py - yMin;
      if ((px * px) / (rx * rx) + (dy * dy) / (ry * ry) > 1.0) continue;
      const pz = (seeded(s * 3 + 2) - 0.5) * 0.04;
      out.push({
        x: Math.round(px * 1000) / 1000,
        y: Math.round(py * 1000) / 1000,
        z: Math.round(pz * 1000) / 1000,
      });
    }
    return out;
  }

  // Tier 2 (indices 25–74):   50 pts — y 1.20–1.45, x ±0.18
  scatter(50,  0.18, 1.20, 1.45, 100).forEach(p => pts.push(p));
  // Tier 3 (indices 75–149):  75 pts — y 1.15–1.50, x ±0.25
  scatter(75,  0.25, 1.15, 1.50, 200).forEach(p => pts.push(p));
  // Tier 4 (indices 150–299): 150 pts — y 1.10–1.55, x ±0.35
  scatter(150, 0.35, 1.10, 1.55, 400).forEach(p => pts.push(p));
  // Tier 5 (indices 300–499): 200 pts — same zone, different seed
  scatter(200, 0.35, 1.10, 1.55, 800).forEach(p => pts.push(p));

  return pts; // 25 + 50 + 75 + 150 + 200 = 500
}

export const SNAP_POINTS = buildSnapPoints();

// How many snap points are unlocked given the current leaf count
function unlockedCount(n) {
  if (n <  25) return  25;
  if (n <  75) return  75;
  if (n < 150) return 150;
  if (n < 300) return 300;
  return SNAP_POINTS.length;
}

// Running total — set by spawnLeavesInAR, incremented by placeLeafAtTap
let _totalLeafCount = 0;

// ---------- Color map ----------

const COLOR_MAP = {
  'pale-yellow': '#FFF9A0',
  'peach':       '#FFAA80',
  'turquoise':   '#7FFFD4',
  'lime':        '#CCFF90',
  'purple':      '#D4AAFF',
  'pink':        '#FFB7C5',
};

// ---------- Helpers ----------

function getLeafRotation(x) {
  const normalized = x / 0.675;
  const baseAngle = normalized * 90 + 90;
  const randomVariation = (Math.random() * 20) - 10;
  return '0 0 ' + (baseAngle + randomVariation);
}

// ±0.05 random offset for organic leaf overlap
function randomOffset() {
  return (Math.random() - 0.5) * 0.1;
}

// Find nearest snap point within currently unlocked tiers
// Multiple leaves can share a snap point — no exclusion tracking
function getNearestSnapPoint(tapX, tapY, leafCount) {
  const available = unlockedCount(leafCount);
  let nearest = null;
  let nearestDist = Infinity;
  for (let i = 0; i < available; i++) {
    const p = SNAP_POINTS[i];
    const dist = Math.sqrt((p.x - tapX) ** 2 + (p.y - tapY) ** 2);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = { point: p, index: i };
    }
  }
  return nearest;
}

// ---------- Firebase ----------

export async function loadLeaves() {
  const snapshot = await getDocs(query(collection(db, 'leaves')));
  const leaves = [];
  snapshot.forEach(doc => leaves.push({ id: doc.id, ...doc.data() }));
  return leaves;
}

// ---------- Canvas rendering ----------

async function renderLeafCanvas(leaf) {
  const font = new FontFace('MyFont', 'url(/Myfont.ttf)');
  await font.load();
  document.fonts.add(font);

  return new Promise((resolve) => {
    const color = COLOR_MAP[leaf.color] || '#ffffff';
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
    img.src = '/Leaf-' + leaf.leafNumber + '.png';
  });
}

// ---------- AR spawning ----------

async function spawnLeafElement(leaf, point, initialOpacity, pulse) {
  const dataURL = await renderLeafCanvas(leaf);
  const rotation = getLeafRotation(point.x);

  const el = document.createElement('a-image');
  el.classList.add('ar-leaf');
  el.setAttribute('src', dataURL);
  el.setAttribute('position', point.x + ' ' + point.y + ' ' + point.z);
  el.setAttribute('rotation', rotation);
  el.setAttribute('width', '0.32');
  el.setAttribute('height', '0.16');
  el.setAttribute('transparent', 'true');
  el.setAttribute('material', 'alphaTest: 0.1; transparent: true; opacity: ' + initialOpacity);
  el.dataset.targetOpacity = String(initialOpacity);
  el.dataset.message = leaf.message;
  el.dataset.leafId = leaf.id;

  document.querySelector('[mindar-image-target]').appendChild(el);

  if (pulse) {
    setTimeout(() => {
      const obj = el.object3D;
      if (!obj) return;
      obj.scale.set(1, 1, 1);
      setTimeout(() => obj.scale.set(1.8, 1.8, 1), 50);
      setTimeout(() => obj.scale.set(0.9, 0.9, 1), 500);
      setTimeout(() => obj.scale.set(1.3, 1.3, 1), 800);
      setTimeout(() => obj.scale.set(1, 1, 1), 1200);
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

  const font = new FontFace('MyFont', 'url(/Myfont.ttf)');
  await font.load();
  document.fonts.add(font);

  // Sort oldest→newest, cap at MAX_LEAVES for display
  const sorted = leaves.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  const display = sorted.slice(-MAX_LEAVES);
  const total = display.length;
  _totalLeafCount = total;

  // Spawn each leaf at opacity 0 with age-based target opacity
  const spawnPromises = display.map((leaf, index) => {
    // index 0 = oldest, total-1 = newest
    const ageFraction   = total <= 1 ? 1.0 : index / (total - 1);
    const minOpacity    = Math.max(0, 1 - total / MAX_LEAVES);
    const targetOpacity = minOpacity + (1 - minOpacity) * ageFraction;

    // Position: use stored snapPointIndex if valid, otherwise sequential fallback
    const si = leaf.snapPointIndex;
    const base = (typeof si === 'number' && si >= 0 && si < SNAP_POINTS.length)
      ? SNAP_POINTS[si]
      : SNAP_POINTS[index % SNAP_POINTS.length];

    const point = {
      x: base.x + randomOffset(),
      y: base.y + randomOffset(),
      z: base.z,
    };

    return spawnLeafElement(leaf, point, 0, false).then(el => {
      el.dataset.targetOpacity = String(targetOpacity);
      return el;
    });
  });

  await Promise.all(spawnPromises.filter(Boolean));

  // Fade each leaf to its individual target opacity
  // Batches of 20 every 50ms → ~1.25s max for 500 leaves
  setTimeout(() => {
    document.querySelectorAll('.ar-leaf').forEach((el, i) => {
      const targetOpacity = parseFloat(el.dataset.targetOpacity || '1');
      setTimeout(() => {
        if (el.object3D) {
          el.object3D.traverse(child => {
            if (child.material) {
              child.material.opacity = targetOpacity;
              child.material.needsUpdate = true;
            }
          });
        }
      }, Math.floor(i / 20) * 50);
    });
  }, 300);

  console.log('Spawned ' + total + ' leaves');

  if (pendingLeaf) {
    window._pendingLeaf = pendingLeaf;
    window._tapToPlaceActive = true;
  }
}

// Called when visitor taps the AR scene to place their leaf
async function placeLeafAtTap(tapX, tapY) {
  if (!window._tapToPlaceActive || !window._pendingLeaf) return;
  window._tapToPlaceActive = false;

  const nearest = getNearestSnapPoint(tapX, tapY, _totalLeafCount);
  if (!nearest) {
    console.warn('No available snap points');
    return;
  }

  const { point, index } = nearest;
  const logMsg = 'tap:' + tapX.toFixed(3) + ',' + tapY.toFixed(3) + ' | leaves:' + _totalLeafCount + ' | unlocked:' + unlockedCount(_totalLeafCount) + ' | snap:' + point.x + ',' + point.y + ' #' + index;
  console.log(logMsg);
  if (window.debugLog) window.debugLog(logMsg);
  const leaf = window._pendingLeaf;

  // Apply ±0.05 organic offset then spawn at full opacity with pulse
  const placed = {
    x: point.x + randomOffset(),
    y: point.y + randomOffset(),
    z: point.z,
  };

  await spawnLeafElement(leaf, placed, 1, true);

  // Save to Firebase with snapPointIndex
  try {
    const docRef = await addDoc(collection(db, 'leaves'), {
      leafNumber: leaf.leafNumber,
      message: leaf.message,
      color: leaf.color,
      timestamp: Date.now(),
      approved: false,
      snapPointIndex: index,
    });
    console.log('Leaf saved:', docRef.id);
  } catch (e) {
    console.error('Error saving leaf:', e);
  }

  _totalLeafCount++;
  window._pendingLeaf = null;
  window.dispatchEvent(new CustomEvent('leafPlaced'));
}

export async function saveLeaf(leafNumber, message, color) {
  try {
    const docRef = await addDoc(collection(db, 'leaves'), {
      leafNumber,
      message,
      color,
      timestamp: Date.now(),
      approved: false,
    });
    console.log('Leaf saved:', docRef.id);
    return docRef.id;
  } catch (e) {
    console.error('Error saving leaf:', e);
    throw e;
  }
}

// Hide MindAR scanning UI
const hideMindarUI = setInterval(() => {
  const scanningEl = document.querySelector('.mindar-ui-scanning');
  const overlayEl  = document.querySelector('.mindar-ui-overlay');
  if (scanningEl) scanningEl.style.display = 'none';
  if (overlayEl)  overlayEl.style.display  = 'none';
}, 100);

window.saveLeaf        = saveLeaf;
window.spawnLeavesInAR = spawnLeavesInAR;
window.placeLeafAtTap  = placeLeafAtTap;
