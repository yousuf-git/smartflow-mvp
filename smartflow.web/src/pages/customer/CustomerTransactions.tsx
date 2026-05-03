import { useEffect, useState } from "react";
import {
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowDownRight,
  Droplets,
  Filter,
  Plus,
  History,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import MobilePageHeader from "../../components/MobilePageHeader";
import {
  getCustomerTransactions,
  getCustomerPurchases,
  type CustomerTransaction,
  type CustomerPurchase,
  type CustomerCaneDetail,
} from "../../lib/customerApi";

const CANE_STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  completed:         { label: "Completed",   color: "#059669", bg: "#ecfdf5" },
  partial_completed: { label: "Stopped",     color: "#d97706", bg: "#fffbeb" },
  failed:            { label: "Failed",      color: "#dc2626", bg: "#fef2f2" },
  cancelled:         { label: "Cancelled",   color: "#64748b", bg: "#f1f5f9" },
  pending:           { label: "Pending",     color: "#2563eb", bg: "#eff6ff" },
  started:           { label: "Dispensing",  color: "#0891b2", bg: "#ecfeff" },
};

const GROUP_STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  completed:         { label: "Completed", color: "#059669", bg: "#ecfdf5" },
  partial_completed: { label: "Partial",   color: "#d97706", bg: "#fffbeb" },
  active:            { label: "Active",    color: "#2563eb", bg: "#eff6ff" },
  cancelled:         { label: "Cancelled", color: "#64748b", bg: "#f1f5f9" },
};

function caneChip(status: string) {
  const s = CANE_STATUS_MAP[status] ?? { label: status, color: "#64748b", bg: "#f1f5f9" };
  return (
    <Chip label={s.label} size="small" sx={{ fontWeight: 500, fontSize: "0.65rem", height: 20, color: s.color, bgcolor: s.bg }} />
  );
}

function groupChip(status: string) {
  const s = GROUP_STATUS_MAP[status] ?? { label: status, color: "#64748b", bg: "#f1f5f9" };
  return (
    <Chip label={s.label} size="small" sx={{ fontWeight: 500, fontSize: "0.7rem", height: 22, color: s.color, bgcolor: s.bg }} />
  );
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
  });
}

function groupByTap(canes: CustomerCaneDetail[]) {
  const map = new Map<string, CustomerCaneDetail[]>();
  for (const c of canes) {
    const key = c.tap_label;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }
  return map;
}

