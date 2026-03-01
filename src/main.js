import { db } from './firebase.js';
import { collection, addDoc, getDocs, query } from 'firebase/firestore';

const MAX_LEAVES = 500;

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
  { x: 0.05,  y: 1.18, z: 0.0  },
  { x: -0.05, y: 1.15, z: 0.02 },
  { x: 0.1,   y: 1.12, z: 0.01 },
  { x: 0.0,   y: 1.10, z: 0.0  },
  { x: -0.08, y: 1.08, z: 0.03 },
  { x: 0.05,  y: 1.05, z: 0.01 },
  { x: -0.05, y: 1.02, z: 0.02 },
  { x: 0.1,   y: 1.00, z: 0.0  },
  { x: 0.0,   y: 0.98, z: 0.01 },
  { x: -0.08, y: 0.95, z: 0.02 },
];

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

// Find nearest snap point — multiple leaves can share a snap point
function getNearestSnapPoint(tapX, tapY) {
  let nearest = null;
  let nearestDist = Infinity;
  for (let i = 0; i < SNAP_POINTS.length; i++) {
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

  const nearest = getNearestSnapPoint(tapX, tapY);
  if (!nearest) {
    console.warn('No available snap points');
    return;
  }

  const { point, index } = nearest;
  console.log('placeLeafAtTap | tap:', tapX.toFixed(3), tapY.toFixed(3), '| snap:', point.x, point.y, '#' + index);
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
