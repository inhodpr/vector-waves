import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { LineEntity } from '../store/types';
import { ProjectSettings } from './ProjectSettings';
import { TimeMath } from '../utils/timeMath';

interface PropertiesPanelProps { }

export const PropertiesPanel: React.FC<PropertiesPanelProps> = () => {
    const selectedEntityId = useAppStore(state => state.selectedEntityId);
    const activeEntity = useAppStore(state =>
        selectedEntityId ? state.entities[selectedEntityId] : null
    );

    const updateEntityStyle = useAppStore(state => state.updateEntityStyle);
    const audioMarkers = useAppStore(state => state.audio.markers);
    
    // TL REQUIREMENT: Sorted markers for dropdown stability
    const sortedMarkers = [...audioMarkers].sort((a, b) => a.timestampMs - b.timestampMs);

    const addVibrationAnim = useAppStore(state => state.addVibrationAnim);
    const updateVibrationAnim = useAppStore(state => state.updateVibrationAnim);
    const removeVibrationAnim = useAppStore(state => state.removeVibrationAnim);
    const deleteEntity = useAppStore(state => state.deleteEntity);

    if (!activeEntity || activeEntity.type !== 'Line') {
        return (
            <div style={{ width: '300px', backgroundColor: '#e0e0e0', borderLeft: '1px solid #ccc', overflowY: 'auto' }}>
                <ProjectSettings />
            </div>
        );
    }

    return (
        <div style={{ width: '300px', backgroundColor: '#e0e0e0', borderLeft: '1px solid #ccc', padding: '16px', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Properties</h3>

            <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Stroke Color</label>
                <input
                    type="color"
                    value={activeEntity.style.strokeColor}
                    onChange={(e) => updateEntityStyle(activeEntity.id, { strokeColor: e.target.value })}
                />
            </div>

            <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Stroke Width ({activeEntity.style.strokeWidth}px)</label>
                <input
                    type="range"
                    min="1" max="50"
                    value={activeEntity.style.strokeWidth}
                    onChange={(e) => updateEntityStyle(activeEntity.id, { strokeWidth: parseInt(e.target.value) })}
                    style={{ width: '100%' }}
                />
            </div>

            <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Corner Radius ({activeEntity.style.globalRadius}px)</label>
                <input
                    type="range"
                    min="0" max="200"
                    value={activeEntity.style.globalRadius}
                    onChange={(e) => updateEntityStyle(activeEntity.id, { globalRadius: parseInt(e.target.value) })}
                    style={{ width: '100%' }}
                />
            </div>

            {/* AnimStack Panel Area */}
            <div style={{ borderTop: '1px solid #ccc', paddingTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px' }}>Vibrations</h3>
                    <button
                        onClick={() => {
                            addVibrationAnim(activeEntity.id, {
                                id: `anim_${Date.now()}`,
                                startMarkerId: audioMarkers.length > 0 ? audioMarkers[0].id : '',
                                frequency: Number((0.9 + Math.random() * 1.0).toFixed(2)),
                                amplitude: Math.round(8 + Math.random() * 7),
                                edgeDamping: 20,
                                durationMs: 1000,
                                easing: 'Exponential'
                            });
                        }}
                        style={{ padding: '4px 8px', background: '#2196F3', color: 'white', border: 'none', borderRadius: '4px' }}
                    >
                        + Add
                    </button>
                </div>

                {(!activeEntity.animations || activeEntity.animations.length === 0) && (
                    <p style={{ fontSize: '12px', color: '#666' }}>No animations on this shape.</p>
                )}

                {activeEntity.animations && activeEntity.animations.map(anim => (
                    <div key={anim.id} style={{ background: '#f5f5f5', padding: '12px', borderRadius: '4px', marginBottom: '12px', border: '1px solid #ddd' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <strong style={{ fontSize: '12px' }}>Vibration</strong>
                            <button onClick={() => removeVibrationAnim(activeEntity.id, anim.id)} style={{ background: 'none', border: 'none', color: 'red', cursor: 'pointer' }}>✕</button>
                        </div>

                        <div style={{ marginBottom: '8px', borderTop: '1px solid #ddd', paddingTop: '8px' }}>
                            <label style={{ fontSize: '10px', display: 'block', fontWeight: 'bold' }}>Trigger Type</label>
                            <select
                                value={anim.trigger?.type || 'Temporal'}
                                onChange={e => updateVibrationAnim(activeEntity.id, anim.id, { 
                                    trigger: { 
                                        type: e.target.value as 'Temporal' | 'Reactive',
                                        threshold: anim.trigger?.threshold || 50,
                                        frequencyBand: anim.trigger?.frequencyBand || 'Full'
                                    } 
                                })}
                                style={{ width: '100%', fontSize: '12px' }}
                            >
                                <option value="Temporal">Timeline Marker</option>
                                <option value="Reactive">Audio Reactive</option>
                            </select>
                        </div>

                        {anim.trigger?.type === 'Reactive' ? (
                            <>
                                <div style={{ marginBottom: '8px' }}>
                                    <label style={{ fontSize: '10px', display: 'block' }}>Threshold ({anim.trigger.threshold || 50})</label>
                                    <input type="range" min="0" max="255" value={anim.trigger.threshold || 50}
                                        onChange={e => updateVibrationAnim(activeEntity.id, anim.id, { 
                                            trigger: { 
                                                ...anim.trigger!,
                                                type: 'Reactive',
                                                threshold: parseInt(e.target.value) 
                                            } 
                                        })}
                                        style={{ width: '100%' }} />
                                </div>
                                <div style={{ marginBottom: '8px' }}>
                                    <label style={{ fontSize: '10px', display: 'block' }}>Frequency Band</label>
                                    <select
                                        value={anim.trigger.frequencyBand || 'Full'}
                                        onChange={e => updateVibrationAnim(activeEntity.id, anim.id, { 
                                            trigger: { 
                                                ...anim.trigger!,
                                                type: 'Reactive',
                                                frequencyBand: e.target.value as any 
                                            } 
                                        })}
                                        style={{ width: '100%', fontSize: '12px' }}
                                    >
                                        <option value="Full">Full Spectrum</option>
                                        <option value="Bass">Bass</option>
                                        <option value="Mid">Mids</option>
                                        <option value="Treble">Treble</option>
                                    </select>
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={{ marginBottom: '8px' }}>
                                    <label style={{ fontSize: '10px', display: 'block' }}>Start Marker</label>
                                    <select
                                        value={anim.startMarkerId}
                                        onChange={e => updateVibrationAnim(activeEntity.id, anim.id, { startMarkerId: e.target.value })}
                                        style={{ width: '100%', fontSize: '12px' }}
                                    >
                                        <option value="">Select Marker...</option>
                                        {sortedMarkers.map(m => (
                                            <option key={m.id} value={m.id}>{m.name || 'M?'} ({TimeMath.formatTime(m.timestampMs)})</option>
                                        ))}
                                    </select>
                                </div>

                                <div style={{ marginBottom: '8px' }}>
                                    <label style={{ fontSize: '10px', display: 'block' }}>End Marker</label>
                                    <select
                                        value={anim.endMarkerId || ''}
                                        onChange={e => updateVibrationAnim(activeEntity.id, anim.id, { 
                                            endMarkerId: e.target.value === '' ? undefined : e.target.value 
                                        })}
                                        style={{ width: '100%', fontSize: '12px' }}
                                    >
                                        <option value="">Duration based...</option>
                                        {sortedMarkers.map(m => (
                                            <option key={m.id} value={m.id}>{m.name || 'M?'} ({TimeMath.formatTime(m.timestampMs)})</option>
                                        ))}
                                    </select>
                                </div>

                                {!anim.endMarkerId && (
                                    <div style={{ marginBottom: '8px' }}>
                                        <label style={{ fontSize: '10px', display: 'block' }}>Duration ({anim.durationMs || 1000}ms)</label>
                                        <input type="range" min="100" max="5000" step="100" value={anim.durationMs || 1000}
                                            onChange={e => updateVibrationAnim(activeEntity.id, anim.id, { durationMs: parseInt(e.target.value) })}
                                            style={{ width: '100%' }} />
                                    </div>
                                )}
                            </>
                        )}

                        <div style={{ marginBottom: '8px', borderTop: '1px solid #ddd', paddingTop: '8px' }}>
                            <label style={{ fontSize: '10px', display: 'block' }}>Freq ({anim.frequency})</label>
                            <input type="range" min="0.1" max="10" step="0.1" value={anim.frequency}
                                onChange={e => updateVibrationAnim(activeEntity.id, anim.id, { frequency: parseFloat(e.target.value) })}
                                style={{ width: '100%' }} />
                        </div>

                        <div style={{ marginBottom: '8px' }}>
                            <label style={{ fontSize: '10px', display: 'block' }}>Amp ({anim.amplitude}px)</label>
                            <input type="range" min="1" max="200" value={anim.amplitude}
                                onChange={e => updateVibrationAnim(activeEntity.id, anim.id, { amplitude: parseFloat(e.target.value) })}
                                style={{ width: '100%' }} />
                        </div>

                        <div style={{ marginBottom: '8px' }}>
                            <label style={{ fontSize: '10px', display: 'block' }}>Edge Damp ({anim.edgeDamping || 0}px)</label>
                            <input type="range" min="0" max="200" value={anim.edgeDamping || 0}
                                onChange={e => updateVibrationAnim(activeEntity.id, anim.id, { edgeDamping: parseFloat(e.target.value) })}
                                style={{ width: '100%' }} />
                        </div>

                        <div>
                            <label style={{ fontSize: '10px', display: 'block' }}>Decay Profile</label>
                            <select
                                value={anim.easing}
                                onChange={e => updateVibrationAnim(activeEntity.id, anim.id, { easing: e.target.value as any })}
                                style={{ width: '100%', fontSize: '12px' }}
                            >
                                <option value="Linear">Linear Drop</option>
                                <option value="Exponential">Exponential Tail</option>
                            </select>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ marginTop: '32px', borderTop: '2px solid #ccc', paddingTop: '16px' }}>
                <button
                    onClick={() => {
                        if (confirm('Are you sure you want to delete this line and all its vibrations?')) {
                            deleteEntity(activeEntity.id);
                        }
                    }}
                    style={{
                        width: '100%',
                        padding: '12px',
                        backgroundColor: '#ffebee',
                        color: '#c62828',
                        border: '1px solid #ffcdd2',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                    }}
                >
                    Delete Line
                </button>
            </div>
        </div>
    );
};
