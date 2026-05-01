import { useEffect, useState } from "react";
import { Paper, Skeleton, Chip } from "@mui/material";
import {
  Users,
  UsersRound,
  Receipt,
  Droplets,
  DollarSign,
  Activity,
  TrendingUp,
  CalendarClock,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  getAdminDashboard,
  getAdminCharts,
  getSystemLogs,
  type AdminDashboard as DashboardData,
  type AdminChartData,
  type SystemLogRow,
} from "../../lib/adminApi";

type StatCardProps = {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
};

function StatCard({ icon, label, value, color }: StatCardProps) {
  return (
    <Paper
      elevation={0}
      sx={{ border: "1px solid #EDF0F2", borderRadius: 3 }}
      className="p-5"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-ink-300 mb-1 uppercase tracking-wide">
            {label}
          </p>
          <p className="text-2xl font-bold text-ink-900">{value}</p>
        </div>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${color}14` }}
        >
          {icon}
        </div>
      </div>
    </Paper>
  );
}

const CHART_COLORS = ["#0F8CB0", "#3B7A57", "#D97757", "#7C3AED", "#F59E0B"];
const LEVEL_COLORS: Record<string, "default" | "info" | "warning" | "error"> = {
  info: "info",
  warning: "warning",
  error: "error",
  critical: "error",
};

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [charts, setCharts] = useState<AdminChartData | null>(null);
  const [logs, setLogs] = useState<SystemLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getAdminDashboard(),
      getAdminCharts().catch(() => null),
      getSystemLogs(undefined, 10).catch(() => []),
    ]).then(([d, c, l]) => {
      setData(d);
      setCharts(c);
      setLogs(l);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton variant="text" width={200} height={36} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={100} />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;
  const customerTypeData = charts?.customer_types.some((ct) => ct.value > 0)
    ? charts.customer_types
    : [{ name: "No customers", value: 1 }];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-ink-900 mb-1">Dashboard</h1>
        <p className="text-sm text-ink-300">System overview</p>
      </div>

      {/* Overview stats */}
      <div>
        <h2 className="text-xs font-semibold text-ink-300 uppercase tracking-wider mb-3">
          Overview
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={<Users className="w-5 h-5 text-aqua-600" />} label="Total Users" value={data.total_users} color="#0F8CB0" />
          <StatCard icon={<UsersRound className="w-5 h-5 text-aqua-600" />} label="Customers" value={data.total_customers} color="#0F8CB0" />
          <StatCard icon={<Receipt className="w-5 h-5" style={{ color: "#3B7A57" }} />} label="Total Sessions" value={data.total_orders} color="#3B7A57" />
          <StatCard icon={<DollarSign className="w-5 h-5" style={{ color: "#3B7A57" }} />} label="Total Revenue" value={`Rs. ${data.total_revenue.toFixed(0)}`} color="#3B7A57" />
        </div>
      </div>

      {/* Today */}
      <div>
        <h2 className="text-xs font-semibold text-ink-300 uppercase tracking-wider mb-3">
          Today
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={<CalendarClock className="w-5 h-5 text-aqua-600" />} label="Today's Sessions" value={data.today_orders} color="#0F8CB0" />
          <StatCard icon={<TrendingUp className="w-5 h-5" style={{ color: "#3B7A57" }} />} label="Today's Revenue" value={`Rs. ${data.today_revenue.toFixed(0)}`} color="#3B7A57" />
          <StatCard icon={<Droplets className="w-5 h-5 text-aqua-600" />} label="Litres Dispensed" value={`${data.total_litres_dispensed.toFixed(1)} L`} color="#0F8CB0" />
          <StatCard icon={<Activity className="w-5 h-5" style={{ color: "#D97757" }} />} label="Active Sessions" value={data.active_sessions} color="#D97757" />
        </div>
      </div>

      {/* Charts */}
      {charts && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Revenue chart */}
          <Paper elevation={0} sx={{ border: "1px solid #EDF0F2", borderRadius: 3 }} className="p-5">
            <h3 className="text-sm font-semibold text-ink-900 mb-4">Revenue (30 days)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={charts.revenue_chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EDF0F2" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => [`Rs. ${Number(v).toFixed(0)}`, "Revenue"]} />
                <Line type="monotone" dataKey="value" stroke="#0F8CB0" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Paper>

          {/* Orders chart */}
          <Paper elevation={0} sx={{ border: "1px solid #EDF0F2", borderRadius: 3 }} className="p-5">
            <h3 className="text-sm font-semibold text-ink-900 mb-4">Dispense Sessions (30 days)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={charts.orders_chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EDF0F2" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#3B7A57" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Paper>

          {/* Customer types donut */}
          <Paper elevation={0} sx={{ border: "1px solid #EDF0F2", borderRadius: 3 }} className="p-5">
            <h3 className="text-sm font-semibold text-ink-900 mb-4">Customer Types</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={customerTypeData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={4}
                >
                  {customerTypeData.map((_, i) => (
                    <Cell key={i} fill={charts.customer_types.some((ct) => ct.value > 0) ? CHART_COLORS[i % CHART_COLORS.length] : "#EDF0F2"} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 mt-2">
              {charts.customer_types.length > 0 ? charts.customer_types.map((ct, i) => (
                <div key={ct.name} className="flex items-center gap-1.5 text-xs text-ink-700">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                  {ct.name} ({ct.value})
                </div>
              )) : <div className="text-xs text-ink-300">No customer type data yet</div>}
            </div>
          </Paper>
        </div>
      )}

      {/* Recent system logs */}
      {logs.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-ink-300 uppercase tracking-wider mb-3">
            Recent System Logs
          </h2>
          <Paper elevation={0} sx={{ border: "1px solid #EDF0F2", borderRadius: 3 }} className="divide-y divide-ink-100">
            {logs.map((log) => (
              <div key={log.id} className="px-5 py-3 flex items-center gap-3">
                <Chip
                  label={log.level}
                  size="small"
                  color={LEVEL_COLORS[log.level] ?? "default"}
                  variant="outlined"
                  sx={{ fontSize: "0.65rem", minWidth: 60 }}
                />
                <span className="text-sm text-ink-900 flex-1 truncate">{log.message}</span>
                <span className="text-xs text-ink-300 whitespace-nowrap">
                  {new Date(log.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </Paper>
        </div>
      )}
    </div>
  );
}
