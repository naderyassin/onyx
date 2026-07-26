/**
 * In-place PE icon replacer for NSIS installers.
 *
 * Parses the PE resource directory, finds every RT_ICON bitmap,
 * generates new icon bitmaps at the EXACT same pixel dimensions
 * and byte sizes, and overwrites them in place.
 *
 * Because no sizes, offsets, or headers change, the NSIS overlay
 * offset remains valid and the integrity check passes.
 */

const fs    = require('fs');
const path  = require('path');
const sharp = require('sharp');

/* ──────────── PE parsing helpers ──────────── */

function parsePe(buf) {
  const e_lfanew = buf.readUInt32LE(0x3c);
  if (buf.readUInt32LE(e_lfanew) !== 0x00004550)
    throw new Error('Not a valid PE');

  const coffOff    = e_lfanew + 4;
  const nSections  = buf.readUInt16LE(coffOff + 2);
  const optSize    = buf.readUInt16LE(coffOff + 16);
  const optOff     = coffOff + 20;
  const secTableOff = optOff + optSize;

  const sections = [];
  for (let i = 0; i < nSections; i++) {
    const off = secTableOff + i * 40;
    const name = buf.subarray(off, off + 8).toString('ascii').replace(/\0+$/, '');
    sections.push({
      name,
      virtualSize:   buf.readUInt32LE(off + 8),
      virtualAddr:   buf.readUInt32LE(off + 12),
      rawSize:       buf.readUInt32LE(off + 16),
      rawOffset:     buf.readUInt32LE(off + 20),
    });
  }
  return { sections };
}

function rvaToFileOffset(rva, sections) {
  for (const s of sections) {
    if (rva >= s.virtualAddr && rva < s.virtualAddr + s.rawSize) {
      return rva - s.virtualAddr + s.rawOffset;
    }
  }
  throw new Error(`Cannot map RVA 0x${rva.toString(16)}`);
}

/* ──────────── Resource directory walker ──────────── */

const RT_ICON       = 3;
const RT_GROUP_ICON = 14;

function parseResourceDir(buf, rsrcSection) {
  const base = rsrcSection.rawOffset;   // file offset of .rsrc start
  const rva0 = rsrcSection.virtualAddr; // VA of .rsrc start

  function readDir(dirFileOff) {
    const namedEntries = buf.readUInt16LE(dirFileOff + 12);
    const idEntries    = buf.readUInt16LE(dirFileOff + 14);
    const total = namedEntries + idEntries;
    const entries = [];
    for (let i = 0; i < total; i++) {
      const eOff   = dirFileOff + 16 + i * 8;
      const nameId = buf.readUInt32LE(eOff);
      const data   = buf.readUInt32LE(eOff + 4);
      entries.push({
        id:    nameId & 0x7fffffff,
        isDir: !!(data & 0x80000000),
        offset: data & 0x7fffffff,      // offset from .rsrc start
      });
    }
    return entries;
  }

  function readDataEntry(fileOff) {
    return {
      rva:  buf.readUInt32LE(fileOff),
      size: buf.readUInt32LE(fileOff + 4),
    };
  }

  // Walk: Type → ID → Language → DATA_ENTRY
  const icons = [];      // { fileOffset, size, width, height }
  const groupIcons = []; // { fileOffset, size }

  const level1 = readDir(base);
  for (const typeEntry of level1) {
    if (typeEntry.id !== RT_ICON && typeEntry.id !== RT_GROUP_ICON) continue;
    if (!typeEntry.isDir) continue;

    const level2 = readDir(base + typeEntry.offset);
    for (const idEntry of level2) {
      if (!idEntry.isDir) continue;

      const level3 = readDir(base + idEntry.offset);
      for (const langEntry of level3) {
        if (langEntry.isDir) continue;

        const de = readDataEntry(base + langEntry.offset);
        const dataFileOff = rvaToFileOffset(de.rva, [rsrcSection]);

        if (typeEntry.id === RT_ICON) {
          // RT_ICON data is a BITMAPINFOHEADER (or PNG)
          const isPng = buf.readUInt32LE(dataFileOff) === 0x474e5089; // "\x89PNG"
          let w = 0, h = 0;
          if (isPng) {
            // PNG: width at offset 16, height at offset 20 (big-endian)
            w = buf.readUInt32BE(dataFileOff + 16);
            h = buf.readUInt32BE(dataFileOff + 20);
          } else {
            // BMP DIB header: biWidth at +4, biHeight at +8
            w = buf.readInt32LE(dataFileOff + 4);
            h = buf.readInt32LE(dataFileOff + 8) / 2; // biHeight is 2x for AND mask
          }
          icons.push({
            id: idEntry.id,
            fileOffset: dataFileOff,
            size: de.size,
            width: w,
            height: Math.abs(h),
            isPng,
          });
        } else {
          groupIcons.push({
            id: idEntry.id,
            fileOffset: dataFileOff,
            size: de.size,
          });
        }
      }
    }
  }
  return { icons, groupIcons };
}

