import axios, { AxiosError } from "axios";

const baseURL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export const api = axios.create({ baseURL, timeout: 15_000 });

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
      const d = detail as { code?: string; message?: string } & Record<string, unknown>;
      return {
        code: d.code ?? "unknown",
        message: d.message ?? err.message,
        httpStatus: status,
        ...d,
      };
    }
    if (typeof detail === "string") {
      return { code: "unknown", message: detail, httpStatus: status };
    }
    if (!err.response) {
      return { code: "network", message: "Could not reach the server." };
    }
    return { code: "unknown", message: err.message, httpStatus: status };
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
    const { data } = await api.post<Order>("/api/order", { plant_id, canes });
    return data;
  } catch (err) {
    throw extractError(err);
  }
}

export async function startCane(orderId: string, caneId: number): Promise<{ cane: Cane }> {
  try {
    const { data } = await api.post<{ status: string; cane: Cane }>(
      `/api/order/${orderId}/cane/${caneId}/start`,
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