function CaneRow({ cane }: { cane: CustomerCaneDetail }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-xs border-t border-slate-100">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-slate-500 shrink-0">#{cane.cane_number}</span>
        {caneChip(cane.status)}
      </div>
      <div className="flex items-center gap-3 text-right shrink-0">
        <span className="text-slate-600">
          {cane.litres_delivered.toFixed(2)} of {cane.litres_requested.toFixed(2)} L
        </span>
        <span className="text-slate-800 font-medium w-16 text-right">
          Rs. {cane.price.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

function PurchaseCard({ p }: { p: CustomerPurchase }) {
  const [open, setOpen] = useState(false);
  const byTap = groupByTap(p.canes);
  return (
    <Paper
      elevation={0}
      sx={{ borderRadius: 2, overflow: "hidden" }}
      className="border border-slate-100"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-3 py-2.5 flex items-center justify-between hover:bg-slate-50/60 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {p.plant_name}
            </Typography>
            {groupChip(p.status)}
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Droplets className="w-3 h-3" />
              {p.total_litres.toFixed(2)} L
            </span>
            <span>{p.cane_count} cane{p.cane_count > 1 ? "s" : ""}</span>
            <span className="font-medium text-slate-700">Rs. {p.total_price.toFixed(2)}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
          <span className="text-[11px] text-slate-400">
            {fmtTime(p.created_at)}
          </span>
          {open ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </button>
      {open && (
        <div className="px-3 pb-2.5 pt-0 space-y-2">
          {[...byTap.entries()].map(([tapLabel, canes]) => (
            <div key={tapLabel}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
                {tapLabel}
              </Typography>
              {canes.map((c) => (
                <CaneRow key={c.id} cane={c} />
              ))}
            </div>
          ))}
        </div>
      )}
    </Paper>
  );
}

export default function CustomerTransactions() {
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [txs, setTxs] = useState<CustomerTransaction[]>([]);
  const [purchases, setPurchases] = useState<CustomerPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    Promise.all([getCustomerTransactions(), getCustomerPurchases()])
      .then(([t, p]) => {
        setTxs(t);
        setPurchases(p);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <CircularProgress />
      </div>
    );
  }

  const inRange = (isoDate: string) => {
    const value = new Date(isoDate).getTime();
    if (dateFrom) {
      const from = new Date(`${dateFrom}T00:00:00`).getTime();
      if (value < from) return false;
    }
    if (dateTo) {
      const to = new Date(`${dateTo}T23:59:59`).getTime();
      if (value > to) return false;
    }
    return true;
  };

  const filteredTxs = txs.filter((tx) => inRange(tx.timestamp));
  const filteredPurchases = purchases.filter((purchase) => inRange(purchase.created_at));
  const hasDateFilter = Boolean(dateFrom || dateTo);

  return (
    <div className="px-4 pt-6">
      <MobilePageHeader
        icon={History}
        title="History"
        subtitle="Wallet and dispense activity"
        action={
          <Button size="small" variant="contained" startIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => navigate("/app/top-up")} sx={{ textTransform: "none", borderRadius: 2 }}>
            Top up
          </Button>
        }
      />

      <div className="mb-3 flex items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ minHeight: 36 }}
        >
          <Tab label="Wallet" sx={{ textTransform: "none", minHeight: 36, py: 0 }} />
          <Tab label="Dispenses" sx={{ textTransform: "none", minHeight: 36, py: 0 }} />
        </Tabs>
        <IconButton size="small" onClick={() => setFilterOpen(true)} sx={{ border: "1px solid #E2E8F0", bgcolor: hasDateFilter ? "#ECFDF5" : "white" }}>
          <Filter className={`w-4 h-4 ${hasDateFilter ? "text-emerald-600" : "text-slate-500"}`} />
        </IconButton>
      </div>

      {tab === 0 && (
        <div className="space-y-2">
          {filteredTxs.length === 0 ? (
            <p className="text-center text-slate-400 py-10">
              No wallet transactions
            </p>
          ) : (
            filteredTxs.map((tx) => (
              <Paper
                key={tx.id}
                elevation={0}
                sx={{ px: 2.5, py: 2, borderRadius: 2 }}
                className="flex items-center justify-between border border-slate-100"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center ${
                      tx.type === "credit" ? "bg-emerald-50" : "bg-red-50"
                    }`}
                  >
                    {tx.type === "credit" ? (
                      <ArrowDownRight className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4 text-red-500" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink-900">
                      {tx.type === "credit" ? "Credit" : "Debit"}
                      {tx.purchase_id ? ` #${tx.purchase_id}` : ""}
                    </p>
                    <p className="text-xs text-slate-400">
                      {fmtTime(tx.timestamp)}
                    </p>
                  </div>
                </div>
                <Chip
                  label={`${tx.type === "credit" ? "+" : "-"} Rs. ${tx.amount.toFixed(2)}`}
                  size="small"
                  sx={{
                    fontWeight: 600,
                    bgcolor: tx.type === "credit" ? "#ecfdf5" : "#fef2f2",
                    color: tx.type === "credit" ? "#059669" : "#dc2626",
                  }}
                />
              </Paper>
            ))
          )}
        </div>
      )}

      {tab === 1 && (
        <div className="space-y-2">
          {filteredPurchases.length === 0 ? (
            <p className="text-center text-slate-400 py-10">
              No dispense activity yet
            </p>
          ) : (
            filteredPurchases.map((p) => <PurchaseCard key={p.id} p={p} />)
          )}
        </div>
      )}

      <Dialog open={filterOpen} onClose={() => setFilterOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700 }}>Filter History</DialogTitle>
        <DialogContent className="!space-y-3 !pt-2">
          <TextField label="From" type="date" size="small" fullWidth value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField label="To" type="date" size="small" fullWidth value={dateTo} onChange={(e) => setDateTo(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setDateFrom(""); setDateTo(""); }} sx={{ textTransform: "none" }}>Clear</Button>
          <Button variant="contained" onClick={() => setFilterOpen(false)} sx={{ textTransform: "none" }}>Apply</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
