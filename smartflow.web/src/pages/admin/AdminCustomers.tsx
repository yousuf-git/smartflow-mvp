import { useEffect, useState } from "react";
import { Avatar, Paper, Skeleton } from "@mui/material";
import { getAdminCustomers, type AdminCustomer } from "../../lib/adminApi";

export default function AdminCustomers() {
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminCustomers()
      .then(setCustomers)
      .finally(() => setLoading(false));
  }, []);

  const initials = (customer: AdminCustomer) =>
    `${customer.first_name[0] ?? ""}${customer.last_name[0] ?? ""}`.toUpperCase();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-900 mb-1">Customers</h1>
        <p className="text-sm text-ink-300">Customer balances and usage</p>
      </div>

      <Paper
        elevation={0}
        sx={{ border: "1px solid #EDF0F2", borderRadius: 3, overflow: "hidden" }}
      >
        {loading ? (
          <div className="p-6 space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={48} />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-ink-100/30">
                  <th className="text-left px-5 py-3 font-semibold text-ink-700">Name</th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700">Email</th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700">Type</th>
                  <th className="text-right px-5 py-3 font-semibold text-ink-700">Balance</th>
                  <th className="text-right px-5 py-3 font-semibold text-ink-700 hidden sm:table-cell">
                    Daily Used
                  </th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr
                    key={c.user_id}
                    className="border-t border-ink-100/50 hover:bg-ink-100/20 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar src={c.avatar_url ?? undefined} sx={{ width: 34, height: 34, bgcolor: "#0F8CB0", fontSize: "0.75rem", fontWeight: 700 }}>
                          {initials(c)}
                        </Avatar>
                        <span className="font-medium text-ink-900">{c.first_name} {c.last_name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-ink-700">{c.email}</td>
                    <td className="px-5 py-3 text-ink-700 capitalize">{c.customer_type}</td>
                    <td className="px-5 py-3 text-right font-medium text-ink-900">
                      PKR {c.balance.toFixed(2)}
                    </td>
                    <td className="px-5 py-3 text-right text-ink-700 hidden sm:table-cell">
                      {c.daily_consumed.toFixed(1)} L
                    </td>
                  </tr>
                ))}
                {customers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-ink-300">
                      No customers yet.
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
