import { useEffect, useRef } from 'react';
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

    // Zoom control state (local to avoid rapid Zustand updates)
    const containerRef = useRef<HTMLDivElement>(null);

    const animEngine = useRef(new PhysicsAnimationEngine(new OneDWaveStrategy()));

    // Singleton tools mapping
    const handlers = useRef<Record<string, any>>({
        Draw: new DrawToolHandler(),
        Select: new SelectToolHandler(),
        EditPts: new EditPtsToolHandler(animEngine.current)
    });

    const handleMouseEvent = (e: React.MouseEvent<HTMLCanvasElement>, type: 'down' | 'move' | 'up') => {
        const state = useAppStore.getState();
        const handler = handlers.current[state.activeTool];
        const ctx = canvasRef.current?.getContext('2d');
        if (!handler || !ctx) return;

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

    useEffect(() => {
        if (!canvasRef.current) return;

        const engine = new CanvasEngine(
            canvasRef.current,
            useAppStore,
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
    }, []);

    return (
        <div ref={containerRef} style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', backgroundColor: '#e0e0e0' }}>
            <div style={{ transform: 'scale(0.8)', transformOrigin: 'center', transition: 'transform 0.1s' }}>
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
