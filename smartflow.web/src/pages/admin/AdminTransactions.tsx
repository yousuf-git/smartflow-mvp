import { useEffect, useState } from "react";
import { Paper, Chip, Skeleton, TextField, Button } from "@mui/material";
import { getAdminTransactions, type AdminTransaction } from "../../lib/adminApi";
import { type Period, periodDates } from "../../lib/time";

const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
];

export default function AdminTransactions() {
  const [txs, setTxs] = useState<AdminTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("today");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    setLoading(true);
    const range = period === "custom" ? { from: dateFrom, to: dateTo } : periodDates(period);
    getAdminTransactions(undefined, range?.from || undefined, range?.to || undefined)
      .then(setTxs)
      .finally(() => setLoading(false));
  }, [period, dateFrom, dateTo]);

  const selectPeriod = (p: Period) => {
    if (p !== "custom") {
      setDateFrom("");
      setDateTo("");
    }
    setPeriod(p);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-900 mb-1">Transactions</h1>
        <p className="text-sm text-ink-300">Wallet ledger entries</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1.5">
          {PERIODS.map((p) => (
            <Chip
              key={p.key}
              label={p.label}
              size="small"
              variant={period === p.key ? "filled" : "outlined"}
              color={period === p.key ? "primary" : "default"}
              onClick={() => selectPeriod(p.key)}
              sx={{ fontWeight: 500 }}
            />
          ))}
        </div>
        <TextField label="From" type="date" size="small" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPeriod("custom"); }} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField label="To" type="date" size="small" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPeriod("custom"); }} slotProps={{ inputLabel: { shrink: true } }} />
        {period === "custom" && (
          <Button size="small" onClick={() => selectPeriod("today")} sx={{ textTransform: "none" }}>
            Clear dates
          </Button>
        )}
      </div>

      <Paper
        elevation={0}
        sx={{ border: "1px solid #EDF0F2", borderRadius: 3, overflow: "hidden" }}
      >
        {loading ? (
          <div className="p-6 space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={48} />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-ink-100/30">
                  <th className="text-left px-5 py-3 font-semibold text-ink-700">ID</th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700">User</th>
                  <th className="text-right px-5 py-3 font-semibold text-ink-700">Amount</th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700">Type</th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700 hidden sm:table-cell">Date</th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700 hidden md:table-cell">Dispense</th>
                </tr>
              </thead>
              <tbody>
                {txs.map((tx) => (
                  <tr
                    key={tx.id}
                    className="border-t border-ink-100/50 hover:bg-ink-100/20 transition-colors"
                  >
                    <td className="px-5 py-3 font-mono text-xs text-ink-300">
                      #{tx.id}
                    </td>
                    <td className="px-5 py-3 text-ink-900">{tx.user_email}</td>
                    <td className="px-5 py-3 text-right font-medium">
                      <span
                        className={
                          tx.type === "credit" ? "text-moss" : "text-coral"
                        }
                      >
                        {tx.type === "credit" ? "+" : "-"}PKR{" "}
                        {tx.amount.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <Chip
                        label={tx.type}
                        size="small"
                        color={tx.type === "credit" ? "success" : "error"}
                        variant="outlined"
                        sx={{ fontSize: "0.7rem", textTransform: "capitalize" }}
                      />
                    </td>
                    <td className="px-5 py-3 text-ink-300 hidden sm:table-cell">
                      {new Date(tx.timestamp).toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-ink-300 hidden md:table-cell">
                      {tx.purchase_id ? `#${tx.purchase_id}` : "—"}
                    </td>
                  </tr>
                ))}
                {txs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-ink-300">
                      No transactions found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Paper>
    </div>
  );
}
