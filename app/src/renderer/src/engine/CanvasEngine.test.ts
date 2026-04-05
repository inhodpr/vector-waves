import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CanvasEngine } from './CanvasEngine';
import { useAppStore } from '../store/useAppStore';
import { EventBus } from './EventBus';

describe('CanvasEngine', () => {
    let canvas: HTMLCanvasElement;
    let mockContext: any;
    let mockAnimEngine: any;
    let engine: CanvasEngine;
    let mockPath: any;

    beforeEach(() => {
        mockPath = {
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            arc: vi.fn(),
            closePath: vi.fn(),
            fill: vi.fn(),
            stroke: vi.fn()
        };
        vi.stubGlobal('Path2D', class {
            constructor() { return mockPath; }
        });
        mockContext = {
            canvas: { width: 800, height: 600 },
            clearRect: vi.fn(),
            fillRect: vi.fn(),
            strokeRect: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            arc: vi.fn(),
            fill: vi.fn(),
            stroke: vi.fn(),
            clip: vi.fn(),
            save: vi.fn(),
            restore: vi.fn(),
            translate: vi.fn(),
            scale: vi.fn(),
            drawImage: vi.fn(),
            rect: vi.fn(),
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 1
        };

        canvas = {
            getContext: vi.fn().mockReturnValue(mockContext)
        } as any;

        mockAnimEngine = {
            calculateDeformedMesh: vi.fn().mockReturnValue([]),
            getPluckOriginPoint: vi.fn()
        };

        const mockAssetResolver = {
            resolveImage: vi.fn().mockReturnValue(new Image())
        };

        engine = new CanvasEngine(canvas, useAppStore.getState, mockAssetResolver as any, new EventBus(), mockAnimEngine);
        
        // Reset store
        useAppStore.setState({
            entityIds: [],
            entities: {},
            backgroundColor: '#000000',
            backgroundImageAssetId: null,
            canvasWidth: 800,
            canvasHeight: 600,
            activeTool: 'Select',
            selectedEntityId: null,
            assets: { images: {} },
            logs: []
        });

        // Global mocks for Image and URL
        vi.stubGlobal('URL', {
            createObjectURL: vi.fn().mockReturnValue('blob:test'),
            revokeObjectURL: vi.fn()
        });

        class ImageMock {
            complete = true;
            naturalWidth = 1000;
            naturalHeight = 1000;
            src = '';
            onload: any = null;
            onerror: any = null;
        }
        vi.stubGlobal('Image', ImageMock);
        vi.stubGlobal('Blob', vi.fn());
    });

    it('should initialize and clear canvas', () => {
        engine.draw();
        expect(mockContext.clearRect).toHaveBeenCalled();
    });

    it('should draw a solid background', () => {
        useAppStore.setState({ backgroundColor: '#ff00ff' });
        engine.draw();
        expect(mockContext.fillStyle).toBe('#ff00ff');
        expect(mockContext.fillRect).toHaveBeenCalled();
    });

    it('should render a line entity with fill', () => {
        const line = {
            id: 'l1',
            type: 'Line',
            vertices: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
            style: { strokeWidth: 5, strokeColor: '#ff0000', fillColor: '#00ff00', globalRadius: 0 }
        };
        useAppStore.setState({
            entityIds: ['l1'],
            entities: { 'l1': line } as any
        });

        engine.draw();
        expect(mockContext.fillStyle).toBe('#00ff00');
        expect(mockContext.fill).toHaveBeenCalled();
    });

    it('should draw overlays in EditPts tool mode', () => {
        const line = {
            id: 'l1',
            type: 'Line',
            vertices: [{ x: 10, y: 10 }],
            style: { strokeWidth: 2, strokeColor: '#000000' }
        };
        useAppStore.setState({
            activeTool: 'EditPts',
            selectedEntityId: 'l1',
            entityIds: ['l1'],
            entities: { 'l1': line } as any
        });

        engine.draw();
        expect(mockContext.arc).toHaveBeenCalledWith(10, 10, 5, 0, Math.PI * 2);
    });

    it('should draw pluck origin marker for selected line with animations', () => {
        const line = {
            id: 'l1',
            type: 'Line',
            vertices: [{ x: 10, y: 10 }, { x: 90, y: 90 }],
            animations: [{ type: 'Pluck' }],
            style: { strokeWidth: 2, strokeColor: '#000000' }
        };
        useAppStore.setState({
            activeTool: 'EditPts',
            selectedEntityId: 'l1',
            entityIds: ['l1'],
            entities: { 'l1': line } as any
        });

        mockAnimEngine.getPluckOriginPoint.mockReturnValue({ x: 50, y: 50 });

        engine.draw();
        expect(mockContext.fillRect).toHaveBeenCalledWith(50 - 6, 50 - 6, 12, 12);
    });

    it('should handle background image rendering and caching', () => {
        const asset = { id: 'a1', buffer: new Uint8Array([255, 216, 255]) }; // JPG
        useAppStore.setState({
            backgroundImageAssetId: 'a1',
            assets: { images: { 'a1': asset } } as any
        });

        // First call creates image
        engine.draw();
        // Second call draws because mock is already "complete"
        engine.draw();
        
        expect(mockContext.drawImage).toHaveBeenCalled();
        expect(URL.createObjectURL).toHaveBeenCalled();
    });

    it('should apply background transformations', () => {
        const asset = { id: 'a1', buffer: new Uint8Array([255, 216, 255]) };
        useAppStore.setState({
            backgroundImageAssetId: 'a1',
            assets: { images: { 'a1': asset } } as any,
            backgroundImageTransform: { x: 50, y: -20, scale: 1.5 }
        });

        engine.draw(); // create
        engine.draw(); // draw
        
        expect(mockContext.drawImage).toHaveBeenCalled();
    });

    it('should detect MIME types correctly', () => {
        const jpg = new Uint8Array([255, 216, 255, 0]);
        const png = new Uint8Array([137, 80, 78, 71, 0]);
        const gif = new Uint8Array([71, 73, 70, 56, 0]);
        
        expect((engine as any).getMimeType(jpg)).toBe('image/jpeg');
        expect((engine as any).getMimeType(png)).toBe('image/png');
        expect((engine as any).getMimeType(gif)).toBe('image/gif');
        expect((engine as any).getMimeType(new Uint8Array([0,0,0,0]))).toBe('image/png');
    });

    it('should update timestamp from time source', () => {
        const mockTimeSource = { 
            getCurrentTimeMs: vi.fn().mockReturnValue(555),
            onTimeUpdate: vi.fn(),
            removeTimeUpdateListener: vi.fn()
        };
        engine.setTimeSource(mockTimeSource as any);
        
        engine.update(100); 
        expect((engine as any).lastTickMs).toBe(555);
    });

    it('should render deformed mesh if animations present', () => {
        const line = {
            id: 'l1',
            type: 'Line',
            vertices: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
            animations: [{ type: 'Pluck' }],
            style: { strokeWidth: 2, strokeColor: '#000000' }
        };
        useAppStore.setState({
            entityIds: ['l1'],
            entities: { 'l1': line } as any
        });
        
        mockAnimEngine.calculateDeformedMesh.mockReturnValue([{x: 5, y: 5}, {x: 95, y: 95}]);
        
        engine.draw();
        expect(mockPath.lineTo).toHaveBeenCalledWith(95, 95);
    });
});
