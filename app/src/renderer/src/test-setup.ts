import { vi } from 'vitest';

// Mock Web Audio API
class AudioContextMock {
  state = 'suspended';
  decodeAudioData = vi.fn().mockResolvedValue({});
  createBufferSource = vi.fn().mockReturnValue({
    buffer: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null,
  });
  createAnalyser = vi.fn().mockReturnValue({
    connect: vi.fn(),
    disconnect: vi.fn(),
    fftSize: 2048,
    frequencyBinCount: 1024,
    getByteFrequencyData: vi.fn(),
  });
  createBiquadFilter = vi.fn().mockReturnValue({
    connect: vi.fn(),
    disconnect: vi.fn(),
    type: 'lowpass',
    frequency: { value: 350 },
    Q: { value: 1 },
    gain: { value: 0 },
  });
  audioWorklet = {
    addModule: vi.fn().mockResolvedValue(undefined),
  };
  createMediaStreamSource = vi.fn().mockReturnValue({
    connect: vi.fn(),
  });
  destination = {};
  resume = vi.fn().mockImplementation(() => {
    this.state = 'running';
    return Promise.resolve();
  });
  close = vi.fn().mockResolvedValue(undefined);
  currentTime = 0;
  sampleRate = 44100;
}

(global as any).AudioContext = AudioContextMock;

// Mock Path2D
class Path2DMock {
  moveTo = vi.fn();
  lineTo = vi.fn();
  arc = vi.fn();
  arcTo = vi.fn();
  closePath = vi.fn();
  addPath = vi.fn();
}
(global as any).Path2D = Path2DMock;

// Mock Electron IPC
(global as any).window = (global as any).window || {};
(global as any).window.electron = {
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    send: vi.fn(),
  },
};

// Mock URLSearchParams
if (!(global as any).URLSearchParams) {
    (global as any).URLSearchParams = class {
        constructor(search: string) { }
        get(name: string) { return null; }
    };
}
