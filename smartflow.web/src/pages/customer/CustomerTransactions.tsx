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
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowDownRight,
  Waves,
  Droplets,
  Filter,
  Plus,
  History,
} from "lucide-react";
import MobilePageHeader from "../../components/MobilePageHeader";
import {
  getCustomerTransactions,
  getCustomerPurchases,
  type CustomerTransaction,
  type CustomerPurchase,
} from "../../lib/customerApi";

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
                      {new Date(tx.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
                <Chip
                  label={`${tx.type === "credit" ? "+" : "-"}${tx.amount.toFixed(0)}`}
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
            filteredPurchases.map((p) => (
              <Paper
                key={p.id}
                elevation={0}
                sx={{ px: 2.5, py: 2, borderRadius: 2 }}
                className="border border-slate-100"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Waves className="w-4 h-4 text-sky-500" />
                    <span className="text-sm font-medium text-ink-900">
                      {p.plant_name}
                    </span>
                  </div>
                  <Chip
                    label={p.status}
                    size="small"
                    sx={{
                      fontWeight: 500,
                      fontSize: "0.7rem",
                      height: 22,
                      bgcolor:
                        p.status === "completed"
                          ? "#ecfdf5"
                          : p.status === "active"
                            ? "#eff6ff"
                            : "#fef2f2",
                      color:
                        p.status === "completed"
                          ? "#059669"
                          : p.status === "active"
                            ? "#2563eb"
                            : "#dc2626",
                    }}
                  />
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Droplets className="w-3 h-3" />
                    {p.total_litres.toFixed(1)}L
                  </span>
                  <span>{p.cane_count} cane{p.cane_count > 1 ? "s" : ""}</span>
                  <span>{p.total_price.toFixed(0)} PKR</span>
                  <span className="ml-auto">
                    {new Date(p.created_at).toLocaleDateString()}
                  </span>
                </div>
              </Paper>
            ))
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
