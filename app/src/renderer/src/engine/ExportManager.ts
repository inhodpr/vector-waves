import { useAppStore } from '../store/useAppStore';
import { CanvasEngine } from './CanvasEngine';

export class ExportManager {
    constructor(private engine: CanvasEngine) {}

    public async startExport(durationMs: number) {
        const state = useAppStore.getState();
        const { fps } = state.exportSettings;
        const totalFrames = Math.ceil((durationMs / 1000) * fps);
        const frameTimeMs = 1000 / fps;

        useAppStore.getState().startExport();

        // 1. Tell main process to start FFmpeg
        const success = await (window as any).electron.ipcRenderer.invoke('start-export', {
            width: state.canvasWidth,
            height: state.canvasHeight,
            fps: fps,
            totalFrames: totalFrames
        });

        if (!success) {
            useAppStore.getState().finishExport();
            return;
        }

        // 2. Headless Render Loop
        for (let i = 0; i < totalFrames; i++) {
            const currentMs = i * frameTimeMs;
            
            // Step the engine
            this.engine.update(currentMs);
            this.engine.draw();

            // Capture frame from canvas
            const canvas = (this.engine as any).ctx.canvas;
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            const base64Data = dataUrl.replace(/^data:image\/jpeg;base64,/, '');

            // Send to main process
            await (window as any).electron.ipcRenderer.invoke('render-frame', {
                frameIndex: i,
                base64Data: base64Data
            });

            useAppStore.getState().updateExportProgress((i + 1) / totalFrames);
        }

        // 3. Finalize
        await (window as any).electron.ipcRenderer.invoke('finish-export');
        useAppStore.getState().finishExport();
    }
}
