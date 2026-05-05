export function formatTime12h(value: string): string {
  const [rawHour, rawMinute = "00"] = value.split(":");
  const hour = Number(rawHour);
  if (!Number.isFinite(hour)) return value;
  const minute = rawMinute.padStart(2, "0").slice(0, 2);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${period}`;
}

export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
  });
}

export type Period = "today" | "7d" | "30d" | "custom";

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function periodDates(period: Period): { from: string; to: string } | null {
  if (period === "custom") return null;
  const today = new Date();
  const to = toISO(today);
  if (period === "today") return { from: to, to };
  const ago = new Date(today);
  ago.setDate(ago.getDate() - (period === "7d" ? 6 : 29));
  return { from: toISO(ago), to };
}
