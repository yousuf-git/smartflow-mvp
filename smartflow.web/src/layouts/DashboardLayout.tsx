import { useState } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import {
  Drawer,
  IconButton,
  Avatar,
  Button,
  useMediaQuery,
} from "@mui/material";
import {
  LayoutDashboard,
  Users,
  UsersRound,
  Droplets,
  Receipt,
  DollarSign,
  Menu,
  LogOut,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

type NavItem = {
  path: string;
  label: string;
  icon: LucideIcon;
};

const ADMIN_NAV: NavItem[] = [
  { path: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { path: "/admin/users", label: "Users", icon: Users },
  { path: "/admin/customers", label: "Customers", icon: UsersRound },
  { path: "/admin/plants", label: "Plants", icon: Droplets },
  { path: "/admin/orders", label: "Orders", icon: Receipt },
  { path: "/admin/transactions", label: "Transactions", icon: DollarSign },
];

const MANAGER_NAV: NavItem[] = [
  { path: "/manager", label: "Dashboard", icon: LayoutDashboard },
  { path: "/manager/plant", label: "My Plant", icon: Droplets },
  { path: "/manager/orders", label: "Orders", icon: Receipt },
  { path: "/manager/customers", label: "Customers", icon: UsersRound },
];

type Props = { role: "admin" | "manager" };

export default function DashboardLayout({ role }: Props) {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const location = useLocation();

  const navItems = role === "admin" ? ADMIN_NAV : MANAGER_NAV;
  const initials = user
    ? `${user.first_name[0]}${user.last_name[0]}`.toUpperCase()
    : "??";

  const isActive = (path: string) => {
    if (path === `/${role}`) return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  const sidebar = (
    <div className="flex flex-col h-full w-64 bg-white border-r border-ink-100">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-ink-100">
        <div className="w-9 h-9 rounded-lg bg-aqua-600 flex items-center justify-center">
          <Droplets className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="text-sm font-semibold text-ink-900">SmartFlow</div>
          <div className="text-xs text-ink-300 capitalize">{role} Panel</div>
        </div>
        {!isDesktop && (
          <IconButton
            size="small"
            onClick={() => setMobileOpen(false)}
            className="!ml-auto"
          >
            <X className="w-4 h-4" />
          </IconButton>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === `/${role}`}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-aqua-50 text-aqua-700"
                  : "text-ink-700 hover:bg-ink-100/50 hover:text-ink-900"
              }`}
            >
              <Icon
                className={`w-[18px] h-[18px] ${active ? "text-aqua-600" : "text-ink-300"}`}
              />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      {/* User section */}
      <div className="px-4 py-4 border-t border-ink-100">
        <div className="flex items-center gap-3 mb-3">
          <Avatar
            sx={{
              width: 36,
              height: 36,
              bgcolor: "#0F8CB0",
              fontSize: "0.8rem",
              fontWeight: 600,
            }}
          >
            {initials}
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-ink-900 truncate">
              {user?.first_name} {user?.last_name}
            </div>
            <div className="text-xs text-ink-300 truncate">{user?.email}</div>
          </div>
        </div>
        <Button
          onClick={logout}
          variant="outlined"
          size="small"
          fullWidth
          startIcon={<LogOut className="w-3.5 h-3.5" />}
          sx={{
            textTransform: "none",
            color: "#3A464C",
            borderColor: "#EDF0F2",
            fontSize: "0.8rem",
            "&:hover": { borderColor: "#B9C2C7", bgcolor: "#F6F8F9" },
          }}
        >
          Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-paper">
      {/* Desktop sidebar */}
      {isDesktop && <div className="flex-shrink-0">{sidebar}</div>}

      {/* Mobile drawer */}
      {!isDesktop && (
        <Drawer
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          PaperProps={{ sx: { width: 264, border: "none" } }}
        >
          {sidebar}
        </Drawer>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        {!isDesktop && (
          <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-ink-100">
            <IconButton
              size="small"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </IconButton>
            <div className="flex items-center gap-2">
              <Droplets className="w-5 h-5 text-aqua-600" />
              <span className="text-sm font-semibold text-ink-900">
                SmartFlow
              </span>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-5 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
