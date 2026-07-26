const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Read the PATCHED file
const exePath = path.join(__dirname, '../public/downloads/Onyx-Setup.exe');
const buf = fs.readFileSync(exePath);

// Find NSIS firstheader
const magic = Buffer.from([
  0xef,0xbe,0xad,0xde, 0x4e,0x75,0x6c,0x6c,
  0x73,0x6f,0x66,0x74, 0x49,0x6e,0x73,0x74
]);
const sigIdx = buf.indexOf(magic);
const firstheaderOffset = sigIdx - 4;

// Read the ACTUAL flags field (uint32 at firstheader start)
const flags = buf.readUInt32LE(firstheaderOffset);
console.log('Flags (hex):', flags.toString(16));
console.log('FH_FLAGS_CRC (bit 0):', (flags & 1) !== 0 ? 'ENABLED' : 'disabled');
console.log('FH_FLAGS_UNINSTALL (bit 1):', (flags & 2) !== 0);
console.log('FH_FLAGS_SILENT (bit 2):', (flags & 4) !== 0);

// Check CRC in last 4 bytes
const storedCrc = buf.readUInt32LE(buf.length - 4);
const computedCrc = zlib.crc32(buf.subarray(0, buf.length - 4));
console.log('\nStored  CRC32:', storedCrc.toString(16));
console.log('Computed CRC32:', (computedCrc >>> 0).toString(16));
console.log('CRC match:', storedCrc === (computedCrc >>> 0));
