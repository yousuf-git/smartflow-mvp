export type ProgressStatus = "dispensing" | "complete" | "failed";

export type ProgressFrame = {
  id: string;
  litres: number;
  status: ProgressStatus;
  reason?: string;
};

export type ProgressHandlers = {
  onFrame: (frame: ProgressFrame) => void;
  onClose: (info: { code: number; clean: boolean }) => void;
  onError: (err: Event) => void;
};

const baseWS = import.meta.env.VITE_WS_BASE_URL ?? "ws://localhost:8000";

export function openProgressSocket(
  sessionId: string,
  handlers: ProgressHandlers,
): WebSocket {
  const url = `${baseWS}/api/ws/dispense/${encodeURIComponent(sessionId)}`;
  const ws = new WebSocket(url);

  ws.addEventListener("message", (ev) => {
    try {
      const frame = JSON.parse(ev.data as string) as ProgressFrame;
      handlers.onFrame(frame);
    } catch (err) {
      console.error("ws.parse.error", err, ev.data);
    }
  });

  ws.addEventListener("close", (ev) => {
    handlers.onClose({ code: ev.code, clean: ev.wasClean });
  });

  ws.addEventListener("error", (ev) => {
    handlers.onError(ev);
  });

  return ws;
}
