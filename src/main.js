import { db } from './firebase.js';
import { collection, addDoc, getDocs, query } from 'firebase/firestore';

export const SNAP_POINTS = [
  { x: -0.05, y: 1.42, z: 0.0  },
  { x: 0.05,  y: 1.45, z: 0.01 },
  { x: -0.1,  y: 1.38, z: -0.01},
  { x: 0.1,   y: 1.40, z: 0.02 },
  { x: 0.0,   y: 1.35, z: 0.0  },
  { x: -0.05, y: 1.28, z: 0.01 },
  { x: 0.1,   y: 1.30, z: 0.0  },
  { x: 0.0,   y: 1.25, z: 0.02 },
  { x: 0.08,  y: 1.22, z: -0.01},
  { x: -0.08, y: 1.25, z: 0.01 },
  { x: -0.15, y: 1.32, z: 0.0  },
  { x: 0.15,  y: 1.35, z: 0.01 },
  { x: -0.18, y: 1.28, z: 0.02 },
  { x: 0.18,  y: 1.30, z: 0.0  },
  { x: -0.20, y: 1.38, z: 0.01 },
  { x: 0.20,  y: 1.40, z: 0.02 },
  { x: -0.12, y: 1.42, z: 0.0  },
  { x: 0.12,  y: 1.44, z: 0.01 },
  { x: -0.22, y: 1.32, z: 0.02 },
  { x: 0.22,  y: 1.35, z: 0.0  },
];

// Track which snap points are taken: snapPointIndex -> leafId
const takenSnapPoints = {};

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
  const normalized = x / 0.675; // -1 to 1
  const baseAngle = normalized * 90 + 90; // 0 to 180 degrees
  const randomVariation = (Math.random() * 20) - 10; // ±10 degrees
  return '0 0 ' + (baseAngle + randomVariation);
}

// Find nearest available snap point to a tapped AR position
function getNearestSnapPoint(tapX, tapY) {
  let nearest = null;
  let nearestDist = Infinity;
  SNAP_POINTS.forEach((point, index) => {
    if (takenSnapPoints[index]) return;
    const dist = Math.sqrt(
      Math.pow(point.x - tapX, 2) +
      Math.pow(point.y - tapY, 2)
    );
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = { point, index };
    }
  });
  return nearest;
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
  el.setAttribute('position', (point.x * 0.18) + ' ' + (point.y - 1.2) + ' ' + point.z);
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

  const point = {
    x: tapX + (Math.random() - 0.5) * 0.1,
    y: tapY + (Math.random() - 0.5) * 0.1,
    z: 0,
  };

  // Spawn their leaf at full opacity with pulse
  await spawnLeafElement(leaf, point, 1, true);

  // Save to Firebase
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

  // Signal to index.html that placement is done
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