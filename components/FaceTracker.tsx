'use client';

import React, { useEffect, useRef, useState } from 'react';

interface FaceTrackerProps {
  onMotion: (motion: { roll: number; pitch: number }) => void;
  isActive: boolean;
}

declare global {
  interface Window {
    FaceMesh: any;
    Camera: any;
  }
}

export const FaceTracker: React.FC<FaceTrackerProps> = ({ onMotion, isActive }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [libsLoaded, setLibsLoaded] = useState(false);

  const smoothingRef = useRef(0.2);
  const rollHistoryRef = useRef<number[]>([]);
  const pitchHistoryRef = useRef<number[]>([]);
  const MAX_HISTORY = 8;

  const smoothNoseYRef = useRef<number | null>(null);
  const centerNoseYRef = useRef<number | null>(null);
  const smoothRollRef = useRef(0);
  const centerRollRef = useRef(0);

  const isActiveRef = useRef(isActive);
  const onMotionRef = useRef(onMotion);

  useEffect(() => {
    isActiveRef.current = isActive;
    onMotionRef.current = onMotion;
  }, [isActive, onMotion]);

  useEffect(() => {
    // Reset smoothing history when game becomes active
    if (isActive) {
      rollHistoryRef.current = [];
      pitchHistoryRef.current = [];
    }
  }, [isActive]);

  const recalibrate = () => {
    centerRollRef.current = smoothRollRef.current;
    centerNoseYRef.current = smoothNoseYRef.current;
  };

  // Load MediaPipe scripts from CDN
  useEffect(() => {
    const loadScript = (src: string) => {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.crossOrigin = 'anonymous';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    };

    const initLibs = async () => {
      try {
        if (!window.FaceMesh) {
          await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js');
        }
        if (!window.Camera) {
          await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
        }
        setLibsLoaded(true);
      } catch (err) {
        console.error('Failed to load MediaPipe scripts:', err);
        setError('Failed to load tracking libraries. Please check your connection.');
      }
    };

    initLibs();
  }, []);

  useEffect(() => {
    if (!videoRef.current || !libsLoaded) return;

    let faceMesh: any = null;
    let camera: any = null;
    let isClosed = false;

    try {
      const FaceMeshConstructor = window.FaceMesh;
      const CameraConstructor = window.Camera;

      if (!FaceMeshConstructor || !CameraConstructor) {
        throw new Error('MediaPipe constructors not found on window');
      }

      faceMesh = new FaceMeshConstructor({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
      });

      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      faceMesh.onResults((results: any) => {
        if (isClosed || !results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) return;

        const face = results.multiFaceLandmarks[0];
        const noseTip = face[1];
        const leftEye = face[33];
        const rightEye = face[263];

        // Pitch (Up/Down)
        const noseY = noseTip.y;
        if (smoothNoseYRef.current === null) {
          smoothNoseYRef.current = noseY;
          centerNoseYRef.current = noseY;
        }
        
        // EMA Smoothing
        smoothNoseYRef.current = (smoothNoseYRef.current as number) * (1 - smoothingRef.current) + noseY * smoothingRef.current;
        
        // Window Smoothing
        pitchHistoryRef.current.push(smoothNoseYRef.current);
        if (pitchHistoryRef.current.length > MAX_HISTORY) pitchHistoryRef.current.shift();
        const avgNoseY = pitchHistoryRef.current.reduce((a, b) => a + b, 0) / pitchHistoryRef.current.length;
        
        const pitch = (avgNoseY - (centerNoseYRef.current ?? 0)) * 100;

        // Roll (Left/Right Tilt)
        const lx = leftEye.x;
        const ly = leftEye.y;
        const rx = rightEye.x;
        const ry = rightEye.y;

        const rawRoll = Math.atan2(ry - ly, rx - lx) * (180 / Math.PI);
        
        // EMA Smoothing
        smoothRollRef.current = smoothRollRef.current * (1 - smoothingRef.current) + rawRoll * smoothingRef.current;
        
        // Window Smoothing
        rollHistoryRef.current.push(smoothRollRef.current);
        if (rollHistoryRef.current.length > MAX_HISTORY) rollHistoryRef.current.shift();
        const avgRoll = rollHistoryRef.current.reduce((a, b) => a + b, 0) / rollHistoryRef.current.length;

        if (centerRollRef.current === 0) {
          centerRollRef.current = avgRoll;
        }
        const roll = -(avgRoll - centerRollRef.current);

        // Only emit motion if active
        if (isActiveRef.current) {
          onMotionRef.current({ roll, pitch });
        }

        // Draw debug - Optimize by only drawing crosshair
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            
            // Draw a small crosshair for center reference
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(canvasRef.current.width / 2, 0);
            ctx.lineTo(canvasRef.current.width / 2, canvasRef.current.height);
            ctx.moveTo(0, canvasRef.current.height / 2);
            ctx.lineTo(canvasRef.current.width, canvasRef.current.height / 2);
            ctx.stroke();
          }
        }
      });

      camera = new CameraConstructor(videoRef.current, {
        onFrame: async () => {
          if (!isClosed && videoRef.current && faceMesh) {
            try {
              await faceMesh.send({ image: videoRef.current });
            } catch (e) {
              console.warn('FaceMesh send failed:', e);
            }
          }
        },
        width: 640,
        height: 480,
      });

      camera.start()
        .then(() => {
          if (!isClosed) setIsReady(true);
        })
        .catch((err: any) => {
          if (!isClosed) {
            console.error('Camera failed:', err);
            setError('Camera access denied or failed.');
          }
        });

    } catch (err) {
      console.error('Initialization error:', err);
      setError('Tracking system failed to initialize.');
    }

    return () => {
      isClosed = true;
      if (camera) {
        camera.stop().catch(() => {});
      }
      if (faceMesh) {
        faceMesh.close().catch(() => {});
      }
    };
  }, [libsLoaded]); // Removed isActive from dependencies

  return (
    <div className="relative w-full h-full overflow-hidden rounded-2xl border-2 border-white/10 bg-black">
      <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover scale-x-[-1]" playsInline muted />
      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 w-full h-full object-cover scale-x-[-1] pointer-events-none" 
        width={640} 
        height={480} 
      />
      {(!isReady || !libsLoaded) && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="text-white text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-blue-400">
              {!libsLoaded ? 'Loading Systems...' : 'Initializing Camera...'}
            </p>
            <p className="text-[8px] font-mono uppercase tracking-widest text-white/30 mt-2">
              Position your face in the center
            </p>
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-900/40 p-4 text-center">
          <p className="text-white font-mono text-[10px] uppercase leading-relaxed">{error}</p>
        </div>
      )}
      <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end pointer-events-none">
        <div className="bg-black/60 backdrop-blur-md px-3 py-1 rounded border border-white/10">
          <p className="text-[10px] text-white/50 font-mono uppercase tracking-tighter"></p>
          <p className="text-xs text-blue-400 font-mono font-bold uppercase tracking-widest">
            {isReady ? '' : 'Cy'} 
          </p>
        </div>
      </div>
    </div>
  );
};
