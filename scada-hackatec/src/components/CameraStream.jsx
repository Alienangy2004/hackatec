import React, { useRef, useEffect, useState } from 'react';
import { Camera, Eye, Users, Trash2, CheckCircle2 } from 'lucide-react';

export default function CameraStream({ onPhotoCaptured, currentPhoto, operatorsCount = 1 }) {
  const videoRef = useRef(null);
  const [streamActive, setStreamActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  useEffect(() => {
    let activeStream = null;
    navigator.mediaDevices?.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false
    })
    .then((stream) => {
      activeStream = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setStreamActive(true);
      }
    })
    .catch((err) => {
      console.error('Error cámara:', err);
      setCameraError('Permiso denegado o webcam no disponible.');
    });

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const captureFrame = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    
    // Guardar en el estado principal del padre
    if (onPhotoCaptured) {
      onPhotoCaptured(dataUrl);
    }
  };

  return (
    <div className="scada-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-semibold accent-text tracking-wider">
          <Eye size={16} className="animate-pulse" /> SUPERVISIÓN ÓPTICA EN VIVO
        </span>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full scada-inner border border-cyan-500/30 text-xs">
          <Users size={13} className="accent-text" />
          <span>Operadores: <strong className="accent-text">{operatorsCount} / 2</strong></span>
        </div>
      </div>

      {/* Video en vivo con marco Neón */}
      <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-cyan-500/40 bg-black flex items-center justify-center shadow-inner">
        {cameraError ? (
          <p className="text-rose-400 text-xs text-center px-4">{cameraError}</p>
        ) : (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            
            {/* HUD de Detección */}
            <div className="absolute inset-0 pointer-events-none p-3 flex flex-col justify-between">
              <div className="flex justify-between text-[10px] font-mono accent-text bg-black/60 px-2 py-0.5 rounded backdrop-blur-sm">
                <span>CH_01 // WEBCAM_TRACK</span>
                <span className="text-emerald-400">STATUS: SENSING</span>
              </div>

              {/* Guía visual táctica de operador */}
              <div className="self-center w-44 h-52 border-2 border-dashed border-cyan-400/70 rounded-lg relative flex flex-col justify-between p-1">
                <span className="text-[9px] font-mono bg-cyan-950/90 text-cyan-300 px-1 rounded self-start">
                  OPERADOR 1: VERIFICADO
                </span>
                {operatorsCount > 1 && (
                  <span className="text-[9px] font-mono bg-emerald-950/90 text-emerald-300 px-1 rounded self-end">
                    OPERADOR 2: EN ESCENA
                  </span>
                )}
              </div>

              <div className="text-[9px] font-mono text-slate-400 bg-black/40 px-1 rounded self-end">
                RES: 640x480 | 30 FPS
              </div>
            </div>
          </>
        )}
      </div>

      {/* Botón de Captura y Previsualización */}
      <div className="flex items-center justify-between pt-1">
        <button onClick={captureFrame} className="btn-neon w-full">
          <Camera size={15} /> Capturar Fotograma para Dictamen
        </button>
      </div>

      {/* Imagen Capturada fija (nunca se borra al renderizar) */}
      {currentPhoto && (
        <div className="scada-inner p-2.5 flex items-center gap-3 border border-cyan-500/40">
          <img src={currentPhoto} alt="Fotograma capturado" className="w-20 h-14 object-cover rounded-md border border-cyan-400 shadow" />
          <div className="flex-1 text-xs">
            <p className="font-semibold text-emerald-400 flex items-center gap-1">
              <CheckCircle2 size={13} /> Fotograma Listo para IA y PDF
            </p>
            <p className="text-[10px] opacity-75">Se incluirá como evidencia en el dictamen.</p>
          </div>
          <button 
            onClick={() => onPhotoCaptured(null)}
            className="p-1.5 text-rose-400 hover:text-rose-200 transition"
            title="Descartar foto"
          >
            <Trash2 size={15} />
          </button>
        </div>
      )}
    </div>
  );
}