import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, CircularProgress, Snackbar, Typography } from "@mui/material";
import WalletHeader from "./components/WalletHeader";
import CaneBuilder, { type DraftCane } from "./components/CaneBuilder";
import ProgressScreen from "./components/ProgressScreen";
import {
  cancelOrder,
  createOrder,
  getCatalogue,
  getMe,
  startCane,
  stopCane,
  type ApiErr,
  type Cane,
  type Catalogue,
  type Me,
  type Order,
  type Plant,
} from "./lib/api";
import { openOrderSocket, type OrderFrame } from "./lib/ws";

type Screen =
  | { kind: "loading" }
  | { kind: "home" }
  | { kind: "submitting" }
  | {
      kind: "progress";
      order: Order;
      startingCaneId: number | null;
    };

type ToastSeverity = "error" | "warning" | "info" | "success";
type Toast = { msg: string; severity: ToastSeverity } | null;

const IDLE_RELEASE_SECONDS = Number(import.meta.env.VITE_IDLE_RELEASE_SECONDS ?? 90);

export default function App() {
  const [screen, setScreen] = useState<Screen>({ kind: "loading" });
  const [me, setMe] = useState<Me | null>(null);
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [draft, setDraft] = useState<DraftCane[]>([]);
  const [toast, setToast] = useState<Toast>(null);
  const [idleDeadline, setIdleDeadline] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const showToast = useCallback((msg: string, severity: ToastSeverity) => {
    setToast({ msg, severity });
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      setMe(await getMe());
    } catch (err) {
      console.error("me.error", err);
    }
  }, []);

  const bootstrap = useCallback(async () => {
    try {
      const [m, c] = await Promise.all([getMe(), getCatalogue()]);
      setMe(m);
      setCatalogue(c);
      setScreen({ kind: "home" });
    } catch (err) {
      console.error("bootstrap.error", err);
      showToast("Could not load the app. Is the server running?", "error");
      setScreen({ kind: "home" });
    }
  }, [showToast]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const plant: Plant | null = catalogue?.plants[0] ?? null;

  const resetToHome = useCallback(async () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIdleDeadline(null);
    setDraft([]);
    await refreshMe();
    setScreen({ kind: "home" });
  }, [refreshMe]);

  const applyFrame = useCallback(
    (frame: OrderFrame) => {
      setScreen((prev) => {
        if (prev.kind !== "progress") return prev;
        const canes = prev.order.canes.map<Cane>((c) => {
          if (c.id !== frame.cane_id) return c;
          const updatedStatus: Cane["status"] =
            frame.status === "dispensing" ? c.status : frame.status;
          return {
            ...c,
            litres_delivered: frame.litres,
            status: updatedStatus,
            reason: frame.reason ?? c.reason,
          };
        });
        return { ...prev, order: { ...prev.order, canes } };
      });
      // Terminal frames may move the wallet (credit refund on stop/fail, or
      // no-op on complete) or the daily-hold counter — always resync /me so
      // the header matches the DB.
      if (frame.status !== "dispensing") {
        void refreshMe();
      }
    },
    [refreshMe],
  );

  const armIdle = useCallback(() => {
    setIdleDeadline(Date.now() + IDLE_RELEASE_SECONDS * 1000);
  }, []);

  const onConfirm = useCallback(async () => {
    if (!plant) return;
    const canes = draft
      .map((d) => ({ tap_id: d.tap_id, litres: Number(d.litres) }))
      .filter((c) => !Number.isNaN(c.litres) && c.litres > 0);
    if (canes.length === 0) return;

    setScreen({ kind: "submitting" });
    try {
      const order = await createOrder(plant.id, canes);
      await refreshMe();
      setScreen({ kind: "progress", order, startingCaneId: null });
      armIdle();

      const ws = openOrderSocket(order.id, {
        onFrame: (frame) => applyFrame(frame),
        onClose: ({ clean }) => {
          wsRef.current = null;
          if (!clean) showToast("Lost live updates.", "warning");
        },
        onError: (ev) => {
          console.error("ws.error", ev);
          showToast("Progress stream error.", "error");
        },
      });
      wsRef.current = ws;
    } catch (err) {
      const e = err as ApiErr;
      console.error("order.error", e);
      showToast(e.message ?? "Order failed.", "error");
      setScreen({ kind: "home" });
    }
  }, [plant, draft, refreshMe, applyFrame, armIdle, showToast]);

  const onStart = useCallback(
    async (caneId: number) => {
      setScreen((prev) =>
        prev.kind === "progress" ? { ...prev, startingCaneId: caneId } : prev,
      );
      try {
        if (screen.kind !== "progress") return;
        const { cane } = await startCane(screen.order.id, caneId);
        setScreen((prev) => {
          if (prev.kind !== "progress") return prev;
          const canes = prev.order.canes.map((c) => (c.id === cane.id ? cane : c));
          return { ...prev, order: { ...prev.order, canes }, startingCaneId: null };
        });
        await refreshMe();
        armIdle();
      } catch (err) {
        const e = err as ApiErr;
        console.error("start.error", e);
        const sev: ToastSeverity = e.code === "retry_limit" ? "warning" : "error";
        showToast(e.message ?? "Could not start.", sev);
        setScreen((prev) =>
          prev.kind === "progress" ? { ...prev, startingCaneId: null } : prev,
        );
      }
    },
    [screen, refreshMe, armIdle, showToast],
  );

  const onStop = useCallback(
    async (caneId: number) => {
      if (screen.kind !== "progress") return;
      try {
        const { cane } = await stopCane(screen.order.id, caneId);
        setScreen((prev) => {
          if (prev.kind !== "progress") return prev;
          const canes = prev.order.canes.map((c) => (c.id === cane.id ? cane : c));
          return { ...prev, order: { ...prev.order, canes } };
        });
        await refreshMe();
        showToast("Stopped. Unused litres refunded.", "info");
      } catch (err) {
        const e = err as ApiErr;
        showToast(e.message ?? "Could not stop.", "error");
      }
    },
    [screen, refreshMe, showToast],
  );

  const onCancel = useCallback(async () => {
    if (screen.kind !== "progress") return;
    try {
      await cancelOrder(screen.order.id);
      await refreshMe();
      showToast("Holds returned.", "info");
    } catch (err) {
      const e = err as ApiErr;
      showToast(e.message ?? "Cancel failed.", "error");
    }
  }, [screen, refreshMe, showToast]);

  if (screen.kind === "loading" || !plant || !me) {
    return (
      <div className="min-h-full w-full flex items-center justify-center p-6">
        <CircularProgress />
      </div>
    );
  }

  return (
    <div className="min-h-full w-full flex items-start justify-center p-4 sm:p-6">
      <main className="w-full max-w-3xl flex flex-col gap-4">
        <Typography
          variant="overline"
          className="tracking-widest"
          sx={{ color: "text.secondary" }}
        >
          SmartFlow · V1.1
        </Typography>

        <WalletHeader me={me} />

        {screen.kind === "home" || screen.kind === "submitting" ? (
          <CaneBuilder
            plant={plant}
            me={me}
            draft={draft}
            onChange={setDraft}
            onConfirm={onConfirm}
            submitting={screen.kind === "submitting"}
          />
        ) : (
          <ProgressScreen
            order={screen.order}
            plant={plant}
            idleDeadline={idleDeadline}
            startingCaneId={screen.startingCaneId}
            onStart={onStart}
            onStop={onStop}
            onCancel={onCancel}
            onDone={resetToHome}
          />
        )}
      </main>

      <Snackbar
        open={toast !== null}
        autoHideDuration={5000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {toast ? (
          <Alert
            onClose={() => setToast(null)}
            severity={toast.severity}
            variant="filled"
            sx={{ width: "100%" }}
          >
            {toast.msg}
          </Alert>
        ) : undefined}
      </Snackbar>
    </div>
  );
}
