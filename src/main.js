import { db } from './firebase.js';
import { collection, addDoc, getDocs, query, onSnapshot, deleteDoc, doc } from 'firebase/firestore';

export const SNAP_POINTS = [];

const TIERS = [
  { maxLeaves: 7,   xRange: 1.80, xRangeTop: 0.60, yMin: 1.45, yMax: 1.62 },
  { maxLeaves: 20,  xRange: 2.10, xRangeTop: 0.75, yMin: 1.43, yMax: 1.69 },
  { maxLeaves: 40,  xRange: 2.40, xRangeTop: 0.90, yMin: 1.41, yMax: 1.76 },
  { maxLeaves: 70,  xRange: 2.65, xRangeTop: 1.05, yMin: 1.39, yMax: 1.83 },
  { maxLeaves: 110, xRange: 2.85, xRangeTop: 1.20, yMin: 1.27, yMax: 1.90 },
  { maxLeaves: 170, xRange: 3.00, xRangeTop: 1.35, yMin: 1.25, yMax: 1.97 },
  { maxLeaves: 250, xRange: 3.10, xRangeTop: 1.50, yMin: 1.23, yMax: 2.04 },
  { maxLeaves: 370, xRange: 3.18, xRangeTop: 1.65, yMin: 1.21, yMax: 2.10 },
  { maxLeaves: 500, xRange: 3.24, xRangeTop: 1.80, yMin: 1.19, yMax: 2.16 },
];

const snapGrid = [
  [-0.35, 1.36], [-0.22, 1.33], [-0.10, 1.32], [0.0, 1.31], [0.10, 1.32], [0.22, 1.33], [0.35, 1.36],
  [-0.52, 1.41], [-0.38, 1.39], [-0.24, 1.37], [-0.12, 1.36], [-0.03, 1.35], [0.03, 1.35], [0.12, 1.36], [0.24, 1.37], [0.38, 1.39], [0.52, 1.41],
  [-0.65, 1.45], [-0.50, 1.44], [-0.36, 1.43], [-0.22, 1.42], [-0.08, 1.41], [0.0, 1.40], [0.08, 1.41], [0.22, 1.42], [0.36, 1.43], [0.50, 1.44], [0.65, 1.45],
  [-0.72, 1.49], [-0.56, 1.48], [-0.40, 1.47], [-0.24, 1.46], [-0.08, 1.45], [0.0, 1.44], [0.08, 1.45], [0.24, 1.46], [0.40, 1.47], [0.56, 1.48], [0.72, 1.49],
  [-0.60, 1.54], [-0.46, 1.53], [-0.32, 1.52], [-0.18, 1.51], [-0.06, 1.50], [0.06, 1.50], [0.18, 1.51], [0.32, 1.52], [0.46, 1.53], [0.60, 1.54],
  [-0.46, 1.60], [-0.32, 1.59], [-0.20, 1.58], [-0.08, 1.57], [0.0, 1.56], [0.08, 1.57], [0.20, 1.58], [0.32, 1.59], [0.46, 1.60],
  [-0.30, 1.66], [-0.18, 1.65], [-0.08, 1.64], [0.0, 1.63], [0.08, 1.64], [0.18, 1.65], [0.30, 1.66],
  [-0.16, 1.72], [-0.08, 1.71], [0.0, 1.70], [0.08, 1.71], [0.16, 1.72],
];

snapGrid.forEach(([x, y], i) => {
  const z = (Math.random() - 0.5) * 0.04;
  SNAP_POINTS.push({ x, y, z, tier: 0 });
});

const takenSnapPoints = {};

const TIER_OPEN_THRESHOLD = 0.8;

