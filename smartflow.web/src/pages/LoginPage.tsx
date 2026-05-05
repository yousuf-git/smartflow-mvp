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
import { Droplets, Eye, EyeOff, Mail, Lock, ArrowRight } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { Link, useNavigate } from "react-router-dom";

const fieldSx = {
  "& .MuiOutlinedInput-root": {
    backgroundColor: "#F8FAFC",
    borderRadius: "16px",
    "& fieldset": { borderColor: "transparent" },
    "&:hover fieldset": { borderColor: "#E2E8F0" },
    "&.Mui-focused fieldset": { borderColor: "#00A3FF" },
  },
  "& .MuiInputLabel-root": {
    fontWeight: 600,
    color: "#64748B",
    "&.Mui-focused": { color: "#00A3FF" }
  },
  "& .MuiOutlinedInput-input": {
    py: 1.8,
    fontWeight: 600,
    fontSize: '0.9rem',
  },
};

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
      <div className="flex items-center justify-center h-screen bg-white">
        <CircularProgress sx={{ color: "#00A3FF" }} />
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
    <div className="flex min-h-screen bg-white">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden flex-col justify-between p-12 text-white bg-gradient-to-br from-slate-900 via-sky-950 to-cyan-900">
        <WavePattern />
        <FloatingDroplets />

        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[120px]" />

        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10"
        >
          <div className="flex items-center gap-3 mb-16">
            <div className="w-11 h-11 rounded-2xl bg-pure-aqua flex items-center justify-center shadow-lg shadow-pure-aqua/20">
              <Droplets className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-semibold tracking-tight">SmartFlow</span>
          </div>

          <h1 className="text-5xl font-semibold leading-tight mb-6">
            Water Conservation <br />
            <span className="text-pure-aqua">Made Intelligent.</span>
          </h1>
          <p className="text-slate-400 text-lg max-w-md leading-relaxed">
            Real-time IoT monitoring, smart dispensing, and intelligent resource management for water plants.
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
              className="bg-white/5 border border-white/10 rounded-2xl px-6 py-5 backdrop-blur-sm"
            >
              <div className="text-pure-aqua text-sm font-bold mb-1 tracking-wider uppercase">
                {item.value}
              </div>
              <div className="text-slate-300 text-[11px] font-semibold uppercase tracking-widest">{item.label}</div>
            </div>
          ))}
        </motion.div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 relative overflow-hidden">
        {/* Background Decorations (Mobile only) */}
        <div className="lg:hidden absolute top-[-10%] right-[-5%] w-[400px] h-[400px] bg-pure-aqua/5 blur-[100px] rounded-full -z-10" />
        <div className="lg:hidden absolute bottom-[-5%] left-[-5%] w-[300px] h-[300px] bg-cyan-500/5 blur-[80px] rounded-full -z-10" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          {/* Mobile Branding */}
          <div className="flex flex-col items-center mb-10 lg:hidden">
            <motion.div
              whileHover={{ scale: 1.05, rotate: 5 }}
              className="w-16 h-16 bg-pure-aqua rounded-[20px] flex items-center justify-center shadow-lg shadow-pure-aqua/20 mb-6"
            >
              <Droplets className="w-10 h-10 text-white" />
            </motion.div>
            <h1 className="text-3xl font-semibold text-ink-900 tracking-tighter uppercase mb-2">SmartFlow</h1>
            <p className="text-[11px] font-semibold text-slate-400 tracking-widest uppercase">Intelligent Water Ecosystem</p>
          </div>

          {/* Card */}
          <div className="bg-white rounded-[32px] border border-slate-100 p-8 md:p-10 shadow-xl shadow-slate-200/40 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-pure-aqua" />

            <div className="mb-8">
              <h2 className="text-2xl font-semibold text-ink-900 mb-2">Welcome back</h2>
              <p className="text-sm font-medium text-slate-500">Please enter your details to sign in.</p>
            </div>

            {error && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-6">
                <Alert severity="error" sx={{ borderRadius: '12px', fontWeight: 600 }}>
                  {error}
                </Alert>
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-ink-700 uppercase tracking-widest ml-1">Email Address</p>
                <TextField
                  fullWidth
                  placeholder="name@example.com"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  sx={fieldSx}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <Mail className="w-4 h-4 text-slate-400" />
                        </InputAdornment>
                      ),
                    },
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-ink-700 uppercase tracking-widest ml-1">Password</p>
                <TextField
                  fullWidth
                  placeholder="••••••••"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  sx={fieldSx}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <Lock className="w-4 h-4 text-slate-400" />
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
                              <EyeOff className="w-4 h-4 text-slate-400" />
                            ) : (
                              <Eye className="w-4 h-4 text-slate-400" />
                            )}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      size="small"
                      sx={{ color: '#00A3FF', '&.Mui-checked': { color: '#00A3FF' } }}
                    />
                  }
                  label="Keep me signed in"
                  slotProps={{ typography: { sx: { fontSize: '0.875rem', fontWeight: 500, color: '#64748B' } } }}
                />
              </div>

              <Button
                type="submit"
                variant="contained"
                fullWidth
                disabled={loading}
                sx={{
                  py: 2,
                  borderRadius: '16px',
                  textTransform: "none",
                  fontWeight: 600,
                  fontSize: "1rem",
                  bgcolor: '#00A3FF',
                  boxShadow: '0 10px 15px -3px rgba(0, 163, 255, 0.3)',
                  '&:hover': { bgcolor: '#008BD9' }
                }}
              >
                {loading ? (
                  <CircularProgress size={24} color="inherit" />
                ) : (
                  <span className="flex items-center gap-2">Sign In <ArrowRight className="w-5 h-5" /></span>
                )}
              </Button>
            </form>

            <div className="mt-8 pt-8 border-t border-slate-50 text-center">
              <p className="text-slate-500 font-medium text-sm">
                New to SmartFlow?{" "}
                <Link to="/signup" className="text-pure-aqua font-semibold hover:underline underline-offset-4 decoration-2">
                  Create an account
                </Link>
              </p>
            </div>
          </div>

          {/* Footer Info */}
          <div className="mt-10 text-center">
            <p className="text-[10px] font-semibold text-slate-300 uppercase tracking-[0.2em]">
              &copy; 2026 SmartFlow Technologies. All rights reserved.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

