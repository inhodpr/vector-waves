# Case Study: Video Export Issues

## Symptoms
1. **Truncated Video**: The exported video is always 10 seconds long, regardless of the project length.
2. **Missing Audio**: The exported video contains no sound.

## Root Cause Analysis

### 1. Hardcoded Export Duration
In `app/src/renderer/src/components/ExportDialog.tsx`, the duration for the export is explicitly hardcoded to 10,000 milliseconds (10 seconds) if audio tracks are present, and 5,000 milliseconds otherwise.

```typescript
// app/src/renderer/src/components/ExportDialog.tsx:21
const durationMs = audioTracks.length > 0 ? 10000 : 5000; // Mock duration for now
```

This "mock" implementation was never replaced with the actual duration of the audio track.

### 2. Missing Audio Integration in FFmpeg
The backend export logic in `app/src/main/index.ts` only listens for image frames through a pipe. It does not accept or process any audio input.

```typescript
// app/src/main/index.ts:135
ffmpegProcess = spawn('ffmpeg', [
  '-y',
  '-f', 'image2pipe',
  '-vcodec', 'mjpeg',
  '-r', fps.toString(),
  '-i', '-',
  '-vcodec', 'libx264',
  '-pix_fmt', 'yuv420p',
  '-r', fps.toString(),
  filePath
]);
```

The command lacks an `-i` flag for the audio track and the corresponding mapping logic.

### 3. State Awareness Gap
The `ExportManager` (frontend) does not communicate the audio track path to the main process when starting an export. Even if the main process were ready to include audio, it wouldn't know which file to use.

## Recommended Fixes

### Phase 1: Expose Audio Duration
Modify `AudioPlaybackAdapter.ts` to provide the duration of the loaded audio buffer.

### Phase 2: Dynamic Duration in UI
Update `ExportDialog.tsx` to retrieve the actual duration from the audio adapter instead of using hardcoded values.

### Phase 3: Pass Audio Path to Main Process
Update `ExportManager.ts` to include the path of the primary audio track in the `start-export` IPC call.

### Phase 4: Update FFmpeg Command
Modify the `start-export` handler in `app/src/main/index.ts` to:
1. Accept an optional `audioPath`.
2. Construct the FFmpeg command with the audio input:
   ```bash
   ffmpeg -y -f image2pipe -vcodec mjpeg -r $FPS -i - -i $AUDIO_PATH -vcodec libx264 -pix_fmt yuv420p -shortest $OUTPUT_PATH
   ```
