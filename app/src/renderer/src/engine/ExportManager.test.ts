import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportManager } from './ExportManager';
import { useAppStore } from '../store/useAppStore';

describe('ExportManager', () => {
    let mockEngine: any;
    let manager: ExportManager;

    beforeEach(() => {
        mockEngine = {
            update: vi.fn(),
            draw: vi.fn(),
            ctx: {
                canvas: {
                    toDataURL: vi.fn().mockReturnValue('data:image/jpeg;base64,dummy-data'),
                    width: 800,
                    height: 600
                }
            }
        };
        manager = new ExportManager(mockEngine);

        // Setup store
        useAppStore.setState({
            canvasWidth: 800,
            canvasHeight: 600,
            exportSettings: { 
                fps: 30, 
                resolution: '1080p',
                rangeType: 'whole',
                startTimeMs: 0,
                endTimeMs: 1000
            }
        });

        // Mock IPC
        vi.mocked(window.electron.ipcRenderer.invoke).mockResolvedValue(true);
    });

    it('should run a full export cycle', async () => {
        const durationMs = 1000; // 30 frames
        await manager.startExport(durationMs, 'audio.mp3', 0);

        expect(window.electron.ipcRenderer.invoke).toHaveBeenCalledWith('start-export', expect.objectContaining({
            fps: 30,
            totalFrames: 30,
            audioPath: 'audio.mp3'
        }));

        expect(mockEngine.update).toHaveBeenCalledTimes(30);
        expect(mockEngine.draw).toHaveBeenCalledTimes(30);
        expect(window.electron.ipcRenderer.invoke).toHaveBeenCalledWith('render-frame', expect.anything());
        expect(window.electron.ipcRenderer.invoke).toHaveBeenCalledWith('finish-export');
        
        expect(useAppStore.getState().isExporting).toBe(false);
    });

    it('should abort if start-export fails', async () => {
        vi.mocked(window.electron.ipcRenderer.invoke).mockResolvedValueOnce(false);
        
        await manager.startExport(1000);
        
        expect(mockEngine.update).not.toHaveBeenCalled();
        expect(useAppStore.getState().isExporting).toBe(false);
    });
});
