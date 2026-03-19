import React from 'react';
import { AppState } from '../store/types';

export interface IToolHandler {
    onMouseDown(e: React.MouseEvent<HTMLCanvasElement>, state: AppState, ctx: CanvasRenderingContext2D): void;
    onMouseMove(e: React.MouseEvent<HTMLCanvasElement>, state: AppState, ctx: CanvasRenderingContext2D): void;
    onMouseUp(e: React.MouseEvent<HTMLCanvasElement>, state: AppState, ctx: CanvasRenderingContext2D): void;
    onKeyDown?(e: React.KeyboardEvent<HTMLCanvasElement>, state: AppState): void;
}
