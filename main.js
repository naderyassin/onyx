const { app, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');
const http = require('http');

let mainWindow;
let nextProcess;

// Native get-port implementation
function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

// Native wait-on implementation
function waitForServer(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      if (Date.now() - startTime > timeout) {
        clearInterval(interval);
        reject(new Error(`Timeout waiting for ${url}`));
        return;
      }
      
      const req = http.get(url, (res) => {
        if (res.statusCode === 200 || res.statusCode === 404) { // Next.js returns 404 for root sometimes if no index, but it means server is up
          clearInterval(interval);
          resolve();
        }
      });
      
      req.on('error', () => {
        // Ignore error and try again
      });
      
      req.end();
    }, 500);
  });
}

async function createWindow() {
  try {
    const port = await getAvailablePort();
    console.log(`Starting Next.js on port ${port}...`);
    
    const isDev = !app.isPackaged;
    const serverPath = isDev 
      ? path.join(__dirname, 'node_modules', 'next', 'dist', 'bin', 'next')
      : path.join(__dirname, '.next', 'standalone', 'server.js');
    
    const env = { 
      ...process.env, 
      PORT: port.toString(),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: isDev ? 'development' : 'production'
    };

    const binDir = isDev 
      ? path.join(__dirname, 'bin')
      : path.join(process.resourcesPath, 'bin');
    
    env.PATH = `${binDir};${process.env.PATH}`;
    env.YT_DLP_PATH = path.join(binDir, 'yt-dlp.exe');
    env.FFMPEG_PATH = path.join(binDir, 'ffmpeg.exe');

    if (isDev) {
      nextProcess = spawn('node', [serverPath, 'dev', '-p', port.toString()], { env, stdio: 'inherit' });
    } else {
      nextProcess = spawn('node', [serverPath], { env, stdio: 'ignore', cwd: __dirname, windowsHide: true });
    }

    const appUrl = `http://127.0.0.1:${port}`;
    console.log(`Waiting for server at ${appUrl}...`);
    
    await waitForServer(appUrl);
    console.log('Server is ready!');

    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      title: 'Onyx',
      icon: path.join(__dirname, 'public', 'favicon.ico'),
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    mainWindow.loadURL(appUrl);
    
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  } catch (err) {
    console.error('Failed to start application:', err);
    app.quit();
  }
}

app.whenReady().then(() => {
  createWindow();
  // Dev builds have no app-update.yml (electron-builder only writes it into
  // a packaged app), so checking there just logs a harmless "not packaged" error.
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
  }
});

app.on('window-all-closed', () => {
  if (nextProcess) {
    nextProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  if (nextProcess) {
    nextProcess.kill();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
