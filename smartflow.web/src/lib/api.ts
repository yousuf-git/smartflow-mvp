import axios, { AxiosError } from "axios";

const baseURL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export const api = axios.create({
  baseURL,
  timeout: 15_000,
});

export type DispenseAccepted = { id: string; status: "accepted" };

export type DispenseError = {
  kind: "rejected" | "timeout" | "publish_failed" | "bad_request" | "unknown";
  message: string;
  reason?: string;
};

export async function startDispense(litres: number): Promise<DispenseAccepted> {
  try {
    const { data } = await api.post<DispenseAccepted>("/api/dispense", { litres });
    return data;
  } catch (err) {
    throw mapError(err);
  }
}

function mapError(err: unknown): DispenseError {
  if (err instanceof AxiosError) {
    if (err.code === "ECONNABORTED" || err.code === "ERR_CANCELED") {
      return { kind: "timeout", message: "Request timed out. Please try again." };
    }
    if (!err.response) {
      return { kind: "unknown", message: "Could not reach the server. Is it running?" };
    }
    const status = err.response?.status;
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail;

    if (status === 409) {
      const reason =
        typeof detail === "object" && detail !== null
          ? (detail as { reason?: string }).reason
          : undefined;
      return {
        kind: "rejected",
        message: reason ? `Dispense rejected: ${reason}` : "Dispense rejected.",
        reason,
      };
    }
    if (status === 504) {
      return { kind: "timeout", message: "Dispenser didn't respond. Please try again." };
    }
    if (status === 502) {
      return {
        kind: "publish_failed",
        message: "Couldn't reach the dispenser. Try again.",
      };
    }
    if (status === 400) {
      const msg =
        typeof detail === "string" ? detail : "Invalid request.";
      return { kind: "bad_request", message: msg };
    }
  }
  return { kind: "unknown", message: "Something went wrong. Please try again." };
}
