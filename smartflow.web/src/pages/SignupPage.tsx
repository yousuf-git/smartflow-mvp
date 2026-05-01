import { useEffect, useMemo, useState, type FormEvent } from "react";
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
import {
  ArrowRight,
  Check,
  Droplets,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Phone,
  User,
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

function WavePattern() {
  return (
    <div className="absolute inset-0 overflow-hidden opacity-[0.07]">
      <svg className="absolute h-full w-[200%]" viewBox="0 0 1440 800" preserveAspectRatio="none">
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

const fieldSx = {
  "& .MuiOutlinedInput-root": {
    backgroundColor: "#FFFFFF",
    borderRadius: "8px",
  },
  "& .MuiOutlinedInput-input": {
    py: 1.45,
  },
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-PK", {
    maximumFractionDigits: 2,
  }).format(value);
}

function passwordState(password: string) {
  if (!password) return { label: "Use at least 6 characters.", color: "bg-ink-100", width: "w-1/4" };
  if (password.length < 6) return { label: "Too short.", color: "bg-coral", width: "w-1/3" };
  if (password.length < 10) return { label: "Good password.", color: "bg-aqua-500", width: "w-2/3" };
  return { label: "Strong password.", color: "bg-moss", width: "w-full" };
}

function confirmPasswordState(password: string, confirmPassword: string) {
  if (!confirmPassword) return { label: "Re-enter your password to confirm.", matched: false, touched: false };
  const matched = password === confirmPassword;
  return {
    label: matched ? "Passwords match." : "Passwords do not match.",
    matched,
    touched: true,
  };
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

  const selectedPlan = useMemo(
    () => types.find((type) => type.id === selectedType) ?? null,
    [selectedType, types],
  );
  const strength = passwordState(password);
  const confirmState = confirmPasswordState(password, confirmPassword);

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
      <div className="flex h-screen items-center justify-center bg-paper">
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

  return (
    <div className="flex min-h-screen">
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

      <div className="flex-1 overflow-y-auto bg-paper px-5 py-8 sm:px-8 lg:px-12">
        <div className="mx-auto w-full max-w-2xl">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="w-9 h-9 rounded-lg bg-aqua-600 flex items-center justify-center">
              <Droplets className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-semibold text-ink-900">SmartFlow</span>
          </div>

          <div className="mb-7">
            <h2 className="text-3xl font-bold tracking-tight text-ink-900">Create your account</h2>
            <p className="mt-2 text-sm leading-6 text-ink-700">
              Start by selecting a water plan. The plan shows the rate charged
              per litre and the maximum litres available per day.
            </p>
          </div>

          {error && (
            <Alert severity="error" className="mb-5" onClose={() => setError("")}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <section className="rounded-lg border border-ink-100 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-ink-900">Water plan</h3>
                  <p className="mt-1 text-sm text-ink-700">
                    Select the plan that matches your expected daily water use.
                  </p>
                </div>
                {selectedPlan && (
                  <div className="hidden rounded-lg bg-paper px-3 py-2 text-right sm:block">
                    <div className="text-xs text-ink-700">Selected rate</div>
                    <div className="text-sm font-bold text-ink-900">
                      Rs. {formatNumber(selectedPlan.unit_price)} / litre
                    </div>
                  </div>
                )}
              </div>

              {typesLoading ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Skeleton variant="rounded" height={132} />
                  <Skeleton variant="rounded" height={132} />
                </div>
              ) : types.length === 0 ? (
                <div className="rounded-lg border border-ink-100 bg-paper px-4 py-5 text-sm text-ink-700">
                  No water plans are available right now. Please contact support.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {types.map((ct) => {
                    const isSelected = selectedType === ct.id;
                    return (
                      <motion.button
                        key={ct.id}
                        type="button"
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setSelectedType(ct.id)}
                        className={`relative rounded-lg border p-4 text-left transition ${
                          isSelected
                            ? "border-aqua-500 bg-aqua-50 shadow-sm"
                            : "border-ink-100 bg-white hover:border-aqua-200 hover:bg-paper"
                        }`}
                      >
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${isSelected ? "bg-aqua-600" : "bg-paper"}`}>
                              <Droplets className={`h-5 w-5 ${isSelected ? "text-white" : "text-aqua-600"}`} />
                            </div>
                            <div>
                              <div className="text-sm font-bold capitalize text-ink-900">{ct.name}</div>
                            </div>
                          </div>
                          {isSelected && (
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-aqua-600">
                              <Check className="h-3.5 w-3.5 text-white" />
                            </span>
                          )}
                        </div>

                        <p className="mb-4 min-h-10 text-xs leading-5 text-ink-700">
                          {ct.description || "Rate and daily allowance assigned by the SmartFlow team."}
                        </p>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-lg bg-paper px-3 py-2">
                            <div className="text-[11px] font-medium text-ink-700">Rate</div>
                            <div className="text-sm font-bold text-ink-900">
                              Rs. {formatNumber(ct.unit_price)}/L
                            </div>
                          </div>
                          <div className="rounded-lg bg-paper px-3 py-2">
                            <div className="text-[11px] font-medium text-ink-700">Daily limit</div>
                            <div className="text-sm font-bold text-ink-900">
                              {formatNumber(ct.daily_litre_limit)} L
                            </div>
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-lg border border-ink-100 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <h3 className="text-base font-semibold text-ink-900">Profile details</h3>
                <p className="mt-1 text-sm text-ink-700">
                  These details identify your customer profile at SmartFlow plants.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  fullWidth
                  label="First name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                  sx={fieldSx}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <User className="h-4 w-4 text-ink-300" />
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
                  autoComplete="family-name"
                  sx={fieldSx}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <User className="h-4 w-4 text-ink-300" />
                        </InputAdornment>
                      ),
                    },
                  }}
                />
                <TextField
                  fullWidth
                  className="sm:col-span-2"
                  label="Email address"
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
                          <Mail className="h-4 w-4 text-ink-300" />
                        </InputAdornment>
                      ),
                    },
                  }}
                />
                <TextField
                  fullWidth
                  className="sm:col-span-2"
                  label="Phone number"
                  placeholder="Optional"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  sx={fieldSx}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <Phone className="h-4 w-4 text-ink-300" />
                        </InputAdornment>
                      ),
                    },
                  }}
                />
                <div className="sm:col-span-2">
                  <TextField
                    fullWidth
                    label="Password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    sx={fieldSx}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <Lock className="h-4 w-4 text-ink-300" />
                          </InputAdornment>
                        ),
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton size="small" onClick={() => setShowPassword(!showPassword)} edge="end">
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                  <div className="mt-2">
                    <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                      <div className={`h-full rounded-full ${strength.color} ${strength.width}`} />
                    </div>
                    <p className="mt-1 text-xs text-ink-700">{strength.label}</p>
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <TextField
                    fullWidth
                    label="Confirm password"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    sx={{
                      ...fieldSx,
                      "& .MuiOutlinedInput-root fieldset": {
                        borderColor: confirmState.touched
                          ? confirmState.matched
                            ? "#5EC5D9"
                            : "#F2B8AE"
                          : undefined,
                      },
                    }}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <Lock className="h-4 w-4 text-ink-300" />
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                  {password && (
                    <div className="mt-2">
                      <div className="flex flex-wrap gap-1">
                        {Array.from(password).map((char, index) => {
                          const hasConfirmChar = confirmPassword.length > index;
                          const matches = confirmPassword[index] === char;
                          const color = !hasConfirmChar
                            ? "bg-ink-100 text-transparent"
                            : matches
                              ? "bg-aqua-100 text-aqua-700"
                              : "bg-red-50 text-red-500";
                          return (
                            <span
                              key={`${char}-${index}`}
                              className={`flex h-5 min-w-5 items-center justify-center rounded px-1 text-[10px] font-bold ${color}`}
                            >
                              {showPassword ? char : "•"}
                            </span>
                          );
                        })}
                      </div>
                      <p className={`mt-1 text-xs ${confirmState.touched && !confirmState.matched ? "text-red-500" : "text-ink-700"}`}>
                        {confirmState.label}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-ink-700">
                Already registered?{" "}
                <Link to="/login" className="font-semibold text-aqua-700 hover:underline">
                  Sign in
                </Link>
              </p>
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={loading || !selectedType || typesLoading || password !== confirmPassword}
                endIcon={!loading ? <ArrowRight className="h-4 w-4" /> : undefined}
                sx={{
                  px: 3,
                  py: 1.45,
                  borderRadius: "8px",
                  textTransform: "none",
                  fontWeight: 700,
                  fontSize: "1rem",
                }}
              >
                {loading ? <CircularProgress size={22} color="inherit" /> : "Create account"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
