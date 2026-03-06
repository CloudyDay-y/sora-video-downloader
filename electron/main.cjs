const { app, BrowserWindow } = require('electron');
const path = require('node:path');

let win;

function getResourcePath(...parts) {
  const base = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked')
    : path.join(__dirname, '..');
  return path.join(base, ...parts);
}

function createWindow() {
  win = new BrowserWindow({
    width: 980,
    height: 760,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });

  loadWithRetry();
}

async function loadWithRetry(retries = 15) {
  for (let i = 0; i < retries; i++) {
    try {
      await win.loadURL('http://localhost:5178');
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  win.loadURL('http://localhost:5178');
}

app.whenReady().then(async () => {
  // 直接在主进程中启动 server（不 spawn 子进程）
  const rootDir = getResourcePath();
  const server = require(getResourcePath('server', 'index.cjs'));
  await server.startServer(rootDir);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
