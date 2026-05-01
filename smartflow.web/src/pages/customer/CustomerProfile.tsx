import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  Alert,
  Button,
  CircularProgress,
  IconButton,
  Paper,
  TextField,
} from "@mui/material";
import {
  Camera,
  Check,
  Droplets,
  Edit3,
  LogOut,
  Mail,
  Phone,
  Shield,
  Wallet,
  X,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import {
  getCustomerDashboard,
  updateCustomerProfile,
  uploadCustomerAvatar,
  type CustomerDashboard,
} from "../../lib/customerApi";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

async function compressLosslessPng(file: File): Promise<Blob> {
  const image = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.drawImage(image, 0, 0);
  image.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("avatar_compress_failed"))), "image/png");
  });
}

export default function CustomerProfile() {
  const { user, logout, setUser } = useAuth();
  const [dash, setDash] = useState<CustomerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [firstName, setFirstName] = useState(user?.first_name ?? "");
  const [lastName, setLastName] = useState(user?.last_name ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getCustomerDashboard()
      .then(setDash)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    setFirstName(user.first_name);
    setLastName(user.last_name);
  }, [user]);

  const handlePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("Select a valid image file.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError("Profile picture must be 2 MB or smaller.");
      return;
    }
    setUploading(true);
    try {
      const compressed = await compressLosslessPng(file);
      if (compressed.size > MAX_AVATAR_BYTES) {
        setError("Compressed image is still larger than 2 MB.");
        return;
      }
      const updated = await uploadCustomerAvatar(compressed);
      setUser(updated);
    } catch {
      setError("Could not upload profile picture.");
    } finally {
      setUploading(false);
    }
  };

  const saveName = async () => {
    if (!user) return;
    setError("");
    setSaving(true);
    try {
      const updated = await updateCustomerProfile(firstName.trim(), lastName.trim());
      setUser(updated);
      setEditingName(false);
    } catch {
      setError("Could not save your name.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center h-64">
        <CircularProgress />
      </div>
    );
  }

  const initials = `${user.first_name[0] ?? ""}${user.last_name[0] ?? ""}`;

  return (
    <div className="px-4 pt-6 space-y-5">
      {error && <Alert severity="error">{error}</Alert>}

      <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3 }} className="border border-slate-100 bg-white">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="w-[88px] h-[88px] rounded-full overflow-hidden bg-white border border-slate-200 flex items-center justify-center text-ink-700 text-2xl font-bold">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <IconButton
              size="small"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              sx={{ position: "absolute", right: 0, bottom: 0, bgcolor: "white", border: "1px solid #E2E8F0", "&:hover": { bgcolor: "white" } }}
            >
              {uploading ? <CircularProgress size={16} /> : <Camera className="w-4 h-4 text-slate-600" />}
            </IconButton>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
          </div>

          <div className="min-w-0 flex-1">
            {editingName ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <TextField label="First" size="small" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  <TextField label="Last" size="small" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button size="small" variant="contained" startIcon={<Check className="w-3.5 h-3.5" />} disabled={saving || !firstName.trim() || !lastName.trim()} onClick={saveName} sx={{ textTransform: "none" }}>
                    Save
                  </Button>
                  <Button size="small" variant="text" startIcon={<X className="w-3.5 h-3.5" />} onClick={() => { setEditingName(false); setFirstName(user.first_name); setLastName(user.last_name); }} sx={{ textTransform: "none" }}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500">Customer profile</p>
                  <h1 className="text-xl font-bold text-ink-900 truncate">{user.first_name} {user.last_name}</h1>
                  <p className="text-xs text-slate-400 truncate">{user.email}</p>
                </div>
                <IconButton size="small" onClick={() => setEditingName(true)}>
                  <Edit3 className="w-4 h-4 text-slate-500" />
                </IconButton>
              </div>
            )}
          </div>
        </div>
      </Paper>

      <div className="grid grid-cols-2 gap-3">
        <Paper elevation={0} sx={{ p: 2, borderRadius: 2.5 }} className="border border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center mb-2">
            <Wallet className="w-4 h-4 text-slate-600" />
          </div>
          <p className="text-xs text-slate-500">Wallet Balance</p>
          <p className="text-lg font-bold text-ink-900">Rs. {dash?.balance.toFixed(0) ?? "0"}</p>
        </Paper>
        <Paper elevation={0} sx={{ p: 2, borderRadius: 2.5 }} className="border border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center mb-2">
            <Shield className="w-4 h-4 text-slate-600" />
          </div>
          <p className="text-xs text-slate-500">Water Plan</p>
          <p className="text-sm font-semibold text-ink-900">Rs. {dash?.price_per_litre.toFixed(0) ?? "0"}/L</p>
          <p className="text-xs text-slate-400">{dash?.daily_limit_litres.toFixed(0) ?? "0"} L daily limit</p>
        </Paper>
      </div>

      <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3 }} className="border border-slate-100">
        <h2 className="text-sm font-semibold text-ink-900 mb-3">Account Details</h2>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Mail className="w-4 h-4 text-slate-400" />
            <div>
              <p className="text-xs text-slate-400">Email</p>
              <p className="text-sm font-medium text-ink-900">{user.email}</p>
            </div>
          </div>
          {user.phone && (
            <div className="flex items-center gap-3">
              <Phone className="w-4 h-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-400">Phone</p>
                <p className="text-sm font-medium text-ink-900">{user.phone}</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Droplets className="w-4 h-4 text-slate-400" />
            <div>
              <p className="text-xs text-slate-400">Today Remaining</p>
              <p className="text-sm font-medium text-ink-900">{dash?.daily_remaining_litres.toFixed(1) ?? "0"} L</p>
            </div>
          </div>
        </div>
      </Paper>

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
