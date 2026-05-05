import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  Alert,
  CircularProgress,
  TextField,
} from "@mui/material";
import {
  Camera,
  Droplets,
  Edit3,
  LogOut,
  Mail,
  Phone,
  Shield,
  Wallet,
} from "lucide-react";
import { motion } from "framer-motion";
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
    py: 1.5,
    fontWeight: 600,
    fontSize: '0.9rem',
  },
};

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
      <div className="flex items-center justify-center h-screen bg-white">
        <CircularProgress sx={{ color: "#00A3FF" }} />
      </div>
    );
  }

  const initials = `${user.first_name[0] ?? ""}${user.last_name[0] ?? ""}`;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 15, opacity: 0 },
    visible: { y: 0, opacity: 1 },
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="relative min-h-screen pb-12 overflow-x-hidden"
    >
      {/* Ambient Background */}
      <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-slate-50 to-transparent -z-10" />
      <div className="absolute top-[-5%] right-[-10%] w-64 h-64 bg-pure-aqua/5 blur-[100px] rounded-full -z-10" />

      <div className="px-5 pt-10">
        {error && (
          <motion.div variants={itemVariants} className="mb-6">
            <Alert severity="error" sx={{ borderRadius: '16px', fontWeight: 600 }}>{error}</Alert>
          </motion.div>
        )}

        {/* Profile Header */}
        <motion.div variants={itemVariants} className="flex flex-col items-center mb-10">
          <div className="relative mb-4">
            <div className="w-28 h-28 rounded-full p-1.5 bg-white shadow-xl shadow-slate-200/50 border border-slate-100">
              <div className="w-full h-full rounded-full overflow-hidden bg-slate-50 flex items-center justify-center text-pure-aqua text-3xl font-semibold">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  initials
                )}
              </div>
            </div>
            <button
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="absolute bottom-1 right-1 w-9 h-9 bg-white rounded-full border border-slate-100 shadow-lg flex items-center justify-center text-slate-600 transition-transform active:scale-90"
            >
              {uploading ? <CircularProgress size={16} /> : <Camera className="w-4.5 h-4.5" />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
          </div>

          <div className="text-center w-full max-w-xs">
            {editingName ? (
              <div className="space-y-3 mt-2">
                <div className="grid grid-cols-2 gap-2">
                  <TextField
                    placeholder="First"
                    size="small"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    sx={fieldSx}
                  />
                  <TextField
                    placeholder="Last"
                    size="small"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    sx={fieldSx}
                  />
                </div>
                <div className="flex justify-center gap-2">
                  <button
                    disabled={saving || !firstName.trim() || !lastName.trim()}
                    onClick={saveName}
                    className="px-4 py-2 bg-pure-aqua text-white rounded-xl text-xs font-semibold shadow-md active:scale-95 transition-all"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={() => { setEditingName(false); setFirstName(user.first_name); setLastName(user.last_name); }}
                    className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-semibold active:scale-95 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-2">
                   <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
                    {user.first_name} {user.last_name}
                  </h1>
                  <button onClick={() => setEditingName(true)} className="p-1 text-slate-300 hover:text-pure-aqua">
                    <Edit3 className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-sm font-medium text-slate-400 mt-1">{user.email}</p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Stats Grid */}
        <motion.div variants={itemVariants} className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm">
            <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center mb-3">
              <Wallet className="w-5 h-5 text-pure-aqua" />
            </div>
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-widest mb-1">Balance</p>
            <p className="text-lg font-semibold text-slate-900">Rs. {dash?.balance.toFixed(2) ?? "0.00"}</p>
          </div>
          <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm">
            <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center mb-3">
              <Shield className="w-5 h-5 text-pure-aqua" />
            </div>
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-widest mb-1">Current Plan</p>
            <p className="text-sm font-semibold text-slate-900">Rs. {dash?.price_per_litre.toFixed(2) ?? "0.00"}/L</p>
          </div>
        </motion.div>

        {/* Action List */}
        <motion.div variants={itemVariants} className="space-y-3 mb-10">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-[0.2em] ml-2 mb-4">Account Information</h2>
          <div className="bg-white border border-slate-100 rounded-[32px] overflow-hidden shadow-sm">
            <div className="p-2">
               <div className="flex items-center justify-between p-4 px-5 hover:bg-slate-50 transition-colors rounded-2xl group">
                 <div className="flex items-center gap-4">
                   <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-pure-aqua group-hover:bg-pure-aqua/5 transition-colors">
                     <Mail className="w-5 h-5" />
                   </div>
                   <div>
                     <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Email</p>
                     <p className="text-sm font-semibold text-slate-900">{user.email}</p>
                   </div>
                 </div>
               </div>

               {user.phone && (
                 <div className="flex items-center justify-between p-4 px-5 hover:bg-slate-50 transition-colors rounded-2xl group">
                   <div className="flex items-center gap-4">
                     <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-pure-aqua group-hover:bg-pure-aqua/5 transition-colors">
                       <Phone className="w-5 h-5" />
                     </div>
                     <div>
                       <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Phone</p>
                       <p className="text-sm font-semibold text-slate-900">{user.phone}</p>
                     </div>
                   </div>
                 </div>
               )}

               <div className="flex items-center justify-between p-4 px-5 hover:bg-slate-50 transition-colors rounded-2xl group">
                 <div className="flex items-center gap-4">
                   <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-pure-aqua group-hover:bg-pure-aqua/5 transition-colors">
                     <Droplets className="w-5 h-5" />
                   </div>
                   <div>
                     <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Remaining Litres</p>
                     <p className="text-sm font-semibold text-slate-900">{dash?.daily_remaining_litres.toFixed(2) ?? "0.00"} L</p>
                   </div>
                 </div>
               </div>
            </div>
          </div>
        </motion.div>

        {/* Sign Out Button */}
        <motion.div variants={itemVariants}>
          <button
            onClick={logout}
            className="w-full py-4 rounded-[24px] bg-red-50 text-red-600 text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all border border-red-100"
          >
            <LogOut className="w-4.5 h-4.5" /> Sign Out
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}
