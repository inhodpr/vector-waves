import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Ticker } from './Ticker';

describe('Ticker', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should start and emit ticks', () => {
        const ticker = new Ticker();
        const spy = vi.fn();
        ticker.addCallback(spy);
        
        ticker.start();
        
        // Mock requestAnimationFrame
        vi.runOnlyPendingTimers();
        
        expect(spy).toHaveBeenCalledWith(expect.any(Number));
    });

    it('should stop emitting ticks after stop()', () => {
        const ticker = new Ticker();
        const spy = vi.fn();
        ticker.addCallback(spy);
        
        ticker.start();
        vi.runOnlyPendingTimers();
        expect(spy).toHaveBeenCalled();
        
        const callCount = spy.mock.calls.length;
        ticker.stop();
        
        vi.runOnlyPendingTimers();
        expect(spy.mock.calls.length).toBe(callCount);
    });

    it('should remove callbacks', () => {
        const ticker = new Ticker();
        const spy = vi.fn();
        ticker.addCallback(spy);
        ticker.removeCallback(spy);
        
        ticker.start();
        vi.runOnlyPendingTimers();
        expect(spy).not.toHaveBeenCalled();
    });
});
