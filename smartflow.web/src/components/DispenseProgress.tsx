import { useEffect, useRef } from "react";
import { Button, Chip, Paper, Typography } from "@mui/material";
import gsap from "gsap";
import type { ProgressStatus } from "../lib/ws";

type Props = {
  target: number;
  litres: number;
  status: ProgressStatus;
  reason?: string;
  onBack: () => void;
};

export default function DispenseProgress({
  target,
  litres,
  status,
  reason,
  onBack,
}: Props) {
  const numberRef = useRef<HTMLSpanElement | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const displayedRef = useRef<number>(0);

  useEffect(() => {
    const cappedLitres = Math.min(litres, target);
    const obj = { value: displayedRef.current };
    const tween = gsap.to(obj, {
      value: cappedLitres,
      duration: 0.4,
      ease: "power2.out",
      onUpdate: () => {
        displayedRef.current = obj.value;
        if (numberRef.current) {
          numberRef.current.textContent = obj.value.toFixed(1);
        }
      },
    });
    return () => {
      tween.kill();
    };
  }, [litres, target]);

  useEffect(() => {
    const pct = target > 0 ? Math.min(100, (litres / target) * 100) : 0;
    if (fillRef.current) {
      gsap.to(fillRef.current, {
        height: `${pct}%`,
        duration: 0.4,
        ease: "power2.out",
      });
    }
  }, [litres, target]);

  const complete = status === "complete";
  const failed = status === "failed";
  const active = status === "dispensing";

  const statusLabel = complete
    ? "Complete"
    : failed
      ? "Failed"
      : "Pouring";

  const statusColor: "success" | "error" | "primary" = complete
    ? "success"
    : failed
      ? "error"
      : "primary";

  return (
    <Paper
      elevation={0}
      className="relative overflow-hidden rounded-2xl"
      sx={{
        border: "1px solid #EDF0F2",
        background: failed
          ? "linear-gradient(180deg,#2A1010 0%,#0A0505 100%)"
          : "linear-gradient(180deg,#0A6B8A 0%,#074E66 100%)",
        color: "#fff",
        minHeight: 520,
      }}
    >
      {!failed && (
        <div
          ref={fillRef}
          aria-hidden
          className="absolute left-0 right-0 bottom-0 pointer-events-none"
          style={{
            height: "0%",
            background:
              "linear-gradient(180deg, rgba(94,197,217,0.25) 0%, rgba(15,140,176,0.5) 100%)",
            borderTopLeftRadius: 40,
            borderTopRightRadius: 40,
          }}
        />
      )}

      <div className="relative z-10 flex flex-col items-center justify-center p-8 min-h-[520px] text-center">
        <Typography
          variant="overline"
          sx={{ color: "rgba(255,255,255,0.65)", letterSpacing: "0.12em" }}
        >
          {complete
            ? "litres delivered"
            : failed
              ? "tap didn't open"
              : `of ${target} litres`}
        </Typography>

        <div
          className="flex items-baseline gap-2 mt-2"
          style={{ fontFamily: "Inter, sans-serif" }}
        >
          <span
            ref={numberRef}
            style={{
              fontSize: 88,
              fontWeight: 600,
              lineHeight: 1,
              letterSpacing: "-0.03em",
              fontVariantNumeric: "tabular-nums",
              textShadow: "0 2px 24px rgba(0,0,0,0.3)",
            }}
          >
            0.0
          </span>
          <span className="opacity-70" style={{ fontSize: 20 }}>
            L
          </span>
        </div>

        <div className="flex flex-wrap gap-2 justify-center mt-6">
          <Chip
            label={statusLabel}
            color={statusColor}
            variant="filled"
            sx={{
              backdropFilter: "blur(24px)",
              bgcolor:
                active || complete || failed
                  ? undefined
                  : "rgba(255,255,255,0.12)",
              color: "#fff",
            }}
          />
          <Chip
            label={`Target ${target} L`}
            sx={{
              bgcolor: "rgba(255,255,255,0.12)",
              color: "#fff",
              backdropFilter: "blur(24px)",
            }}
          />
        </div>

        {failed && reason ? (
          <Typography
            variant="body2"
            sx={{ color: "rgba(255,255,255,0.8)", mt: 2, maxWidth: 320 }}
          >
            {reason}
          </Typography>
        ) : null}

        <div className="mt-auto w-full pt-8">
          {(complete || failed) && (
            <Button
              variant="contained"
              fullWidth
              onClick={onBack}
              sx={{
                height: 52,
                bgcolor: "#fff",
                color: complete ? "#3B7A57" : "#D97757",
                fontWeight: 600,
                textTransform: "none",
                "&:hover": { bgcolor: "#F6F8F9" },
              }}
            >
              {complete ? "Done · back home" : "Back"}
            </Button>
          )}
        </div>
      </div>
    </Paper>
  );
}
