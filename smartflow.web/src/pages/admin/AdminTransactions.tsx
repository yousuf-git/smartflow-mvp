import { useEffect, useState } from "react";
import { Paper, Chip, Skeleton } from "@mui/material";
import { getAdminTransactions, type AdminTransaction } from "../../lib/adminApi";

export default function AdminTransactions() {
  const [txs, setTxs] = useState<AdminTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminTransactions()
      .then(setTxs)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-900 mb-1">Transactions</h1>
        <p className="text-sm text-ink-300">Wallet ledger entries</p>
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
                      No transactions yet.
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
