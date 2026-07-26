const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Read the exe
const exePath = path.join(__dirname, '../public/downloads/Onyx-Setup.exe');
const buf = fs.readFileSync(exePath);

// The last 4 bytes are the stored CRC32
const dataToCrc = buf.subarray(0, buf.length - 4);
const storedCrc = buf.readUInt32LE(buf.length - 4);

// Compute new CRC32
// zlib.crc32 returns a 32-bit unsigned integer (or can be casted via >>> 0)
const newCrc = zlib.crc32(dataToCrc) >>> 0;

console.log('Original stored CRC:', storedCrc.toString(16));
console.log('Newly computed CRC :', newCrc.toString(16));

// Write the new CRC to the last 4 bytes
buf.writeUInt32LE(newCrc, buf.length - 4);

// Save back
fs.writeFileSync(exePath, buf);
console.log('Successfully updated NSIS CRC in the patched executable.');
