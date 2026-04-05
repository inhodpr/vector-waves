import { describe, it, expect, vi } from 'vitest';
import { EventBus } from './EventBus';

describe('EventBus', () => {
    it('should register and trigger listeners', () => {
        const bus = new EventBus();
        const spy = vi.fn();
        
        bus.on('test-event', spy);
        bus.emit('test-event', { data: 123 });
        
        expect(spy).toHaveBeenCalledWith({ data: 123 });
    });

    it('should unregister listeners', () => {
        const bus = new EventBus();
        const spy = vi.fn();
        
        bus.on('test-event', spy);
        bus.off('test-event', spy);
        
        bus.emit('test-event', { data: 123 });
        expect(spy).not.toHaveBeenCalled();
    });

    it('should handle multiple listeners for the same event', () => {
        const bus = new EventBus();
        const spy1 = vi.fn();
        const spy2 = vi.fn();
        
        bus.on('test-event', spy1);
        bus.on('test-event', spy2);
        
        bus.emit('test-event', 'payload');
        
        expect(spy1).toHaveBeenCalledWith('payload');
        expect(spy2).toHaveBeenCalledWith('payload');
    });
});
