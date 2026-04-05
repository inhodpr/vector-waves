import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { ExportManager } from '../engine/ExportManager';
import { TimelineManager } from '../engine/TimelineManager';

interface ExportDialogProps {
    onClose: () => void;
    engine: any;
    timelineManager: TimelineManager;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({ onClose, engine, timelineManager }) => {
    const isExporting = useAppStore(state => state.isExporting);
    const exportProgress = useAppStore(state => state.exportProgress);
    const exportSettings = useAppStore(state => state.exportSettings);
    const setExportSettings = useAppStore(state => state.setExportSettings);
    const audioTracks = useAppStore(state => state.audio.tracks);
    const setLiveMode = useAppStore(state => state.setLiveMode);

    React.useEffect(() => {
        // Initialize range to full duration if it's currently at defaults
        const durationMs = timelineManager.getDurationMs() || 5000;
        if (exportSettings.startTimeMs === 0 && (exportSettings.endTimeMs === 0 || exportSettings.endTimeMs === 5000)) {
            setExportSettings({ endTimeMs: durationMs });
        }
    }, [timelineManager, setExportSettings]);

    const handleExport = async () => {
        if (!engine) return;
        
        const audioTrack = audioTracks[0];
        const animationDurationMs = timelineManager.getDurationMs() || 5000;
        
        let startTimeMs = 0;
        let durationMs = animationDurationMs;

        if (exportSettings.rangeType === 'range') {
            startTimeMs = exportSettings.startTimeMs;
            durationMs = exportSettings.endTimeMs - exportSettings.startTimeMs;
        }

        // Final safety check
        if (durationMs <= 0) {
            alert("Invalid range: End time must be greater than start time.");
            return;
        }
        
        const manager = new ExportManager(engine);
        await manager.startExport(durationMs, audioTrack?.path, startTimeMs);
        if (!useAppStore.getState().isExporting) {
            onClose();
        }
    };

    const maxDurationS = (timelineManager.getDurationMs() || 5000) / 1000;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center',
            zIndex: 1000
        }}>
            <div style={{
                backgroundColor: 'white', padding: '24px', borderRadius: '8px', width: '450px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
            }}>
                <h2 style={{ margin: '0 0 16px 0' }}>Export MP4</h2>
                
                {!isExporting ? (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Resolution</label>
                                <select 
                                    value={exportSettings.resolution}
                                    onChange={(e) => setExportSettings({ resolution: e.target.value as any })}
                                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                                >
                                    <option value="1080p">High (1080p)</option>
                                    <option value="720p">Low (720p)</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>FPS ({exportSettings.fps})</label>
                                <input 
                                    type="range" min="24" max="60" step="1"
                                    value={exportSettings.fps}
                                    onChange={(e) => setExportSettings({ fps: parseInt(e.target.value) })}
                                    style={{ width: '100%', accentColor: '#4CAF50' }}
                                />
                            </div>
                        </div>

                        <div style={{ marginBottom: '24px', padding: '16px', background: '#f9f9f9', borderRadius: '8px', border: '1px solid #eee' }}>
                            <label style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', marginBottom: '12px' }}>Export Range</label>
                            
                            <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
                                    <input 
                                        type="radio" 
                                        checked={exportSettings.rangeType === 'whole'} 
                                        onChange={() => setExportSettings({ rangeType: 'whole' })}
                                    />
                                    Whole Animation
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
                                    <input 
                                        type="radio" 
                                        checked={exportSettings.rangeType === 'range'} 
                                        onChange={() => setExportSettings({ rangeType: 'range' })}
                                    />
                                    Custom Range
                                </label>
                            </div>

                            {exportSettings.rangeType === 'range' && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '12px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Start Time (s)</label>
                                        <input 
                                            type="number" step="0.1" min="0" max={maxDurationS}
                                            value={exportSettings.startTimeMs / 1000}
                                            onChange={(e) => setExportSettings({ startTimeMs: Math.max(0, parseFloat(e.target.value) * 1000) })}
                                            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>End Time (s)</label>
                                        <input 
                                            type="number" step="0.1" min="0" max={maxDurationS}
                                            value={exportSettings.endTimeMs / 1000}
                                            onChange={(e) => setExportSettings({ endTimeMs: Math.min(maxDurationS * 1000, parseFloat(e.target.value) * 1000) })}
                                            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button onClick={onClose} style={{ padding: '8px 16px', background: '#eee', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                            <button 
                                onClick={handleExport} 
                                disabled={exportSettings.rangeType === 'range' && exportSettings.startTimeMs >= exportSettings.endTimeMs}
                                style={{ 
                                    padding: '8px 16px', 
                                    background: (exportSettings.rangeType === 'range' && exportSettings.startTimeMs >= exportSettings.endTimeMs) ? '#ccc' : '#4CAF50', 
                                    color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' 
                                }}
                            >
                                Start Export
                            </button>
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
