import { useEffect, useRef } from "react";
import jsQR from "jsqr";

type Props = {
  onResult: (text: string) => void;
  onError: (msg: string) => void;
};

export default function CameraScanner({ onResult, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;

    const stopStream = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!active || !video || !canvas) return;

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code) {
            active = false;
            stopStream();
            onResult(code.data);
            return;
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().then(() => {
            if (active) rafRef.current = requestAnimationFrame(tick);
          }).catch(() => {});
        }
      })
      .catch((err: unknown) => {
        if (active) onError(String(err));
      });

    return () => {
      active = false;
      stopStream();
    };
  }, [onResult, onError]);

  return (
    <div style={{ position: "relative", width: "100%", background: "#000", borderRadius: 8, overflow: "hidden" }}>
      <video
        ref={videoRef}
        style={{ display: "block", width: "100%", maxHeight: 320, objectFit: "cover" }}
        playsInline
        muted
      />
      <canvas ref={canvasRef} style={{ display: "none" }} />
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        pointerEvents: "none",
      }}>
        <div style={{
          width: 200, height: 200,
          border: "2px solid rgba(255,255,255,0.8)",
          borderRadius: 12,
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
        }} />
      </div>
    </div>
  );
}
