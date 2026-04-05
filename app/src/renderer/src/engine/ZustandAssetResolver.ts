import { IAssetResolver } from './IAssetResolver';
import { AssetData } from '../store/types';
import { useAppStore } from '../store/useAppStore';

export class ZustandAssetResolver implements IAssetResolver {
    private imageCache: Map<string, HTMLImageElement> = new Map();
    private failedAssets: Set<string> = new Set();

    public resolveImage(asset: AssetData | { id?: string; assetId: string }): HTMLImageElement | null {
        // CONTENT IDENTITY: If assetId is present (ImageLayer cases), use it, 
        // otherwise use ID (full AssetData from store cases).
        const id = (asset as any).assetId || (asset as AssetData).id;
        if (!id) return null;

        if (this.imageCache.has(id)) {
            const cachedImg = this.imageCache.get(id)!;
            if (cachedImg.complete && cachedImg.naturalWidth === 0) {
                // This was a failed load, try to clear and re-read if it was a temporary blob
                if (!this.failedAssets.has(id)) {
                    this.imageCache.delete(id);
                } else {
                    return null;
                }
            } else {
                return cachedImg;
            }
        }

        const state = useAppStore.getState();
        // Try to find full AssetData in store using the provided ID or assetId
        const fullAsset = state.assets.images[id] || (asset as any).assetId && state.assets.images[(asset as any).assetId] || asset;

        let url = (fullAsset as AssetData).path || (asset as any).assetId || (asset as AssetData).id;
        let blobUrlManaged = false;

        if ((fullAsset as AssetData).buffer) {
            const buffer = (fullAsset as AssetData).buffer!;
            // Ensure buffer is hydrated as Uint8Array if it came from JSON
            let uint8;
            if (buffer instanceof Uint8Array) {
                uint8 = buffer;
            } else if (typeof buffer === 'object' && buffer !== null) {
                uint8 = new Uint8Array(Object.values(buffer));
            } else {
                uint8 = new Uint8Array(buffer as any);
            }

            const mimeType = this.getMimeType(uint8);
            const blob = new Blob([uint8], { type: mimeType });
            url = URL.createObjectURL(blob);
            blobUrlManaged = true;
        }

        if (!url) return null;

        const img = new Image();
        img.onload = () => {
            // Success
        };
        img.onerror = () => {
            console.error(`[RESOLVER] Failed to load image from URL: ${url?.slice(0, 50)}...`);
            this.failedAssets.add(id);
            if (blobUrlManaged && url) URL.revokeObjectURL(url);
        };

        // If it starts with blob: or data:, it's already a browser-ready URL
        img.src = url;
        this.imageCache.set(id, img);
        return img;
    }

    private getMimeType(buffer: Uint8Array): string {
        if (buffer.length > 4) {
            if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
            if (buffer[0] === 0xFF && buffer[1] === 0xD8) return 'image/jpeg';
            if (buffer[0] === 0x47 && buffer[1] === 0x49) return 'image/gif';
            if (buffer[0] === 0x3C && buffer[1] === 0x73) return 'image/svg+xml';
        }
        return 'image/png';
    }
}
