import { useState, useEffect } from 'react';
import { useAppStore } from './store/useAppStore';
import { CanvasContainer, canvasEngineInstance } from './components/CanvasContainer';
import { LeftToolbar } from './components/LeftToolbar';
import { PropertiesPanel } from './components/PropertiesPanel';
import { TimelinePanel } from './components/TimelinePanel';
import { TimelineManager } from './engine/TimelineManager';
import { AudioPlaybackAdapter } from './engine/AudioPlaybackAdapter';
import { ExportDialog } from './components/ExportDialog';

import { LiveAudioAdapter } from './engine/LiveAudioAdapter';
import { LivePanel } from './components/LivePanel';
import { LogPanel } from './components/LogPanel';

// Quick global styling for MVP
import './assets/main.css';

// Singletons for the app lifecycle
const defaultAudioAdapter = new AudioPlaybackAdapter();
const liveAudioAdapter = new LiveAudioAdapter();
const defaultTimelineManager = new TimelineManager(defaultAudioAdapter);

function App() {
  const [showExport, setShowExport] = useState(false);
  const liveMode = useAppStore(state => state.liveMode);
  const isDetachedMode = useAppStore(state => state.isDetachedMode);
  const detachedActive = useAppStore(state => state.detachedActive);

  // Initialize Detached Mode Handlers
  useEffect(() => {
    const windowAPI = (window as any).windowAPI;
    if (!windowAPI) return;

    // Listen for port setup
    const unsetPort = windowAPI.onSetupPort((port: MessagePort) => {
      useAppStore.getState().setMessagePort(port);
      liveAudioAdapter.setMessagePort(port);
      useAppStore.getState().addLog('info', `MessagePort initialized for ${isDetachedMode ? 'Detached' : 'Main'} window.`);
      
      // If we are the detached window, request initial state
      if (isDetachedMode) {
        port.postMessage({ type: 'REQUEST_INITIAL_SYNC' });
      }
    });

    // Listen for active status (Main Window only)
    const unsetActive = windowAPI.onDetachedActive((active: boolean) => {
      useAppStore.getState().setDetachedActive(active);
      if (active) {
        // Initial sync when window opens
        setTimeout(() => {
          useAppStore.getState().syncStateToPreview();
        }, 500); // Small delay to ensure port is ready at both ends
      }
    });

    return () => {
      unsetPort();
      unsetActive();
    };
  }, [isDetachedMode]);

  // Unified Sync Pulse (20Hz) - Main Window Only
  useEffect(() => {
    if (isDetachedMode) return;

    const interval = setInterval(() => {
      const state = useAppStore.getState();
      if (state.detachedActive && state.messagePort) {
        const timeSource = liveMode ? liveAudioAdapter : defaultAudioAdapter;
        state.messagePort.postMessage({
          type: 'SYNC_TIME',
          payload: {
            projectTimeMs: timeSource.getCurrentTimeMs(),
            audioHardwareTime: (timeSource as any).audioCtx?.currentTime || 0
          }
        });
      }
    }, 50); // 20Hz

    return () => clearInterval(interval);
  }, [isDetachedMode, liveMode, detachedActive]);

  // State Patching Subscription - Main Window Only
  useEffect(() => {
    if (isDetachedMode) return;

    // We subset the state to avoid syncing UI-only properties like 'logs' or 'isDragging'
    const unsubscribe = useAppStore.subscribe(
      (state) => ({
        entities: state.entities,
        entityIds: state.entityIds,
        audio: state.audio,
        backgroundColor: state.backgroundColor,
        canvasWidth: state.canvasWidth,
        canvasHeight: state.canvasHeight
      }),
      (slice) => {
        const state = useAppStore.getState();
        if (state.detachedActive) {
          state.syncStateToPreview(slice);
        }
      },
      { fireImmediately: false }
    );

    return unsubscribe;
  }, [isDetachedMode, detachedActive]);

  useEffect(() => {
    const handleOpenExport = () => setShowExport(true);
    window.addEventListener('open-export', handleOpenExport);
    
    // TL REQUIREMENT: Legacy Migration of Markers
    // We run this once on app mount to catch any markers without names.
    useAppStore.getState().migrateAudioMarkers();

    return () => window.removeEventListener('open-export', handleOpenExport);
  }, []);

  // Handle project reloading synchronization
  useEffect(() => {
    const handleProjectLoaded = async () => {
      const audioState = useAppStore.getState().audio;
      for (const track of audioState.tracks) {
        useAppStore.getState().addLog('info', `Reloading audio track: ${track.name}`);
        await defaultTimelineManager.reloadTrack(track.path);
      }
      
      // Update preview window if active
      useAppStore.getState().syncStateToPreview();
    };

    window.addEventListener('project-loaded', handleProjectLoaded);
    return () => window.removeEventListener('project-loaded', handleProjectLoaded);
  }, []);

  // Handle incoming time sync in detached window
  useEffect(() => {
    if (!isDetachedMode) return;

    const handleSyncTime = (e: any) => {
      const { projectTimeMs } = e.detail;
      (window as any).__LAST_SYNC_TIME__ = projectTimeMs;
      (window as any).__LAST_SYNC_RECEIVED_AT__ = performance.now();
    };

    const handleDetachedPluck = (e: any) => {
      const { slotId, intensity, timestampMs } = e.detail;
      const [entityId, animId] = slotId.split('-');
      const state = useAppStore.getState();
      const entity = state.entities[entityId];
      if (entity && entity.type === 'Line') {
        const anim = entity.animations.find(a => a.id === animId);
        if (anim) {
          const activeTriggers = (anim.activeTriggers || [])
            .filter(t => timestampMs - t.timestampMs < 2000);
          state.updateVibrationAnim(entityId, animId, {
            activeTriggers: [
              ...activeTriggers,
              { timestampMs, intensity }
            ]
          });
        }
      }
    };

    window.addEventListener('sync-time', handleSyncTime);
    window.addEventListener('detached-pluck', handleDetachedPluck);
    return () => {
      window.removeEventListener('sync-time', handleSyncTime);
      window.removeEventListener('detached-pluck', handleDetachedPluck);
    };
  }, [isDetachedMode]);

  // Sync engine clock with the active mode
  useEffect(() => {
    if (canvasEngineInstance) {
      if (isDetachedMode) {
        // Detached window uses a "Predictive" time source
        canvasEngineInstance.setTimeSource({
          getCurrentTimeMs: () => {
            const lastSync = (window as any).__LAST_SYNC_TIME__ || 0;
            const receivedAt = (window as any).__LAST_SYNC_RECEIVED_AT__ || performance.now();
            return lastSync + (performance.now() - receivedAt);
          },
          onTimeUpdate: () => {},
          removeTimeUpdateListener: () => {}
        });
      } else {
        canvasEngineInstance.setTimeSource(liveMode ? liveAudioAdapter : defaultAudioAdapter);
      }
    }
  }, [liveMode, isDetachedMode]);

  if (isDetachedMode) {
    return (
      <div style={{ height: '100vh', width: '100vw', backgroundColor: '#000', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <CanvasContainer />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <LivePanel adapter={liveAudioAdapter} />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        <LeftToolbar />
        <div style={{ flex: 1, position: 'relative', display: 'flex' }}>
          <CanvasContainer timeSource={liveMode ? liveAudioAdapter : defaultAudioAdapter} />
          {detachedActive && (
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(4px)',
              display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
              zIndex: 100
            }}>
              <h2 style={{ color: '#333', marginBottom: '1rem' }}>Preview Detached</h2>
              <button 
                onClick={() => (window as any).windowAPI.toggleDetachedPreview()}
                style={{
                  padding: '10px 20px', backgroundColor: '#4a90e2', color: 'white',
                  border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
                }}
              >
                Reattach Preview
              </button>
            </div>
          )}
        </div>
        <PropertiesPanel />
      </div>
      {!liveMode && <TimelinePanel timelineManager={defaultTimelineManager} />}
      <LogPanel />
      {showExport && <ExportDialog engine={canvasEngineInstance} timelineManager={defaultTimelineManager} onClose={() => setShowExport(false)} />}
    </div>
  )
}

export default App
