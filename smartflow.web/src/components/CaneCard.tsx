import { useEffect, useRef } from "react";
import { Button, Chip, CircularProgress, Paper, Typography } from "@mui/material";
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
        if (numRef.current) numRef.current.textContent = obj.value.toFixed(1);
      },
    });
    return () => {
      tween.kill();
    };
  }, [cane.litres_delivered, cane.litres_requested]);

  const stateStyle = cardState(cane.status) ?? cardState("pending")!;

  return (
    <Paper
      elevation={0}
      sx={{
        border: "1px solid #EDF0F2",
        borderRadius: 3,
        overflow: "hidden",
        position: "relative",
      }}
      className="p-0"
    >
      <div
        ref={fillRef}
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: "0%",
          background: stateStyle.fillGradient,
          transition: "background 0.3s ease",
        }}
      />
      <div className="relative z-10 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Chip
              label={tapLabel}
              size="small"
              sx={{ bgcolor: "#0F8CB0", color: "#fff", fontWeight: 600 }}
            />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Cane {cane.cane_number}
            </Typography>
          </div>
          <Chip
            icon={stateStyle.icon}
            label={stateStyle.label}
            size="small"
            sx={{
              bgcolor: stateStyle.chipBg,
              color: stateStyle.chipFg,
              fontWeight: 600,
            }}
          />
        </div>

        <div className="flex items-baseline gap-1" style={{ fontFamily: "Inter" }}>
          <span
            ref={numRef}
            style={{
              fontSize: 40,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            0.0
          </span>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            of {cane.litres_requested.toFixed(1)} L · PKR {cane.price.toFixed(2)}
          </Typography>
        </div>

        {cane.reason ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {cane.reason}
          </Typography>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          {cane.status === "pending" && (
            <Button
              variant="contained"
              startIcon={
                startPending ? (
                  <CircularProgress size={14} color="inherit" />
                ) : (
                  <PlayArrowRoundedIcon />
                )
              }
              onClick={onStart}
              disabled={!canStart || startPending}
              sx={{ textTransform: "none", fontWeight: 600 }}
            >
              {startPending ? "Waiting for tap…" : "Start"}
            </Button>
          )}
          {cane.status === "started" && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<StopRoundedIcon />}
              onClick={onStop}
              sx={{ textTransform: "none", fontWeight: 600 }}
            >
              Stop
            </Button>
          )}
          {(cane.status === "completed" ||
            cane.status === "partial_completed" ||
            cane.status === "failed" ||
            cane.status === "cancelled") && (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              {cane.status === "completed" && "Filled successfully."}
              {cane.status === "partial_completed" && "Stopped early — partial amount kept."}
              {cane.status === "failed" && "Failed — unused credit returned."}
              {cane.status === "cancelled" && "Cancelled — credit returned."}
            </Typography>
          )}
          {cane.status === "pending" && cane.retry_count > 0 && (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Attempt {cane.retry_count + 1}
            </Typography>
          )}
        </div>
      </div>
    </Paper>
  );
}

function cardState(status: Cane["status"]) {
  switch (status) {
    case "pending":
      return {
        label: "Queued",
        chipBg: "#EDF0F2",
        chipFg: "#3A464C",
        icon: undefined,
        fillGradient: "linear-gradient(90deg, rgba(237,240,242,0), rgba(237,240,242,0.4))",
      };
    case "started":
      return {
        label: "Pouring",
        chipBg: "#0F8CB0",
        chipFg: "#fff",
        icon: undefined,
        fillGradient: "linear-gradient(90deg, rgba(94,197,217,0.25), rgba(15,140,176,0.45))",
      };
    case "completed":
      return {
        label: "Complete",
        chipBg: "#3B7A57",
        chipFg: "#fff",
        icon: <CheckRoundedIcon />,
        fillGradient: "linear-gradient(90deg, rgba(59,122,87,0.20), rgba(59,122,87,0.30))",
      };
    case "partial_completed":
      return {
        label: "Stopped",
        chipBg: "#D97757",
        chipFg: "#fff",
        icon: <StopRoundedIcon />,
        fillGradient: "linear-gradient(90deg, rgba(217,119,87,0.2), rgba(217,119,87,0.3))",
      };
    case "failed":
      return {
        label: "Failed",
        chipBg: "#B03A2E",
        chipFg: "#fff",
        icon: <ErrorOutlineRoundedIcon />,
        fillGradient: "linear-gradient(90deg, rgba(176,58,46,0.18), rgba(176,58,46,0.28))",
      };
    case "cancelled":
      return {
        label: "Cancelled",
        chipBg: "#9AA3A8",
        chipFg: "#fff",
        icon: <CancelRoundedIcon />,
        fillGradient: "linear-gradient(90deg, rgba(154,163,168,0.18), rgba(154,163,168,0.28))",
      };
  }
}
