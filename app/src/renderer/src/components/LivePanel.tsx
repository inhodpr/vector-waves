import React, { useEffect, useState, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { LiveAudioAdapter } from '../engine/LiveAudioAdapter';

interface LivePanelProps {
    adapter: LiveAudioAdapter;
}

export const LivePanel: React.FC<LivePanelProps> = ({ adapter }) => {
    const liveMode = useAppStore(state => state.liveMode);
    const setLiveMode = useAppStore(state => state.setLiveMode);
    const audioInputDeviceId = useAppStore(state => state.audioInputDeviceId);
    const setAudioInputDeviceId = useAppStore(state => state.setAudioInputDeviceId);
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [volume, setVolume] = useState(0);

    const entities = useAppStore(state => state.entities);
    const updateVibrationAnim = useAppStore(state => state.updateVibrationAnim);

    useEffect(() => {
        navigator.mediaDevices.enumerateDevices().then(d => {
            setDevices(d.filter(device => device.kind === 'audioinput'));
        });
    }, []);

    useEffect(() => {
        let interval: any;
        if (liveMode) {
            adapter.start(audioInputDeviceId || undefined);
            interval = setInterval(() => {
                const vol = adapter.getVolume();
                setVolume(vol);

                // Check triggers for all entities
                const state = useAppStore.getState();
                const nowMs = adapter.getCurrentTimeMs();

                Object.values(state.entities).forEach(entity => {
                    if (entity.type === 'Line' && entity.animations) {
                        entity.animations.forEach(anim => {
                            if (anim.trigger?.type === 'Reactive') {
                                const threshold = anim.trigger.threshold || 50;
                                const band = anim.trigger.frequencyBand || 'Full';
                                
                                let currentVal = 0;
                                if (band === 'Full') currentVal = vol;
                                else if (band === 'Bass') currentVal = adapter.getBandVolume(20, 250);
                                else if (band === 'Mid') currentVal = adapter.getBandVolume(250, 4000);
                                else if (band === 'Treble') currentVal = adapter.getBandVolume(4000, 20000);

                                const triggers = anim.activeTriggers || [];
                                // Clean up old triggers
                                const activeTriggers = triggers.filter(t => nowMs - t.timestampMs < 2000);
                                
                                if (currentVal > threshold) {
                                    const lastTrigger = activeTriggers.length > 0 
                                        ? activeTriggers[activeTriggers.length - 1].timestampMs 
                                        : 0;

                                    // Faster refractory period for multi-wave density
                                    if (nowMs - lastTrigger > 100) {
                                        updateVibrationAnim(entity.id, anim.id, {
                                            activeTriggers: [
                                                ...activeTriggers,
                                                { timestampMs: nowMs, intensity: currentVal / 255 }
                                            ]
                                        });
                                    } else if (activeTriggers.length !== triggers.length) {
                                        // Still update if we just cleaned up, even if we didn't add a new one
                                        updateVibrationAnim(entity.id, anim.id, { activeTriggers });
                                    }
                                } else if (activeTriggers.length !== triggers.length) {
                                    // Just cleanup
                                    updateVibrationAnim(entity.id, anim.id, { activeTriggers });
                                }
                            }
                        });
                    }
                });
            }, 50); // 20fps for trigger checks is enough
        } else {
            adapter.stop();
            setVolume(0);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [liveMode, audioInputDeviceId]);

    return (
        <div style={{ padding: '16px', background: '#f0f0f0', borderBottom: '1px solid #ccc' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
                <h3 style={{ margin: 0 }}>Live Mode</h3>
                <button
                    onClick={() => setLiveMode(!liveMode)}
                    style={{
                        padding: '8px 16px',
                        background: liveMode ? '#f44336' : '#4CAF50',
                        color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'
                    }}
                >
                    {liveMode ? 'Stop Live' : 'Start Live'}
                </button>
            </div>

            {liveMode && (
                <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                    <div>
                        <label style={{ fontSize: '12px', display: 'block' }}>Input Device</label>
                        <select
                            value={audioInputDeviceId || ''}
                            onChange={e => setAudioInputDeviceId(e.target.value)}
                            style={{ padding: '4px' }}
                        >
                            <option value="">Default Microphone</option>
                            {devices.map(d => (
                                <option key={d.deviceId} value={d.deviceId}>{d.label || `Device ${d.deviceId.slice(0, 5)}`}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '12px', display: 'block' }}>Signal Intensity</label>
                        <div style={{ width: '100%', height: '10px', background: '#ddd', borderRadius: '5px', overflow: 'hidden' }}>
                            <div style={{ width: `${(volume / 255) * 100}%`, height: '100%', background: '#2196F3', transition: 'width 0.1s' }} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
