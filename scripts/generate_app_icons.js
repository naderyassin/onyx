const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIcoModule = require('png-to-ico');
const pngToIco = typeof pngToIcoModule === 'function' ? pngToIcoModule : pngToIcoModule.default;

async function main() {
  const svgPath = path.join(__dirname, '../src/app/icon.svg');
  const svgBuffer = fs.readFileSync(svgPath);

  const sizes = [512, 256, 192, 180, 64, 32, 16];
  const pngFiles = {};

  for (const s of sizes) {
    const tmpPng = path.join(__dirname, `../public/icon-${s}.png`);
    await sharp(svgBuffer).resize(s, s).png().toFile(tmpPng);
    pngFiles[s] = tmpPng;
  }

  // Copy standard locations
  fs.copyFileSync(pngFiles[512], path.join(__dirname, '../src/app/icon.png'));
  fs.copyFileSync(pngFiles[512], path.join(__dirname, '../public/icon.png'));
  fs.copyFileSync(pngFiles[512], path.join(__dirname, '../public/app-icon.png'));
  fs.copyFileSync(pngFiles[180], path.join(__dirname, '../public/apple-touch-icon.png'));
  fs.copyFileSync(pngFiles[32], path.join(__dirname, '../public/favicon-32x32.png'));
  fs.copyFileSync(pngFiles[16], path.join(__dirname, '../public/favicon-16x16.png'));

  // Generate true multi-size Windows ICO file
  const icoBuf = await pngToIco([pngFiles[256], pngFiles[64], pngFiles[32], pngFiles[16]]);
  fs.writeFileSync(path.join(__dirname, '../public/favicon.ico'), icoBuf);

  console.log('Successfully generated all icon formats including multi-resolution favicon.ico!');
}

main().catch(err => {
  console.error('Error generating app icons:', err);
  process.exit(1);
});
