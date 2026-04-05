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
        if (liveMode) {
            adapter.start(audioInputDeviceId || undefined).then(() => {
                // Initial sync of triggers
                syncTriggers();
            });

            // Listen for peak events from the worklet (SAB ring buffer)
            const handlePeak = (event: { slotId: string, intensity: number, timestampMs: number }) => {
                const state = useAppStore.getState();
                const entity = state.entities[event.slotId.split('-')[0]]; // slotId is format `${entityId}-${animId}`
                const animId = event.slotId.split('-')[1];

                if (entity && entity.type === 'Line' && entity.animations) {
                    const anim = entity.animations.find(a => a.id === animId);
                    if (anim) {
                        const triggers = anim.activeTriggers || [];
                        const activeTriggers = triggers.filter(t => event.timestampMs - t.timestampMs < 2000);
                        
                        updateVibrationAnim(entity.id, anim.id, {
                            activeTriggers: [
                                ...activeTriggers,
                                { timestampMs: event.timestampMs, intensity: event.intensity }
                            ]
                        });
                    }
                }
            };

            adapter.onPeakDetected(handlePeak);

            // Level monitoring for the UI bar (using legacy analyzer for smooth visual)
            const interval = setInterval(() => {
                setVolume(adapter.getVolume());
            }, 50);

            return () => {
                clearInterval(interval);
                adapter.stop();
            };
        } else {
            adapter.stop();
            setVolume(0);
        }
        return undefined;
    }, [liveMode, audioInputDeviceId]);

    // Sync triggers whenever entities change
    useEffect(() => {
        if (liveMode) {
            syncTriggers();
        }
    }, [entities, liveMode]);

    const syncTriggers = () => {
        const configs: any[] = [];
        Object.values(entities).forEach(entity => {
            if (entity.type === 'Line' && entity.animations) {
                entity.animations.forEach(anim => {
                    if (anim.trigger?.type === 'Reactive') {
                        configs.push({
                            id: `${entity.id}-${anim.id}`,
                            band: anim.trigger.frequencyBand || 'Full',
                            threshold: anim.trigger.threshold || 50,
                            refractory: 30 // Hard-coded lower refractory for now, or use a setting
                        });
                    }
                });
            }
        });
        adapter.updateTriggers(configs);
    };

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
