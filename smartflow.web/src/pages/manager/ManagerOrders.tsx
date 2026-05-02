import { useEffect, useState } from "react";
import { Chip, Paper, Skeleton, TextField, Button, Typography } from "@mui/material";
import { ChevronDown, ChevronUp, Droplets } from "lucide-react";
import { getManagerOrders, type AdminOrder, type AdminOrderCane } from "../../lib/managerApi";

const GROUP_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  completed:         { label: "Completed",   color: "#059669", bg: "#ecfdf5" },
  partial_completed: { label: "Partial",     color: "#d97706", bg: "#fffbeb" },
  active:            { label: "Active",      color: "#2563eb", bg: "#eff6ff" },
  cancelled:         { label: "Cancelled",   color: "#64748b", bg: "#f1f5f9" },
};

const CANE_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  completed:         { label: "Completed",  color: "#059669", bg: "#ecfdf5" },
  partial_completed: { label: "Stopped",    color: "#d97706", bg: "#fffbeb" },
  failed:            { label: "Failed",     color: "#dc2626", bg: "#fef2f2" },
  cancelled:         { label: "Cancelled",  color: "#64748b", bg: "#f1f5f9" },
  pending:           { label: "Pending",    color: "#2563eb", bg: "#eff6ff" },
  started:           { label: "Dispensing", color: "#0891b2", bg: "#ecfeff" },
};

function statusChip(map: typeof GROUP_STATUS, status: string) {
  const s = map[status] ?? { label: status, color: "#64748b", bg: "#f1f5f9" };
  return (
    <Chip
      label={s.label}
      size="small"
      sx={{ fontWeight: 500, fontSize: "0.65rem", height: 20, color: s.color, bgcolor: s.bg }}
    />
  );
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
  });
}

function groupByTap(canes: AdminOrderCane[]) {
  const map = new Map<string, AdminOrderCane[]>();
  for (const c of canes) {
    const key = c.tap_label;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }
  return map;
}

function CaneRow({ c }: { c: AdminOrderCane }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-xs border-t border-slate-100">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-slate-500 shrink-0">#{c.cane_number}</span>
        {statusChip(CANE_STATUS, c.status)}
      </div>
      <div className="flex items-center gap-3 text-right shrink-0">
        <span className="text-slate-600">
          {c.litres_delivered.toFixed(1)} of {c.litres_requested.toFixed(1)} L
        </span>
        <span className="text-slate-800 font-medium w-16 text-right">
          Rs. {c.price.toFixed(0)}
        </span>
      </div>
    </div>
  );
}

function OrderCard({ o }: { o: AdminOrder }) {
  const [open, setOpen] = useState(false);
  const byTap = groupByTap(o.canes);

  return (
    <Paper
      elevation={0}
      sx={{ borderRadius: 2, overflow: "hidden" }}
      className="border border-slate-100"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-3.5 py-3 flex items-center justify-between hover:bg-slate-50/60 transition-colors gap-3"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {o.user_email}
            </Typography>
            {statusChip(GROUP_STATUS, o.status)}
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
            <span className="flex items-center gap-1">
              <Droplets className="w-3 h-3" />
              {o.total_litres.toFixed(1)} L
            </span>
            <span>{o.cane_count} cane{o.cane_count > 1 ? "s" : ""}</span>
            <span className="font-medium text-slate-700">Rs. {o.total_price.toFixed(0)}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-[11px] text-slate-400">{fmtTime(o.created_at)}</span>
          {open ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </button>
      {open && (
        <div className="px-3.5 pb-3 pt-0 space-y-2">
          {[...byTap.entries()].map(([tapLabel, canes]) => (
            <div key={tapLabel}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
                {tapLabel}
              </Typography>
              {canes.map((c) => (
                <CaneRow key={c.id} c={c} />
              ))}
            </div>
          ))}
          {o.unit_price != null && (
            <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-50">
              Rate: Rs. {o.unit_price.toFixed(0)}/L
              {o.daily_litre_limit != null && <span> &middot; Limit: {o.daily_litre_limit.toFixed(0)} L/day</span>}
            </div>
          )}
        </div>
      )}
    </Paper>
  );
}

export default function ManagerOrders() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    setLoading(true);
    getManagerOrders(statusFilter || undefined, dateFrom || undefined, dateTo || undefined)
      .then(setOrders)
      .finally(() => setLoading(false));
  }, [statusFilter, dateFrom, dateTo]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-900 mb-1">Dispense Records</h1>
        <p className="text-sm text-ink-300">Plant dispense sessions</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1.5">
          {["", "active", "completed", "partial_completed", "cancelled"].map((s) => (
            <Chip
              key={s}
              label={s === "partial_completed" ? "Partial" : s || "All"}
              size="small"
              variant={statusFilter === s ? "filled" : "outlined"}
              color={statusFilter === s ? "primary" : "default"}
              onClick={() => setStatusFilter(s)}
              sx={{ textTransform: "capitalize", fontWeight: 500 }}
            />
          ))}
        </div>
        <TextField label="From" type="date" size="small" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField label="To" type="date" size="small" value={dateTo} onChange={(e) => setDateTo(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        {(dateFrom || dateTo) && (
          <Button size="small" onClick={() => { setDateFrom(""); setDateTo(""); }} sx={{ textTransform: "none" }}>
            Clear dates
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={72} />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <p className="text-center text-slate-400 py-10">No dispense records found.</p>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <OrderCard key={o.id} o={o} />
          ))}
        </div>
      )}
    </div>
  );
}
