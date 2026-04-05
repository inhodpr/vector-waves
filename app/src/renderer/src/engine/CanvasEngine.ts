import { IAnimationEngine } from './IAnimationEngine';
import { ITimeSource } from './ITimeSource';
import { EventBus } from './EventBus';
import { CanvasEntity } from '../store/types';
import { buildEntityPath } from '../utils/geometry';
import { ProjectState } from './ProjectState';
import { IAssetResolver } from './IAssetResolver';

export class CanvasEngine {
    private ctx: CanvasRenderingContext2D;
    private getState: () => ProjectState;
    private assetResolver: IAssetResolver;
    private timeSource: ITimeSource | null = null;
    private _debugLogged: boolean = false;

    private animationEngine: IAnimationEngine | null = null;
    private viewportTransform = { x: 0, y: 0, scale: 1.0 };


    constructor(
        canvas: HTMLCanvasElement,
        getState: () => ProjectState,
        assetResolver: IAssetResolver,
        _eventBus: EventBus,
        animEngine: IAnimationEngine,
        timeSource?: ITimeSource
    ) {
        this.ctx = canvas.getContext('2d')!;
        this.getState = getState;
        this.assetResolver = assetResolver;
        this.animationEngine = animEngine;
        if (timeSource) {
            this.timeSource = timeSource;
        }
    }

    public setTimeSource(timeSource: ITimeSource) {
        this.timeSource = timeSource;
    }

    public setViewportTransform(transform: { x: number; y: number; scale: number }) {
        this.viewportTransform = transform;
    }

    private lastTickMs: number = 0;

    public update(timestamp: number, force: boolean = false) {
        const timeMs = (this.timeSource && !force) ? this.timeSource.getCurrentTimeMs() : timestamp;
        this.lastTickMs = timeMs;
    }

    public draw() {
        if (!this.ctx) return;

        this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
        const state = this.getState();
        
        this.ctx.save();
        this.ctx.translate(this.viewportTransform.x, this.viewportTransform.y);
        this.ctx.scale(this.viewportTransform.scale, this.viewportTransform.scale);
        
        // Render background

        if (state.backgroundImageAssetId && state.assets.images[state.backgroundImageAssetId]) {
            const asset = state.assets.images[state.backgroundImageAssetId];
            this.drawBackgroundImage(asset, state.canvasWidth, state.canvasHeight);
        } else {
            this.ctx.fillStyle = state.backgroundColor;
            this.ctx.fillRect(0, 0, state.canvasWidth, state.canvasHeight);
        }

        // Draw entities in Z-Order
        for (const id of state.entityIds) {
            const entity = state.entities[id];
            if (entity) {
                switch (entity.type) {
                    case 'Line':
                        this.renderEntity(entity, state, this.lastTickMs);
                        break;
                    case 'Image':
                        this.drawImage(entity);
                        break;
                    case 'ImageLayer':
                        this.drawImageLayer(entity, state);
                        break;
                    default:
                        console.warn(`[ENGINE] Unknown entity type: ${(entity as any).type}`);
                }
            }
        }

        this.ctx.restore();
    }

    private drawImage(entity: any) {
        const img = this.assetResolver.resolveImage({ id: entity.assetId, assetId: entity.assetId });
        if (!img || !img.complete || img.naturalWidth === 0) return;
        this.ctx.save();
        this.ctx.drawImage(img, entity.x, entity.y, entity.width, entity.height);
        this.ctx.restore();
    }

