import React from 'react';
import { useAppStore } from '../store/useAppStore';

export const ProjectSettings: React.FC = () => {
    const backgroundColor = useAppStore(state => state.backgroundColor);
    const setBackgroundColor = useAppStore(state => state.setBackgroundColor);

    return (
        <div style={{ padding: '16px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Project Settings</h3>
            
            <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Canvas Background</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                            type="color"
                            value={backgroundColor}
                            onChange={(e) => setBackgroundColor(e.target.value)}
                            style={{ width: '40px', height: '40px', border: '1px solid #ccc', borderRadius: '4px', padding: '2px', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '12px', fontFamily: 'monospace' }}>{backgroundColor.toUpperCase()}</span>
                    </div>
                </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Background Image</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button 
                        onClick={async () => {
                            const result = await (window as any).imageAPI.selectImage();
                            const store = useAppStore.getState();
                            if (result) {
                                store.addLog('info', `ProjectSettings: Received selection result for ${result.originalPath}`);
                                
                                const bufferData = result.buffer;
                                let uint8Buffer: Uint8Array;

                                if (bufferData && bufferData.type === 'Buffer' && Array.isArray(bufferData.data)) {
                                    store.addLog('info', 'ProjectSettings: Detected Node.js Buffer object format');
                                    uint8Buffer = new Uint8Array(bufferData.data);
                                } else if (bufferData instanceof Uint8Array) {
                                    store.addLog('info', 'ProjectSettings: Detected native Uint8Array format');
                                    uint8Buffer = bufferData;
                                } else {
                                    store.addLog('info', `ProjectSettings: Attempting generic conversion for type: ${typeof bufferData}`);
                                    uint8Buffer = new Uint8Array(bufferData);
                                }

                                store.addLog('info', `Values: first 4 bytes: ${uint8Buffer.slice(0, 4).join(', ')}`);
                                
                                const assetId = `img_${Date.now()}`;
                                store.addImageAsset({
                                    id: assetId,
                                    path: result.originalPath,
                                    buffer: uint8Buffer
                                });
                                store.setBackgroundImage(assetId);
                            } else {
                                store.addLog('warn', 'ProjectSettings: Image selection cancelled or failed');
                            }
                        }}
                        style={{ padding: '8px', cursor: 'pointer' }}
                    >
                        Choose Image...
                    </button>
                    {useAppStore.getState().backgroundImageAssetId && (
                        <button 
                            onClick={() => useAppStore.getState().setBackgroundImage(null)}
                            style={{ padding: '8px', cursor: 'pointer', backgroundColor: '#fee', border: '1px solid #fcc' }}
                        >
                            Remove Image
                        </button>
                    )}
                </div>
            </div>

            <div style={{ borderTop: '1px solid #ccc', paddingTop: '16px', marginTop: '16px' }}>
                <p style={{ fontSize: '11px', color: '#666' }}>
                    Export settings will appear here in the next update.
                </p>
            </div>
        </div>
    );
};
