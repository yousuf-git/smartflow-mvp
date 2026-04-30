import { useEffect, useState, type FormEvent } from "react";
import {
  Paper, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Alert, Skeleton, IconButton, Tooltip, Chip,
  FormControlLabel, Switch,
} from "@mui/material";
import { Plus, Pencil } from "lucide-react";
import { getPrices, createPrice, updatePrice, type PriceRow } from "../../lib/adminApi";
import { useGlobalToast } from "../../contexts/ToastContext";

export default function AdminPrices() {
  const { showToast } = useGlobalToast();
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PriceRow | null>(null);
  const [form, setForm] = useState({ unit_price: 0, is_active: true });
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    getPrices().then(setPrices).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openCreate = () => {
    setEditTarget(null);
    setForm({ unit_price: 5, is_active: true });
    setFormError("");
    setDialogOpen(true);
  };

  const openEdit = (p: PriceRow) => {
    setEditTarget(p);
    setForm({ unit_price: p.unit_price, is_active: p.is_active });
    setFormError("");
    setDialogOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);
    try {
      if (editTarget) {
        await updatePrice(editTarget.id, form);
      } else {
        await createPrice(form);
      }
      setDialogOpen(false);
      load();
      showToast(editTarget ? "Price updated" : "Price created", "success");
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
          <h1 className="text-xl font-bold text-ink-900 mb-1">Prices</h1>
          <p className="text-sm text-ink-300">Manage unit pricing</p>
        </div>
        <Button variant="contained" startIcon={<Plus className="w-4 h-4" />} onClick={openCreate} sx={{ textTransform: "none", fontWeight: 600 }}>
          Add Price
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
                  <th className="text-left px-5 py-3 font-semibold text-ink-700">Unit Price</th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700">Currency</th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700">Status</th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700 hidden md:table-cell">Created</th>
                  <th className="text-right px-5 py-3 font-semibold text-ink-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {prices.map((p) => (
                  <tr key={p.id} className="border-t border-ink-100/50 hover:bg-ink-100/20 transition-colors">
                    <td className="px-5 py-3 text-ink-700">{p.id}</td>
                    <td className="px-5 py-3 font-medium text-ink-900">Rs. {p.unit_price}/L</td>
                    <td className="px-5 py-3 text-ink-700">{p.currency}</td>
                    <td className="px-5 py-3">
                      <Chip label={p.is_active ? "Active" : "Inactive"} size="small" color={p.is_active ? "success" : "default"} variant="outlined" sx={{ fontSize: "0.7rem" }} />
                    </td>
                    <td className="px-5 py-3 text-ink-300 hidden md:table-cell">{new Date(p.timestamp).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-right">
                      <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(p)}><Pencil className="w-4 h-4 text-ink-300" /></IconButton></Tooltip>
                    </td>
                  </tr>
                ))}
                {prices.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-ink-300">No prices.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleSubmit}>
          <DialogTitle sx={{ fontWeight: 700 }}>{editTarget ? "Edit" : "Create"} Price</DialogTitle>
          <DialogContent className="!space-y-4 !pt-2">
            {formError && <Alert severity="error">{formError}</Alert>}
            <TextField label="Unit Price (Rs./L)" type="number" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: Number(e.target.value) })} required fullWidth size="small" slotProps={{ htmlInput: { step: "0.01", min: "0" } }} />
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
