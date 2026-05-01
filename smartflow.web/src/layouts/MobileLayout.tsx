import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { History, Home, MapPin, QrCode, User } from "lucide-react";

const navItems = [
  { path: "/app", icon: Home, label: "Home" },
  { path: "/app/plants", icon: MapPin, label: "Plants" },
  { path: "/app/scan", icon: QrCode, label: "Scan" },
  { path: "/app/transactions", icon: History, label: "History" },
  { path: "/app/profile", icon: User, label: "Profile" },
];

function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <motion.nav
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-t border-slate-200"
    >
      <div className="flex items-center justify-around px-2 py-2">
        {navItems.map((item) => {
          const isActive =
            item.path === "/app"
              ? location.pathname === "/app"
              : location.pathname.startsWith(item.path);
          const Icon = item.icon;
          const isCenter = item.path === "/app/scan";

          if (isCenter) {
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="relative -mt-6 flex flex-col items-center"
              >
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center justify-center w-16 h-16 rounded-full shadow-lg bg-gradient-to-br from-sky-500 to-cyan-500 text-white"
                >
                  <Icon className="h-7 w-7" />
                </motion.div>
                <span className="text-[10px] font-medium text-slate-500 mt-1">
                  {item.label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="relative flex flex-col items-center py-2 px-4"
            >
              <motion.div whileTap={{ scale: 0.9 }} className="relative">
                <Icon
                  className={`h-6 w-6 transition-colors duration-200 ${
                    isActive ? "text-sky-500" : "text-slate-400"
                  }`}
                />
                {isActive && (
                  <motion.div
                    layoutId="navIndicator"
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-sky-500"
                    transition={{
                      type: "spring",
                      stiffness: 500,
                      damping: 30,
                    }}
                  />
                )}
              </motion.div>
              <span
                className={`text-[10px] mt-1 transition-colors duration-200 ${
                  isActive
                    ? "text-sky-500 font-medium"
                    : "text-slate-400"
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </motion.nav>
  );
}

export default function MobileLayout({ hideNav = false }: { hideNav?: boolean }) {
  return (
    <div className={`min-h-screen bg-paper ${!hideNav ? "pb-24" : ""}`}>
      <Outlet />
      {!hideNav && <MobileBottomNav />}
    </div>
  );
}
