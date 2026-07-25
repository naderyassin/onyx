const fs = require('fs');
const sharp = require('sharp');
const path = require('path');

const outDir = 'c:/Users/nader/OneDrive/Desktop/Code/onyx-windows/build/sidebars';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, {recursive: true});

const designs = [
  // Design 1: Minimalist Center
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 164 314" width="164" height="314">
  <defs>
    <filter id="neon" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <g id="logo">
      <path d="M -30 -30 L 0 0 L 30 -30" fill="none" stroke="#00ffff" stroke-width="10" stroke-linecap="round" stroke-linejoin="miter" />
      <path d="M -30 10 L 0 40 L 30 10" fill="none" stroke="#00ffff" stroke-width="10" stroke-linecap="round" stroke-linejoin="miter" />
    </g>
  </defs>
  <rect width="164" height="314" fill="#000000" />
  <g transform="translate(82, 137)" filter="url(#neon)">
    <use href="#logo" />
  </g>
  <text x="82" y="240" fill="#00ffff" font-family="Arial, sans-serif" font-size="24" font-weight="bold" text-anchor="middle" letter-spacing="4" filter="url(#neon)">ONYX</text>
  </svg>`,

  // Design 2: Top Logo + Circuit Lines
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 164 314" width="164" height="314">
  <defs>
    <filter id="neon" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <g id="logo">
      <path d="M -20 -20 L 0 0 L 20 -20" fill="none" stroke="#00ffff" stroke-width="8" stroke-linecap="round" stroke-linejoin="miter" />
      <path d="M -20 5 L 0 25 L 20 5" fill="none" stroke="#00ffff" stroke-width="8" stroke-linecap="round" stroke-linejoin="miter" />
    </g>
  </defs>
  <rect width="164" height="314" fill="#000000" />
  <g stroke="#004444" stroke-width="2" fill="none">
    <path d="M 0 100 L 40 100 L 80 140 L 80 314" />
    <path d="M 164 120 L 120 120 L 90 150 L 90 314" />
    <path d="M 0 200 L 30 200 L 60 230 L 60 314" />
  </g>
  <g transform="translate(82, 60)" filter="url(#neon)">
    <use href="#logo" />
  </g>
  <text x="82" y="280" fill="#00ffff" font-family="Arial, sans-serif" font-size="20" font-weight="bold" text-anchor="middle" letter-spacing="6" filter="url(#neon)">ONYX</text>
  </svg>`,

  // Design 3: Large Cropped Logo Background
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 164 314" width="164" height="314">
  <defs>
    <filter id="neon" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#00ffff" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="1"/>
    </linearGradient>
  </defs>
  <rect width="164" height="314" fill="#000000" />
  <g transform="translate(82, 100) scale(2.5)" stroke="url(#fade)" stroke-width="8" stroke-linecap="round" fill="none">
    <path d="M -30 -30 L 0 0 L 30 -30" />
    <path d="M -30 10 L 0 40 L 30 10" />
  </g>
  <g transform="translate(82, 220)" filter="url(#neon)">
    <path d="M -15 -15 L 0 0 L 15 -15" fill="none" stroke="#00ffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="miter" />
    <path d="M -15 5 L 0 20 L 15 5" fill="none" stroke="#00ffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="miter" />
  </g>
  </svg>`
];

async function generate() {
  for (let i = 0; i < designs.length; i++) {
    const svg = designs[i];
    await sharp(Buffer.from(svg)).png().toFile(path.join(outDir, `sidebar_${i+1}.png`));
    console.log(`Generated sidebar option ${i+1}`);
  }
}
generate();
