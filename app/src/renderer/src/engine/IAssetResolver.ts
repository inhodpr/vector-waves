import { AssetData } from '../store/types';

export interface IAssetResolver {
    resolveImage(asset: AssetData | { id: string, assetId: string }): HTMLImageElement | null;
}
