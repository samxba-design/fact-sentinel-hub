import { useState, useRef, useCallback, useEffect } from 'react';
import { AudioState } from '@/types/interview';

export function useAudioCapture() {
  const [state, setState] = useState<AudioState>({
    isCapturing: false,
    stream: null,
    error: null,
    audioLevel: 0,
  });

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number>(0);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  // Audio level monitoring
  const monitorLevel = useCallback(() => {
    if (!analyserRef.current) return;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    const level = Math.min(1, average / 128);
    setState((prev) => ({ ...prev, audioLevel: level }));
    animationRef.current = requestAnimationFrame(monitorLevel);
  }, []);

  // Capture system audio via getDisplayMedia
  const startCapture = useCallback(async () => {
    try {
      // Use getDisplayMedia for system audio capture
      // In Chrome, this lets the user share a tab/window with audio
      const displayStream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: {
          width: { ideal: 1 },
          height: { ideal: 1 },
          frameRate: { ideal: 0.1 },
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      // Extract only the audio track, stop video tracks to save resources
      const audioTracks = displayStream.getAudioTracks();
      displayStream.getVideoTracks().forEach((t: MediaStreamTrack) => t.stop());

      if (audioTracks.length === 0) {
        // Fallback: try microphone (user would need virtual audio cable)
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        streamRef.current = micStream;
      } else {
        // Create a new stream with just the audio track
        streamRef.current = new MediaStream(audioTracks);
      }

      // Set up audio context for level monitoring
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(streamRef.current);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const destination = audioContext.createMediaStreamDestination();

      // Connect: source → analyser (for monitoring) → destination (for STT)
      source.connect(analyser);
      source.connect(destination);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceNodeRef.current = source;
      destinationRef.current = destination;

      setState({
        isCapturing: true,
        stream: streamRef.current,
        error: null,
        audioLevel: 0,
      });

      monitorLevel();

      // Return the destination stream for speech recognition
      return destination.stream;
    } catch (err: any) {
      const message =
        err.name === 'AbortError'
          ? 'Screen share was cancelled.'
          : err.name === 'NotAllowedError'
          ? 'Permission denied. Please allow screen/audio sharing.'
          : `Audio capture failed: ${err.message}`;

      setState((prev) => ({ ...prev, error: message, isCapturing: false }));
      return null;
    }
  }, [monitorLevel]);

  const stopCapture = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    if (sourceNodeRef.current) sourceNodeRef.current.disconnect();
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
    }

    setState({
      isCapturing: false,
      stream: null,
      error: null,
      audioLevel: 0,
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  return {
    ...state,
    startCapture,
    stopCapture,
    stream: streamRef,
  };
}