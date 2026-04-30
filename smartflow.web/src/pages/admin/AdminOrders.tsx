import { useEffect, useState } from "react";
import { Paper, Chip, Skeleton } from "@mui/material";
import { getAdminOrders, type AdminOrder } from "../../lib/adminApi";

const STATUS_COLORS: Record<string, "primary" | "success" | "default" | "error"> = {
  active: "primary",
  completed: "success",
  cancelled: "default",
};

export default function AdminOrders() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    setLoading(true);
    getAdminOrders(statusFilter || undefined)
      .then(setOrders)
      .finally(() => setLoading(false));
  }, [statusFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-900 mb-1">Orders</h1>
        <p className="text-sm text-ink-300">All dispense sessions</p>
      </div>

      <div className="flex gap-1.5">
        {["", "active", "completed", "cancelled"].map((s) => (
          <Chip
            key={s}
            label={s || "All"}
            size="small"
            variant={statusFilter === s ? "filled" : "outlined"}
            color={statusFilter === s ? "primary" : "default"}
            onClick={() => setStatusFilter(s)}
            sx={{ textTransform: "capitalize", fontWeight: 500 }}
          />
        ))}
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
                  <th className="text-left px-5 py-3 font-semibold text-ink-700">Order ID</th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700">Customer</th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700 hidden sm:table-cell">Plant</th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700">Status</th>
                  <th className="text-right px-5 py-3 font-semibold text-ink-700">Litres</th>
                  <th className="text-right px-5 py-3 font-semibold text-ink-700 hidden md:table-cell">Cost</th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700 hidden lg:table-cell">Date</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr
                    key={o.id}
                    className="border-t border-ink-100/50 hover:bg-ink-100/20 transition-colors"
                  >
                    <td className="px-5 py-3 font-mono text-xs text-ink-700">
                      {o.id.slice(0, 8)}...
                    </td>
                    <td className="px-5 py-3 text-ink-900">{o.user_email}</td>
                    <td className="px-5 py-3 text-ink-700 hidden sm:table-cell">{o.plant_name}</td>
                    <td className="px-5 py-3">
                      <Chip
                        label={o.status}
                        size="small"
                        color={STATUS_COLORS[o.status] ?? "default"}
                        sx={{ textTransform: "capitalize", fontSize: "0.7rem" }}
                      />
                    </td>
                    <td className="px-5 py-3 text-right text-ink-900">
                      {o.total_litres.toFixed(1)} L
                    </td>
                    <td className="px-5 py-3 text-right text-ink-700 hidden md:table-cell">
                      PKR {o.total_price.toFixed(2)}
                    </td>
                    <td className="px-5 py-3 text-ink-300 hidden lg:table-cell">
                      {new Date(o.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-ink-300">
                      No orders found.
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
