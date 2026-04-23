import { useCallback, useRef, useState } from "react";
import { Snackbar, Alert } from "@mui/material";
import DispenseForm from "./components/DispenseForm";
import DispenseProgress from "./components/DispenseProgress";
import { startDispense, type DispenseError } from "./lib/api";
import {
  openProgressSocket,
  type ProgressFrame,
  type ProgressStatus,
} from "./lib/ws";

type Screen =
  | { kind: "idle" }
  | { kind: "submitting"; litres: number }
  | {
      kind: "dispensing";
      sessionId: string;
      target: number;
      litres: number;
      status: ProgressStatus;
      reason?: string;
    };

type ToastSeverity = "error" | "warning" | "info" | "success";
type Toast = { msg: string; severity: ToastSeverity } | null;

export default function App() {
  const [screen, setScreen] = useState<Screen>({ kind: "idle" });
  const [toast, setToast] = useState<Toast>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const showToast = useCallback((msg: string, severity: ToastSeverity) => {
    setToast({ msg, severity });
  }, []);

  const resetToIdle = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setScreen({ kind: "idle" });
  }, []);

  const onDispense = useCallback(
    async (litres: number) => {
      setScreen({ kind: "submitting", litres });
      try {
        const accepted = await startDispense(litres);
        console.info("dispense.accepted", accepted);

        setScreen({
          kind: "dispensing",
          sessionId: accepted.id,
          target: litres,
          litres: 0,
          status: "dispensing",
        });

        const ws = openProgressSocket(accepted.id, {
          onFrame: (frame: ProgressFrame) => {
            console.info("ws.frame", frame);
            setScreen((prev) =>
              prev.kind === "dispensing" && prev.sessionId === frame.id
                ? {
                    ...prev,
                    litres: frame.litres,
                    status: frame.status,
                    reason: frame.reason,
                  }
                : prev,
            );
            if (frame.status === "failed") {
              showToast(
                frame.reason ? `Dispense failed: ${frame.reason}` : "Dispense failed.",
                "error",
              );
            }
          },
          onClose: ({ code, clean }) => {
            console.info("ws.close", { code, clean });
            wsRef.current = null;
            if (!clean && code !== 1000) {
              setScreen((prev) =>
                prev.kind === "dispensing" &&
                prev.status === "dispensing"
                  ? { ...prev, status: "failed", reason: "Lost live updates." }
                  : prev,
              );
              showToast("Lost live updates.", "warning");
            }
          },
          onError: (err) => {
            console.error("ws.error", err);
            showToast("Progress stream error.", "error");
          },
        });
        wsRef.current = ws;
      } catch (err) {
        const e = err as DispenseError;
        console.error("dispense.error", e);
        showToast(e.message, e.kind === "rejected" ? "warning" : "error");
        setScreen({ kind: "idle" });
      }
    },
    [showToast],
  );

  return (
    <div className="min-h-full w-full flex items-center justify-center p-4">
      <main className="w-full max-w-md">
        {screen.kind !== "dispensing" ? (
          <DispenseForm
            submitting={screen.kind === "submitting"}
            onSubmit={onDispense}
          />
        ) : (
          <DispenseProgress
            target={screen.target}
            litres={screen.litres}
            status={screen.status}
            reason={screen.reason}
            onBack={resetToIdle}
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
