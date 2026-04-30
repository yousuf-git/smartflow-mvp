import { useEffect, useState, type FormEvent } from "react";
import {
  TextField,
  Button,
  Alert,
  CircularProgress,
  IconButton,
  InputAdornment,
  Skeleton,
} from "@mui/material";
import { motion } from "framer-motion";
import { Droplets, Eye, EyeOff, Mail, Lock, User, Phone, Check } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

type CustomerTypeOption = {
  id: number;
  name: string;
  unit_price: number;
  daily_litre_limit: number;
};

function WavePattern() {
  return (
    <div className="absolute inset-0 overflow-hidden opacity-[0.07]">
      <svg className="absolute w-[200%] h-full" viewBox="0 0 1440 800" preserveAspectRatio="none">
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
      </svg>
    </div>
  );
}

export default function SignupPage() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [types, setTypes] = useState<CustomerTypeOption[]>([]);
  const [typesLoading, setTypesLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<number | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<CustomerTypeOption[]>("/api/auth/customer-types")
      .then(({ data }) => {
        setTypes(data);
        if (data.length > 0) setSelectedType(data[0].id);
      })
      .catch(() => setError("Failed to load account types"))
      .finally(() => setTypesLoading(false));
  }, []);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-paper">
        <CircularProgress />
      </div>
    );
  }

  if (user) {
    navigate(user.role === "customer" ? "/app" : `/${user.role}`, { replace: true });
    return null;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim()) {
      setError("All fields are required.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (!selectedType) {
      setError("Please select an account type.");
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post<{ token: string; user: { role: string } }>(
        "/api/auth/signup",
        {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          password,
          phone: phone.trim() || null,
          customer_type_id: selectedType,
        },
      );
      localStorage.setItem("sf_token", data.token);
      window.location.href = "/app";
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "";
      const msg =
        detail === "email_already_exists"
          ? "This email is already registered."
          : detail === "invalid_customer_type"
            ? "Invalid account type selected."
            : detail || "Signup failed. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden flex-col justify-between p-12 text-white bg-gradient-to-br from-slate-900 via-sky-950 to-cyan-900">
        <WavePattern />
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
            <span className="text-xl font-semibold tracking-tight">SmartFlow</span>
          </div>

          <h1 className="text-4xl font-bold leading-tight mb-4">
            Join the
            <br />
            <span className="text-aqua-400">Conservation Movement</span>
          </h1>
          <p className="text-slate-400 text-lg max-w-md">
            Create your account and start managing your water consumption intelligently.
          </p>
        </motion.div>

        <div className="relative z-10" />
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-paper overflow-y-auto">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="w-9 h-9 rounded-lg bg-aqua-600 flex items-center justify-center">
              <Droplets className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-semibold text-ink-900">SmartFlow</span>
          </div>

          <h2 className="text-2xl font-bold text-ink-900 mb-1">Create account</h2>
          <p className="text-ink-700 mb-6">Sign up to get started</p>

          {error && (
            <Alert severity="error" className="mb-5" onClose={() => setError("")}>
              {error}
            </Alert>
          )}

          {/* Customer type cards */}
          <div className="mb-6">
            <p className="text-sm font-medium text-ink-900 mb-3">Account type</p>
            {typesLoading ? (
              <div className="grid grid-cols-2 gap-3">
                <Skeleton variant="rounded" height={100} />
                <Skeleton variant="rounded" height={100} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {types.map((ct) => (
                  <motion.button
                    key={ct.id}
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setSelectedType(ct.id)}
                    className={`relative rounded-xl border-2 p-4 text-left transition-all ${
                      selectedType === ct.id
                        ? "border-aqua-500 bg-aqua-50/60 shadow-sm"
                        : "border-ink-100 bg-white hover:border-ink-200"
                    }`}
                  >
                    {selectedType === ct.id && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-aqua-500 flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                    <div className="text-sm font-semibold text-ink-900 capitalize mb-2">
                      {ct.name}
                    </div>
                    <div className="text-xs text-ink-700 space-y-1">
                      <div>Rs. {ct.unit_price}/L</div>
                      <div>{ct.daily_litre_limit} L/day</div>
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <TextField
                fullWidth
                label="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                size="small"
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <User className="w-4 h-4 text-ink-300" />
                      </InputAdornment>
                    ),
                  },
                }}
              />
              <TextField
                fullWidth
                label="Last name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                size="small"
              />
            </div>

            <TextField
              fullWidth
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              size="small"
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
              label="Phone (optional)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              size="small"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Phone className="w-4 h-4 text-ink-300" />
                    </InputAdornment>
                  ),
                },
              }}
            />

            <TextField
              fullWidth
              label="Password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              size="small"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Lock className="w-4 h-4 text-ink-300" />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setShowPassword(!showPassword)} edge="end">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />

            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={loading || !selectedType}
              sx={{ py: 1.5, textTransform: "none", fontWeight: 600, fontSize: "1rem" }}
            >
              {loading ? <CircularProgress size={22} color="inherit" /> : "Create account"}
            </Button>
          </form>

          <p className="text-center text-sm text-ink-700 mt-6">
            Already have an account?{" "}
            <Link to="/login" className="text-aqua-600 font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