function getActiveTier(leafCount) {
  for (let i = 0; i < TIERS.length; i++) {
    if (leafCount < TIERS[i].maxLeaves) return i;
  }
  return TIERS.length - 1;
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

function startBreezeAnimation() {
  const swayingLeaves = new WeakMap();

  function swayBatch() {
    const leaves = Array.from(document.querySelectorAll('.ar-leaf'));
    if (leaves.length === 0) return;

    const count = Math.max(1, Math.floor(leaves.length * 0.15));
    const shuffled = leaves.sort(() => Math.random() - 0.5).slice(0, count);

    shuffled.forEach((leaf, i) => {
      if (swayingLeaves.get(leaf)) return;
      const delay = i * 400 + Math.random() * 300;
      setTimeout(() => {
        if (swayingLeaves.get(leaf)) return;
        const currentRot = leaf.getAttribute('rotation');
        if (!currentRot) return;
        const baseZ = currentRot.z;
        const swayDeg = (Math.random() * 20 + 15) * (Math.random() < 0.5 ? 1 : -1);
        const duration = 3000 + Math.random() * 2000;
        const start = performance.now();
        swayingLeaves.set(leaf, true);

        function animate(now) {
          const t = Math.min(1, (now - start) / duration);
          const ease = (1 - Math.cos(t * Math.PI)) / 2;
          const sway = Math.sin(ease * Math.PI);
          leaf.setAttribute('rotation', { x: currentRot.x, y: currentRot.y, z: baseZ + swayDeg * sway });
          if (t < 1) {
            requestAnimationFrame(animate);
          } else {
            leaf.setAttribute('rotation', { x: currentRot.x, y: currentRot.y, z: baseZ });
            swayingLeaves.set(leaf, false);
          }
        }
        requestAnimationFrame(animate);
      }, delay);
    });

    const nextBatch = 2500 + Math.random() * 2000;
    setTimeout(swayBatch, nextBatch);
  }

  setTimeout(swayBatch, 500);
  setTimeout(swayBatch, 1500);
  setTimeout(swayBatch, 3000);
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
      obj.scale.set(0.1, 0.1, 1);
      setTimeout(() => obj.scale.set(3.5, 3.5, 1), 50);
      setTimeout(() => obj.scale.set(2.2, 2.2, 1), 350);
      setTimeout(() => obj.scale.set(2.8, 2.8, 1), 600);
      setTimeout(() => obj.scale.set(1.6, 1.6, 1), 900);
      setTimeout(() => obj.scale.set(2.0, 2.0, 1), 1100);
      setTimeout(() => obj.scale.set(1.0, 1.0, 1), 1400);
      // After pulse ends, fade from 1.0 down to resting opacity 0.80
      setTimeout(() => fadeOpacity(el, 1.0, 0.80, 2500), 1600);
    }, 200);
  }

  return el;
}

export async function spawnLeavesInAR(pendingLeaf) {
  const target = document.querySelector('[mindar-image-target]');
  if (!target) { console.error('No AR target found'); return; }

  const font = new FontFace('MyFont', 'url(/Myfont1-Regular.ttf)');
  await font.load();
  document.fonts.add(font);

  if (pendingLeaf) { window._pendingLeaf = pendingLeaf; window._tapToPlaceActive = true; }

  Object.keys(takenSnapPoints).forEach(k => delete takenSnapPoints[k]);

  window._seenIds = new Set();
  let leafIndex = 0;
  const unsubscribe = onSnapshot(query(collection(db, 'leaves')), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const leaf = { id: change.doc.id, ...change.doc.data() };
        if (window._seenIds.has(leaf.id)) return;
        if (window._placingLeaf) return;
        window._seenIds.add(leaf.id);
        const index = leafIndex++;
        const point = (typeof leaf.x === 'number' && typeof leaf.y === 'number')
          ? { x: leaf.x, y: leaf.y, z: leaf.z || 0 }
          : SNAP_POINTS[index % SNAP_POINTS.length];
        spawnLeafElement(leaf, point, 0, false).then(el => {
          if (el) setTimeout(() => fadeOpacity(el, 0, 0.80, 600), 100);
        });
      }
    });
  });

  window.addEventListener('leafPlaced', function cleanup() {
    window.removeEventListener('leafPlaced', cleanup);
  });

  window._unsubscribeLeaves = unsubscribe;

  // Single pass after initial load — fade oldest 10% of leaves to 40% opacity for depth
  setTimeout(() => {
    const allLeaves = Array.from(document.querySelectorAll('.ar-leaf'));
    if (allLeaves.length < 30) return;
    const sorted = allLeaves
      .filter(el => !isNaN(parseInt(el.dataset.timestamp, 10)))
      .sort((a, b) => parseInt(a.dataset.timestamp, 10) - parseInt(b.dataset.timestamp, 10));
    const cutoff = Math.floor(sorted.length * 0.10);
    sorted.slice(0, cutoff).forEach(el => {
      fadeOpacity(el, 0.80, 0.40, 2000);
    });
  }, 3000);

  startBreezeAnimation();
}

