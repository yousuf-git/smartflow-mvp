import { useEffect, useState } from "react";
import { Paper, CircularProgress, Chip, IconButton } from "@mui/material";
import { useNavigate } from "react-router-dom";
import {
  Wallet,
  Droplets,
  Gauge,
  Waves,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  TimerReset,
  CirclePlus,
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
  const navigate = useNavigate();
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
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => navigate("/app/profile")} className="w-[52px] h-[52px] rounded-full overflow-hidden bg-white border border-slate-200 flex items-center justify-center text-ink-700 text-base font-bold shrink-0">
          {user?.avatar_url ? <img src={user.avatar_url} alt="" className="w-full h-full object-cover" /> : `${user?.first_name?.[0] ?? ""}${user?.last_name?.[0] ?? ""}`}
        </button>
        <div className="min-w-0">
          <p className="text-sm text-slate-500">
            {(() => {
              const h = new Date().getHours();
              if (h < 12) return "Good morning,";
              if (h < 17) return "Good afternoon,";
              return "Good evening,";
            })()}
          </p>
          <h1 className="text-2xl font-bold text-ink-900 truncate">
            {user?.first_name} {user?.last_name}
          </h1>
        </div>
      </div>

      {/* Balance Card */}
      <Paper
        elevation={0}
        sx={{ p: 3, borderRadius: 3, mb: 3 }}
        className="relative overflow-hidden bg-white border border-slate-100"
      >
        <div className="absolute inset-y-0 right-0 w-28 bg-gradient-to-l from-cyan-50 to-transparent" />
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-aqua-50 flex items-center justify-center shrink-0">
              <Wallet className="w-6 h-6 text-aqua-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Wallet Balance</p>
              <h2 className="text-3xl font-bold text-ink-900">
                {dash.currency} {dash.balance.toFixed(2)}
              </h2>
            </div>
          </div>
          <IconButton
            onClick={() => navigate("/app/top-up")}
            sx={{ bgcolor: "#E8F6FB", "&:hover": { bgcolor: "#D1EEF5" }, zIndex: 10 }}
          >
            <CirclePlus className="w-6 h-6 text-aqua-600" />
          </IconButton>
        </div>
        {dash.hold_balance > 0 && (
          <p className="text-sm text-amber-600">
            On hold: {dash.currency} {dash.hold_balance.toFixed(2)}
          </p>
        )}
        <div className="flex items-center gap-1 text-sm text-slate-500 mt-1">
          <Droplets className="w-3.5 h-3.5" />
          <span>Current water rate: {dash.currency} {dash.price_per_litre.toFixed(2)} per litre</span>
        </div>
      </Paper>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {[
          {
            icon: Waves,
            label: "Dispense Sessions",
            value: dash.total_orders,
            color: "text-sky-500",
            bg: "bg-sky-50",
          },
          {
            icon: Droplets,
            label: "Total Litres",
            value: `${dash.total_litres.toFixed(2)}L`,
            color: "text-cyan-500",
            bg: "bg-cyan-50",
          },
          {
            icon: Gauge,
            label: "Daily Limit",
            value: `${dash.daily_limit_litres.toFixed(2)}L`,
            color: "text-emerald-500",
            bg: "bg-emerald-50",
          },
          {
            icon: TimerReset,
            label: "Remaining Today",
            value: `${dash.daily_remaining_litres.toFixed(2)}L`,
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
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-ink-900">Recent Transactions</h3>
          <IconButton size="small" onClick={() => navigate("/app/transactions")}>
            <ArrowRight className="w-4 h-4 text-slate-500" />
          </IconButton>
        </div>
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
                  label={`${tx.type === "credit" ? "+" : "-"}${tx.amount.toFixed(2)}`}
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
