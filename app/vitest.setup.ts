import { vi } from 'vitest';

// jest-canvas-mock expects a global jest object
(global as any).jest = vi;
