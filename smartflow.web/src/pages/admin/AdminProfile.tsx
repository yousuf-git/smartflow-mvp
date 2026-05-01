import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  Alert,
  Avatar,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Paper,
  TextField,
} from "@mui/material";
import { Camera, Check, Edit3, Lock, Mail, Phone, UserRound, X } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { updateOwnProfile, uploadOwnAvatar } from "../../lib/profileApi";
import { useGlobalToast } from "../../contexts/ToastContext";

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

export default function AdminProfile() {
  const { user, setUser } = useAuth();
  const { showToast } = useGlobalToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    setForm({
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      phone: user.phone ?? "",
      password: "",
    });
  }, [user]);

  if (!user) {
    return (
      <div className="flex h-64 items-center justify-center">
        <CircularProgress />
      </div>
    );
  }

  const initials = `${user.first_name[0] ?? ""}${user.last_name[0] ?? ""}`.toUpperCase();

  const handleAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
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
      const updated = await uploadOwnAvatar(compressed, user.role);
      setUser(updated);
      showToast("Profile picture updated", "success");
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ? `Could not upload profile picture. ${detail}` : "Could not upload profile picture.");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const payload: Record<string, string | null> = {};
      if (form.first_name.trim() !== user.first_name) payload.first_name = form.first_name.trim();
      if (form.last_name.trim() !== user.last_name) payload.last_name = form.last_name.trim();
      if (form.email.trim() !== user.email) payload.email = form.email.trim();
      if (form.phone.trim() !== (user.phone ?? "")) payload.phone = form.phone.trim() || null;
      if (form.password) payload.password = form.password;

      const updated = await updateOwnProfile(payload, user.role);
      setUser(updated);
      setForm((current) => ({ ...current, password: "" }));
      setEditing(false);
      showToast("Profile updated", "success");
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail === "email_already_exists" ? "A user with this email already exists." : "Could not update profile.");
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setError("");
    setForm({
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      phone: user.phone ?? "",
      password: "",
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-900 mb-1">Profile Settings</h1>
        <p className="text-sm text-ink-300">Manage your account details and profile picture</p>
      </div>

      {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}

      <Paper elevation={0} sx={{ border: "1px solid #EDF0F2", borderRadius: 3, overflow: "hidden" }}>
        <div className="flex flex-col gap-5 border-b border-ink-100 bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="relative w-fit">
            <Avatar
              src={user.avatar_url ?? undefined}
              sx={{ width: 88, height: 88, bgcolor: "#0F8CB0", fontSize: "1.4rem", fontWeight: 700 }}
            >
              {initials}
            </Avatar>
            {editing && (
              <IconButton
                size="small"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                sx={{ position: "absolute", right: -2, bottom: -2, bgcolor: "white", border: "1px solid #EDF0F2", "&:hover": { bgcolor: "white" } }}
              >
                {uploading ? <CircularProgress size={16} /> : <Camera className="h-4 w-4 text-ink-700" />}
              </IconButton>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatar} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-bold text-ink-900">{user.first_name} {user.last_name}</h2>
              <span className="rounded-full bg-aqua-50 px-2.5 py-1 text-xs font-semibold capitalize text-aqua-700">{user.role}</span>
            </div>
            <p className="mt-1 truncate text-sm text-ink-700">{user.email}</p>
          </div>
          </div>

          {!editing && (
            <Button
              variant="contained"
              startIcon={<Edit3 className="h-4 w-4" />}
              onClick={() => setEditing(true)}
              sx={{ alignSelf: "flex-start", textTransform: "none", fontWeight: 700 }}
            >
              Edit Profile
            </Button>
          )}
        </div>

        {!editing ? (
          <div className="grid gap-4 p-6 sm:grid-cols-2">
            <div className="rounded-lg border border-ink-100 bg-paper px-4 py-3 sm:col-span-2">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium text-ink-700">
                <Phone className="h-3.5 w-3.5 text-aqua-600" />
                Phone
              </div>
              <div className="font-semibold text-ink-900">{user.phone || "Not added"}</div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="First name"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                required
                fullWidth
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><UserRound className="h-4 w-4 text-ink-300" /></InputAdornment> } }}
              />
              <TextField
                label="Last name"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                required
                fullWidth
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><UserRound className="h-4 w-4 text-ink-300" /></InputAdornment> } }}
              />
              <TextField
                className="sm:col-span-2"
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                fullWidth
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><Mail className="h-4 w-4 text-ink-300" /></InputAdornment> } }}
              />
              <TextField
                className="sm:col-span-2"
                label="Phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                fullWidth
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><Phone className="h-4 w-4 text-ink-300" /></InputAdornment> } }}
              />
              <TextField
                className="sm:col-span-2"
                label="New password"
                helperText="Leave blank to keep your current password."
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                fullWidth
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><Lock className="h-4 w-4 text-ink-300" /></InputAdornment> } }}
              />
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-ink-100 pt-5">
              <Button
                type="button"
                variant="outlined"
                onClick={cancelEdit}
                startIcon={<X className="h-4 w-4" />}
                sx={{ textTransform: "none", fontWeight: 600 }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={saving || !form.first_name.trim() || !form.last_name.trim() || !form.email.trim()}
                startIcon={saving ? undefined : <Check className="h-4 w-4" />}
                sx={{ textTransform: "none", fontWeight: 700 }}
              >
                {saving ? <CircularProgress size={20} color="inherit" /> : "Save Profile"}
              </Button>
            </div>
          </form>
        )}
      </Paper>
    </div>
  );
}
