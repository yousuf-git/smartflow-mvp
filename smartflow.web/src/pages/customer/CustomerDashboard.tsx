import { useEffect, useState } from "react";
import { Paper, CircularProgress, Chip } from "@mui/material";
import {
  Wallet,
  Droplets,
  ShoppingCart,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import {
  getCustomerDashboard,
  getCustomerTransactions,
  type CustomerDashboard as DashData,
  type CustomerTransaction,
} from "../../lib/customerApi";

export default function CustomerDashboard() {
  const { user } = useAuth();
  const [dash, setDash] = useState<DashData | null>(null);
  const [txs, setTxs] = useState<CustomerTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getCustomerDashboard(), getCustomerTransactions()])
      .then(([d, t]) => {
        setDash(d);
        setTxs(t.slice(0, 5));
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading || !dash) {
    return (
      <div className="flex items-center justify-center h-64">
        <CircularProgress />
      </div>
    );
  }

  return (
    <div className="px-4 pt-6">
      {/* Header */}
      <div className="mb-6">
        <p className="text-sm text-slate-500">
          {(() => {
            const h = new Date().getHours();
            if (h < 12) return "Good morning,";
            if (h < 17) return "Good afternoon,";
            return "Good evening,";
          })()}
        </p>
        <h1 className="text-2xl font-bold text-ink-900">
          {user?.first_name} {user?.last_name}
        </h1>
      </div>

      {/* Balance Card */}
      <Paper
        elevation={0}
        sx={{ p: 3, borderRadius: 3, mb: 3 }}
        className="bg-gradient-to-br from-sky-500 to-cyan-600 text-white"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm text-white/70">Available Balance</p>
            <h2 className="text-3xl font-bold">
              {dash.currency} {dash.balance.toFixed(0)}
            </h2>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
            <Wallet className="w-6 h-6" />
          </div>
        </div>
        {dash.hold_balance > 0 && (
          <p className="text-sm text-white/70">
            On hold: {dash.currency} {dash.hold_balance.toFixed(0)}
          </p>
        )}
        <div className="flex items-center gap-1 text-sm text-white/80 mt-1">
          <Droplets className="w-3.5 h-3.5" />
          <span>
            {dash.price_per_litre.toFixed(0)} {dash.currency}/L
          </span>
        </div>
      </Paper>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {[
          {
            icon: ShoppingCart,
            label: "Total Orders",
            value: dash.total_orders,
            color: "text-sky-500",
            bg: "bg-sky-50",
          },
          {
            icon: Droplets,
            label: "Total Litres",
            value: `${dash.total_litres.toFixed(1)}L`,
            color: "text-cyan-500",
            bg: "bg-cyan-50",
          },
          {
            icon: TrendingUp,
            label: "Daily Limit",
            value: `${dash.daily_limit_litres.toFixed(0)}L`,
            color: "text-emerald-500",
            bg: "bg-emerald-50",
          },
          {
            icon: Clock,
            label: "Remaining Today",
            value: `${dash.daily_remaining_litres.toFixed(1)}L`,
            color: "text-amber-500",
            bg: "bg-amber-50",
          },
        ].map((s) => (
          <Paper
            key={s.label}
            elevation={0}
            sx={{ p: 2, borderRadius: 2.5 }}
            className="border border-slate-100"
          >
            <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center mb-2`}>
              <s.icon className={`w-4.5 h-4.5 ${s.color}`} />
            </div>
            <p className="text-lg font-bold text-ink-900">{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </Paper>
        ))}
      </div>

      {/* Recent Transactions */}
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-ink-900 mb-3">
          Recent Transactions
        </h3>
        {txs.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">
            No transactions yet
          </p>
        ) : (
          <div className="space-y-2">
            {txs.map((tx) => (
              <Paper
                key={tx.id}
                elevation={0}
                sx={{ px: 2.5, py: 2, borderRadius: 2 }}
                className="flex items-center justify-between border border-slate-100"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center ${
                      tx.type === "credit"
                        ? "bg-emerald-50"
                        : "bg-red-50"
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
                      {new Date(tx.timestamp).toLocaleDateString()}
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