// Called when visitor taps the AR scene to place their leaf
async function placeLeafAtTap(tapX, tapY) {
  if (!window._pendingLeaf) return;
  window._tapToPlaceActive = false;
  window._placingLeaf = true;

  const leaf = window._pendingLeaf;

  // Get current leaf count to determine active tier
  const existingLeaves = Array.from(document.querySelectorAll('.ar-leaf'));
  const leafCount = existingLeaves.length;

  const activeTierIndex = getActiveTier(leafCount);

  // All tiers up to and including active are available (additive)
  const availableTiers = TIERS.slice(0, activeTierIndex + 1);

  // Pick a random available tier weighted toward newer/outer tiers
  const weights = availableTiers.map((_, i) => i + 1);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * totalWeight;
  let chosenTierIndex = 0;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) { chosenTierIndex = i; break; }
  }
  const chosenTier = availableTiers[chosenTierIndex];

  // Zone is centered on tap position with some randomness
  const yProgress = (tapY - chosenTier.yMin) / (chosenTier.yMax - chosenTier.yMin);
  const organicJitter = 1 + (Math.random() - 0.5) * 0.18;
  const domeCurve = Math.pow(yProgress, 0.6);
  const effectiveXRange = (chosenTier.xRange - (chosenTier.xRange - chosenTier.xRangeTop) * domeCurve) * organicJitter;
  const xSpread = effectiveXRange * 0.5;
  const ySpread = (chosenTier.yMax - chosenTier.yMin) * 0.5;

  const MIN_DIST = 0.10;
  const MAX_ISOLATION = 0.30;
  const placedPositions = existingLeaves.map(el => ({
    x: parseFloat(el.dataset.arX),
    y: parseFloat(el.dataset.arY),
  })).filter(p => !isNaN(p.x) && !isNaN(p.y));

  let point = null;
  for (let attempt = 0; attempt < 15; attempt++) {
    let baseX = tapX;
    let baseY = tapY;
    if (leafCount > 0 && leafCount < 50 && placedPositions.length > 0) {
      const nearest = placedPositions.reduce((a, b) => {
        const da = Math.sqrt(Math.pow(a.x - tapX, 2) + Math.pow(a.y - tapY, 2));
        const db = Math.sqrt(Math.pow(b.x - tapX, 2) + Math.pow(b.y - tapY, 2));
        return da < db ? a : b;
      });
      const biasFactor = Math.max(0, (1 - leafCount / 50) * 0.3);
      baseX = tapX * (1 - biasFactor) + nearest.x * biasFactor;
      baseY = tapY * (1 - biasFactor) + nearest.y * biasFactor;
    }
    const x = Math.max(-effectiveXRange, Math.min(effectiveXRange,
      baseX + (Math.random() - 0.5) * xSpread));
    const y = Math.max(chosenTier.yMin, Math.min(chosenTier.yMax,
      baseY + (Math.random() - 0.5) * ySpread));
    const tooClose = placedPositions.some(p =>
      Math.sqrt(Math.pow(p.x - x, 2) + Math.pow(p.y - y, 2)) < MIN_DIST
    );
    const tooIsolated = placedPositions.length > 0 && !placedPositions.some(p =>
      Math.sqrt(Math.pow(p.x - x, 2) + Math.pow(p.y - y, 2)) < MAX_ISOLATION
    );
    if (!tooClose && !tooIsolated) { point = { x, y, z: (Math.random() - 0.5) * 0.04 }; break; }
  }

  if (!point) {
    if (placedPositions.length > 0) {
      const nearest = placedPositions.reduce((a, b) => {
        const da = Math.sqrt(Math.pow(a.x - tapX, 2) + Math.pow(a.y - tapY, 2));
        const db = Math.sqrt(Math.pow(b.x - tapX, 2) + Math.pow(b.y - tapY, 2));
        return da < db ? a : b;
      });
      const angle = Math.random() * Math.PI * 2;
      const dist = MIN_DIST + Math.random() * (MAX_ISOLATION - MIN_DIST);
      point = {
        x: nearest.x + Math.cos(angle) * dist,
        y: nearest.y + Math.sin(angle) * dist,
        z: (Math.random() - 0.5) * 0.04
      };
    } else {
      point = {
        x: tapX + (Math.random() - 0.5) * 0.2,
        y: tapY + (Math.random() - 0.5) * 0.2,
        z: (Math.random() - 0.5) * 0.04
      };
    }
    point.y = Math.max(chosenTier.yMin, point.y);
  }

  // 500 leaf cap — delete oldest leaf before adding new one
  const allLeaves = Array.from(document.querySelectorAll('.ar-leaf'));
  if (allLeaves.length >= 500) {
    let oldestEl = null;
    let oldestTimestamp = Infinity;
    allLeaves.forEach(el => {
      const ts = parseInt(el.dataset.timestamp, 10);
      if (!isNaN(ts) && ts < oldestTimestamp) {
        oldestTimestamp = ts;
        oldestEl = el;
      }
    });
    if (oldestEl) {
      const oldestId = oldestEl.dataset.leafId;
      oldestEl.parentNode.removeChild(oldestEl);
      if (oldestId) {
        try {
          await deleteDoc(doc(db, 'leaves', oldestId));
        } catch (e) {
          console.error('Error deleting oldest leaf:', e);
        }
      }
    }
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
    if (window._seenIds) window._seenIds.add(docRef.id);
    console.log('Leaf saved with ID: ', docRef.id);
  } catch (e) {
    console.error('Error saving leaf: ', e);
  }

  window._pendingLeaf = null;
  window._placingLeaf = false;
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