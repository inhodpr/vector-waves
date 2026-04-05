import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from './store/useAppStore';
import { CanvasEngine } from './engine/CanvasEngine';
import { PhysicsAnimationEngine } from './engine/PhysicsAnimationEngine';
import { OneDWaveStrategy } from './engine/OneDWaveStrategy';
import { Ticker } from './engine/Ticker';
import { EventBus } from './engine/EventBus';
import { LiveAudioAdapter } from './engine/LiveAudioAdapter';
import { ZustandAssetResolver } from './engine/ZustandAssetResolver';
import { PhotoSystem } from '@visual-map/PhotoSystem';
import { createClient } from '@supabase/supabase-js';

export const PlayerApp: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const audioAdapter = useRef(new LiveAudioAdapter());
    const animEngine = useRef(new PhysicsAnimationEngine(new OneDWaveStrategy()));
    const assetResolver = useRef(new ZustandAssetResolver());
    const photoSystem = useRef(new PhotoSystem({
        maxActive: 6,
        marginRatio: 0.15,
        photoBaseUrl: 'fotos/'
    }, createClient('https://fixpfxxlnuhwzvbgcykm.supabase.co', 'sb_publishable_9SUF0gKkr4337Ai9i4kCrg_pSaW2sSI')));
    const engineRef = useRef<CanvasEngine | null>(null);
    
    const [isLoaded, setIsLoaded] = useState(false);
    const [viewportTransform, setViewportTransform] = useState({ x: 0, y: 0, scale: 1.0 });
    const [isDragging, setIsDragging] = useState(false);
    const lastMousePos = useRef({ x: 0, y: 0 });

    const [volume, setVolume] = useState(0);
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
    const [threshold, setThreshold] = useState<number>(50);
    const [showOverlay, setShowOverlay] = useState(true);

    const updateVibrationAnim = useAppStore(state => state.updateVibrationAnim);

    // Sync triggers to Enable Peak Detection in the Worklet
    const syncTriggers = () => {
        const state = useAppStore.getState();
        const configs: any[] = [];
        Object.values(state.entities).forEach(entity => {
            if (entity.type === 'Line' && entity.animations) {
                entity.animations.forEach(anim => {
                    if (anim.trigger?.type === 'Reactive') {
                        const trigger = anim.trigger as any;
                        configs.push({
                            id: `${entity.id}-${anim.id}`,
                            band: trigger.frequencyBand || 'Full',
                            threshold: threshold, // Use global threshold override in player
                            refractory: 30
                        });
                    }
                });
            }
        });
        console.log(`[PLAYER] Syncing ${configs.length} triggers with threshold ${threshold}`);
        audioAdapter.current.updateTriggers(configs);
    };

    useEffect(() => {
        const init = async () => {
            const params = new URLSearchParams(window.location.search);
            const vvaPath = params.get('file');
            
            if (!vvaPath) {
                console.error('No VVA file provided to player');
                return;
            }

            // 1. Load the project via main process (bypassing dialog)
            const projectResponse = await (window as any).electron.ipcRenderer.invoke('read-vva-file', vvaPath);
            if (!projectResponse) return;

            // Handle both string and object responses (structured cloning vs legacy)
            const projectData = typeof projectResponse === 'string' ? JSON.parse(projectResponse) : projectResponse;
            
            // Hydrate buffers (standard step)
            if (projectData.assets && projectData.assets.images) {
                for (const id in projectData.assets.images) {
                    const asset = projectData.assets.images[id];
                    if (asset.buffer && !(asset.buffer instanceof Uint8Array)) {
                        asset.buffer = new Uint8Array(Object.values(asset.buffer));
                    }
                }
            }

            // 2. Automated Conversion to Audio-Reactive
            // This ensures ANY project loaded in player mode becomes reactive
            const freqRange = { 
                min: parseFloat(params.get('fmin') || '0.8'), 
                max: parseFloat(params.get('fmax') || '5') 
            };
            const ampRange = { 
                min: parseFloat(params.get('amin') || '8'), 
                max: parseFloat(params.get('amax') || '18') 
            };
            const parsedThreshold = parseFloat(params.get('thresh') || '50');
            setThreshold(parsedThreshold);

            let lineCounter = 0;
            for (const id in projectData.entities) {
                const entity = projectData.entities[id];
                if (entity.type === 'Line') {
                    // TL REQUIREMENT: Even if no animations exist, add one so everything is reactive
                    const baseAnims = (entity.animations && entity.animations.length > 0) 
                        ? entity.animations 
                        : [{ id: `auto_${id}`, edgeDamping: 20, easing: 'Exponential', startMarkerId: '' }];

                    entity.animations = baseAnims.map(anim => {
                        // Randomize freq/amp within requested range
                        const f = freqRange.min + Math.random() * (freqRange.max - freqRange.min);
                        const a = ampRange.min + Math.random() * (ampRange.max - ampRange.min);
                        
                        // Cycle through bands for even distribution
                        const bands = ['Bass', 'Mid', 'Treble'] as const;
                        const band = bands[lineCounter % bands.length];
                        lineCounter++;

                        return {
                            ...anim,
                            frequency: f,
                            amplitude: a,
                            trigger: {
                                type: 'Reactive' as const,
                                params: {
                                    threshold: parsedThreshold, 
                                    cooldownMs: 100
                                },
                                frequencyBand: band
                            },
                            activeTriggers: []
                        };
                    });
                }
            }

            // 3. Apply to store
            useAppStore.setState({
                ...projectData,
                isLoaded: true
            });

            // 4. Fetch Audio Devices
            const d = await navigator.mediaDevices.enumerateDevices();
            setDevices(d.filter(device => device.kind === 'audioinput'));

            // 5. Load Photos
            photoSystem.current.loadPhotos();

            setIsLoaded(true);
        };

        init();
    }, []);

    // Re-sync triggers when threshold changes
    useEffect(() => {
        if (isLoaded) {
            syncTriggers();
        }
    }, [threshold, isLoaded]);

    useEffect(() => {
        if (!isLoaded || !canvasRef.current) return;

        const engine = new CanvasEngine(
            canvasRef.current,
            () => useAppStore.getState(),
            assetResolver.current,
            new EventBus(),
            animEngine.current
        );
        engine.setViewportTransform(viewportTransform);
        engineRef.current = engine;


        const resize = () => {
            if (canvasRef.current) {
                canvasRef.current.width = window.innerWidth;
                canvasRef.current.height = window.innerHeight;
                useAppStore.setState({ 
                    canvasWidth: window.innerWidth,
                    canvasHeight: window.innerHeight 
                });
                photoSystem.current.generateSlots(window.innerWidth, window.innerHeight);
            }
        };
        window.addEventListener('resize', resize);
        resize();

        // Start Audio Analysis
        audioAdapter.current.start(selectedDeviceId || undefined).then(() => {
            console.log('[PLAYER] Audio analysis started');
            syncTriggers();
        });

        // Peak listener to update store
        const onPeak = (event: { slotId: string, intensity: number, timestampMs: number }) => {
            const [entityId, animId] = event.slotId.split('-');
            const state = useAppStore.getState();
            const entity = state.entities[entityId];
            
            if (entity && entity.type === 'Line' && entity.animations) {
                const anim = entity.animations.find(a => a.id === animId);
                if (anim) {
                    updateVibrationAnim(entityId, animId, {
                        activeTriggers: [
                           ...(anim.activeTriggers || []),
                           { timestampMs: event.timestampMs, intensity: event.intensity }
                        ].filter(t => event.timestampMs - t.timestampMs < 2000)
                    });
                }
            }
        };
        audioAdapter.current.onPeakDetected(onPeak);

        let lastTime = 0;
        const ticker = new Ticker();
        ticker.addCallback((ts) => {
            const now = ts / 1000;
            const dt = lastTime === 0 ? 0 : now - lastTime;
            lastTime = now;

            setVolume(audioAdapter.current.getVolume());
            engine.update(ts);
            engine.draw();

            const ctx = canvasRef.current?.getContext('2d');
            if (ctx) {
                photoSystem.current.update(dt);
                photoSystem.current.draw(ctx);
            }
        });
        ticker.start();

        return () => {
            ticker.stop();
            audioAdapter.current.stop();
            window.removeEventListener('resize', resize);
            engineRef.current = null;
        };
    }, [isLoaded, selectedDeviceId]);

    useEffect(() => {
        if (engineRef.current) {
            engineRef.current.setViewportTransform(viewportTransform);
        }
    }, [viewportTransform]);

    const handleWheel = (e: React.WheelEvent) => {
        const zoomSensitivity = 0.002;
        const panSpeed = 1.0;

        if (e.ctrlKey) {
            // Zoom relative to mouse position
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;

            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            setViewportTransform(prev => {
                const newScale = Math.max(0.1, Math.min(10, prev.scale * Math.exp(-e.deltaY * zoomSensitivity)));
                const scaleRatio = newScale / prev.scale;

                return {
                    scale: newScale,
                    x: mouseX - (mouseX - prev.x) * scaleRatio,
                    y: mouseY - (mouseY - prev.y) * scaleRatio
                };
            });
        } else {
            // Pan
            let dx = e.deltaX * panSpeed;
            let dy = e.deltaY * panSpeed;

            if (e.shiftKey && dy !== 0 && dx === 0) {
                dx = dy;
                dy = 0;
            }

            setViewportTransform(prev => ({
                ...prev,
                x: prev.x - dx,
                y: prev.y - dy
            }));
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;

        const dx = e.clientX - lastMousePos.current.x;
        const dy = e.clientY - lastMousePos.current.y;

        setViewportTransform(prev => ({
            ...prev,
            x: prev.x + dx,
            y: prev.y + dy
        }));

        lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleDoubleClick = () => {
        setViewportTransform({ x: 0, y: 0, scale: 1.0 });
    };


    if (!isLoaded) return <div style={{ color: 'white', background: 'black', width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>Loading Player...</div>;

    return (
        <div 
            style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: 'black', position: 'relative', cursor: isDragging ? 'grabbing' : 'default' }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDoubleClick={handleDoubleClick}
        >
            <canvas 
                ref={canvasRef} 
                style={{ display: 'block', width: '100vw', height: '100vh' }} 
            />


            {/* Floating UI Overlay */}
            <div style={{
                position: 'fixed',
                bottom: '20px',
                left: '20px',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
            }}>
                {showOverlay ? (
                    <div style={{
                        background: 'rgba(0, 0, 0, 0.7)',
                        backdropFilter: 'blur(10px)',
                        padding: '15px',
                        borderRadius: '12px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: 'white',
                        minWidth: '240px',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                        fontFamily: 'Inter, sans-serif',
                        fontSize: '13px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, opacity: 0.8 }}>AUDIO ENGINE</span>
                            <button 
                                onClick={() => setShowOverlay(false)}
                                style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '16px', opacity: 0.5 }}
                            >✕</button>
                        </div>

                        {/* Signal Meter */}
                        <div style={{ marginBottom: '15px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '10px', opacity: 0.6 }}>
                                <span>SIGNAL INTENSITY</span>
                                <span>{Math.round((volume / 255) * 100)}%</span>
                            </div>
                            <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ 
                                    width: `${(volume / 255) * 100}%`, 
                                    height: '100%', 
                                    background: 'linear-gradient(90deg, #4facfe 0%, #00f2fe 100%)',
                                    boxShadow: '0 0 10px #00f2fe',
                                    transition: 'width 0.05s ease-out'
                                }} />
                            </div>
                        </div>

                        {/* Threshold Slider */}
                        <div style={{ marginBottom: '15px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '10px', opacity: 0.6 }}>
                                <span>TRIGGER THRESHOLD</span>
                                <span style={{ color: '#00f2fe' }}>{Math.round(threshold)}</span>
                            </div>
                            <input 
                                type="range"
                                min="1"
                                max="255"
                                value={threshold}
                                onChange={(e) => setThreshold(parseInt(e.target.value))}
                                style={{
                                    width: '100%',
                                    cursor: 'pointer',
                                    accentColor: '#00f2fe'
                                }}
                            />
                        </div>

                        {/* Device Selector */}
                        <div>
                            <label style={{ display: 'block', fontSize: '10px', opacity: 0.6, marginBottom: '4px' }}>INPUT SOURCE</label>
                            <select 
                                value={selectedDeviceId}
                                onChange={(e) => setSelectedDeviceId(e.target.value)}
                                style={{
                                    width: '100%',
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    color: 'white',
                                    padding: '6px',
                                    borderRadius: '6px',
                                    outline: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                <option value="">Default Input</option>
                                {devices.map(d => (
                                    <option key={d.deviceId} value={d.deviceId}>{d.label || `Audio Device ${d.deviceId.slice(0, 4)}`}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                ) : (
                    <button 
                        onClick={() => setShowOverlay(true)}
                        style={{
                            background: 'rgba(0, 0, 0, 0.7)',
                            backdropFilter: 'blur(10px)',
                            padding: '10px',
                            borderRadius: '50%',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            color: 'white',
                            cursor: 'pointer',
                            width: '40px',
                            height: '40px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                        }}
                    >
                        🎙️
                    </button>
                )}
            </div>
        </div>
    );
};
