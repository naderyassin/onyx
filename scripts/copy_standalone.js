const fs = require('fs');
const path = require('path');

function copyRecursiveSync(src, dest, skip = []) {
  if (fs.existsSync(src)) {
    const stats = fs.statSync(src);
    const isDirectory = stats.isDirectory();
    if (isDirectory) {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
      fs.readdirSync(src).forEach((child) => {
        if (skip.includes(child)) return;
        copyRecursiveSync(path.join(src, child), path.join(dest, child));
      });
    } else {
      fs.copyFileSync(src, dest);
    }
  }
}

const standaloneDir = path.join(__dirname, '../.next/standalone');
if (fs.existsSync(standaloneDir)) {
  console.log('Copying public folder to standalone...');
  // Skip "downloads" — that's electron-builder's OWN output directory (see
  // package.json directories.output), not a public asset. Copying it in
  // would bundle the previous build's installer into this one, compounding
  // in size on every rebuild.
  copyRecursiveSync(path.join(__dirname, '../public'), path.join(standaloneDir, 'public'), ['downloads']);
  
  console.log('Copying .next/static folder to standalone...');
  copyRecursiveSync(path.join(__dirname, '../.next/static'), path.join(standaloneDir, '.next/static'));
  
  console.log('Standalone files copied successfully.');
} else {
  console.error('Standalone directory not found!');
}
