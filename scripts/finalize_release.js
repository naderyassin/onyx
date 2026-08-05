/**
 * Refreshes latest.yml's checksum from the actual built Onyx-Setup.exe.
 * electron-updater rejects an update whose downloaded file doesn't match
 * this checksum.
 *
 * Run after: electron-builder --win.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const yaml = require('js-yaml');

const outDir = path.join(__dirname, '../public/downloads');
const exePath = path.join(outDir, 'Onyx-Setup.exe');
const yamlPath = path.join(outDir, 'latest.yml');

const buf = fs.readFileSync(exePath);
const sha512 = crypto.createHash('sha512').update(buf).digest('base64');
const size = buf.length;

const doc = yaml.load(fs.readFileSync(yamlPath, 'utf8'));
doc.sha512 = sha512;
if (Array.isArray(doc.files)) {
  for (const f of doc.files) {
    f.sha512 = sha512;
    f.size = size;
  }
}
fs.writeFileSync(yamlPath, yaml.dump(doc));
console.log(`latest.yml refreshed: sha512=${sha512.slice(0, 16)}… size=${size}`);
