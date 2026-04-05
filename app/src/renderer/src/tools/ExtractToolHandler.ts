import React from 'react';
import { AppState, Point } from '../store/types';
import { useAppStore } from '../store/useAppStore';
import { IToolHandler } from './IToolHandler';
import { LineExtractor, RGB } from '../utils/LineExtractor';
import { ZustandAssetResolver } from '../engine/ZustandAssetResolver';

export class ExtractToolHandler implements IToolHandler {
    private points: Point[] = [];
    private targetColor: RGB | null = null;
    private lastClickTime: number = 0;
    private doubleClickDelay: number = 300;
    private isExtracting: boolean = false;
    private targetLayerId: string | null = null;

    onMouseDown(e: React.MouseEvent<HTMLCanvasElement>, state: AppState, ctx: CanvasRenderingContext2D) {
        if (this.isExtracting) return;

        const now = Date.now();
        const ox = e.nativeEvent.offsetX;
        const oy = e.nativeEvent.offsetY;

        this.lastClickTime = now;

        // First click sets the target color and identifies the target layer
        if (this.points.length === 0) {
            const targetLayer = this.findTargetLayer(ox, oy, state);
            if (!targetLayer) {
                useAppStore.getState().addLog('warn', 'No image layer found at this position.');
                return;
            }
            this.targetLayerId = targetLayer.id;

            // Sample color from the canvas (for UX convenience, we sample the screen pixel)
            const pixel = ctx.getImageData(ox, oy, 1, 1).data;
            this.targetColor = { r: pixel[0], g: pixel[1], b: pixel[2] };
        }

        this.points.push({ x: ox, y: oy });
        
        // Visual feedback
        this.drawPreview(ctx);
    }

    onMouseMove(e: React.MouseEvent<HTMLCanvasElement>, _state: AppState, ctx: CanvasRenderingContext2D) {
        if (this.isExtracting || this.points.length === 0) return;
        
        // We don't update state here to avoid jitter, just draw preview
        this.drawPreview(ctx, { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
    }

    onMouseUp(_e: React.MouseEvent<HTMLCanvasElement>, _state: AppState, _ctx: CanvasRenderingContext2D) {
        // No-op
    }

    onKeyDown(e: React.KeyboardEvent<HTMLCanvasElement>, state: AppState) {
        if (e.key === 'Escape') {
            if (this.points.length >= 2) {
                this.handleExtraction(state);
            } else {
                this.reset();
            }
        }
    }

    private drawPreview(ctx: CanvasRenderingContext2D, mousePos?: Point) {
        // This is a bit tricky because the CanvasEngine is also drawing.
        // Usually, tools draw on a separate "overlay" canvas or we trigger a re-draw.
        // In this project, the CanvasEngine draws 60fps. 
        // We can't easily "inject" a drawing here without it being cleared by the next frame.
        // However, we can store the "draft" in the state if we want persistent preview.
        // For simplicity, let's assume the user sees the points as they click.
    }

    private async handleExtraction(state: AppState, ctx?: CanvasRenderingContext2D) {
        if (!this.targetColor || this.points.length < 2 || !this.targetLayerId) return;

        const layer = state.entities[this.targetLayerId] as any; // ImageLayerEntity
        if (!layer) return;

        this.isExtracting = true;
        useAppStore.getState().setIsExtracting(true);

        try {
            // 1. Resolve targeted Layer's Image using the same logic as the engine
            const resolver = new ZustandAssetResolver();
            const img = resolver.resolveImage({ id: layer.id, assetId: layer.assetId });
            if (!img) throw new Error('Could not resolve layer image.');
            
            // Wait for image to load if not cached or complete
            if (!img.complete) {
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                });
            }

            const offCanvas = new OffscreenCanvas(layer.width, layer.height);
            const offCtx = offCanvas.getContext('2d')!;
            offCtx.drawImage(img, 0, 0, layer.width, layer.height);
            const layerImageData = offCtx.getImageData(0, 0, layer.width, layer.height);

            // 2. Project Points: Global -> Layer Local
            const localPoints = this.points.map(p => ({
                x: (p.x - layer.x) / layer.scale,
                y: (p.y - layer.y) / layer.scale
            }));
            
            // 3. Ridge Tracing
            const ridgePathLocal = LineExtractor.analyzeRidge(
                localPoints,
                layerImageData,
                this.targetColor,
                30 // tolerance
            );

            // 4. Transform Ridge back to Global Space for the new LineEntity
            const ridgePathGlobal = ridgePathLocal.map(p => ({
                x: p.x * layer.scale + layer.x,
                y: p.y * layer.scale + layer.y
            }));

            // 5. Erase the line from the source layer image and get new data
            const strokeWidth = 5;
            const uint8Buffer = await LineExtractor.eraseLineFromImage(
                ridgePathLocal,
                strokeWidth,
                offCanvas
            );

            // 6. Update the source layer's asset with the modified image (PERSISTENTLY)
            const newAssetId = `img_edited_${Date.now()}`;
            useAppStore.getState().addImageAsset({
                id: newAssetId,
                path: `edited_${layer.id}.png`,
                buffer: uint8Buffer
            });
            useAppStore.getState().updateEntity(layer.id, { assetId: newAssetId } as any);

            // 7. Add the new extracted line entity
            const lineId = `line_extracted_${Date.now()}`;
            useAppStore.getState().addEntity({
                id: lineId,
                type: 'Line',
                vertices: ridgePathGlobal,
                style: {
                    strokeColor: `rgb(${this.targetColor.r}, ${this.targetColor.g}, ${this.targetColor.b})`,
                    strokeWidth,
                    fillColor: 'transparent',
                    globalRadius: 0
                },
                pluckOrigin: 0.5,
                zIndex: state.entityIds.length,
                animations: [],
            });

            useAppStore.getState().setSelectedEntityId(lineId);
            useAppStore.getState().addLog('info', `Successfully extracted line from layer ${layer.id}.`);

        } catch (error) {
            console.error('Extraction failed', error);
            useAppStore.getState().addLog('error', 'Line extraction failed. See console for details.');
        } finally {
            this.isExtracting = false;
            useAppStore.getState().setIsExtracting(false);
            this.reset();
        }
    }

    private findTargetLayer(ox: number, oy: number, state: AppState): any | null {
        // Top-to-bottom hit test
        for (let i = state.entityIds.length - 1; i >= 0; i--) {
            const id = state.entityIds[i];
            const entity = state.entities[id];
            if (entity && entity.type === 'ImageLayer') {
                const lx = (ox - (entity as any).x) / (entity as any).scale;
                const ly = (oy - (entity as any).y) / (entity as any).scale;
                if (lx >= 0 && lx < (entity as any).width && ly >= 0 && ly < (entity as any).height) {
                    return entity;
                }
            }
        }
        return null;
    }

    private loadImage(url: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = url;
        });
    }

    private reset() {
        this.points = [];
        this.targetColor = null;
        this.isExtracting = false;
        this.targetLayerId = null;
    }
}
