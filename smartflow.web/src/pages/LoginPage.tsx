import { useState, type FormEvent } from "react";
import {
  TextField,
  Button,
  Alert,
  CircularProgress,
  IconButton,
  InputAdornment,
  FormControlLabel,
  Checkbox,
} from "@mui/material";
import { motion } from "framer-motion";
import { Droplets, Eye, EyeOff, Mail, Lock } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { Link, useNavigate } from "react-router-dom";

function WavePattern() {
  return (
    <div className="absolute inset-0 overflow-hidden opacity-[0.07]">
      <svg
        className="absolute w-[200%] h-full"
        viewBox="0 0 1440 800"
        preserveAspectRatio="none"
      >
        <motion.path
          d="M0,400 C360,300 720,500 1080,350 C1260,300 1350,400 1440,380 L1440,800 L0,800 Z"
          fill="currentColor"
          className="text-white"
          animate={{
            d: [
              "M0,400 C360,300 720,500 1080,350 C1260,300 1350,400 1440,380 L1440,800 L0,800 Z",
              "M0,350 C360,450 720,300 1080,400 C1260,450 1350,350 1440,370 L1440,800 L0,800 Z",
              "M0,400 C360,300 720,500 1080,350 C1260,300 1350,400 1440,380 L1440,800 L0,800 Z",
            ],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.path
          d="M0,500 C360,400 720,600 1080,450 C1260,400 1350,500 1440,480 L1440,800 L0,800 Z"
          fill="currentColor"
          className="text-white"
          animate={{
            d: [
              "M0,500 C360,400 720,600 1080,450 C1260,400 1350,500 1440,480 L1440,800 L0,800 Z",
              "M0,450 C360,550 720,400 1080,500 C1260,550 1350,450 1440,470 L1440,800 L0,800 Z",
              "M0,500 C360,400 720,600 1080,450 C1260,400 1350,500 1440,480 L1440,800 L0,800 Z",
            ],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
      </svg>
    </div>
  );
}

function FloatingDroplets() {
  const droplets = [
    { size: 6, x: "15%", delay: 0, duration: 7 },
    { size: 4, x: "30%", delay: 1.5, duration: 9 },
    { size: 8, x: "50%", delay: 0.5, duration: 8 },
    { size: 5, x: "70%", delay: 2, duration: 10 },
    { size: 3, x: "85%", delay: 1, duration: 7.5 },
    { size: 7, x: "40%", delay: 3, duration: 9.5 },
  ];

  return (
    <div className="absolute inset-0 overflow-hidden">
      {droplets.map((d, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full bg-white/10"
          style={{ width: d.size, height: d.size, left: d.x }}
          initial={{ y: "110%", opacity: 0 }}
          animate={{
            y: ["110%", "-10%"],
            opacity: [0, 0.6, 0.6, 0],
          }}
          transition={{
            duration: d.duration,
            repeat: Infinity,
            delay: d.delay,
            ease: "linear",
          }}
        />
      ))}
    </div>
  );
}

export default function LoginPage() {
  const { login, user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-paper">
        <CircularProgress />
      </div>
    );
  }

  if (user) {
    const redirects: Record<string, string> = {
      admin: "/admin",
      manager: "/manager",
      customer: "/app",
    };
    navigate(redirects[user.role] ?? "/", { replace: true });
    return null;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password.trim()) {
      setError("Email and password are required.");
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password, rememberMe);
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "Login failed. Check your credentials.";
      const msg =
        detail === "invalid_credentials"
          ? "Invalid email or password."
          : detail === "account_disabled"
            ? "This account has been disabled."
            : String(detail);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left branding panel — hidden on mobile */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden flex-col justify-between p-12 text-white bg-gradient-to-br from-slate-900 via-sky-950 to-cyan-900">
        <WavePattern />
        <FloatingDroplets />

        {/* Radial glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[120px]" />

        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10"
        >
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Droplets className="w-6 h-6 text-aqua-400" />
            </div>
            <span className="text-xl font-semibold tracking-tight">
              SmartFlow
            </span>
          </div>

          <h1 className="text-4xl font-bold leading-tight mb-4">
            Water Conservation
            <br />
            <span className="text-aqua-400">Made Intelligent</span>
          </h1>
          <p className="text-slate-400 text-lg max-w-md">
            Real-time IoT monitoring, smart dispensing, and intelligent resource
            management for water plants.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="relative z-10 flex gap-6"
        >
          {[
            { label: "Real-time Monitoring", value: "IoT" },
            { label: "Smart Dispensing", value: "MQTT" },
            { label: "Resource Tracking", value: "Live" },
          ].map((item) => (
            <div
              key={item.label}
              className="bg-white/5 border border-white/10 rounded-xl px-5 py-4"
            >
              <div className="text-aqua-400 text-sm font-semibold mb-1">
                {item.value}
              </div>
              <div className="text-slate-300 text-xs">{item.label}</div>
            </div>
          ))}
        </motion.div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-8 sm:p-12 bg-paper">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="w-9 h-9 rounded-lg bg-aqua-600 flex items-center justify-center">
              <Droplets className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-semibold text-ink-900">
              SmartFlow
            </span>
          </div>

          <h2 className="text-2xl font-bold text-ink-900 mb-1">
            Welcome back
          </h2>
          <p className="text-ink-700 mb-8">Sign in to continue</p>

          {error && (
            <Alert severity="error" className="mb-6" onClose={() => setError("")}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <TextField
              fullWidth
              placeholder="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Mail className="w-4 h-4 text-ink-300" />
                    </InputAdornment>
                  ),
                },
              }}
            />

            <TextField
              fullWidth
              placeholder="Password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Lock className="w-4 h-4 text-ink-300" />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  size="small"
                />
              }
              label="Remember me"
              slotProps={{ typography: { className: "text-sm text-ink-700" } }}
            />

            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={loading}
              sx={{
                py: 1.5,
                textTransform: "none",
                fontWeight: 600,
                fontSize: "1rem",
              }}
            >
              {loading ? (
                <CircularProgress size={22} color="inherit" />
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-ink-700 mt-6">
            Don't have an account?{" "}
            <Link to="/signup" className="text-aqua-600 font-medium hover:underline">
              Sign up
            </Link>
          </p>

        </div>
      </div>
    </div>
  );
}
