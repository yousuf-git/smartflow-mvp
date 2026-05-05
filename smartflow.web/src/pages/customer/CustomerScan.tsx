import { useCallback, useEffect, useRef, useState } from "react";
import { CircularProgress } from "@mui/material";
import { motion } from "framer-motion";
import WalletHeader from "../../components/WalletHeader";
import CaneBuilder, { type DraftCane } from "../../components/CaneBuilder";
import ProgressScreen from "../../components/ProgressScreen";
import QRScanScreen from "../../components/QRScanScreen";
import Toast from "../../components/Toast";
import { useToast } from "../../lib/useToast";
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
  type Tap,
} from "../../lib/api";
import { openOrderSocket, type OrderFrame } from "../../lib/ws";

type Screen =
  | { kind: "loading" }
  | { kind: "qr_scan" }
  | { kind: "home" }
  | { kind: "submitting" }
  | { kind: "progress"; order: Order; startingCaneId: number | null };

export default function CustomerScan() {
  const [screen, setScreen] = useState<Screen>({ kind: "loading" });
  const [me, setMe] = useState<Me | null>(null);
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [selectedPlant, setSelectedPlant] = useState<Plant | null>(null);
  const [draft, setDraft] = useState<DraftCane[]>([]);
  const [idleDeadlines, setIdleDeadlines] = useState<Record<number, number>>({});
  const wsRef = useRef<WebSocket | null>(null);

  const { toastProps, showToast } = useToast();

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
      setScreen({ kind: "qr_scan" });
    } catch (err) {
      console.error("bootstrap.error", err);
      showToast("Could not load scan. Is the server running?", "error");
      setScreen({ kind: "qr_scan" });
    }
  }, [showToast]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const plant: Plant | null = selectedPlant ?? catalogue?.plants[0] ?? null;

  const enterHome = useCallback((plant: Plant, tap: Tap) => {
    setSelectedPlant(plant);
    const key = `${tap.id}-init-${Date.now()}`;
    setDraft([{ key, tap_id: tap.id, litres: "10" }]);
    setScreen({ kind: "home" });
  }, []);

  const onQRScanned = useCallback(
    (plant: Plant, tap: Tap) => {
      enterHome(plant, tap);
    },
    [enterHome],
  );

  const onBypass = useCallback(() => {
    if (!catalogue) return;
    const p = catalogue.plants[0];
    const t = p?.taps[0];
    if (!p || !t) {
      showToast("No plant/tap available in catalogue.", "error");
      return;
    }
    enterHome(p, t);
  }, [catalogue, enterHome, showToast]);

  const backToScan = useCallback(() => {
    setDraft([]);
    setSelectedPlant(null);
    setScreen({ kind: "qr_scan" });
  }, []);

  const resetToHome = useCallback(async () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIdleDeadlines({});
    setDraft([]);
    setSelectedPlant(null);
    await refreshMe();
    setScreen({ kind: "qr_scan" });
  }, [refreshMe]);

  const idleSecs = Number(import.meta.env.VITE_IDLE_RELEASE_SECONDS ?? 90);

  const armIdleForTaps = useCallback(
    (canes: { tap_id: number; status: string }[]) => {
      const pendingTaps = new Set<number>();
      const startedTaps = new Set<number>();
      for (const c of canes) {
        if (c.status === "pending") pendingTaps.add(c.tap_id);
        if (c.status === "started") startedTaps.add(c.tap_id);
      }
      setIdleDeadlines((prev) => {
        const next = { ...prev };
        for (const tap of pendingTaps) {
          if (!startedTaps.has(tap) && !next[tap]) {
            next[tap] = Date.now() + idleSecs * 1000;
          }
        }
        for (const tap of startedTaps) {
          delete next[tap];
        }
        for (const tap of Object.keys(next).map(Number)) {
          if (!pendingTaps.has(tap)) delete next[tap];
        }
        return next;
      });
    },
    [idleSecs],
  );

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
        if (frame.status !== "dispensing") {
          armIdleForTaps(canes);
        }
        return { ...prev, order: { ...prev.order, canes } };
      });
      if (frame.status !== "dispensing") {
        void refreshMe();
      }
    },
    [refreshMe, armIdleForTaps],
  );

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
      armIdleForTaps(order.canes);

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
      showToast(e.message ?? "Could not start session.", "error");
      setScreen({ kind: "home" });
    }
  }, [plant, draft, refreshMe, applyFrame, armIdleForTaps, showToast]);

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
          const canes = prev.order.canes.map((c) =>
            c.id === cane.id ? cane : c,
          );
          armIdleForTaps(canes);
          return {
            ...prev,
            order: { ...prev.order, canes },
            startingCaneId: null,
          };
        });
        await refreshMe();
      } catch (err) {
        const e = err as ApiErr;
        console.error("start.error", e);
        const sev = e.code === "retry_limit" ? "warning" : "error";
        showToast(e.message ?? "Could not start fill.", sev);
        setScreen((prev) =>
          prev.kind === "progress" ? { ...prev, startingCaneId: null } : prev,
        );
      }
    },
    [screen, refreshMe, armIdleForTaps, showToast],
  );

  const onStop = useCallback(
    async (caneId: number) => {
      if (screen.kind !== "progress") return;
      try {
        const { cane } = await stopCane(screen.order.id, caneId);
        setScreen((prev) => {
          if (prev.kind !== "progress") return prev;
          const canes = prev.order.canes.map((c) =>
            c.id === cane.id ? cane : c,
          );
          armIdleForTaps(canes);
          return { ...prev, order: { ...prev.order, canes } };
        });
        await refreshMe();
        showToast("Stopped. Unused credit returned.", "info");
      } catch (err) {
        const e = err as ApiErr;
        showToast(e.message ?? "Could not stop.", "error");
      }
    },
    [screen, refreshMe, armIdleForTaps, showToast],
  );

  const onCancel = useCallback(async () => {
    if (screen.kind !== "progress") return;
    try {
      await cancelOrder(screen.order.id);
      await refreshMe();
      showToast("Unfilled canes cancelled. Credit returned.", "info");
    } catch (err) {
      const e = err as ApiErr;
      showToast(e.message ?? "Cancel failed.", "error");
    }
  }, [screen, refreshMe, showToast]);

  if (screen.kind === "loading") {
    return (
      <div className="min-h-full w-full flex items-center justify-center p-6">
        <CircularProgress />
      </div>
    );
  }

  if (screen.kind === "qr_scan") {
    return (
      <div className="min-h-full w-full flex items-start justify-center p-4 sm:p-6">
        <main className="w-full max-w-md flex flex-col gap-4">
          <QRScanScreen
            catalogue={catalogue}
            onScanned={onQRScanned}
            onBypass={onBypass}
          />
        </main>
        <Toast {...toastProps} />
      </div>
    );
  }

  if (!plant || !me) {
    return (
      <div className="min-h-full w-full flex items-center justify-center p-6">
        <CircularProgress />
      </div>
    );
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 15, opacity: 0 },
    visible: { y: 0, opacity: 1 },
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="relative min-h-screen pb-10 overflow-x-hidden"
    >
      {/* Ambient Background */}
      <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-slate-50 to-transparent -z-10" />
      <div className="absolute top-[-5%] right-[-10%] w-64 h-64 bg-pure-aqua/5 blur-[100px] rounded-full -z-10" />

      <div className="px-5 pt-8">
        {(screen.kind === "home" || screen.kind === "submitting") && (
          <motion.div variants={itemVariants} className="mb-6">
             <WalletHeader me={me} activeOrder={null} />
          </motion.div>
        )}

        <motion.div variants={itemVariants} className="w-full">
          {screen.kind === "home" || screen.kind === "submitting" ? (
            <CaneBuilder
              plant={plant}
              me={me}
              draft={draft}
              onChange={setDraft}
              onConfirm={onConfirm}
              onBack={backToScan}
              submitting={screen.kind === "submitting"}
            />
          ) : (
            <ProgressScreen
              order={screen.order}
              plant={plant}
              me={me}
              idleDeadlines={idleDeadlines}
              startingCaneId={screen.startingCaneId}
              onStart={onStart}
              onStop={onStop}
              onCancel={onCancel}
              onDone={resetToHome}
            />
          )}
        </motion.div>
      </div>
      <Toast {...toastProps} />
    </motion.div>
  );
}
