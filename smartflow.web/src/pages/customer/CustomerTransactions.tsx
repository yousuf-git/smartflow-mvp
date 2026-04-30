import { useEffect, useState } from "react";
import { Paper, CircularProgress, Chip, Tabs, Tab } from "@mui/material";
import {
  ArrowUpRight,
  ArrowDownRight,
  ShoppingCart,
  Droplets,
} from "lucide-react";
import {
  getCustomerTransactions,
  getCustomerPurchases,
  type CustomerTransaction,
  type CustomerPurchase,
} from "../../lib/customerApi";

export default function CustomerTransactions() {
  const [tab, setTab] = useState(0);
  const [txs, setTxs] = useState<CustomerTransaction[]>([]);
  const [purchases, setPurchases] = useState<CustomerPurchase[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="px-4 pt-6">
      <h1 className="text-xl font-bold text-ink-900 mb-4">History</h1>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 3, minHeight: 36 }}
      >
        <Tab label="Wallet" sx={{ textTransform: "none", minHeight: 36, py: 0 }} />
        <Tab label="Purchases" sx={{ textTransform: "none", minHeight: 36, py: 0 }} />
      </Tabs>

      {tab === 0 && (
        <div className="space-y-2">
          {txs.length === 0 ? (
            <p className="text-center text-slate-400 py-10">
              No wallet transactions
            </p>
          ) : (
            txs.map((tx) => (
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
          {purchases.length === 0 ? (
            <p className="text-center text-slate-400 py-10">
              No purchases yet
            </p>
          ) : (
            purchases.map((p) => (
              <Paper
                key={p.id}
                elevation={0}
                sx={{ px: 2.5, py: 2, borderRadius: 2 }}
                className="border border-slate-100"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-sky-500" />
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
    </div>
  );
}
