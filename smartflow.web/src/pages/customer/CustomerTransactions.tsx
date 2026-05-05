import { useEffect, useState } from "react";
import {
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  InputAdornment,
} from "@mui/material";
import {
  Droplets,
  Filter,
  History,
  ChevronDown,
  ChevronUp,
  X,
  Calendar,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import MobilePageHeader from "../../components/MobilePageHeader";
import CustomerTransactionRow from "../../components/CustomerTransactionRow";
import {
  getCustomerTransactions,
  getCustomerPurchases,
  type CustomerTransaction,
  type CustomerPurchase,
  type CustomerCaneDetail,
} from "../../lib/customerApi";
import { type Period, periodDates, formatTimestamp } from "../../lib/time";

const fieldSx = {
  "& .MuiOutlinedInput-root": {
    backgroundColor: "#F8FAFC",
    borderRadius: "16px",
    "& fieldset": { borderColor: "transparent" },
    "&:hover fieldset": { borderColor: "#E2E8F0" },
    "&.Mui-focused fieldset": { borderColor: "#00A3FF" },
  },
  "& .MuiInputLabel-root": {
    fontWeight: 600,
    color: "#64748B",
    "&.Mui-focused": { color: "#00A3FF" }
  },
  "& .MuiOutlinedInput-input": {
    py: 1.8,
    fontWeight: 600,
    fontSize: '0.9rem',
  },
};

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
    <div className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-tighter`} style={{ color: s.color, backgroundColor: s.bg }}>
      {s.label}
    </div>
  );
}

function groupChip(status: string) {
  const s = GROUP_STATUS_MAP[status] ?? { label: status, color: "#64748b", bg: "#f1f5f9" };
  return (
    <div className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider`} style={{ color: s.color, backgroundColor: s.bg }}>
      {s.label}
    </div>
  );
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
    <div className="flex items-center justify-between py-2 text-[11px] border-t border-slate-50">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-slate-400 font-medium shrink-0">#{cane.cane_number}</span>
        {caneChip(cane.status)}
      </div>
      <div className="flex items-center gap-3 text-right shrink-0">
        <span className="text-slate-500 font-medium">
          {cane.litres_delivered.toFixed(2)}/{cane.litres_requested.toFixed(2)} L
        </span>
        <span className="text-slate-900 font-semibold w-14 text-right">
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
    <div className="bg-white border border-slate-100 rounded-[24px] overflow-hidden shadow-sm transition-all">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left p-4 flex items-center justify-between active:bg-slate-50 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <h3 className="text-sm font-semibold text-slate-900 truncate">
              {p.plant_name}
            </h3>
            {groupChip(p.status)}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-400 font-medium">
            <span className="flex items-center gap-1">
              <Droplets className="w-3 h-3 text-pure-aqua" />
              {p.total_litres.toFixed(2)} L
            </span>
            <span>{p.cane_count} Canes</span>
            <span className="text-slate-900 font-semibold">Rs. {p.total_price.toFixed(2)}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0 ml-3">
          <span className="text-[10px] font-medium text-slate-400">
            {formatTimestamp(p.created_at)}
          </span>
          {open ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 pb-4 pt-0 space-y-3 overflow-hidden"
          >
            {[...byTap.entries()].map(([tapLabel, canes]) => (
              <div key={tapLabel} className="bg-slate-50/50 rounded-xl p-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                   <div className="w-1.5 h-1.5 rounded-full bg-pure-aqua" />
                   {tapLabel}
                </p>
                <div className="space-y-1">
                  {canes.map((c) => (
                    <CaneRow key={c.id} cane={c} />
                  ))}
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
];

export default function CustomerTransactions() {
  const [tab, setTab] = useState(0);
  const [txs, setTxs] = useState<CustomerTransaction[]>([]);
  const [purchases, setPurchases] = useState<CustomerPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("today");
  const [filterOpen, setFilterOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    setLoading(true);
    const range = period === "custom" ? { from: dateFrom, to: dateTo } : periodDates(period);
    const from = range?.from || undefined;
    const to = range?.to || undefined;
    Promise.all([getCustomerTransactions(from, to), getCustomerPurchases(from, to)])
      .then(([t, p]) => {
        setTxs(t);
        setPurchases(p);
      })
      .finally(() => setLoading(false));
  }, [period, dateFrom, dateTo]);

  const selectPeriod = (p: Period) => {
    if (p !== "custom") {
      setDateFrom("");
      setDateTo("");
    }
    setPeriod(p);
  };

  const applyCustom = () => {
    setPeriod("custom");
    setFilterOpen(false);
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.05 },
    },
  };

  const itemVariants = {
    hidden: { y: 15, opacity: 0 },
    visible: { y: 0, opacity: 1 },
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="relative min-h-screen pb-12 overflow-x-hidden"
    >
      <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-slate-50 to-transparent -z-10" />

      <div className="px-5 pt-8">
        <motion.div variants={itemVariants}>
          <MobilePageHeader
            icon={History}
            title="History"
            subtitle="Your activity and records"
          />
        </motion.div>

        {/* Filters & Tabs */}
        <motion.div variants={itemVariants} className="mb-6">
           <div className="flex items-center justify-between mb-4">
              <div className="flex gap-1.5">
                {PERIODS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => selectPeriod(p.key)}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                      period === p.key
                        ? "bg-pure-aqua text-white shadow-md shadow-pure-aqua/20"
                        : "bg-white border border-slate-100 text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <IconButton
                onClick={() => setFilterOpen(true)}
                sx={{
                  borderRadius: '12px',
                  bgcolor: period === "custom" ? '#00A3FF' : 'white',
                  color: period === "custom" ? 'white' : '#64748b',
                  border: '1px solid #F1F5F9',
                  '&:hover': { bgcolor: period === "custom" ? '#008BD9' : '#F8FAFC' }
                }}
              >
                <Filter className="w-4.5 h-4.5" />
              </IconButton>
           </div>

           <div className="bg-slate-100/50 p-1 rounded-2xl flex gap-1">
              <button
                onClick={() => setTab(0)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${tab === 0 ? "bg-white text-pure-aqua shadow-sm" : "text-slate-500"}`}
              >
                Wallet
              </button>
              <button
                onClick={() => setTab(1)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${tab === 1 ? "bg-white text-pure-aqua shadow-sm" : "text-slate-500"}`}
              >
                Dispenses
              </button>
           </div>
        </motion.div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <CircularProgress sx={{ color: "#00A3FF" }} />
          </div>
        ) : (
          <motion.div variants={itemVariants} className="space-y-3">
            {tab === 0 ? (
              txs.length === 0 ? (
                <div className="py-20 text-center">
                   <p className="text-slate-400 font-medium text-sm">No wallet transactions found</p>
                </div>
              ) : (
                txs.map((tx) => (
                  <CustomerTransactionRow
                    key={tx.id}
                    tx={tx}
                    currency="Rs."
                    className="border border-slate-100 rounded-[24px] shadow-sm"
                  />
                ))
              )
            ) : (
              purchases.length === 0 ? (
                <div className="py-20 text-center">
                   <p className="text-slate-400 font-medium text-sm">No dispense activity found</p>
                </div>
              ) : (
                purchases.map((p) => <PurchaseCard key={p.id} p={p} />)
              )
            )}
          </motion.div>
        )}
      </div>

      <Dialog
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        fullWidth
        maxWidth="xs"
        slotProps={{
          paper: { sx: { borderRadius: '24px', p: 0.5 } }
        }}
      >        <DialogTitle sx={{ p: 3, pb: 2 }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 rounded-xl bg-pure-aqua/10 flex items-center justify-center text-pure-aqua">
                  <Calendar className="w-5 h-5" />
               </div>
               <h2 className="text-lg font-semibold text-slate-900">Custom Range</h2>
            </div>
            <IconButton onClick={() => setFilterOpen(false)} sx={{ bgcolor: '#F8FAFC' }}>
              <X className="w-4 h-4 text-slate-400" />
            </IconButton>
          </div>
        </DialogTitle>
        <DialogContent sx={{ p: 3, pt: 1 }}>
          <div className="space-y-5 mt-4">
            <TextField
              label="Starting From"
              type="date"
              fullWidth
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              sx={fieldSx}
              slotProps={{
                inputLabel: { shrink: true },
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Calendar className="w-4 h-4 text-slate-400" />
                    </InputAdornment>
                  ),
                }
              }}
            />
            <TextField
              label="Ending At"
              type="date"
              fullWidth
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              sx={fieldSx}
              slotProps={{
                inputLabel: { shrink: true },
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Calendar className="w-4 h-4 text-slate-400" />
                    </InputAdornment>
                  ),
                }
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 mt-8">
             <button
                onClick={() => { setDateFrom(""); setDateTo(""); selectPeriod("today"); setFilterOpen(false); }}
                className="py-4 rounded-[20px] bg-slate-100 text-slate-500 text-sm font-bold active:scale-[0.98] transition-all"
             >
               Reset
             </button>
             <button
                onClick={applyCustom}
                className="py-4 rounded-[20px] bg-pure-aqua text-white text-sm font-bold shadow-lg shadow-pure-aqua/20 active:scale-[0.98] transition-all"
             >
               Apply Filter
             </button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
