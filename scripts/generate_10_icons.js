const fs = require('fs');
const sharp = require('sharp');
const path = require('path');

const outDir = 'c:/Users/nader/OneDrive/Desktop/Code/onyx-windows/build/options';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, {recursive: true});

// Filter for neon glow
const defs = `
  <defs>
    <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="4" result="blur1" />
      <feGaussianBlur stdDeviation="8" result="blur2" />
      <feMerge>
        <feMergeNode in="blur2" />
        <feMergeNode in="blur1" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
  <rect width="256" height="256" fill="#000000" />
`;

const designs = [
  // 1: Classic thick stem and arrowhead
  `<g filter="url(#neonGlow)"><line x1="128" y1="40" x2="128" y2="160" stroke="#00ffff" stroke-width="20" stroke-linecap="round" /><path d="M 70 120 L 128 180 L 186 120" fill="none" stroke="#00ffff" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" /></g>`,
  
  // 2: Outline chevron with a detached line above it
  `<g filter="url(#neonGlow)"><path d="M 80 120 L 128 168 L 176 120" fill="none" stroke="#00ffff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" /><line x1="128" y1="40" x2="128" y2="90" stroke="#00ffff" stroke-width="16" stroke-linecap="round" /></g>`,

  // 3: Chevron pointing into a tray (bracket)
  `<g filter="url(#neonGlow)"><path d="M 90 90 L 128 130 L 166 90" fill="none" stroke="#00ffff" stroke-width="14" stroke-linecap="round" stroke-linejoin="miter" /><path d="M 60 160 L 60 190 L 196 190 L 196 160" fill="none" stroke="#00ffff" stroke-width="14" stroke-linecap="round" stroke-linejoin="miter" /><line x1="128" y1="30" x2="128" y2="120" stroke="#00ffff" stroke-width="14" stroke-linecap="round" /></g>`,

  // 4: Double chevron (two Vs pointing down)
  `<g filter="url(#neonGlow)"><path d="M 80 70 L 128 118 L 176 70" fill="none" stroke="#00ffff" stroke-width="16" stroke-linecap="round" stroke-linejoin="miter" /><path d="M 80 130 L 128 178 L 176 130" fill="none" stroke="#00ffff" stroke-width="16" stroke-linecap="round" stroke-linejoin="miter" /></g>`,

  // 5: Heavy, bold solid neon arrow
  `<g filter="url(#neonGlow)"><polygon points="100,30 156,30 156,120 200,120 128,210 56,120 100,120" fill="#00ffff" /></g>`,

  // 6: Circular background outline with a neon arrow inside
  `<g filter="url(#neonGlow)"><circle cx="128" cy="128" r="100" fill="none" stroke="#00ffff" stroke-width="10" /><path d="M 90 120 L 128 160 L 166 120" fill="none" stroke="#00ffff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" /><line x1="128" y1="60" x2="128" y2="150" stroke="#00ffff" stroke-width="12" stroke-linecap="round" /></g>`,

  // 7: Minimalist wireframe arrow (sharp and thin)
  `<g filter="url(#neonGlow)"><path d="M 128 200 L 128 50 M 128 200 L 60 120 M 128 200 L 196 120" fill="none" stroke="#00ffff" stroke-width="8" stroke-linecap="square" stroke-linejoin="miter" /></g>`,

  // 8: Broken/dashed line arrow
  `<g filter="url(#neonGlow)"><line x1="128" y1="40" x2="128" y2="160" stroke="#00ffff" stroke-width="16" stroke-linecap="round" stroke-dasharray="20,20" /><path d="M 70 120 L 128 180 L 186 120" fill="none" stroke="#00ffff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" /></g>`,

  // 9: Rounded geometric arrow with soft corners
  `<g filter="url(#neonGlow)"><rect x="116" y="40" width="24" height="100" rx="12" fill="#00ffff" /><path d="M 80 120 L 128 170 L 176 120" fill="none" stroke="#00ffff" stroke-width="24" stroke-linecap="round" stroke-linejoin="round" /></g>`,

  // 10: Triple downward chevron
  `<g filter="url(#neonGlow)"><path d="M 90 60 L 128 90 L 166 60" fill="none" stroke="#00ffff" stroke-width="12" stroke-linecap="round" /><path d="M 90 100 L 128 130 L 166 100" fill="none" stroke="#00ffff" stroke-width="12" stroke-linecap="round" /><path d="M 90 140 L 128 170 L 166 140" fill="none" stroke="#00ffff" stroke-width="12" stroke-linecap="round" /></g>`
];

async function generate() {
  for (let i = 0; i < designs.length; i++) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">${defs}${designs[i]}</svg>`;
    await sharp(Buffer.from(svg)).png().toFile(path.join(outDir, `option_${i+1}.png`));
    console.log(`Generated option ${i+1}`);
  }
}
generate();
