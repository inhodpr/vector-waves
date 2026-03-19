import React, { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';

export const LogPanel: React.FC = () => {
    const logs = useAppStore(state => state.logs);
    const clearLogs = useAppStore(state => state.clearLogs);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    return (
        <div style={{
            position: 'absolute',
            bottom: '160px',
            right: '310px',
            width: '300px',
            height: '200px',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: '#00ff00',
            fontFamily: 'monospace',
            fontSize: '10px',
            padding: '8px',
            borderRadius: '4px',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 1000,
            pointerEvents: 'auto',
            boxShadow: '0 0 10px rgba(0,0,0,0.5)',
            border: '1px solid #444'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', borderBottom: '1px solid #444', paddingBottom: '4px' }}>
                <span style={{ fontWeight: 'bold' }}>SYSTEM LOGS</span>
                <button 
                    onClick={clearLogs}
                    style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '10px' }}
                >
                    Clear
                </button>
            </div>
            <div 
                ref={scrollRef}
                style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}
            >
                {logs.length === 0 && <div style={{ color: '#666' }}>No logs yet...</div>}
                {logs.map(log => (
                    <div key={log.id} style={{ borderBottom: '1px solid #222', paddingBottom: '2px' }}>
                        <span style={{ color: '#888' }}>[{new Date(log.timestamp).toLocaleTimeString()}]</span>{' '}
                        <span style={{ 
                            color: log.level === 'error' ? '#ff0000' : log.level === 'warn' ? '#ffff00' : '#00ff00' 
                        }}>
                            {log.level.toUpperCase()}:
                        </span>{' '}
                        {log.message}
                    </div>
                ))}
            </div>
        </div>
    );
};
