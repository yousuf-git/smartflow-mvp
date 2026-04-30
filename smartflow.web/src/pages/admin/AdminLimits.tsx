import { useEffect, useState, type FormEvent } from "react";
import {
  Paper, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Alert, Skeleton, IconButton, Tooltip, Chip,
  FormControlLabel, Switch,
} from "@mui/material";
import { Plus, Pencil } from "lucide-react";
import { getLimits, createLimit, updateLimit, type LimitRow } from "../../lib/adminApi";
import { useGlobalToast } from "../../contexts/ToastContext";

export default function AdminLimits() {
  const { showToast } = useGlobalToast();
  const [limits, setLimits] = useState<LimitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LimitRow | null>(null);
  const [form, setForm] = useState({ daily_litre_limit: 0, is_active: true });
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    getLimits().then(setLimits).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openCreate = () => {
    setEditTarget(null);
    setForm({ daily_litre_limit: 50, is_active: true });
    setFormError("");
    setDialogOpen(true);
  };

  const openEdit = (l: LimitRow) => {
    setEditTarget(l);
    setForm({ daily_litre_limit: l.daily_litre_limit, is_active: l.is_active });
    setFormError("");
    setDialogOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);
    try {
      if (editTarget) {
        await updateLimit(editTarget.id, form);
      } else {
        await createLimit(form);
      }
      setDialogOpen(false);
      load();
      showToast(editTarget ? "Limit updated" : "Limit created", "success");
    } catch (err: unknown) {
      setFormError((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900 mb-1">Limits</h1>
          <p className="text-sm text-ink-300">Manage daily litre limits</p>
        </div>
        <Button variant="contained" startIcon={<Plus className="w-4 h-4" />} onClick={openCreate} sx={{ textTransform: "none", fontWeight: 600 }}>
          Add Limit
        </Button>
      </div>

      <Paper elevation={0} sx={{ border: "1px solid #EDF0F2", borderRadius: 3, overflow: "hidden" }}>
        {loading ? (
          <div className="p-6 space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} variant="rounded" height={48} />)}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-ink-100/30">
                  <th className="text-left px-5 py-3 font-semibold text-ink-700">ID</th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700">Daily Limit</th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700">Status</th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700 hidden md:table-cell">Created</th>
                  <th className="text-right px-5 py-3 font-semibold text-ink-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {limits.map((l) => (
                  <tr key={l.id} className="border-t border-ink-100/50 hover:bg-ink-100/20 transition-colors">
                    <td className="px-5 py-3 text-ink-700">{l.id}</td>
                    <td className="px-5 py-3 font-medium text-ink-900">{l.daily_litre_limit} L/day</td>
                    <td className="px-5 py-3">
                      <Chip label={l.is_active ? "Active" : "Inactive"} size="small" color={l.is_active ? "success" : "default"} variant="outlined" sx={{ fontSize: "0.7rem" }} />
                    </td>
                    <td className="px-5 py-3 text-ink-300 hidden md:table-cell">{new Date(l.timestamp).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-right">
                      <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(l)}><Pencil className="w-4 h-4 text-ink-300" /></IconButton></Tooltip>
                    </td>
                  </tr>
                ))}
                {limits.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-ink-300">No limits.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleSubmit}>
          <DialogTitle sx={{ fontWeight: 700 }}>{editTarget ? "Edit" : "Create"} Limit</DialogTitle>
          <DialogContent className="!space-y-4 !pt-2">
            {formError && <Alert severity="error">{formError}</Alert>}
            <TextField label="Daily Litre Limit" type="number" value={form.daily_litre_limit} onChange={(e) => setForm({ ...form, daily_litre_limit: Number(e.target.value) })} required fullWidth size="small" slotProps={{ htmlInput: { step: "1", min: "1" } }} />
            <FormControlLabel control={<Switch checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />} label="Active" />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setDialogOpen(false)} sx={{ textTransform: "none" }}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={submitting} sx={{ textTransform: "none", fontWeight: 600 }}>{submitting ? "Saving..." : "Save"}</Button>
          </DialogActions>
        </form>
      </Dialog>
    </div>
  );
}
