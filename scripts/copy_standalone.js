const fs = require('fs');
const path = require('path');

function copyRecursiveSync(src, dest) {
  if (fs.existsSync(src)) {
    const stats = fs.statSync(src);
    const isDirectory = stats.isDirectory();
    if (isDirectory) {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
      fs.readdirSync(src).forEach((child) => {
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
  copyRecursiveSync(path.join(__dirname, '../public'), path.join(standaloneDir, 'public'));
  
  console.log('Copying .next/static folder to standalone...');
  copyRecursiveSync(path.join(__dirname, '../.next/static'), path.join(standaloneDir, '.next/static'));
  
  console.log('Standalone files copied successfully.');
} else {
  console.error('Standalone directory not found!');
}