/* ──────────── Generate replacement icon data ──────────── */

async function makeIconBmp(svgBuf, width, height, targetSize) {
  // Render SVG → raw RGBA at the required pixel size
  const rgba = await sharp(svgBuf)
    .resize(width, height)
    .ensureAlpha()
    .raw()
    .toBuffer();

  // Build a BITMAPINFOHEADER DIB (no file header — that's how RT_ICON stores it)
  const bihSize = 40;
  const pixelDataSize = width * height * 4;          // 32bpp BGRA
  const andMaskRowBytes = Math.ceil(width / 32) * 4; // 1bpp, DWORD-aligned
  const andMaskSize = andMaskRowBytes * height;
  const dibSize = bihSize + pixelDataSize + andMaskSize;

  const dib = Buffer.alloc(targetSize); // pad to exact target size

  // BITMAPINFOHEADER
  dib.writeUInt32LE(bihSize, 0);       // biSize
  dib.writeInt32LE(width, 4);          // biWidth
  dib.writeInt32LE(height * 2, 8);     // biHeight (2x for XOR + AND)
  dib.writeUInt16LE(1, 12);            // biPlanes
  dib.writeUInt16LE(32, 14);           // biBitCount
  dib.writeUInt32LE(0, 16);            // biCompression = BI_RGB
  dib.writeUInt32LE(pixelDataSize + andMaskSize, 20); // biSizeImage

  // XOR bitmap (BGRA, bottom-up row order)
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const srcIdx  = (y * width + x) * 4;
      const dstIdx  = bihSize + ((height - 1 - y) * width + x) * 4;
      dib[dstIdx + 0] = rgba[srcIdx + 2]; // B
      dib[dstIdx + 1] = rgba[srcIdx + 1]; // G
      dib[dstIdx + 2] = rgba[srcIdx + 0]; // R
      dib[dstIdx + 3] = rgba[srcIdx + 3]; // A
    }
  }

  // AND mask: all zeros (fully opaque — alpha channel handles transparency)
  // Already zero-filled by Buffer.alloc

  return dib;
}

async function makeIconPng(svgBuf, width, height, targetSize) {
  // Render to PNG, then pad/truncate to exact size
  let png = await sharp(svgBuf)
    .resize(width, height)
    .png({ compressionLevel: 9 })
    .toBuffer();

  if (png.length > targetSize) {
    // Try lower quality / fewer colors
    png = await sharp(svgBuf)
      .resize(width, height)
      .png({ compressionLevel: 9, colors: 64 })
      .toBuffer();
  }

  if (png.length > targetSize) {
    throw new Error(`PNG for ${width}x${height} is ${png.length} bytes, need ≤ ${targetSize}`);
  }

  // Pad with zeros to exact target size
  const padded = Buffer.alloc(targetSize);
  png.copy(padded);
  return padded;
}

/* ──────────── Main ──────────── */

async function main() {
  const exePath = path.join(__dirname, '../public/downloads/Onyx-Setup.exe');
  const svgPath = path.join(__dirname, '../src/app/icon.svg');
  const svgBuf  = fs.readFileSync(svgPath);

  console.log('Reading Onyx-Setup.exe …');
  const buf = fs.readFileSync(exePath);

  const pe = parsePe(buf);
  console.log('PE sections:');
  for (const s of pe.sections) {
    console.log(`  ${s.name.padEnd(10)} VA=0x${s.virtualAddr.toString(16)}  raw=0x${s.rawOffset.toString(16)}  size=${s.rawSize}`);
  }

  const rsrc = pe.sections.find(s => s.name === '.rsrc');
  if (!rsrc) throw new Error('No .rsrc section found');

  const { icons, groupIcons } = parseResourceDir(buf, rsrc);

  console.log(`\nFound ${icons.length} RT_ICON entries:`);
  for (const ic of icons) {
    console.log(`  ID=${ic.id}  ${ic.width}×${ic.height}  ${ic.size} bytes  ${ic.isPng ? 'PNG' : 'BMP'}  @0x${ic.fileOffset.toString(16)}`);
  }
  console.log(`Found ${groupIcons.length} RT_GROUP_ICON entries`);

  // Replace each icon in-place
  for (const ic of icons) {
    console.log(`\nReplacing icon ID=${ic.id} (${ic.width}×${ic.height}, ${ic.size} bytes) …`);
    let newData;
    if (ic.isPng) {
      newData = await makeIconPng(svgBuf, ic.width, ic.height, ic.size);
    } else {
      newData = await makeIconBmp(svgBuf, ic.width, ic.height, ic.size);
    }
    newData.copy(buf, ic.fileOffset);
    console.log(`  ✓ Written ${newData.length} bytes at offset 0x${ic.fileOffset.toString(16)}`);
  }

  fs.writeFileSync(exePath, buf);
  console.log(`\n✓ Saved patched file (${buf.length} bytes — size unchanged)`);
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
