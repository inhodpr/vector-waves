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

  ipcMain.handle('save-project', async (_, jsonString) => {
    const { filePath } = await dialog.showSaveDialog({ filters: [{ name: 'VVA', extensions: ['vva'] }] });
    if (filePath) {
      fs.writeFileSync(filePath, jsonString);
      return true;
    }
    return false;
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

  ipcMain.handle('load-project', async () => {
    const { filePaths } = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'VVA', extensions: ['vva'] }] });
    if (filePaths && filePaths.length > 0) {
      return fs.readFileSync(filePaths[0], 'utf-8');
    }
    return null;
  });

  // --- FFmpeg Export Handlers ---
  let ffmpegProcess: any = null;

  ipcMain.handle('start-export', async (_, { width, height, fps, totalFrames }) => {
    console.log(`Starting export: ${width}x${height} @ ${fps}fps, ${totalFrames} frames`);
    
    const { filePath } = await dialog.showSaveDialog({
      title: 'Save Exported Video',
      defaultPath: 'animation.mp4',
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
    });

    if (!filePath) return false;

    const { spawn } = require('child_process');
    
    // Command: ffmpeg -y -f image2pipe -vcodec mjpeg -i - -vcodec libx264 -pix_fmt yuv420p output.mp4
    ffmpegProcess = spawn('ffmpeg', [
      '-y',
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-r', fps.toString(),
      '-i', '-',
      '-vcodec', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-r', fps.toString(),
      filePath
    ]);

    ffmpegProcess.on('error', (err: any) => {
      console.error('FFmpeg error:', err);
    });

    ffmpegProcess.stderr.on('data', () => {
      // console.log(`FFmpeg output received`);
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

  createWindow()

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
