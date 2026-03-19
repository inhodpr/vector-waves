import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { WaveformRenderer } from './WaveformRenderer';
import { TimelineInteractionOverlay } from './TimelineInteractionOverlay';
import { TimelineManager } from '../engine/TimelineManager';

interface TimelinePanelProps {
    timelineManager: TimelineManager;
}

export const TimelinePanel: React.FC<TimelinePanelProps> = ({ timelineManager }) => {
    const audioState = useAppStore(state => state.audio);
    const audioAdapter = timelineManager.getAdapter();
    const zoomLevel = useAppStore(state => state.timelineZoomLevel);
    const scrollOffsetPx = useAppStore(state => state.timelineScrollOffsetPx);
    const setZoom = useAppStore(state => state.setTimelineZoom);
    const setScroll = useAppStore(state => state.setTimelineScroll);
    const addMarker = useAppStore(state => state.addAudioMarker);

    // Local playback time state
    const [currentTimeMs, setCurrentTimeMs] = useState(0);

    useEffect(() => {
        const timeSubscriber = (time: number) => {
            setCurrentTimeMs(time);

            // TL REQUIREMENT: Auto-Scroll (90% Threshold)
            // If playhead exceeds 90% of visible viewport width, jump scroll offset.
            const viewportWidth = 800; // TODO: Measure actual DOM width
            const playheadPx = time * zoomLevel;
            const relativePos = playheadPx - scrollOffsetPx;

            if (relativePos > viewportWidth * 0.9) {
                // Scroll so playhead is at 10% from the left for "breathing room"
                setScroll(playheadPx - (viewportWidth * 0.1));
            }
        };
        audioAdapter.onTimeUpdate(timeSubscriber);

        return () => {
            // Cleanup would go here
        };
    }, [audioAdapter, zoomLevel, scrollOffsetPx]);

    // Focus-safe Play/Pause hotkey bindings
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const activeTag = document.activeElement?.tagName.toLowerCase();
            const isTyping = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';
            if (isTyping) return;

            if (e.code === 'Space') {
                e.preventDefault();
                timelineManager.togglePlayPause();
            }

            // TL REQUIREMENT: Hotkey 'M' for markers
            if (e.code === 'KeyM') {
                e.preventDefault();
                addMarker({
                    id: `marker-${Date.now()}`,
                    targetTrackId: audioState.tracks[0]?.id || 'default',
                    timestampMs: currentTimeMs
                });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [timelineManager, currentTimeMs, audioState.tracks]);

    const handleLoadAudioClick = async () => {
        // @ts-ignore IPC exposed bridge
        const response = await window.audioAPI.selectTrack();
        if (response && response.originalPath && response.buffer) {
            // The buffer is transferred over Electron IPC
            timelineManager.loadSelectedTrack(response.originalPath, response.buffer);
        }
    };

    return (
        <div style={{ height: '150px', backgroundColor: '#2C2C2C', borderTop: '1px solid #444', display: 'flex', flexDirection: 'column' }}>
            {/* Header / Controls */}
            <div style={{ padding: '8px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #333' }}>
                <button
                    onClick={() => timelineManager.togglePlayPause()}
                    style={{ padding: '4px 12px', background: '#4CAF50', border: 'none', color: 'white', borderRadius: '4px' }}
                >
                    Play/Pause
                </button>
                <div style={{ color: '#ccc', fontFamily: 'monospace' }}>
                    {(currentTimeMs / 1000).toFixed(2)}s
                </div>

                <button onClick={() => setZoom(zoomLevel * 1.5)}>+</button>
                <button onClick={() => setZoom(zoomLevel / 1.5)}>-</button>

                <span style={{ marginLeft: 'auto', color: '#999', fontSize: '12px' }}>
                    {audioState.tracks.length > 0
                        ? audioState.tracks[0].name
                        : <button onClick={handleLoadAudioClick}>Load Audio</button>}
                </span>
            </div>

            {/* Waveform Canvas Container */}
            <div
                style={{ flex: 1, position: 'relative', overflow: 'hidden' }}
                onWheel={(e) => {
                    if (e.ctrlKey) {
                        e.preventDefault();
                        // TL REQUIREMENT: Centered Zoom Mathematics
                        const mouseX = e.nativeEvent.offsetX;
                        const timeAtMouse = (mouseX + scrollOffsetPx) / zoomLevel;
                        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
                        setZoom(zoomLevel * zoomFactor, timeAtMouse);
                    } else if (e.shiftKey) {
                        // TL REQUIREMENT: Panning (Shift + Scroll)
                        setScroll(scrollOffsetPx + e.deltaY);
                    }
                }}
                onDoubleClick={(e) => {
                    // TL REQUIREMENT: Double-click to add marker
                    const mouseX = e.nativeEvent.offsetX;
                    const timeMs = (mouseX + scrollOffsetPx) / zoomLevel;
                    addMarker({
                        id: `marker-dc-${Date.now()}`,
                        targetTrackId: audioState.tracks[0]?.id || 'default',
                        timestampMs: timeMs
                    });
                }}
                onContextMenu={(e) => {
                    // TL REQUIREMENT: Right-Click context menu
                    e.preventDefault();
                    const mouseX = e.nativeEvent.offsetX;
                    const timeMs = (mouseX + scrollOffsetPx) / zoomLevel;
                    // For MVP simplicity, just add marker directly
                    addMarker({
                        id: `marker-ctx-${Date.now()}`,
                        targetTrackId: audioState.tracks[0]?.id || 'default',
                        timestampMs: timeMs
                    });
                }}
            >
                <div style={{ position: 'relative', left: `-${scrollOffsetPx}px` }}>
                    <WaveformRenderer
                        pcmData={audioAdapter.getPcmData()}
                        zoomLevel={zoomLevel}
                        viewportOffsetMs={0}
                        width={10000} // Large virtual width
                        height={100}
                    />

                    {/* Playhead Indicator */}
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: `${(currentTimeMs * zoomLevel)}px`,
                        width: '2px',
                        backgroundColor: '#ff4444',
                        zIndex: 10
                    }} />

                    <TimelineInteractionOverlay
                        zoomLevel={zoomLevel}
                        viewportOffsetMs={0}
                        width={10000}
                        height={100}
                        onSeek={(timeMs) => timelineManager.seek(timeMs)}
                    />
                </div>
            </div>
        </div>
    );
};
