import { useEffect, useMemo, useRef, useState } from "react";
import { Button, IconButton, Typography } from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import CaneCard from "./CaneCard";
import type { Cane, Me, Order, Plant } from "../lib/api";

type Props = {
  order: Order;
  plant: Plant;
  me: Me;
  idleDeadlines: Record<number, number>;
  startingCaneId: number | null;
  onStart: (caneId: number) => void;
  onStop: (caneId: number) => void;
  onCancel: () => void;
  onDone: () => void;
};

const terminal = new Set<Cane["status"]>([
  "completed",
  "partial_completed",
  "failed",
  "cancelled",
]);

export default function ProgressScreen({
  order,
  plant,
  me,
  idleDeadlines,
  startingCaneId,
  onStart,
  onStop,
  onCancel,
  onDone,
}: Props) {
  const allTerminal = order.canes.every((c) => terminal.has(c.status));
  const hasPending = order.canes.some((c) => c.status === "pending");

  const activeByTap = useMemo(() => {
    const map: Record<number, boolean> = {};
    for (const c of order.canes) {
      if (c.status === "started") map[c.tap_id] = true;
    }
    return map;
  }, [order.canes]);

  const tapLabel = (tapId: number) =>
    plant.taps.find((t) => t.id === tapId)?.label ?? String(tapId);

  return (
    <div className="flex flex-col gap-6">
      <div className="relative overflow-hidden bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
        {/* Ambient Gradient */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-slate-50 rounded-full -mr-32 -mt-32 blur-3xl opacity-50" />
        
        <div className="relative z-10">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="flex items-start gap-4">
              {allTerminal && (
                <IconButton
                  size="small"
                  onClick={onDone}
                  sx={{ 
                    bgcolor: "#F8FAFC",
                    "&:hover": { bgcolor: "#F1F5F9" },
                    color: "text.secondary"
                  }}
                  aria-label="Back"
                >
                  <ArrowBackRoundedIcon fontSize="small" />
                </IconButton>
              )}
              <div>
                <Typography
                  variant="overline"
                  sx={{ 
                    color: "#64748B", 
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    display: "block",
                    mb: 0.5
                  }}
                >
                  {plant.name}
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, color: "#1E293B", lineHeight: 1.1 }}>
                  {allTerminal ? "Session Complete" : "In Progress"}
                </Typography>

                <div className="flex flex-wrap gap-2 mt-4">
                  <div className="px-3 py-1 bg-slate-50 border border-slate-100 rounded-xl flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    <span className="text-xs font-semibold text-slate-600">
                      {order.canes.length} {order.canes.length === 1 ? "Cane" : "Canes"}
                    </span>
                  </div>
                  <div className="px-3 py-1 bg-sky-50 border border-sky-100 rounded-xl flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                    <span className="text-xs font-semibold text-sky-700">
                      {order.total_litres.toFixed(2)} L
                    </span>
                  </div>
                  <div className="px-3 py-1 bg-amber-50 border border-amber-100 rounded-xl flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <span className="text-xs font-semibold text-amber-700">
                      {me.currency} {order.total_price.toFixed(2)} Reserved
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col md:items-end gap-3">
              {hasPending && Object.keys(idleDeadlines).length > 0 && (
                <IdleTimer
                  deadline={Math.min(...Object.values(idleDeadlines))}
                />
              )}

              <div className="flex flex-wrap gap-3">
                {allTerminal ? (
                  <Button
                    variant="contained"
                    startIcon={<QrCodeScannerIcon />}
                    onClick={onDone}
                    sx={{ 
                      textTransform: "none", 
                      fontWeight: 700,
                      borderRadius: "16px",
                      px: 3,
                      py: 1,
                      bgcolor: "#00A3FF",
                      boxShadow: "0 4px 12px rgba(0, 163, 255, 0.2)",
                      "&:hover": { bgcolor: "#0086D1" }
                    }}
                  >
                    New Session
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outlined"
                      color="error"
                      onClick={onCancel}
                      disabled={!hasPending}
                      sx={{ 
                        textTransform: "none", 
                        fontWeight: 600,
                        borderRadius: "16px",
                        borderWidth: "1.5px",
                        "&:hover": { borderWidth: "1.5px" }
                      }}
                    >
                      Cancel Pending
                    </Button>
                    {!hasPending && (
                      <div className="flex items-center gap-2 text-slate-500">
                        <div className="w-1 h-1 rounded-full bg-slate-400 animate-pulse" />
                        <span className="text-xs font-medium">All fills active or complete</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-8">
        {Object.entries(
          order.canes.reduce<Record<number, typeof order.canes>>(
            (acc, c) => {
              (acc[c.tap_id] ??= []).push(c);
              return acc;
            },
            {},
          ),
        ).map(([tapIdStr, canes]) => {
          const tapId = Number(tapIdStr);
          const tapDeadline = idleDeadlines[tapId] ?? null;
          const tapHasPending = canes.some((c) => c.status === "pending");
          return (
            <div key={tapId} className="flex flex-col gap-4">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center text-white text-xs font-bold">
                    {tapLabel(tapId).split(" ").pop()}
                  </div>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "#1E293B" }}>
                    {tapLabel(tapId)}
                  </Typography>
                </div>
                {tapHasPending && tapDeadline !== null && (
                  <IdleTimer deadline={tapDeadline} />
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {canes.map((cane) => {
                  const tapBusy = !!activeByTap[cane.tap_id] && cane.status === "pending";
                  return (
                    <CaneCard
                      key={cane.id}
                      cane={cane}
                      tapLabel={tapLabel(cane.tap_id)}
                      canStart={!tapBusy}
                      startPending={startingCaneId === cane.id}
                      onStart={() => onStart(cane.id)}
                      onStop={() => onStop(cane.id)}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function IdleTimer({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(() => Date.now());
  const ref = useRef<number | null>(null);
  useEffect(() => {
    ref.current = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (ref.current) window.clearInterval(ref.current);
    };
  }, [deadline]);
  const secs = Math.max(0, Math.round((deadline - now) / 1000));
  const mm = Math.floor(secs / 60).toString().padStart(2, "0");
  const ss = (secs % 60).toString().padStart(2, "0");
  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-red-50 border border-red-100 rounded-xl">
      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
      <span className="text-xs font-bold text-red-700">
        Expires in {mm}:{ss}
      </span>
    </div>
  );
}

