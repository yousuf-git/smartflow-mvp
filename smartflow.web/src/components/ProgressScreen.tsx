import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Chip, IconButton, Paper, Typography } from "@mui/material";
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
    <div className="flex flex-col gap-4">
      <Paper
        elevation={0}
        sx={{ border: "1px solid #EDF0F2", borderRadius: 3 }}
        className="p-5 sm:p-6"
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-2">
            {allTerminal && (
              <IconButton
                size="small"
                onClick={onDone}
                sx={{ mt: 0.25, color: "text.secondary" }}
                aria-label="Back"
              >
                <ArrowBackRoundedIcon fontSize="small" />
              </IconButton>
            )}
            <div>
              <Typography
                variant="overline"
                sx={{ color: "text.secondary", letterSpacing: 2 }}
              >
                {plant.name}
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                {allTerminal ? "Session complete" : "In progress"}
              </Typography>

              <div className="flex flex-wrap gap-2 mt-2">
                <Chip
                  label={`${order.canes.length} ${order.canes.length === 1 ? "cane" : "canes"}`}
                  size="small"
                  sx={{ bgcolor: "#F6F8F9", color: "text.secondary", fontWeight: 600 }}
                />
                <Chip
                  label={`${order.total_litres.toFixed(2)} L`}
                  size="small"
                  sx={{ bgcolor: "#E8F6FB", color: "#074E66", fontWeight: 600 }}
                />
                <Chip
                  label={`${me.currency} ${order.total_price.toFixed(2)} reserved`}
                  size="small"
                  sx={{ bgcolor: "#FFFBEB", color: "#92400E", fontWeight: 600 }}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            {hasPending && Object.keys(idleDeadlines).length > 0 && (
              <IdleTimer
                deadline={Math.min(...Object.values(idleDeadlines))}
              />
            )}

            {allTerminal ? (
              <Button
                variant="contained"
                startIcon={<QrCodeScannerIcon />}
                onClick={onDone}
                sx={{ textTransform: "none", fontWeight: 600 }}
              >
                New session
              </Button>
            ) : (
              <>
                <Button
                  variant="outlined"
                  color="error"
                  onClick={onCancel}
                  disabled={!hasPending}
                  sx={{ textTransform: "none", fontWeight: 600 }}
                >
                  Cancel pending canes
                </Button>
                {!hasPending && (
                  <Typography variant="caption" sx={{ color: "text.secondary", textAlign: "right" }}>
                    Stop or complete all active fills to end
                  </Typography>
                )}
              </>
            )}
          </div>
        </div>
      </Paper>

      <div className="flex flex-col gap-4">
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
            <div key={tapId}>
              <div className="flex items-center justify-between mb-2">
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: "text.secondary" }}>
                  {tapLabel(tapId)}
                </Typography>
                {tapHasPending && tapDeadline !== null && (
                  <IdleTimer deadline={tapDeadline} />
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
    <Chip
      label={`Pending release in ${mm}:${ss}`}
      size="small"
      sx={{ bgcolor: "#EEFAFD", color: "#074E66", fontWeight: 600 }}
    />
  );
}
