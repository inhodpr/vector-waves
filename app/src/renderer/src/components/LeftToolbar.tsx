import { useAppStore } from '../store/useAppStore';

export const LeftToolbar = () => {
    const activeTool = useAppStore(state => state.activeTool);
    const setActiveTool = useAppStore(state => state.setActiveTool);
    const selectedEntityId = useAppStore(state => state.selectedEntityId);

    // Z-Order functions
    const bringForward = useAppStore(state => state.bringForward);
    const sendBackward = useAppStore(state => state.sendBackward);
    const toFront = useAppStore(state => state.toFront);
    const toBack = useAppStore(state => state.toBack);

    const btnStyle = (isActive: boolean) => ({
        padding: '8px',
        backgroundColor: isActive ? '#007bff' : '#fff',
        color: isActive ? '#fff' : '#333',
        border: '1px solid #ccc',
        borderRadius: '4px',
        cursor: 'pointer',
        fontWeight: isActive ? 'bold' : 'normal'
    });

    return (
        <div style={{ width: 75, backgroundColor: '#f5f5f5', borderRight: '1px solid #ddd', display: 'flex', flexDirection: 'column', gap: 10, padding: 10 }}>
            <button style={btnStyle(activeTool === 'Select')} onClick={() => setActiveTool('Select')}>Select</button>
            <button style={btnStyle(activeTool === 'Draw')} onClick={() => setActiveTool('Draw')}>Draw</button>
            <button style={btnStyle(activeTool === 'EditPts')} onClick={() => setActiveTool('EditPts')}>Edit Pts</button>

            <hr style={{ width: '100%', border: 'none', borderBottom: '1px solid #ccc', margin: '10px 0' }} />

            <hr style={{ width: '100%', border: 'none', borderBottom: '1px solid #ccc', margin: '10px 0' }} />

            <button disabled={!selectedEntityId} onClick={() => selectedEntityId && bringForward(selectedEntityId)}>Forward</button>
            <button disabled={!selectedEntityId} onClick={() => selectedEntityId && sendBackward(selectedEntityId)}>Backward</button>
            <button disabled={!selectedEntityId} onClick={() => selectedEntityId && toFront(selectedEntityId)}>To Front</button>
            <button disabled={!selectedEntityId} onClick={() => selectedEntityId && toBack(selectedEntityId)}>To Back</button>

            <hr style={{ width: '100%', border: 'none', borderBottom: '1px solid #ccc', margin: '10px 0' }} />
            
            <button 
                style={{ padding: '8px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                onClick={() => (window as any).dispatchEvent(new CustomEvent('open-export'))}
            >
                Export MP4
            </button>

            <hr style={{ width: '100%', border: 'none', borderBottom: '1px solid #ccc', margin: '10px 0' }} />

            <button 
                style={{ padding: '8px', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                onClick={() => useAppStore.getState().saveProject()}
            >
                Save Project
            </button>

            <button 
                style={{ padding: '8px', backgroundColor: '#FF9800', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                onClick={() => useAppStore.getState().loadProject()}
            >
                Load Project
            </button>

            <button 
                style={{ padding: '8px', backgroundColor: '#673AB7', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                onClick={() => (window as any).windowAPI.toggleDetachedPreview()}
            >
                Detach Preview
            </button>
        </div>
    );
}
