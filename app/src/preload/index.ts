import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('fileSystemAPI', {
      saveProject: (data: string) => ipcRenderer.invoke('save-project', data),
      loadProject: () => ipcRenderer.invoke('load-project')
    })
    contextBridge.exposeInMainWorld('audioAPI', {
      selectTrack: () => ipcRenderer.invoke('select-audio-file')
    })
    contextBridge.exposeInMainWorld('imageAPI', {
      selectImage: () => ipcRenderer.invoke('select-image-file')
    })
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.fileSystemAPI = {
    saveProject: (data: string) => ipcRenderer.invoke('save-project', data),
    loadProject: () => ipcRenderer.invoke('load-project')
  }
  // @ts-ignore (define in dts)
  window.audioAPI = {
    selectTrack: () => ipcRenderer.invoke('select-audio-file')
  }
  // @ts-ignore (define in dts)
  window.imageAPI = {
    selectImage: () => ipcRenderer.invoke('select-image-file')
  }
}
