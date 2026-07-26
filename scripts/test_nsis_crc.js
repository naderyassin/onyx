const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const exePath = path.join(__dirname, '../public/downloads/Onyx-Setup.exe');
const buf = fs.readFileSync(exePath);

function getPeChecksumOffset(buf) {
  const e_lfanew = buf.readUInt32LE(0x3c);
  // Optional Header starts at e_lfanew + 24
  // Checksum is at offset 64 within Optional Header
  return e_lfanew + 24 + 64;
}

const checksumOff = getPeChecksumOffset(buf);

// Create a copy of the buffer up to the last 4 bytes
const data = Buffer.from(buf.subarray(0, buf.length - 4));

// Zero out the PE Checksum field for CRC calculation
data.writeUInt32LE(0, checksumOff);

const computedCrc = zlib.crc32(data) >>> 0;
const storedCrc = buf.readUInt32LE(buf.length - 4);

console.log('Stored CRC32   :', storedCrc.toString(16));
console.log('Computed CRC32 :', computedCrc.toString(16));
console.log('Match          :', storedCrc === computedCrc);
