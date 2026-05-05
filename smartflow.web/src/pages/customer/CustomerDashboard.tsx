import { useEffect, useState } from "react";
import { CircularProgress } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Wallet,
  Droplets,
  Gauge,
  Waves,
  ArrowRight,
  TimerReset,
  Plus,
} from "lucide-react";
import {
  getCustomerDashboard,
  getCustomerTransactions,
  type CustomerDashboard as DashData,
  type CustomerTransaction,
} from "../../lib/customerApi";
import { useAuth } from "../../contexts/AuthContext";
import CustomerTransactionRow from "../../components/CustomerTransactionRow";

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
      <div className="flex items-center justify-center h-screen">
        <CircularProgress sx={{ color: "#00A3FF" }} />
      </div>
    );
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 },
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="relative min-h-screen pb-8 overflow-x-hidden"
    >
      {/* Ambient Background Elements */}
      <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-aqua-50/50 to-transparent -z-10" />
      <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-pure-aqua/5 blur-[100px] rounded-full -z-10" />
      <div className="absolute top-[10%] left-[-10%] w-48 h-48 bg-cyan-500/5 blur-[80px] rounded-full -z-10" />

      <div className="px-5 pt-8">
        {/* Header */}
        <motion.div variants={itemVariants} className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/app/profile")}
              className="w-14 h-14 rounded-full overflow-hidden bg-white shadow-sm border border-slate-100 flex items-center justify-center text-ink-700 text-lg font-bold transition-transform active:scale-95"
            >
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                `${user?.first_name?.[0] ?? ""}${user?.last_name?.[0] ?? ""}`
              )}
            </button>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-400">
                {(() => {
                  const h = new Date().getHours();
                  if (h < 12) return "Good morning,";
                  if (h < 17) return "Good afternoon,";
                  return "Good evening,";
                })()}
              </p>
              <h1 className="text-2xl font-semibold text-ink-900 truncate tracking-tight">
                {user?.first_name} {user?.last_name}
              </h1>
            </div>
          </div>
          <div className="w-10 h-10 rounded-full bg-white border border-slate-100 flex items-center justify-center shadow-sm relative">
             <div className="w-2 h-2 bg-emerald-500 rounded-full absolute top-0 right-0 border-2 border-white" />
             <Droplets className="w-5 h-5 text-pure-aqua" />
          </div>
        </motion.div>

        {/* Balance Card (Premium) */}
        <motion.div
          variants={itemVariants}
          className="relative overflow-hidden rounded-[32px] p-6 mb-8 shadow-2xl shadow-pure-aqua/20"
          style={{
            background: "linear-gradient(135deg, #00A3FF 0%, #0077B6 100%)",
          }}
        >
          {/* Card Decorative Elements */}
          <div className="absolute top-[-20%] right-[-10%] w-40 h-40 bg-white/10 blur-[40px] rounded-full" />
          <div className="absolute bottom-[-20%] left-[-10%] w-32 h-32 bg-cyan-400/20 blur-[30px] rounded-full" />

          <div className="relative z-10">
            <div className="flex justify-between items-start mb-8">
              <div className="flex items-center gap-2 text-white/80">
                <Wallet className="w-4 h-4" />
                <span className="text-[10px] font-semibold uppercase tracking-widest">Available Balance</span>
              </div>
            </div>

            <div className="mb-8">
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-white/70">{dash.currency}</span>
                <h2 className="text-5xl font-black text-white tracking-tighter">
                  {dash.balance.toFixed(2)}
                </h2>
              </div>
              {dash.hold_balance > 0 && (
                <p className="text-[11px] font-semibold text-white/60 mt-2 bg-white/10 inline-block px-2.5 py-1.5 rounded-xl">
                  On hold: {dash.currency} {dash.hold_balance.toFixed(2)}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-white/10">
              <div className="flex flex-col">
                 <span className="text-[10px] text-white/50 uppercase font-semibold tracking-widest mb-1">Current Rate</span>
                 <div className="flex items-center gap-1.5 text-white/90">
                    <Droplets className="w-3.5 h-3.5" />
                    <span className="text-sm font-semibold">{dash.currency} {dash.price_per_litre.toFixed(2)}/L</span>
                 </div>
              </div>
              <button
                onClick={() => navigate("/app/top-up")}
                className="bg-white text-pure-aqua px-5 py-3 rounded-2xl font-semibold text-sm flex items-center gap-2 shadow-lg active:scale-95 transition-transform"
              >
                <Plus className="w-4 h-4" /> Top Up
              </button>
            </div>
          </div>
        </motion.div>

        {/* Stats Section Header */}
        <motion.div variants={itemVariants} className="mb-4 flex items-center justify-between">
           <h3 className="text-[10px] font-semibold text-ink-900 uppercase tracking-[0.2em] ml-1">Efficiency Stats</h3>
        </motion.div>

        {/* Stats Grid */}
        <motion.div variants={itemVariants} className="grid grid-cols-2 gap-4 mb-10">
          {[
            {
              icon: Waves,
              label: "Dispense Sessions",
              value: dash.total_orders,
              color: "text-blue-600",
              bg: "bg-blue-50/80",
              border: "border-blue-100",
            },
            {
              icon: Droplets,
              label: "Total Litres",
              value: `${dash.total_litres.toFixed(2)}L`,
              color: "text-cyan-600",
              bg: "bg-cyan-50/80",
              border: "border-cyan-100",
            },
            {
              icon: Gauge,
              label: "Daily Limit",
              value: `${dash.daily_limit_litres.toFixed(2)}L`,
              color: "text-emerald-600",
              bg: "bg-emerald-50/80",
              border: "border-emerald-100",
            },
            {
              icon: TimerReset,
              label: "Remaining Today",
              value: `${dash.daily_remaining_litres.toFixed(2)}L`,
              color: "text-amber-600",
              bg: "bg-amber-50/80",
              border: "border-amber-100",
            },
          ].map((s) => (
            <div
              key={s.label}
              className={`p-4 rounded-[24px] border ${s.border} ${s.bg} backdrop-blur-sm transition-all hover:shadow-md active:scale-95`}
            >
              <div className={`w-10 h-10 rounded-xl bg-white flex items-center justify-center mb-3 shadow-sm`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <p className="text-lg font-semibold text-ink-900 tracking-tight">{s.value}</p>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{s.label}</p>
            </div>
          ))}
        </motion.div>

        {/* Recent Transactions Section */}
        <motion.div variants={itemVariants} className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-semibold text-ink-900 uppercase tracking-[0.2em] ml-1">Recent Activity</h3>
            <button
              onClick={() => navigate("/app/transactions")}
              className="text-pure-aqua text-xs font-semibold uppercase flex items-center gap-1"
            >
              View All <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {txs.length === 0 ? (
            <div className="bg-white rounded-[24px] border border-slate-100 p-8 text-center">
              <p className="text-sm text-slate-400 font-medium italic">No transactions yet</p>
            </div>
          ) : (
            <div className="bg-white rounded-[32px] border border-slate-100 overflow-hidden shadow-sm">
              <div className="divide-y divide-slate-50">
                {txs.map((tx) => (
                  <CustomerTransactionRow
                    key={tx.id}
                    tx={tx}
                    currency={dash.currency}
                    className="active:bg-slate-50 transition-colors"
                  />
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
