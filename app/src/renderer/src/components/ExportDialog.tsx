import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { ExportManager } from '../engine/ExportManager';

interface ExportDialogProps {
    onClose: () => void;
    engine: any;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({ onClose, engine }) => {
    const isExporting = useAppStore(state => state.isExporting);
    const exportProgress = useAppStore(state => state.exportProgress);
    const exportSettings = useAppStore(state => state.exportSettings);
    const setExportSettings = useAppStore(state => state.setExportSettings);
    const audioTracks = useAppStore(state => state.audio.tracks);

    const handleExport = async () => {
        if (!engine) return;
        
        // Use total length of first audio track or 10s default
        const durationMs = audioTracks.length > 0 ? 10000 : 5000; // Mock duration for now
        
        const manager = new ExportManager(engine);
        await manager.startExport(durationMs);
        if (!useAppStore.getState().isExporting) {
            onClose();
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center',
            zIndex: 1000
        }}>
            <div style={{
                backgroundColor: 'white', padding: '24px', borderRadius: '8px', width: '400px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
            }}>
                <h2 style={{ margin: '0 0 16px 0' }}>Export MP4</h2>
                
                {!isExporting ? (
                    <>
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Resolution</label>
                            <select 
                                value={exportSettings.resolution}
                                onChange={(e) => setExportSettings({ resolution: e.target.value as any })}
                                style={{ width: '100%', padding: '8px' }}
                            >
                                <option value="1080p">High (1080p)</option>
                                <option value="720p">Low (720p)</option>
                            </select>
                        </div>

                        <div style={{ marginBottom: '24px' }}>
                            <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>FPS ({exportSettings.fps})</label>
                            <input 
                                type="range" min="24" max="60" step="1"
                                value={exportSettings.fps}
                                onChange={(e) => setExportSettings({ fps: parseInt(e.target.value) })}
                                style={{ width: '100%' }}
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button onClick={onClose} style={{ padding: '8px 16px', background: '#eee', border: 'none', borderRadius: '4px' }}>Cancel</button>
                            <button onClick={handleExport} style={{ padding: '8px 16px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px' }}>Start Export</button>
                        </div>
                    </>
                ) : (
                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                        <p>Exporting Video... {Math.round(exportProgress * 100)}%</p>
                        <div style={{ width: '100%', height: '8px', background: '#eee', borderRadius: '4px', overflow: 'hidden', marginTop: '12px' }}>
                            <div style={{ width: `${exportProgress * 100}%`, height: '100%', background: '#4CAF50', transition: 'width 0.1s' }} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
