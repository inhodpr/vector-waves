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
    }
};
