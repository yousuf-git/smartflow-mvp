import type { CaneStatus } from "./api";

export type OrderFrame = {
  cane_id: number;
  tap_id: number;
  litres: number;
  status: CaneStatus | "dispensing";
  reason?: string | null;
};

export type WsHandlers = {
  onFrame: (frame: OrderFrame) => void;
  onClose: (info: { code: number; clean: boolean }) => void;
  onError: (err: Event) => void;
};

const baseWS = import.meta.env.VITE_WS_BASE_URL ?? "ws://localhost:8000";

export function openOrderSocket(orderId: string, handlers: WsHandlers): WebSocket {
  const ws = new WebSocket(
    `${baseWS}/api/ws/order/${encodeURIComponent(orderId)}`,
  );
  ws.addEventListener("message", (ev) => {
    try {
      const frame = JSON.parse(ev.data as string) as OrderFrame;
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
