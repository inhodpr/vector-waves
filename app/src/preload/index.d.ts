import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    fileSystemAPI: {
      saveProject: (data: string) => Promise<boolean>
      loadProject: () => Promise<string | null>
    }
    audioAPI: {
      selectTrack: () => Promise<{ originalPath: string; buffer: Uint8Array } | null>
    }
    imageAPI: {
      selectImage: () => Promise<{ originalPath: string; buffer: Uint8Array } | null>
    }
  }
}
