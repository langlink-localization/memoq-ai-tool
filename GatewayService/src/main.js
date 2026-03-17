const path = require('path');
const { app, BrowserWindow } = require('electron');

function resolveSourceModule(moduleName) {
  const sourceRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'src')
    : __dirname;
  return require(path.join(sourceRoot, moduleName));
}

const { createGatewayServer } = resolveSourceModule('server');
const { loadConfig } = resolveSourceModule('config');
const { buildGatewayBaseUrl } = resolveSourceModule('rendererLocation');

let mainWindow;
const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
}

function createWindow(port, host) {
  const gatewayBaseUrl = buildGatewayBaseUrl(host, port);
  const rendererDevServerUrl = typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined'
    ? MAIN_WINDOW_VITE_DEV_SERVER_URL
    : null;
  const rendererName = typeof MAIN_WINDOW_VITE_NAME !== 'undefined'
    ? MAIN_WINDOW_VITE_NAME
    : 'main_window';

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1040,
    minHeight: 720,
    title: 'memoQ AI Gateway',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (rendererDevServerUrl) {
    const rendererUrl = new URL(rendererDevServerUrl);
    rendererUrl.searchParams.set('gatewayBaseUrl', gatewayBaseUrl);
    mainWindow.loadURL(rendererUrl.toString());
    return;
  }

  mainWindow.loadFile(path.join(__dirname, `../renderer/${rendererName}/index.html`), {
    query: {
      gatewayBaseUrl,
    },
  });
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  app.setAppUserModelId('memoq-ai-gateway');
  const config = loadConfig();
  const gateway = await createGatewayServer();
  const server = gateway.app.listen(config.port, config.host, () => {
    createWindow(config.port, config.host);
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(config.port, config.host);
    }
  });

  app.on('before-quit', () => {
    server.close();
    gateway.cleanup();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
