import { useEffect, useState, type FormEvent } from "react";
import {
  Paper, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, FormControl, InputLabel, Select, MenuItem, Alert, Skeleton,
  IconButton, Tooltip, Chip,
} from "@mui/material";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  getCustomerTypes, createCustomerType, updateCustomerType, deleteCustomerType,
  getPrices, getLimits,
  type CustomerTypeRow, type PriceRow, type LimitRow,
} from "../../lib/adminApi";
import { useGlobalToast } from "../../contexts/ToastContext";

export default function AdminCustomerTypes() {
  const { showToast } = useGlobalToast();
  const [types, setTypes] = useState<CustomerTypeRow[]>([]);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [limits, setLimits] = useState<LimitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CustomerTypeRow | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CustomerTypeRow | null>(null);
  const [form, setForm] = useState({ name: "", description: "", price_id: 0, limit_id: 0 });
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const formatDate = (value: string) =>
    new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

  const load = () => {
    setLoading(true);
    Promise.all([getCustomerTypes(), getPrices(), getLimits()])
      .then(([t, p, l]) => { setTypes(t); setPrices(p); setLimits(l); })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openCreate = () => {
    setEditTarget(null);
    setForm({ name: "", description: "", price_id: prices[0]?.id ?? 0, limit_id: limits[0]?.id ?? 0 });
    setFormError("");
    setDialogOpen(true);
  };

  const openEdit = (ct: CustomerTypeRow) => {
    setEditTarget(ct);
    setForm({ name: ct.name, description: ct.description ?? "", price_id: ct.price_id, limit_id: ct.limit_id });
    setFormError("");
    setDialogOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);
    try {
      if (editTarget) {
        await updateCustomerType(editTarget.id, form);
      } else {
        await createCustomerType(form);
      }
      setDialogOpen(false);
      load();
      showToast(editTarget ? "Customer type updated" : "Customer type created", "success");
    } catch (err: unknown) {
      setFormError((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await deleteCustomerType(deleteTarget.id);
      setDeleteOpen(false);
      load();
      showToast("Customer type deleted", "success");
    } catch (err: unknown) {
      showToast((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Delete failed", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900 mb-1">Customer Types</h1>
          <p className="text-sm text-ink-300">Manage pricing tiers</p>
        </div>
        <Button variant="contained" startIcon={<Plus className="w-4 h-4" />} onClick={openCreate} sx={{ textTransform: "none", fontWeight: 600 }}>
          Add Type
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
                  <th className="text-left px-5 py-3 font-semibold text-ink-700">Name</th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700">Description</th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700">Unit Price</th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700">Daily Limit</th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700">Status</th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700 hidden xl:table-cell">Created</th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700 hidden xl:table-cell">Updated</th>
                  <th className="text-right px-5 py-3 font-semibold text-ink-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {types.map((ct) => (
                  <tr key={ct.id} className="border-t border-ink-100/50 hover:bg-ink-100/20 transition-colors">
                    <td className="px-5 py-3 font-medium text-ink-900 capitalize">{ct.name}</td>
                    <td className="px-5 py-3 text-ink-700 min-w-[220px]">{ct.description || "No description"}</td>
                    <td className="px-5 py-3 text-ink-700">Rs. {ct.unit_price}/L</td>
                    <td className="px-5 py-3 text-ink-700">{ct.daily_litre_limit} L/day</td>
                    <td className="px-5 py-3">
                      <Chip label={ct.deleted_at ? "Deleted" : "Active"} size="small" color={ct.deleted_at ? "error" : "success"} variant="outlined" sx={{ fontSize: "0.7rem" }} />
                    </td>
                    <td className="px-5 py-3 text-ink-300 hidden xl:table-cell">{formatDate(ct.created_at)}</td>
                    <td className="px-5 py-3 text-ink-300 hidden xl:table-cell">{formatDate(ct.updated_at)}</td>
                    <td className="px-5 py-3 text-right">
                      <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(ct)}><Pencil className="w-4 h-4 text-ink-300" /></IconButton></Tooltip>
                      {!ct.deleted_at && (
                        <Tooltip title="Delete"><IconButton size="small" onClick={() => { setDeleteTarget(ct); setDeleteOpen(true); }}><Trash2 className="w-4 h-4 text-red-400" /></IconButton></Tooltip>
                      )}
                    </td>
                  </tr>
                ))}
                {types.length === 0 && <tr><td colSpan={8} className="px-5 py-10 text-center text-ink-300">No customer types.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Paper>

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleSubmit}>
          <DialogTitle sx={{ fontWeight: 700 }}>{editTarget ? "Edit" : "Create"} Customer Type</DialogTitle>
          <DialogContent className="!space-y-4 !pt-2">
            {formError && <Alert severity="error">{formError}</Alert>}
            <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required fullWidth size="small" />
            <TextField label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required fullWidth multiline minRows={3} size="small" />
            <FormControl fullWidth size="small">
              <InputLabel>Price</InputLabel>
              <Select label="Price" value={form.price_id || ""} onChange={(e) => setForm({ ...form, price_id: Number(e.target.value) })}>
                {prices.map((p) => <MenuItem key={p.id} value={p.id}>Rs. {p.unit_price}/L {p.is_active ? "" : "(inactive)"}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>Limit</InputLabel>
              <Select label="Limit" value={form.limit_id || ""} onChange={(e) => setForm({ ...form, limit_id: Number(e.target.value) })}>
                {limits.map((l) => <MenuItem key={l.id} value={l.id}>{l.daily_litre_limit} L/day {l.is_active ? "" : "(inactive)"}</MenuItem>)}
              </Select>
            </FormControl>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setDialogOpen(false)} sx={{ textTransform: "none" }}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={submitting} sx={{ textTransform: "none", fontWeight: 600 }}>{submitting ? "Saving..." : "Save"}</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete Customer Type</DialogTitle>
        <DialogContent><p className="text-sm text-ink-700">Delete <strong>{deleteTarget?.name}</strong>?</p></DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteOpen(false)} sx={{ textTransform: "none" }}>Cancel</Button>
          <Button onClick={handleDelete} variant="contained" color="error" disabled={submitting} sx={{ textTransform: "none", fontWeight: 600 }}>Delete</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
