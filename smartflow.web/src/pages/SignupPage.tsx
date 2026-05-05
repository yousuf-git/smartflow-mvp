import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  TextField,
  Alert,
  CircularProgress,
  IconButton,
  InputAdornment,
  Skeleton,
} from "@mui/material";
import { motion } from "framer-motion";
import {
  Check,
  Droplets,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Phone,
  User,
  ChevronRight,
  ShieldCheck,
  Zap
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

type CustomerTypeOption = {
  id: number;
  name: string;
  description: string;
  unit_price: number;
  daily_litre_limit: number;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-PK", {
    maximumFractionDigits: 2,
  }).format(value);
}

const fieldSx = {
  "& .MuiOutlinedInput-root": {
    backgroundColor: "#F8FAFC",
    borderRadius: "16px",
    "& fieldset": { borderColor: "transparent" },
    "&:hover fieldset": { borderColor: "#E2E8F0" },
    "&.Mui-focused fieldset": { borderColor: "#00A3FF" },
  },
  "& .MuiInputLabel-root": {
    fontWeight: 500,
    color: "#64748B",
    "&.Mui-focused": { color: "#00A3FF" }
  },
  "& .MuiOutlinedInput-input": {
    py: 1.8,
    fontWeight: 500,
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
  const [confirmPassword, setConfirmPassword] = useState("");
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

  const selectedPlan = useMemo(
    () => types.find((type) => type.id === selectedType) ?? null,
    [selectedType, types],
  );

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <CircularProgress size={32} thickness={5} sx={{ color: "#00A3FF" }} />
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
      setError("First name, last name, email, and password are required.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!selectedType) {
      setError("Please select a water plan.");
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
      sessionStorage.setItem("sf_token", data.token);
      localStorage.removeItem("sf_remember_token");
      window.location.href = "/app";
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "";
      const msg =
        detail === "email_already_exists"
          ? "This email is already registered."
          : detail === "invalid_customer_type"
            ? "Invalid water plan selected."
            : detail || "Signup failed. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 }
  };

  return (
    <div className="flex min-h-screen bg-white">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden flex-col justify-between p-12 text-white bg-gradient-to-br from-slate-900 via-sky-950 to-cyan-900">
        <WavePattern />
        <FloatingDroplets />

        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[120px]" />

        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="relative z-10"
        >
          <div className="flex items-center gap-3 mb-24">
            <div className="w-11 h-11 rounded-2xl bg-pure-aqua flex items-center justify-center shadow-lg shadow-pure-aqua/20">
              <Droplets className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-semibold tracking-tight">SmartFlow</span>
          </div>

          <h1 className="text-5xl font-semibold leading-tight mb-6">
            Smart water <br />
            <span className="text-pure-aqua">management.</span>
          </h1>
          <p className="text-slate-400 text-lg max-w-sm leading-relaxed">
            Create your account to start managing your daily water usage with precision and transparency.
          </p>
        </motion.div>

        <div className="relative z-10 flex items-center gap-4 p-6 bg-white/5 border border-white/10 rounded-[32px] backdrop-blur-sm">
           <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6 text-pure-aqua" />
           </div>
           <div>
              <p className="text-sm font-semibold">Secure Onboarding</p>
              <p className="text-xs text-slate-400">Encrypted data protection</p>
           </div>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 min-h-screen overflow-y-auto lg:flex lg:flex-col lg:justify-center px-5 py-6 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-xl">
          {/* Mobile Header */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="w-10 h-10 rounded-xl bg-pure-aqua flex items-center justify-center shadow-md shadow-pure-aqua/20">
              <Droplets className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-semibold text-slate-900">SmartFlow</span>
          </div>

          <motion.div
            initial="hidden"
            animate="visible"
            variants={containerVariants}
            className="space-y-5 lg:space-y-6"
          >
            <motion.div variants={itemVariants}>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-900 mb-1">Create Account</h2>
              <p className="text-sm font-medium text-slate-500">Join the community of smart water users today.</p>
            </motion.div>

            {error && (
              <motion.div variants={itemVariants}>
                <Alert severity="error" sx={{ borderRadius: '16px', fontWeight: 600 }}>{error}</Alert>
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5 lg:space-y-6">
              {/* Step 1: Select Plan */}
              <motion.section variants={itemVariants} className="space-y-3">
                <div className="flex items-center justify-between">
                   <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.2em] ml-1">1. Choose a Water Plan</p>
                   {selectedPlan && (
                      <div className="flex items-center gap-1.5 px-3 py-1 bg-pure-aqua/5 rounded-full">
                         <Zap className="w-3 h-3 text-pure-aqua" />
                         <span className="text-[10px] font-semibold text-pure-aqua uppercase tracking-wider">
                           Rs. {formatNumber(selectedPlan.unit_price)}/L
                         </span>
                      </div>
                   )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {typesLoading ? (
                    [1, 2].map(i => <Skeleton key={i} variant="rounded" height={120} sx={{ borderRadius: '24px' }} />)
                  ) : (
                    types.map((ct) => (
                      <button
                        key={ct.id}
                        type="button"
                        onClick={() => setSelectedType(ct.id)}
                        className={`relative p-3.5 rounded-[24px] text-left transition-all border ${
                          selectedType === ct.id
                            ? "bg-white border-pure-aqua shadow-lg shadow-pure-aqua/5"
                            : "bg-slate-50 border-slate-100 hover:bg-slate-100/50"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                           <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${selectedType === ct.id ? 'bg-pure-aqua text-white' : 'bg-white text-slate-400'}`}>
                              <Droplets className="w-4 h-4" />
                           </div>
                           {selectedType === ct.id && (
                              <div className="w-4.5 h-4.5 rounded-full bg-pure-aqua flex items-center justify-center">
                                 <Check className="w-2.5 h-2.5 text-white" />
                              </div>
                           )}
                        </div>
                        <p className="text-[13px] font-semibold text-slate-900 capitalize mb-0.5">{ct.name}</p>
                        <p className="text-[10px] font-medium text-slate-400 leading-relaxed line-clamp-1">
                           {ct.description || "SmartFlow water consumption plan."}
                        </p>
                        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
                           <span className="text-[9px] font-semibold text-slate-400 uppercase">Limit</span>
                           <span className="text-[11px] font-bold text-slate-900">{formatNumber(ct.daily_litre_limit)}L</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </motion.section>

              {/* Step 2: Profile Info */}
              <motion.section variants={itemVariants} className="space-y-3.5">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.2em] ml-1">2. Profile Information</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <TextField
                    fullWidth
                    label="First Name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    sx={fieldSx}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <User className="w-4 h-4 text-slate-400" />
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                  <TextField
                    fullWidth
                    label="Last Name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    sx={fieldSx}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <User className="w-4 h-4 text-slate-400" />
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                  <TextField
                    fullWidth
                    className="sm:col-span-2"
                    label="Email Address"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
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
                  <TextField
                    fullWidth
                    className="sm:col-span-2"
                    label="Phone Number (Optional)"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    sx={fieldSx}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <Phone className="w-4 h-4 text-slate-400" />
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                </div>
              </motion.section>

              {/* Step 3: Security */}
              <motion.section variants={itemVariants} className="space-y-3.5">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.2em] ml-1">3. Account Security</p>
                <div className="grid grid-cols-1 gap-3">
                  <TextField
                    fullWidth
                    label="Create Password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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
                            <IconButton size="small" onClick={() => setShowPassword(!showPassword)} edge="end">
                              {showPassword ? <EyeOff className="w-4 h-4 text-slate-400" /> : <Eye className="w-4 h-4 text-slate-400" />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                  <TextField
                    fullWidth
                    label="Confirm Password"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    sx={fieldSx}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <Lock className="w-4 h-4 text-slate-400" />
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                </div>
              </motion.section>

              <motion.div variants={itemVariants} className="pt-1.5 space-y-3.5">
                <button
                  type="submit"
                  disabled={loading || !selectedType || password !== confirmPassword}
                  className="w-full py-4 bg-pure-aqua text-white rounded-[24px] font-semibold text-sm uppercase tracking-widest shadow-xl shadow-pure-aqua/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <CircularProgress size={20} color="inherit" />
                  ) : (
                    <span className="flex items-center gap-2">Create Account <ChevronRight className="w-4.5 h-4.5" /></span>
                  )}
                </button>

                <p className="text-center text-xs font-medium text-slate-500">
                  Already have an account?{" "}
                  <Link to="/login" className="text-pure-aqua font-semibold hover:underline decoration-2 underline-offset-4">
                    Sign In
                  </Link>
                </p>
              </motion.div>
            </form>
          </motion.div>
        </div>
      </div>    </div>
  );
}
