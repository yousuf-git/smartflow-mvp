import axios, { AxiosError } from "axios";

declare module "axios" {
  interface AxiosRequestConfig {
    _suppressToast?: boolean;
  }
}

const baseURL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export const api = axios.create({ baseURL, timeout: 15_000 });

export function getStoredToken(): string | null {
  return sessionStorage.getItem("sf_token") ?? localStorage.getItem("sf_remember_token");
}

export function clearStoredToken(token?: string | null): void {
  sessionStorage.removeItem("sf_token");
  if (!token || localStorage.getItem("sf_remember_token") === token) {
    localStorage.removeItem("sf_remember_token");
  }
}

const FRIENDLY: Record<string, string> = {
  rejected:              "Tap rejected the command.",
  ack_timeout:           "Tap did not respond in time. Try again.",
  mqtt_publish_failed:   "Could not reach the tap. Check connection.",
  unknown_ack:           "Unexpected response from tap.",
  tap_busy:              "This tap is currently in use.",
  cane_not_found:        "Cane not found.",
  cane_order_mismatch:   "Cane does not belong to this session.",
  cane_not_started:      "This cane is not dispensing.",
  order_not_found:       "Session not found.",
  group_not_found:       "Session not found.",
  insufficient_balance:  "Not enough credit for this request.",
  daily_limit_exceeded:  "Daily water limit reached.",
  retry_limit:           "Too many attempts. Please wait and retry.",
  network:               "Could not reach the server.",
};

function friendlyMessage(detail: unknown): string {
  if (typeof detail === "string") {
    return FRIENDLY[detail] ?? detail;
  }
  if (typeof detail === "object" && detail !== null) {
    const d = detail as Record<string, unknown>;
    if (typeof d.message === "string") return d.message;
    const code = typeof d.code === "string" ? d.code : "";
    const reason = typeof d.reason === "string" ? d.reason : "";
    if (FRIENDLY[code]) {
      return reason ? `${FRIENDLY[code]} Reason: ${reason}` : FRIENDLY[code];
    }
    if (reason) return reason;
  }
  return "Something went wrong.";
}

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err instanceof AxiosError) {
      const status = err.response?.status;
      const url = err.config?.url ?? "";

      if (status === 401 && !url.includes("/api/auth/")) {
        clearStoredToken(getStoredToken());
        window.location.href = "/login";
      } else if (status && status !== 401 && !err.config?._suppressToast) {
        const detail = (err.response?.data as { detail?: unknown })?.detail;
        const msg = friendlyMessage(detail);
        import("../contexts/ToastContext").then(({ fireGlobalToast }) => {
          fireGlobalToast(msg, status >= 500 ? "error" : "warning");
        });
      }
    }
    return Promise.reject(err);
  },
);

export type Me = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  customer_type: string;
  currency: string;
  price_per_litre: number;
  balance: number;
  hold_balance: number;
  daily_limit_litres: number;
  daily_consumed_litres: number;
  daily_hold_litres: number;
  daily_remaining_litres: number;
};

export type Tap = { id: number; label: string };
export type Plant = { id: number; name: string; taps: Tap[] };
export type Catalogue = { plants: Plant[] };

export type CaneStatus =
  | "pending"
  | "started"
  | "completed"
  | "partial_completed"
  | "failed"
  | "cancelled";

export type Cane = {
  id: number;
  tap_id: number;
  cane_number: number;
  litres_requested: number;
  litres_delivered: number;
  price: number;
  status: CaneStatus;
  retry_count: number;
  reason?: string | null;
};

export type OrderStatus = "active" | "completed" | "cancelled";

export type Order = {
  id: string; // uuid
  plant_id: number;
  status: OrderStatus;
  total_litres: number;
  total_price: number;
  canes: Cane[];
};

export type CaneRequest = { tap_id: number; litres: number };

export type ApiErr = {
  code: string;
  message: string;
  httpStatus?: number;
  [k: string]: unknown;
};

function extractError(err: unknown): ApiErr {
  if (err instanceof AxiosError) {
    const status = err.response?.status;
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail;
    if (typeof detail === "object" && detail !== null) {
      const d = detail as { code?: string; message?: string; reason?: string } & Record<string, unknown>;
      const code = d.code ?? "unknown";
      return {
        code,
        message: d.message ?? friendlyMessage(detail),
        httpStatus: status,
        ...d,
      };
    }
    if (typeof detail === "string") {
      return { code: detail, message: FRIENDLY[detail] ?? detail, httpStatus: status };
    }
    if (!err.response) {
      return { code: "network", message: "Could not reach the server." };
    }
    return { code: "unknown", message: "Something went wrong.", httpStatus: status };
  }
  return { code: "unknown", message: String(err) };
}

export async function getMe(): Promise<Me> {
  const { data } = await api.get<Me>("/api/me");
  return data;
}

export async function getCatalogue(): Promise<Catalogue> {
  const { data } = await api.get<Catalogue>("/api/catalogue");
  return data;
}

export async function createOrder(plant_id: number, canes: CaneRequest[]): Promise<Order> {
  try {
    const { data } = await api.post<Order>("/api/order", { plant_id, canes }, { _suppressToast: true });
    return data;
  } catch (err) {
    throw extractError(err);
  }
}

export async function startCane(orderId: string, caneId: number): Promise<{ cane: Cane }> {
  try {
    const { data } = await api.post<{ status: string; cane: Cane }>(
      `/api/order/${orderId}/cane/${caneId}/start`,
      null,
      { _suppressToast: true },
    );
    return { cane: data.cane };
  } catch (err) {
    throw extractError(err);
  }
}

export async function stopCane(orderId: string, caneId: number): Promise<{ cane: Cane }> {
  try {
    const { data } = await api.post<{ cane: Cane }>(
      `/api/order/${orderId}/cane/${caneId}/stop`,
      null,
      { _suppressToast: true },
    );
    return data;
  } catch (err) {
    throw extractError(err);
  }
}

export async function cancelOrder(orderId: string): Promise<number[]> {
  try {
    const { data } = await api.post<{ cancelled: number[] }>(
      `/api/order/${orderId}/cancel`,
      null,
      { _suppressToast: true },
    );
    return data.cancelled;
  } catch (err) {
    throw extractError(err);
  }
}

export async function getOrder(orderId: string): Promise<Order> {
  const { data } = await api.get<Order>(`/api/order/${orderId}`);
  return data;
}
