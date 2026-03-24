import { useAppStore } from '../store/useAppStore';
import { IAnimationEngine } from './IAnimationEngine';
import { ITimeSource } from './ITimeSource';
import { EventBus } from './EventBus';
import { CanvasEntity } from '../store/types';
import { buildEntityPath } from '../utils/geometry';

export class CanvasEngine {
    private ctx: CanvasRenderingContext2D;
    private store: typeof useAppStore;
    private timeSource: ITimeSource | null = null;

    private animationEngine: IAnimationEngine | null = null;

    constructor(
        canvas: HTMLCanvasElement,
        store: typeof useAppStore,
        _eventBus: EventBus,
        animEngine: IAnimationEngine,
        timeSource?: ITimeSource
    ) {
        this.ctx = canvas.getContext('2d')!;
        this.store = store;
        this.animationEngine = animEngine;
        if (timeSource) {
            this.timeSource = timeSource;
        }
    }

    public setTimeSource(timeSource: ITimeSource) {
        this.timeSource = timeSource;
    }

    private lastTickMs: number = 0;

    public update(timestamp: number, force: boolean = false) {
        // If we have an injected audio clock, use it to override the raw Ticker timestamp,
        // UNLESS we are in a forced update (like during Export)
        const timeMs = (this.timeSource && !force) ? this.timeSource.getCurrentTimeMs() : timestamp;
        this.lastTickMs = timeMs;
    }

    public draw() {
        // Make sure we have a valid context
        if (!this.ctx) return;

        this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
        const state = this.store.getState();
        
        // Render background
        if (state.backgroundImageAssetId && state.assets.images[state.backgroundImageAssetId]) {
            const asset = state.assets.images[state.backgroundImageAssetId];
            this.drawBackgroundImage(asset, state.canvasWidth, state.canvasHeight);
        } else {
            // Draw solid background color
            this.ctx.fillStyle = state.backgroundColor;
            this.ctx.fillRect(0, 0, state.canvasWidth, state.canvasHeight);
        }

        // Draw entities in Z-Order
        for (const id of state.entityIds) {
            const entity = state.entities[id];
            if (entity) {
                this.renderEntity(entity, state, this.lastTickMs);
            }
        }
    }

    private renderEntity(entity: CanvasEntity, state: any, timeMs: number) {
        if (entity.type === 'Line') {
            let path = new Path2D();

            // 1. If we have active vibrations, we CANNOT use `buildEntityPath` smoothing.
            // The physics engine has already output a ultra-dense Point[] array tracking
            // both the mathematical `arcTo` curve and the normal displacement math.
            // We must draw it purely using `lineTo`.
            if (entity.animations && entity.animations.length > 0 && this.animationEngine) {
                const denseMesh = this.animationEngine.calculateDeformedMesh(entity, timeMs, state);
                if (denseMesh.length > 0) {
                    path.moveTo(denseMesh[0].x, denseMesh[0].y);
                    for (let i = 1; i < denseMesh.length; i++) {
                        path.lineTo(denseMesh[i].x, denseMesh[i].y);
                    }
                }
            } else {
                // No vibrations, use standard Phase 1 rendering
                path = buildEntityPath(entity.vertices, entity.style.globalRadius);
            }

            this.ctx.lineWidth = entity.style.strokeWidth;
            this.ctx.strokeStyle = entity.style.strokeColor;
            this.ctx.lineJoin = 'round';
            this.ctx.lineCap = 'round';

            this.ctx.stroke(path);

            if (state.activeTool === 'EditPts') {
                const isSelected = state.selectedEntityId === entity.id;
                this.ctx.fillStyle = isSelected ? entity.style.strokeColor : '#99999966';
                this.ctx.strokeStyle = isSelected ? '#FFFFFF' : '#666666';
                this.ctx.lineWidth = 1;

                // Draw Base Vertices
                for (const pt of entity.vertices) {
                    this.ctx.beginPath();
                    this.ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
                    this.ctx.fill();
                    this.ctx.stroke();
                }

                // Draw Pluck Origin Node (only for the selected entity)
                if (isSelected && entity.animations && entity.animations.length > 0) {
                    let originX = entity.vertices[0].x;
                    let originY = entity.vertices[0].y;
                    if (this.animationEngine) {
                        const pt = this.animationEngine.getPluckOriginPoint(entity);
                        if (pt) {
                            originX = pt.x;
                            originY = pt.y;
                        }
                    }

                    this.ctx.fillStyle = '#FFEB3B';
                    this.ctx.strokeStyle = '#000000';
                    this.ctx.lineWidth = 1;
                    this.ctx.fillRect(originX - 6, originY - 6, 12, 12);
                    this.ctx.strokeRect(originX - 6, originY - 6, 12, 12);
                }
            }
        }
    }

    private imageCache: Map<string, HTMLImageElement> = new Map();
    private failedAssets: Set<string> = new Set();

    private getMimeType(buffer: Uint8Array): string {
        if (buffer.length < 4) return 'image/png'; // Default guess
        
        // PNG: 137 80 78 71
        if (buffer[0] === 137 && buffer[1] === 80 && buffer[2] === 78 && buffer[3] === 71) return 'image/png';
        
        // JPG: 255 216 255
        if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'image/jpeg';
        
        // GIF: 71 73 70 56
        if (buffer[0] === 71 && buffer[1] === 73 && buffer[2] === 70 && buffer[3] === 56) return 'image/gif';
        
        return 'image/png'; // Final fallback
    }

    private drawBackgroundImage(asset: any, canvasWidth: number, canvasHeight: number) {
        if (this.failedAssets.has(asset.id)) return;

        let img = this.imageCache.get(asset.id);
        
        if (!img) {
            const addLog = this.store.getState().addLog;
            addLog('info', `CanvasEngine: Creating new image for asset ${asset.id}`);
            img = new Image();
            
            const mimeType = this.getMimeType(asset.buffer);
            addLog('info', `CanvasEngine: Detected MIME type: ${mimeType}`);
            
            const blob = new Blob([asset.buffer], { type: mimeType });
            const url = URL.createObjectURL(blob);
            
            img.onload = () => {
                addLog('info', `CanvasEngine: Image loaded successfully: ${img?.naturalWidth}x${img?.naturalHeight}`);
            };
            
            img.onerror = (err) => {
                addLog('error', `CanvasEngine: Failed to load background image (Asset: ${asset.id}). This might be due to CSP or corrupt data.`);
                this.failedAssets.add(asset.id);
                this.imageCache.delete(asset.id);
                URL.revokeObjectURL(url);
            };
            
            img.src = url;
            this.imageCache.set(asset.id, img);
        }

        if (!img.complete || img.naturalWidth === 0) {
            // Still loading
            return;
        }

        // Implement "object-fit: cover" logic
        const imgAspect = img.naturalWidth / img.naturalHeight;
        const canvasAspect = canvasWidth / canvasHeight;

        let drawW, drawH, offsetX, offsetY;

        if (imgAspect > canvasAspect) {
            // Image is wider than canvas
            drawH = img.naturalHeight;
            drawW = img.naturalHeight * canvasAspect;
            offsetX = (img.naturalWidth - drawW) / 2;
            offsetY = 0;
        } else {
            // Image is taller than canvas
            drawW = img.naturalWidth;
            drawH = img.naturalWidth / canvasAspect;
            offsetX = 0;
            offsetY = (img.naturalHeight - drawH) / 2;
        }

        this.ctx.drawImage(
            img,
            offsetX, offsetY, drawW, drawH, // Source (cropped)
            0, 0, canvasWidth, canvasHeight // Destination (fill canvas)
        );
    }
}
