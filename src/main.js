import { db } from './firebase.js';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';

export const SNAP_POINTS = [
  { x: 0.0,  y: 0.55, z: 0.0   },
  { x: -0.1, y: 0.52, z: 0.02  },
  { x: 0.12, y: 0.50, z: -0.01 },
  { x: 0.05, y: 0.48, z: 0.03  },
  { x: -0.15,y: 0.45, z: 0.01  },
  { x: 0.18, y: 0.43, z: -0.02 },
  { x: -0.05,y: 0.42, z: 0.02  },
  { x: 0.08, y: 0.38, z: 0.01  },
  { x: -0.2, y: 0.36, z: -0.01 },
  { x: 0.22, y: 0.34, z: 0.02  },
  { x: 0.0,  y: 0.32, z: 0.0   },
  { x: -0.12,y: 0.30, z: 0.01  },
  { x: 0.15, y: 0.28, z: -0.01 },
  { x: -0.22,y: 0.26, z: 0.02  },
  { x: 0.05, y: 0.24, z: 0.0   },
  { x: -0.08,y: 0.22, z: -0.01 },
  { x: 0.2,  y: 0.20, z: 0.01  },
  { x: -0.18,y: 0.18, z: 0.0   },
  { x: 0.1,  y: 0.16, z: -0.02 },
  { x: -0.02,y: 0.14, z: 0.01  },
];

const COLOR_MAP = {
  'pale-yellow': '#FFF9A0',
  'peach':       '#FFAA80',
  'turquoise':   '#7FFFD4',
  'lime':        '#CCFF90',
  'purple':      '#D4AAFF',
  'pink':        '#FFB7C5',
};

export async function loadApprovedLeaves() {
  const q = query(collection(db, 'leaves'));
  const snapshot = await getDocs(q);
  const leaves = [];
  snapshot.forEach(doc => {
    leaves.push({ id: doc.id, ...doc.data() });
  });
  return leaves;
}

export async function spawnLeavesInAR() {
  const leaves = await loadApprovedLeaves();
  const target = document.querySelector('[mindar-image-target]');

  if (!target) {
    console.error('No AR target found');
    return;
  }
// TEMP TEST - delete after
const testEl = document.createElement('a-image');
testEl.setAttribute('src', '/Leaf-1.png');
testEl.setAttribute('position', '0 0.98 0.88');
testEl.setAttribute('width', '0.64');
testEl.setAttribute('height', '0.32');
testEl.setAttribute('transparent', 'true');
testEl.setAttribute('material', 'color: red');
target.appendChild(testEl);

  const font = new FontFace('MyFont', 'url(/Myfont.ttf)');
  await font.load();
  document.fonts.add(font);

  leaves.forEach((leaf, index) => {
    if (index >= SNAP_POINTS.length) return;

    const point = SNAP_POINTS[index];
    const color = COLOR_MAP[leaf.color] || '#ffffff';
    const src = '/Leaf-' + leaf.leafNumber + '.png';
    const rotation = '0 0 ' + (Math.random() * 30 - 15);

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
      for (let i = 0; i < 8; i++) {
        ctx.drawImage(img, 0, 0);
      }

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

      const dataURL = canvas.toDataURL();

      const el = document.createElement('a-image');
      el.classList.add('ar-leaf');
      el.setAttribute('src', dataURL);
      el.setAttribute('position', point.x + ' ' + point.y + ' ' + point.z);
      el.setAttribute('width', '0.32');
      el.setAttribute('height', '0.16');
      el.setAttribute('transparent', 'true');
      el.setAttribute('opacity', '1');
      el.setAttribute('material', 'alphaTest: 0.1; transparent: true; opacity: 1');
      el.setAttribute('rotation', rotation);
      el.dataset.message = leaf.message;
      el.dataset.leafId = leaf.id;
      target.appendChild(el);
    };
    img.src = src;
  });

  console.log('Spawned ' + leaves.length + ' leaves');
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
