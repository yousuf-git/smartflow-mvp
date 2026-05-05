import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { CustomerTransaction } from "../lib/customerApi";
import { formatTimestamp } from "../lib/time";

type Props = {
  tx: CustomerTransaction;
  currency?: string;
  className?: string;
};

export default function CustomerTransactionRow({
  tx,
  currency = "Rs.",
  className = "",
}: Props) {
  const isCredit = tx.type === "credit";

  return (
    <div
      className={`flex items-center justify-between p-4 px-5 bg-white ${className}`}
    >
      <div className="flex items-center gap-4">
        <div
          className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
            isCredit ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
          }`}
        >
          {isCredit ? (
            <ArrowDownRight className="w-5 h-5" />
          ) : (
            <ArrowUpRight className="w-5 h-5" />
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-900">
            {isCredit ? "Credit Received" : "Water Dispensed"}
            {tx.purchase_id && (
              <span className="text-[10px] text-slate-400 font-medium ml-1 tracking-tighter">
                #{tx.purchase_id}
              </span>
            )}
          </p>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            {formatTimestamp(tx.timestamp)}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p
          className={`text-sm font-semibold ${
            isCredit ? "text-emerald-600" : "text-red-600"
          }`}
        >
          {isCredit ? "+" : "-"} {currency} {tx.amount.toFixed(2)}
        </p>
      </div>
    </div>
  );
}
