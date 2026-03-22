export const TimeMath = {
    /**
     * Converts an exact timestamp to an infinite virtual pixel X coordinate.
     * zoomLevel = Pixels per millisecond.
     */
    timeToPixel: (timeMs: number, zoomLevel: number, viewportOffsetPixels: number = 0): number => {
        return (timeMs * zoomLevel) - viewportOffsetPixels;
    },

    /**
     * Converts a user mouse click X coordinate back to absolute milliseconds.
     */
    pixelToTime: (pixelX: number, zoomLevel: number, viewportOffsetPixels: number = 0): number => {
        return (pixelX + viewportOffsetPixels) / zoomLevel;
    },

    /**
     * Formats milliseconds into MM:SS.mmm
     */
    formatTime: (timeMs: number): string => {
        const totalSeconds = Math.floor(timeMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const milliseconds = Math.floor(timeMs % 1000);
        
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
    }
};
