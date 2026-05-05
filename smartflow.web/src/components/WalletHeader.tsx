import { LinearProgress } from "@mui/material";
import { Wallet, Droplet } from "lucide-react";
import type { Me, Order } from "../lib/api";

type Props = { me: Me; activeOrder?: Order | null };

export default function WalletHeader({ me, activeOrder }: Props) {
  const activeDelivery = activeOrder
    ? activeOrder.canes
        .filter((c) => c.status === "started")
        .reduce((sum, c) => sum + c.litres_delivered, 0)
    : 0;

  const usedLitres = me.daily_consumed_litres + activeDelivery;
  const remaining = Math.max(0, me.daily_limit_litres - usedLitres);
  const usedPct =
    me.daily_limit_litres > 0
      ? Math.min(100, (usedLitres / me.daily_limit_litres) * 100)
      : 0;

  return (
    <div className="bg-white border border-slate-100 rounded-[32px] p-6 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        {/* Left Side: Balance */}
        <div className="flex items-center gap-4">
           <div className="w-12 h-12 rounded-2xl bg-pure-aqua/10 flex items-center justify-center text-pure-aqua">
              <Wallet className="w-6 h-6" />
           </div>
           <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.2em] mb-0.5">Your Balance</p>
              <div className="flex items-baseline gap-1.5">
                 <span className="text-xl font-bold text-slate-900">{me.currency} {me.balance.toFixed(2)}</span>
                 {me.hold_balance > 0 && (
                    <span className="text-[10px] font-semibold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                       {me.hold_balance.toFixed(2)} HOLD
                    </span>
                 )}
              </div>
           </div>
        </div>

        {/* Right Side: Allowance */}
        <div className="flex-1 md:max-w-xs">
           <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                 <Droplet className="w-3 h-3" /> Daily Allowance
              </p>
              <span className="text-[11px] font-semibold text-slate-900">{remaining.toFixed(2)}L <span className="text-slate-300">LEFT</span></span>
           </div>

           <LinearProgress
              variant="determinate"
              value={usedPct}
              sx={{
                height: 8,
                borderRadius: 4,
                bgcolor: '#F8FAFC',
                '& .MuiLinearProgress-bar': {
                  bgcolor: '#00A3FF',
                  borderRadius: 4,
                }
              }}
           />

           <div className="flex items-center justify-between mt-2">
              <p className="text-[9px] font-semibold text-slate-300 uppercase tracking-tighter">
                 {usedLitres.toFixed(2)}L USED
              </p>
              <p className="text-[9px] font-semibold text-slate-300 uppercase tracking-tighter">
                 LIMIT {me.daily_limit_litres.toFixed(2)}L
              </p>
           </div>
        </div>
      </div>
    </div>
  );
}
