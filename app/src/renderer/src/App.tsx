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
    };

    window.addEventListener('project-loaded', handleProjectLoaded);
    return () => window.removeEventListener('project-loaded', handleProjectLoaded);
  }, []);

  // Sync engine clock with the active mode
  useEffect(() => {
    if (canvasEngineInstance) {
      canvasEngineInstance.setTimeSource(liveMode ? liveAudioAdapter : defaultAudioAdapter);
    }
  }, [liveMode]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <LivePanel adapter={liveAudioAdapter} />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <LeftToolbar />
        <CanvasContainer timeSource={liveMode ? liveAudioAdapter : defaultAudioAdapter} />
        <PropertiesPanel />
      </div>
      {!liveMode && <TimelinePanel timelineManager={defaultTimelineManager} />}
      <LogPanel />
      {showExport && <ExportDialog engine={canvasEngineInstance} onClose={() => setShowExport(false)} />}
    </div>
  )
}

export default App
