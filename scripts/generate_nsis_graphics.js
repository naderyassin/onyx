const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Ensure build directory exists
const buildDir = path.join(__dirname, '../build');
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir);
}

// Helper to write a 24-bpp BMP from RGBA sharp buffer
function create24BppBmp(rgbaBuf, width, height, bgColor = {r: 6, g: 6, b: 6}) {
  // NSIS bitmaps are typically 24-bpp (no alpha) or 8-bpp.
  const rowBytes = Math.ceil((width * 3) / 4) * 4; // 4-byte aligned
  const imageSize = rowBytes * height;
  const fileSize = 54 + imageSize;
  const bmp = Buffer.alloc(fileSize, 0);

  // BITMAPFILEHEADER
  bmp.write('BM', 0);
  bmp.writeUInt32LE(fileSize, 2);
  bmp.writeUInt32LE(0, 6);
  bmp.writeUInt32LE(54, 10); // offset to pixels

  // BITMAPINFOHEADER
  bmp.writeUInt32LE(40, 14); // header size
  bmp.writeInt32LE(width, 18);
  bmp.writeInt32LE(height, 22); // positive height = bottom-up
  bmp.writeUInt16LE(1, 26); // planes
  bmp.writeUInt16LE(24, 28); // bpp
  bmp.writeUInt32LE(0, 30); // compression
  bmp.writeUInt32LE(imageSize, 34); // image size
  bmp.writeInt32LE(2835, 38); // x ppm (72dpi)
  bmp.writeInt32LE(2835, 42); // y ppm (72dpi)
  bmp.writeUInt32LE(0, 46); // colors
  bmp.writeUInt32LE(0, 50); // important colors

  // Pixels (Bottom-Up)
  const bgR = bgColor.r, bgG = bgColor.g, bgB = bgColor.b;

  for (let y = 0; y < height; y++) {
    const dstRowStart = 54 + (height - 1 - y) * rowBytes;
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      
      let r = rgbaBuf[srcIdx];
      let g = rgbaBuf[srcIdx + 1];
      let b = rgbaBuf[srcIdx + 2];
      let a = rgbaBuf[srcIdx + 3] / 255;
      
      // Alpha composite over background
      let finalR = Math.round(r * a + bgR * (1 - a));
      let finalG = Math.round(g * a + bgG * (1 - a));
      let finalB = Math.round(b * a + bgB * (1 - a));

      const dstIdx = dstRowStart + x * 3;
      bmp[dstIdx] = finalB;
      bmp[dstIdx + 1] = finalG;
      bmp[dstIdx + 2] = finalR;
    }
  }

  return bmp;
}

async function main() {
  const svgPath = path.join(__dirname, '../src/app/icon.svg');
  const svgBuf = fs.readFileSync(svgPath);

  // NSIS installerSidebar.bmp (164x314)
  // We'll create a dark background with the logo centered
  console.log('Generating installerSidebar.bmp...');
  const sidebarWidth = 164;
  const sidebarHeight = 314;
  const logoSizeSidebar = 100;
  
  const sidebarRgba = await sharp({
    create: { width: sidebarWidth, height: sidebarHeight, channels: 4, background: { r: 6, g: 6, b: 6, alpha: 1 } }
  })
    .composite([
      { input: await sharp(svgBuf).resize(logoSizeSidebar, logoSizeSidebar).toBuffer(), gravity: 'center' }
    ])
    .raw()
    .toBuffer();
    
  const sidebarBmp = create24BppBmp(sidebarRgba, sidebarWidth, sidebarHeight, {r: 6, g: 6, b: 6});
  fs.writeFileSync(path.join(buildDir, 'installerSidebar.bmp'), sidebarBmp);

  // NSIS installerHeader.bmp (150x57)
  // Logo on the right side
  console.log('Generating installerHeader.bmp...');
  const headerWidth = 150;
  const headerHeight = 57;
  const logoSizeHeader = 40;
  
  const headerRgba = await sharp({
    create: { width: headerWidth, height: headerHeight, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } }
  })
    .composite([
      { input: await sharp(svgBuf).resize(logoSizeHeader, logoSizeHeader).toBuffer(), left: Math.floor(headerWidth - logoSizeHeader - 8), top: Math.floor((headerHeight - logoSizeHeader) / 2) }
    ])
    .raw()
    .toBuffer();

  const headerBmp = create24BppBmp(headerRgba, headerWidth, headerHeight, {r: 255, g: 255, b: 255});
  fs.writeFileSync(path.join(buildDir, 'installerHeader.bmp'), headerBmp);

  console.log('Done!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
