import React, { useRef, useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { TimeMath } from '../utils/timeMath';

interface TimelineInteractionOverlayProps {
    zoomLevel: number;
    viewportOffsetMs: number;
    width: number;
    height: number;
    onSeek?: (timeMs: number) => void;
}

export const TimelineInteractionOverlay: React.FC<TimelineInteractionOverlayProps> = ({
    zoomLevel,
    viewportOffsetMs,
    width,
    height,
    onSeek
}) => {
    const markers = useAppStore(state => state.audio.markers);
    const activeTrack = useAppStore(state => state.audio.tracks[0]);

    // Zustand Mutations
    const addMarker = useAppStore(state => state.addAudioMarker);
    const updateMarkerTime = useAppStore(state => state.updateAudioMarkerTime);

    const overlayRef = useRef<HTMLDivElement>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);

    // Filter markers to only show those belonging to the current track
    const trackMarkers = markers.filter(m => m.targetTrackId === activeTrack?.id);

    const handleDoubleClick = (e: React.MouseEvent) => {
        if (!activeTrack) return;
        if (!overlayRef.current) return;

        const rect = overlayRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left;

        // Calculate raw time
        const targetTimeMs = TimeMath.pixelToTime(clickX, zoomLevel, viewportOffsetMs);

        addMarker({
            id: `mk-${Date.now()}`, // Quick ID generator for MVP
            targetTrackId: activeTrack.id,
            timestampMs: targetTimeMs
        });
    };

    const handlePointerDownBackground = (e: React.PointerEvent) => {
        if (!overlayRef.current) return;
        const rect = overlayRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const targetTimeMs = TimeMath.pixelToTime(clickX, zoomLevel, viewportOffsetMs);
        if (onSeek) onSeek(targetTimeMs);
    };

    const handlePointerDown = (e: React.PointerEvent, id: string) => {
        e.stopPropagation(); // Prevent canvas scrolling/selection
        setDraggingId(id);
    };

    useEffect(() => {
        const handlePointerMove = (e: PointerEvent) => {
            if (!draggingId || !overlayRef.current) return;

            const rect = overlayRef.current.getBoundingClientRect();
            // Clamp X to the bounds of the timeline UI
            const pointerX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));

            const newTimeMs = TimeMath.pixelToTime(pointerX, zoomLevel, viewportOffsetMs);

            // Validate: Prevent overlapping/inverting markers
            // MVP: Just blindly update, we assume the user is trusted. 
            // Phase 3 physics will require strict overlapping bounds.
            updateMarkerTime(draggingId, newTimeMs);
        };

        const handlePointerUp = () => {
            setDraggingId(null);
        };

        if (draggingId) {
            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', handlePointerUp);
        }

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [draggingId, zoomLevel, viewportOffsetMs, updateMarkerTime]);

    return (
        <div
            ref={overlayRef}
            onDoubleClick={handleDoubleClick}
            onPointerDown={handlePointerDownBackground}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width,
                height,
                cursor: 'copy'
            }}
            title="Double Click to Add Marker"
        >
            {trackMarkers.map((marker) => {
                const pixelX = TimeMath.timeToPixel(marker.timestampMs, zoomLevel, viewportOffsetMs);

                // If the marker has been scrolled off-screen, don't render its DOM node
                if (pixelX < -50 || pixelX > width + 50) return null;

                return (
                    <div
                        key={marker.id}
                        onPointerDown={(e) => handlePointerDown(e, marker.id)}
                        style={{
                            position: 'absolute',
                            left: `${pixelX}px`,
                            top: 0,
                            bottom: 0,
                            width: '4px',
                            transform: 'translateX(-50%)',
                            backgroundColor: draggingId === marker.id ? '#FFFF00' : '#2196F3',
                            cursor: 'ew-resize',
                            zIndex: 20,
                            boxShadow: '0 0 4px rgba(0,0,0,0.5)'
                        }}
                    >
                        {/* Visual Head */}
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: '12px',
                            height: '12px',
                            backgroundColor: 'inherit',
                            borderRadius: '50%'
                        }} />
                    </div>
                );
            })}
        </div>
    );
};
