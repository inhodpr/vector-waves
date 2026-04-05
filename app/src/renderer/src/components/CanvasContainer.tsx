import { useEffect, useRef, useState, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { ITimeSource } from '../engine/ITimeSource';
import { CanvasEngine } from '../engine/CanvasEngine';
import { Ticker } from '../engine/Ticker';
import { EventBus } from '../engine/EventBus';
import { PhysicsAnimationEngine } from '../engine/PhysicsAnimationEngine';
import { OneDWaveStrategy } from '../engine/OneDWaveStrategy';
import { DrawToolHandler } from '../tools/DrawToolHandler';
import { SelectToolHandler } from '../tools/SelectToolHandler';
import { EditPtsToolHandler } from '../tools/EditPtsToolHandler';
import { ExtractToolHandler } from '../tools/ExtractToolHandler';
import { ZustandAssetResolver } from '../engine/ZustandAssetResolver';

// Central event bus for tool actions hooking into the engine
export const eventBus = new EventBus();

// Singleton hack for MVP to allow ExportManager to access the active engine
export let canvasEngineInstance: CanvasEngine | null = null;

interface CanvasContainerProps {
    timeSource?: ITimeSource;
}

export const CanvasContainer: React.FC<CanvasContainerProps> = ({ timeSource }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const canvasWidth = useAppStore(state => state.canvasWidth);
    const canvasHeight = useAppStore(state => state.canvasHeight);

    // Zoom control state (local for 60fps responsiveness, synced to store for tool access)
    const containerRef = useRef<HTMLDivElement>(null);
    const [transform, setTransform] = useState({ scale: 0.8, x: 0, y: 0 });
    const lastSyncedScale = useRef(0.8);

    // Sync local transform to store with debounce to avoid rapid Zustand traffic
    useEffect(() => {
        const timeout = setTimeout(() => {
            const setCanvasTransform = useAppStore.getState().setCanvasTransform;
            setCanvasTransform(transform);

            // Check if re-rasterization is needed for any active ImageLayerEntity
            const state = useAppStore.getState();
            state.entityIds.forEach(id => {
                const entity = state.entities[id];
                if (entity && entity.type === 'ImageLayer') {
                    const delta = transform.scale / entity.rasterizedZoomLevel;
                    if (delta > 1.5 || delta < 0.5) {
                        // Calculate viewport bounds in project space
                        const viewportBounds = {
                            panX: -transform.x / transform.scale,
                            panY: -transform.y / transform.scale,
                            width: containerRef.current?.clientWidth || canvasWidth,
                            height: containerRef.current?.clientHeight || canvasHeight
                        };
                        state.reRasterizeOSMLayer(id, transform.scale, viewportBounds);
                    }
                }
            });
        }, 300);
        return () => clearTimeout(timeout);
    }, [transform]);

    const animEngine = useRef(new PhysicsAnimationEngine(new OneDWaveStrategy()));

    // Singleton tools mapping
    const handlers = useRef<Record<string, any>>({
        Draw: new DrawToolHandler(),
        Select: new SelectToolHandler(),
        EditPts: new EditPtsToolHandler(animEngine.current),
        Extract: new ExtractToolHandler()
    });

    const handleMouseEvent = (e: React.MouseEvent<HTMLCanvasElement>, type: 'down' | 'move' | 'up') => {
        const state = useAppStore.getState();
        
        if (state.backgroundEditMode && state.backgroundImageAssetId) {
            if (type === 'down') {
                useAppStore.getState().setIsDragging(true);
            } else if (type === 'move' && state.isDragging) {
                const transform = state.backgroundImageTransform;
                useAppStore.getState().setBackgroundImageTransform({
                    ...transform,
                    x: transform.x + e.movementX,
                    y: transform.y + e.movementY
                });
            } else if (type === 'up') {
                useAppStore.getState().setIsDragging(false);
            }
            return;
        }

        const handler = handlers.current[state.activeTool];
        const ctx = canvasRef.current?.getContext('2d');
        if (!handler || !ctx) return;

        // Project Mouse Event into Canvas Object Space [0, canvasWidth]
        // offsetX/Y are already relative to the <canvas> element.
        // CSS transforms in the parent <div> do not affect offsetX/Y, 
        // they return coordinates relative to the transformed element's content box.
        // Wait, if the canvas is scaled by CSS, offsetX/Y are usually relative to the scaled size.
        // To get "original" canvas units: offset / cssScale.
        // However, we are using translate/scale on a wrapper <div>. 
        // Let's verify: offsetX/Y on a canvas inside a scaled div will be in canvas pixels.
        // Actually, if we want to be safe and precise for the Extract tool:
        if (type === 'down') handler.onMouseDown(e, state, ctx);
        if (type === 'move') handler.onMouseMove(e, state, ctx);
        if (type === 'up') handler.onMouseUp(e, state, ctx);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
        const state = useAppStore.getState();
        const handler = handlers.current[state.activeTool];
        if (handler?.onKeyDown) {
            handler.onKeyDown(e, state);
        }
    };

    const assetResolver = useMemo(() => new ZustandAssetResolver(), []);

    useEffect(() => {
        if (!canvasRef.current) return;

        const engine = new CanvasEngine(
            canvasRef.current,
            () => useAppStore.getState(),
            assetResolver,
            eventBus,
            animEngine.current,
            timeSource
        );
        canvasEngineInstance = engine;

        const ticker = new Ticker();
        ticker.addCallback((ts) => {
            engine.update(ts);
            engine.draw();
        });
        ticker.start();

        return () => ticker.stop();
    }, [assetResolver, timeSource]);

    // Handle background zoom and canvas zoom (Wheel)
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e: WheelEvent) => {
            const state = useAppStore.getState();
            
            // Check background zoom first
            if (state.backgroundEditMode && state.backgroundImageAssetId) {
                e.preventDefault();
                const bgTransform = state.backgroundImageTransform;
                const delta = e.deltaY > 0 ? 0.9 : 1.1;
                const newScale = Math.max(0.1, Math.min(10, bgTransform.scale * delta));
                
                useAppStore.getState().setBackgroundImageTransform({
                    ...bgTransform,
                    scale: newScale
                });
                return;
            }

            // Canvas zoom and pan
            if (e.ctrlKey) {
                e.preventDefault();
                
                setTransform(prev => {
                    const rect = container.getBoundingClientRect();
                    const mouseX = e.clientX - rect.left;
                    const mouseY = e.clientY - rect.top;
                    
                    const zoomSensitivity = 0.005;
                    const newScale = Math.max(0.1, Math.min(5.0, prev.scale * Math.exp(-e.deltaY * zoomSensitivity)));
                    const scaleRatio = newScale / prev.scale;
                    
                    const newX = mouseX - (mouseX - prev.x) * scaleRatio;
                    const newY = mouseY - (mouseY - prev.y) * scaleRatio;
                    
                    return { scale: newScale, x: newX, y: newY };
                });
            } else if (e.shiftKey || e.deltaX !== 0 || e.deltaY !== 0) {
                // Shift+scroll or standard trackpad scrolling pans the canvas
                e.preventDefault();
                
                setTransform(prev => {
                    // Browsers natively convert Shift+Scroll to deltaX, but just in case,
                    // we handle both deltaX and deltaY equally.
                    const panSpeed = 1.0;
                    // Note: If shift key is held and user scrolls standard wheel, deltaY is often 0 and deltaX is populated.
                    // If deltaY is somehow still populated, we manually apply it to X instead if Shift is held.
                    let dx = e.deltaX;
                    let dy = e.deltaY;
                    
                    // Force horizontal pan if shiftKey is explicitly held but the browser didn't convert deltaY to deltaX
                    if (e.shiftKey && dy !== 0 && dx === 0) {
                        dx = dy;
                        dy = 0;
                    }

                    return {
                        scale: prev.scale,
                        x: prev.x - dx * panSpeed,
                        y: prev.y - dy * panSpeed
                    };
                });
            }
        };

        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleWheel);
    }, []);

    return (
        <div ref={containerRef} style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', backgroundColor: '#e0e0e0' }}>
            <div style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`, transformOrigin: '0 0' }}>
                <canvas
                    ref={canvasRef}
                    width={canvasWidth}
                    height={canvasHeight}
                    tabIndex={0}
                    onMouseDown={e => handleMouseEvent(e, 'down')}
                    onMouseMove={e => handleMouseEvent(e, 'move')}
                    onMouseUp={e => handleMouseEvent(e, 'up')}
                    onKeyDown={handleKeyDown}
                    style={{
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        backgroundColor: useAppStore(state => state.backgroundColor),
                        outline: 'none',
                        display: 'block'
                    }}
                />
            </div>
        </div>
    );
};