    private renderEntity(entity: CanvasEntity, state: ProjectState, timeMs: number) {
        if (entity.type === 'Line') {
            let path = new Path2D();

            if (entity.animations && entity.animations.length > 0 && this.animationEngine) {
                const denseMesh = this.animationEngine.calculateDeformedMesh(entity, timeMs, state as any);
                if (!this._debugLogged) {
                    console.log(`[ENGINE] Entity ${entity.id}: anims=${entity.animations.length}, mesh.length=${denseMesh.length}, timeMs=${timeMs}, vertices=${entity.vertices.length}`);
                    this._debugLogged = true;
                    setTimeout(() => { this._debugLogged = false; }, 5000);
                }
                if (denseMesh.length > 1) {
                    path.moveTo(denseMesh[0].x, denseMesh[0].y);
                    for (let i = 1; i < denseMesh.length; i++) {
                        path.lineTo(denseMesh[i].x, denseMesh[i].y);
                    }
                } else {
                    path = buildEntityPath(entity.vertices, entity.style.globalRadius);
                }
            } else {
                path = buildEntityPath(entity.vertices, entity.style.globalRadius);
            }

            this.ctx.lineWidth = entity.style.strokeWidth;
            this.ctx.strokeStyle = entity.style.strokeColor;
            this.ctx.lineJoin = 'round';
            this.ctx.lineCap = 'round';

            this.ctx.stroke(path);
            
            if (entity.style.fillColor && entity.style.fillColor !== 'transparent') {
                this.ctx.fillStyle = entity.style.fillColor;
                this.ctx.fill(path);
            }

            if (state.activeTool === 'EditPts') {
                const isSelected = state.selectedEntityId === entity.id;
                this.ctx.fillStyle = isSelected ? entity.style.strokeColor : '#99999966';
                this.ctx.strokeStyle = isSelected ? '#FFFFFF' : '#666666';
                this.ctx.lineWidth = 1;

                for (const pt of entity.vertices) {
                    this.ctx.beginPath();
                    this.ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
                    this.ctx.fill();
                    this.ctx.stroke();
                }

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

    private drawImageLayer(entity: any, _state: ProjectState) {
        const img = this.assetResolver.resolveImage({ id: entity.id, assetId: entity.assetId });
        if (!img || !img.complete || img.naturalWidth === 0) return;

        this.ctx.save();
        this.ctx.translate(entity.x, entity.y);
        this.ctx.scale(entity.scale, entity.scale);

        const hasCrop = entity.cropX || entity.cropY || entity.cropWidth || entity.cropHeight;
        if (hasCrop) {
            const sx = entity.cropX || 0;
            const sy = entity.cropY || 0;
            const sw = entity.cropWidth || img.naturalWidth;
            const sh = entity.cropHeight || img.naturalHeight;
            this.ctx.drawImage(img, sx, sy, sw, sh, 0, 0, entity.width, entity.height);
        } else {
            this.ctx.drawImage(img, 0, 0);
        }
        
        this.ctx.restore();
    }

    private drawBackgroundImage(asset: any, canvasWidth: number, canvasHeight: number) {
        const state = this.getState();
        const img = this.assetResolver.resolveImage(asset);
        
        if (!img || !img.complete || img.naturalWidth === 0) {
            return;
        }

        const transform = state.backgroundImageTransform || { x: 0, y: 0, scale: 1.0 };

        const imgAspect = img.naturalWidth / img.naturalHeight;
        const canvasAspect = canvasWidth / canvasHeight;

        let drawW, drawH, sourceX, sourceY;

        if (imgAspect > canvasAspect) {
            drawH = img.naturalHeight;
            drawW = img.naturalHeight * canvasAspect;
            sourceX = (img.naturalWidth - drawW) / 2;
            sourceY = 0;
        } else {
            drawW = img.naturalWidth;
            drawH = img.naturalWidth / canvasAspect;
            sourceX = 0;
            sourceY = (img.naturalHeight - drawH) / 2;
        }
        
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(0, 0, canvasWidth, canvasHeight);
        this.ctx.clip();

        this.ctx.translate(canvasWidth / 2 + transform.x, canvasHeight / 2 + transform.y);
        this.ctx.scale(transform.scale, transform.scale);
        this.ctx.translate(-canvasWidth / 2, -canvasHeight / 2);

        this.ctx.drawImage(
            img,
            sourceX, sourceY, drawW, drawH,
            0, 0, canvasWidth, canvasHeight
        );

        this.ctx.restore();
    }
}
