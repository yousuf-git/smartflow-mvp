import { useEffect, useRef } from "react";
import { Button, CircularProgress, Typography } from "@mui/material";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import CancelRoundedIcon from "@mui/icons-material/CancelRounded";
import gsap from "gsap";
import type { Cane } from "../lib/api";

type Props = {
  cane: Cane;
  tapLabel: string;
  canStart: boolean;
  startPending: boolean;
  onStart: () => void;
  onStop: () => void;
};

export default function CaneCard({
  cane,
  tapLabel,
  canStart,
  startPending,
  onStart,
  onStop,
}: Props) {
  const fillRef = useRef<HTMLDivElement | null>(null);
  const numRef = useRef<HTMLSpanElement | null>(null);
  const displayedRef = useRef<number>(0);

  useEffect(() => {
    const target = cane.litres_requested;
    const delivered = Math.min(cane.litres_delivered, target);
    const pct = target > 0 ? Math.min(100, (delivered / target) * 100) : 0;
    if (fillRef.current) {
      gsap.to(fillRef.current, {
        width: `${pct}%`,
        duration: 0.4,
        ease: "power2.out",
      });
    }
    const obj = { value: displayedRef.current };
    const tween = gsap.to(obj, {
      value: delivered,
      duration: 0.4,
      ease: "power2.out",
      onUpdate: () => {
        displayedRef.current = obj.value;
        if (numRef.current) numRef.current.textContent = obj.value.toFixed(2);
      },
    });
    return () => {
      tween.kill();
    };
  }, [cane.litres_delivered, cane.litres_requested]);

  const stateStyle = cardState(cane.status) ?? cardState("pending")!;

  return (
    <div className="relative overflow-hidden bg-white rounded-3xl border border-slate-100 shadow-sm transition-all duration-300">
      {/* Background Fill Layer */}
      <div
        ref={fillRef}
        aria-hidden
        className="absolute left-0 top-0 bottom-0 opacity-10"
        style={{
          width: "0%",
          background: stateStyle.fillColor,
          transition: "background 0.3s ease",
        }}
      />
      
      {/* Subtle Bottom Border Progress (More Modern) */}
      <div
        ref={fillRef}
        aria-hidden
        className="absolute left-0 bottom-0 h-1 rounded-full"
        style={{
          width: "0%",
          background: stateStyle.fillColor,
          transition: "background 0.3s ease",
        }}
      />

      <div className="relative z-10 p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="px-2.5 py-1 bg-slate-900 text-white text-[10px] font-black rounded-lg uppercase tracking-wider">
              {tapLabel}
            </div>
            <Typography variant="body2" sx={{ fontWeight: 600, color: "#64748B" }}>
              Cane {cane.cane_number}
            </Typography>
          </div>
          
          <div 
            className="flex items-center gap-1.5 px-3 py-1 rounded-full border"
            style={{ 
              backgroundColor: `${stateStyle.fillColor}10`,
              borderColor: `${stateStyle.fillColor}20`,
              color: stateStyle.fillColor 
            }}
          >
            {stateStyle.icon && <span className="scale-75 origin-center">{stateStyle.icon}</span>}
            <span className="text-[11px] font-bold uppercase tracking-tight">
              {stateStyle.label}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-0.5">
          <div className="flex items-baseline gap-2">
            <span
              ref={numRef}
              className="text-4xl font-black tracking-tight text-slate-900 font-mono"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              0.00
            </span>
            <span className="text-xl font-bold text-slate-400">L</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <span>Target: {cane.litres_requested.toFixed(2)} L</span>
            <span className="w-1 h-1 rounded-full bg-slate-300" />
            <span>PKR {cane.price.toFixed(2)}</span>
          </div>
        </div>

        {cane.reason && (
          <div className="px-3 py-2 bg-amber-50 border border-amber-100 rounded-xl text-[11px] font-medium text-amber-700">
            {cane.reason}
          </div>
        )}

        <div className="flex items-center justify-between mt-1">
          {cane.status === "pending" && (
            <Button
              variant="contained"
              fullWidth
              startIcon={
                startPending ? (
                  <CircularProgress size={16} color="inherit" thickness={6} />
                ) : (
                  <PlayArrowRoundedIcon />
                )
              }
              onClick={onStart}
              disabled={!canStart || startPending}
              sx={{ 
                textTransform: "none", 
                fontWeight: 700,
                borderRadius: "14px",
                py: 1,
                bgcolor: "#00A3FF",
                boxShadow: "0 4px 12px rgba(0, 163, 255, 0.2)",
                "&:hover": { bgcolor: "#0086D1" },
                "&.Mui-disabled": { bgcolor: "#F1F5F9", color: "#94A3B8" }
              }}
            >
              {startPending ? "Preparing Tap..." : "Start Fill"}
            </Button>
          )}
          
          {cane.status === "started" && (
            <Button
              variant="contained"
              fullWidth
              color="error"
              startIcon={<StopRoundedIcon />}
              onClick={onStop}
              sx={{ 
                textTransform: "none", 
                fontWeight: 700,
                borderRadius: "14px",
                py: 1,
                bgcolor: "#EF4444",
                boxShadow: "0 4px 12px rgba(239, 68, 68, 0.2)",
                "&:hover": { bgcolor: "#DC2626" }
              }}
            >
              Stop Dispensing
            </Button>
          )}

          {(cane.status === "completed" ||
            cane.status === "partial_completed" ||
            cane.status === "failed" ||
            cane.status === "cancelled") && (
            <div className="flex items-center gap-2 text-slate-500 w-full">
              <div className="flex-1 h-px bg-slate-100" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {cane.status === "completed" && "Success"}
                {cane.status === "partial_completed" && "Stopped"}
                {cane.status === "failed" && "Error"}
                {cane.status === "cancelled" && "Cancelled"}
              </span>
              <div className="flex-1 h-px bg-slate-100" />
            </div>
          )}
        </div>

        {cane.status === "pending" && cane.retry_count > 0 && (
          <div className="text-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
              Retrying (Attempt {cane.retry_count + 1})
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function cardState(status: Cane["status"]) {
  switch (status) {
    case "pending":
      return {
        label: "Queued",
        fillColor: "#64748B",
        icon: undefined,
      };
    case "started":
      return {
        label: "Pouring",
        fillColor: "#00A3FF",
        icon: <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />,
      };
    case "completed":
      return {
        label: "Complete",
        fillColor: "#10B981",
        icon: <CheckRoundedIcon sx={{ fontSize: 14 }} />,
      };
    case "partial_completed":
      return {
        label: "Stopped",
        fillColor: "#F59E0B",
        icon: <StopRoundedIcon sx={{ fontSize: 14 }} />,
      };
    case "failed":
      return {
        label: "Failed",
        fillColor: "#EF4444",
        icon: <ErrorOutlineRoundedIcon sx={{ fontSize: 14 }} />,
      };
    case "cancelled":
      return {
        label: "Cancelled",
        fillColor: "#94A3B8",
        icon: <CancelRoundedIcon sx={{ fontSize: 14 }} />,
      };
  }
}

