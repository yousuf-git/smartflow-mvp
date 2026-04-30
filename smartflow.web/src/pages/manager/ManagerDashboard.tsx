import { useEffect, useState } from "react";
import { Paper, Skeleton } from "@mui/material";
import {
  Receipt,
  Droplets,
  DollarSign,
  Activity,
  TrendingUp,
  CalendarClock,
  Gauge,
} from "lucide-react";
import { getManagerDashboard, type ManagerDashboard as DashboardData } from "../../lib/managerApi";

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

export default function ManagerDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getManagerDashboard()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton variant="text" width={200} height={36} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={100} />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-ink-900 mb-1">{data.plant_name}</h1>
        <p className="text-sm text-ink-300">Plant dashboard</p>
      </div>

      <div>
        <h2 className="text-xs font-semibold text-ink-300 uppercase tracking-wider mb-3">
          Overview
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<Receipt className="w-5 h-5 text-aqua-600" />}
            label="Total Orders"
            value={data.total_orders}
            color="#0F8CB0"
          />
          <StatCard
            icon={<Droplets className="w-5 h-5 text-aqua-600" />}
            label="Litres Dispensed"
            value={`${data.total_litres_dispensed.toFixed(1)} L`}
            color="#0F8CB0"
          />
          <StatCard
            icon={<DollarSign className="w-5 h-5" style={{ color: "#3B7A57" }} />}
            label="Total Revenue"
            value={`PKR ${data.total_revenue.toFixed(0)}`}
            color="#3B7A57"
          />
          <StatCard
            icon={<Gauge className="w-5 h-5 text-aqua-600" />}
            label="Taps"
            value={data.tap_count}
            color="#0F8CB0"
          />
        </div>
      </div>

      <div>
        <h2 className="text-xs font-semibold text-ink-300 uppercase tracking-wider mb-3">
          Today
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            icon={<CalendarClock className="w-5 h-5 text-aqua-600" />}
            label="Today's Orders"
            value={data.today_orders}
            color="#0F8CB0"
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5" style={{ color: "#3B7A57" }} />}
            label="Today's Revenue"
            value={`PKR ${data.today_revenue.toFixed(0)}`}
            color="#3B7A57"
          />
          <StatCard
            icon={<Activity className="w-5 h-5" style={{ color: "#D97757" }} />}
            label="Active Sessions"
            value={data.active_sessions}
            color="#D97757"
          />
        </div>
      </div>
    </div>
  );
}
