/**
 * Refreshes latest.yml's checksum after the icon-patch + CRC-fix scripts
 * mutate Onyx-Setup.exe in place. electron-updater rejects an update whose
 * downloaded file doesn't match this checksum, so it must reflect the final,
 * patched bytes — not the pre-patch build electron-builder computed it from.
 *
 * Run after: electron-builder --win, patch_exe_with_overlay.js, update_nsis_crc.js.
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
