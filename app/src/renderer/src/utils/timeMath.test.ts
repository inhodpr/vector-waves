import { describe, it, expect } from 'vitest';
import { TimeMath } from './timeMath';

describe('timeMath', () => {
    describe('formatTime', () => {
        it('should format seconds and milliseconds correctly', () => {
            expect(TimeMath.formatTime(0)).toBe('00:00.000');
            expect(TimeMath.formatTime(1000)).toBe('00:01.000');
            expect(TimeMath.formatTime(61500)).toBe('01:01.500');
        });
    });

    describe('conversion', () => {
        it('should convert pixels to ms and vice versa', () => {
            const zoom = 1; // 1px per ms
            expect(TimeMath.timeToPixel(1000, 1)).toBe(1000);
            expect(TimeMath.pixelToTime(1000, 1)).toBe(1000);
            
            expect(TimeMath.timeToPixel(1000, 2, 500)).toBe(1500); // (1000 * 2) - 500
            expect(TimeMath.pixelToTime(1500, 2, 500)).toBe(1000); // (1500 + 500) / 2
        });
    });
});
