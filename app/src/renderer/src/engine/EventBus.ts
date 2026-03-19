type Callback = (...args: any[]) => void;

export class EventBus {
    private listeners: Record<string, Callback[]> = {};

    public on(event: string, callback: Callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    public off(event: string, callback: Callback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }

    public emit(event: string, ...args: any[]) {
        if (!this.listeners[event]) return;
        for (const callback of this.listeners[event]) {
            callback(...args);
        }
    }
}
