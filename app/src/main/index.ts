import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  ipcMain.handle('save-project', async (_, projectData) => {
    const { filePath } = await dialog.showSaveDialog({ filters: [{ name: 'VVA', extensions: ['vva'] }] });
    if (!filePath) return false;

    try {
      console.log(`[MAIN] Starting project save to: ${filePath}`);
      const projectDir = join(filePath, '..');
      const assetsDirName = 'assets'; 
      const assetsPath = join(projectDir, assetsDirName);

      if (projectData.assets && projectData.assets.images) {
        console.log(`[MAIN] Processing ${Object.keys(projectData.assets.images).length} image assets...`);
        if (!fs.existsSync(assetsPath)) {
          fs.mkdirSync(assetsPath, { recursive: true });
        }

        for (const id in projectData.assets.images) {
          const asset = projectData.assets.images[id];
          if (asset.buffer) {
            let buffer: Buffer;
            
            // Handle structured-cloned Uint8Array or legacy serialized object
            if (asset.buffer instanceof Uint8Array) {
                buffer = Buffer.from(asset.buffer);
            } else if (typeof asset.buffer === 'object' && asset.buffer !== null) {
                const values = Object.values(asset.buffer);
                buffer = Buffer.from(values as number[]);
            } else {
                buffer = Buffer.from(asset.buffer);
            }

            let ext = 'png';
            if (asset.originalPath) {
                const parts = asset.originalPath.split('.');
                if (parts.length > 1) ext = parts[parts.length - 1];
            }
            
            const filename = `${id}.${ext}`;
            const fullAssetPath = join(assetsPath, filename);
            
            console.log(`[MAIN] Writing asset: ${filename} (${buffer.length} bytes)`);
            fs.writeFileSync(fullAssetPath, buffer);
            
            asset.relativePath = join(assetsDirName, filename);
            delete asset.buffer;
          }
        }
      }

      console.log(`[MAIN] Writing project file: ${filePath}`);
      fs.writeFileSync(filePath, JSON.stringify(projectData, null, 2));
      console.log(`[MAIN] Project saved successfully.`);
      return true;
    } catch (e) {
      console.error('[MAIN] Failed to save project with assets:', e);
      return false;
    }
  });

  function hydrateProjectAssets(projectData: any, projectDir: string) {
    if (projectData.assets && projectData.assets.images) {
      for (const id in projectData.assets.images) {
        const asset = projectData.assets.images[id];
        if (asset.relativePath) {
          const absoluteAssetPath = join(projectDir, asset.relativePath);
          if (fs.existsSync(absoluteAssetPath)) {
            const buffer = fs.readFileSync(absoluteAssetPath);
            asset.buffer = new Uint8Array(buffer);
          }
        }
      }
    }
    return projectData;
  }

  ipcMain.handle('load-project', async () => {
    const { filePaths } = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'VVA', extensions: ['vva'] }] });
    if (!filePaths || filePaths.length === 0) return null;

    const filePath = filePaths[0];
    const projectDir = join(filePath, '..');

    try {
      const jsonString = fs.readFileSync(filePath, 'utf-8');
      const projectData = JSON.parse(jsonString);
      hydrateProjectAssets(projectData, projectDir);
      return projectData; // Return the object directly
    } catch (e) {
      console.error('[MAIN] Failed to load project with assets:', e);
      return null;
    }
  });

  ipcMain.handle('read-vva-file', async (_, absolutePath) => {
    if (!fs.existsSync(absolutePath)) return null;
    try {
      const projectDir = join(absolutePath, '..');
      const jsonString = fs.readFileSync(absolutePath, 'utf-8');
      const projectData = JSON.parse(jsonString);
      hydrateProjectAssets(projectData, projectDir);
      return projectData; // Return the object directly
    } catch (e) {
      console.error('[MAIN] Failed to read-vva-file with assets:', e);
      return null;
    }
  });

  ipcMain.handle('select-audio-file', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav'] }]
    });

    if (canceled || filePaths.length === 0) return null;

    const absolutePath = filePaths[0];

    // Read to Buffer for safe IPC transmission to browser context
    const fileBuffer = fs.readFileSync(absolutePath);

    return {
      originalPath: absolutePath,
      buffer: fileBuffer
    };
  });

  ipcMain.handle('read-audio-file', async (_, absolutePath) => {
    if (!fs.existsSync(absolutePath)) return null;
    const fileBuffer = fs.readFileSync(absolutePath);
    return {
      originalPath: absolutePath,
      buffer: fileBuffer
    };
  });

  ipcMain.handle('select-image-file', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'png', 'svg', 'jpeg'] }]
    });

    if (canceled || filePaths.length === 0) return null;

    const absolutePath = filePaths[0];
    const fileBuffer = fs.readFileSync(absolutePath);

    return {
      originalPath: absolutePath,
      buffer: fileBuffer
    };
  });

  ipcMain.handle('fetch-osm-map', async (_, { location, layers }) => {
    const { spawn } = require('child_process');
    
    // In production, the path to resources might change
    const scriptPath = is.dev 
      ? join(__dirname, '../../resources/map_processor.py')
      : join(process.resourcesPath, 'app.asar.unpacked/resources/map_processor.py');

    console.log(`Executing OSM fetch: ${scriptPath} for ${location} (${layers})`);

    return new Promise((resolve) => {
      const py = spawn('python3', [scriptPath, location, layers.join(',')]);
      let stdout = '';
      let stderr = '';

      py.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      py.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      py.on('close', (code: number) => {
        if (code !== 0) {
          console.error(`OSM processor failed (code ${code}): ${stderr}`);
          resolve({ error: `Python process failed with code ${code}. ${stderr}` });
        } else {
          try {
            resolve(JSON.parse(stdout));
          } catch (e) {
            console.error(`Failed to parse OSM processor output: ${e}`);
            resolve({ error: `Malformed output from processor: ${stdout}` });
          }
        }
      });
    });
  });

  ipcMain.handle('fetch-image', async (_, { url }) => {
    try {
      console.log(`Executing fetch-image for: ${url}`);
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'VectorVibeAnimator/1.0',
          'Accept': 'image/png,image/jpeg,*/*'
        }
      });
      if (!response.ok) {
        return { error: `HTTP ${response.status} ${response.statusText}` };
      }
      const arrayBuffer = await response.arrayBuffer();
      // Pass as Uint8Array so it crosses IPC barrier cleanly
      return { buffer: new Uint8Array(arrayBuffer) };
    } catch (e: any) {
      console.error(`Failed to fetch image: ${e}`);
      return { error: e.message || 'Unknown fetch error' };
    }
  });

  // --- FFmpeg Export Handlers ---
  let ffmpegProcess: any = null;

  ipcMain.handle('start-export', async (_, { width, height, fps, totalFrames, audioPath, startTimeMs, durationMs }) => {
    console.log(`Starting export: ${width}x${height} @ ${fps}fps, ${totalFrames} frames, duration: ${durationMs}ms, offset: ${startTimeMs || 0}ms`);
    
    const { filePath } = await dialog.showSaveDialog({
      title: 'Save Exported Video',
      defaultPath: 'animation.mp4',
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
    });

    if (!filePath) return false;

    const { spawn } = require('child_process');
    
    // Command: ffmpeg -y -f image2pipe -vcodec mjpeg -r fps -i - [-i audioPath] -vcodec libx264 -pix_fmt yuv420p -r fps [-c:a aac -map 0:v:0 -map 1:a:0] output.mp4
    const ffmpegArgs = [
      '-y',
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-s', `${width}x${height}`,
      '-r', fps.toString(),
      '-i', '-',
    ];

    if (audioPath) {
      if (startTimeMs && startTimeMs > 0) {
        ffmpegArgs.push('-ss', (startTimeMs / 1000).toString());
      }
      ffmpegArgs.push('-i', audioPath);
    }

    ffmpegArgs.push(
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-r', fps.toString()
    );

    if (durationMs) {
      ffmpegArgs.push('-t', (durationMs / 1000).toString());
    }

    if (audioPath) {
      ffmpegArgs.push('-c:a', 'aac', '-map', '0:v:0', '-map', '1:a:0');
    }

    ffmpegArgs.push(filePath);

    ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

    ffmpegProcess.on('error', (err: any) => {
      console.error('FFmpeg error:', err);
    });

    ffmpegProcess.stderr.on('data', (data: Buffer) => {
      console.log(`FFmpeg: ${data.toString()}`);
    });

    return true;
  });

  ipcMain.handle('render-frame', async (_, { frameIndex, base64Data }) => {
    if (!ffmpegProcess) return false;

    const buffer = Buffer.from(base64Data, 'base64');
    
    return new Promise((resolve) => {
      const success = ffmpegProcess.stdin.write(buffer, (err: any) => {
        if (err) {
          console.error(`Frame ${frameIndex} write error:`, err);
          resolve(false);
        } else {
          resolve(true);
        }
      });
      
      if (!success) {
        ffmpegProcess.stdin.once('drain', () => resolve(true));
      }
    });
  });

  ipcMain.handle('finish-export', async () => {
    if (!ffmpegProcess) return false;

    return new Promise((resolve) => {
      ffmpegProcess.stdin.end();
      ffmpegProcess.on('close', (code: number) => {
        console.log(`FFmpeg process finished with code ${code}`);
        ffmpegProcess = null;
        resolve(code === 0);
      });
    });
  });

  // --- Detached Preview Window Management ---
  let detachedPreviewWindow: BrowserWindow | null = null;

  ipcMain.on('window:toggle-detached-preview', (event) => {
    if (detachedPreviewWindow) {
      detachedPreviewWindow.close();
      return;
    }

    const mainWindow = BrowserWindow.fromWebContents(event.sender);
    if (!mainWindow) return;

    detachedPreviewWindow = new BrowserWindow({
      width: 1080 / 2, // Default preview size
      height: 1080 / 2,
      show: false,
      autoHideMenuBar: true,
      title: 'Vector Vibe Preview',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    });

    detachedPreviewWindow.on('ready-to-show', () => {
      detachedPreviewWindow?.show();
      
      // Initialize MessagePort communication between windows
      const { port1, port2 } = new (require('electron').MessageChannelMain)();
      
      // Send port1 to Main Window
      mainWindow.webContents.postMessage('window:setup-port', null, [port1]);
      
      // Send port2 to Detached Window
      detachedPreviewWindow?.webContents.postMessage('window:setup-port', null, [port2]);

      // Notify Main Window that preview is active
      mainWindow.webContents.send('window:detached-active', true);
    });

    detachedPreviewWindow.on('closed', () => {
      detachedPreviewWindow = null;
      // Notify Main Window that preview is closed
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('window:detached-active', false);
      }
    });

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      detachedPreviewWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?mode=preview`);
    } else {
      detachedPreviewWindow.loadFile(join(__dirname, '../renderer/index.html'), { query: { mode: 'preview' } });
    }
  });


  // Check for CLI arguments for Player Mode
  // Expected: --player --file /path/to/project.vva --fmin 20 --fmax 500 ...
  const args = process.argv;
  const isPlayerFlag = args.includes('--player');
  const fileArgIdx = args.indexOf('--file');
  const playerFile = fileArgIdx !== -1 ? args[fileArgIdx + 1] : null;

  if (isPlayerFlag && playerFile) {
    createPlayerWindow(playerFile, args);
  } else {
    createWindow();
  }

  function createPlayerWindow(filePath: string, allArgs: string[]): void {
      const playerWindow = new BrowserWindow({
          fullscreen: true,
          autoHideMenuBar: true,
          webPreferences: {
              preload: join(__dirname, '../preload/index.js'),
              sandbox: false
          }
      });

      // Extract extra params from args to pass via URL
      const extraParams = new URLSearchParams();
      extraParams.set('mode', 'player');
      extraParams.set('file', filePath);
      
      const paramKeys = ['fmin', 'fmax', 'amin', 'amax'];
      paramKeys.forEach(key => {
          const idx = allArgs.indexOf(`--${key}`);
          if (idx !== -1) extraParams.set(key, allArgs[idx + 1]);
      });

      if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
          playerWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?${extraParams.toString()}`);
      } else {
          playerWindow.loadFile(join(__dirname, '../renderer/index.html'), { query: Object.fromEntries(extraParams.entries()) });
      }
  }

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
