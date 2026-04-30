import { useEffect, useState } from "react";
import { Paper, Button, CircularProgress, Chip } from "@mui/material";
import {
  User,
  Mail,
  Droplets,
  Wallet,
  Shield,
  LogOut,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import {
  getCustomerDashboard,
  type CustomerDashboard,
} from "../../lib/customerApi";

export default function CustomerProfile() {
  const { user, logout } = useAuth();
  const [dash, setDash] = useState<CustomerDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCustomerDashboard()
      .then(setDash)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center h-64">
        <CircularProgress />
      </div>
    );
  }

  return (
    <div className="px-4 pt-6">
      <h1 className="text-xl font-bold text-ink-900 mb-6">Profile</h1>

      {/* Avatar + Name */}
      <div className="flex flex-col items-center mb-6">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-sky-400 to-cyan-500 flex items-center justify-center text-white text-2xl font-bold mb-3">
          {user.first_name[0]}
          {user.last_name[0]}
        </div>
        <h2 className="text-lg font-semibold text-ink-900">
          {user.first_name} {user.last_name}
        </h2>
        <Chip
          label="Customer"
          size="small"
          sx={{ mt: 0.5, bgcolor: "#eff6ff", color: "#2563eb", fontWeight: 500 }}
        />
      </div>

      {/* Info cards */}
      <div className="space-y-3 mb-6">
        {[
          { icon: Mail, label: "Email", value: user.email },
          {
            icon: Shield,
            label: "Account Type",
            value: dash ? "Normal" : "—",
          },
          {
            icon: Wallet,
            label: "Balance",
            value: dash
              ? `${dash.currency} ${dash.balance.toFixed(0)}`
              : "—",
          },
          {
            icon: Droplets,
            label: "Daily Limit",
            value: dash
              ? `${dash.daily_limit_litres.toFixed(0)}L / day`
              : "—",
          },
          {
            icon: Droplets,
            label: "Price Rate",
            value: dash
              ? `${dash.price_per_litre.toFixed(0)} ${dash.currency}/L`
              : "—",
          },
        ].map((item) => (
          <Paper
            key={item.label}
            elevation={0}
            sx={{ px: 3, py: 2, borderRadius: 2 }}
            className="flex items-center gap-3 border border-slate-100"
          >
            <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center">
              <item.icon className="w-4 h-4 text-slate-500" />
            </div>
            <div>
              <p className="text-xs text-slate-400">{item.label}</p>
              <p className="text-sm font-medium text-ink-900">{item.value}</p>
            </div>
          </Paper>
        ))}
      </div>

      <Button
        variant="outlined"
        color="error"
        fullWidth
        startIcon={<LogOut className="w-4 h-4" />}
        onClick={logout}
        sx={{ textTransform: "none", py: 1.2 }}
      >
        Sign Out
      </Button>
    </div>
  );
}
