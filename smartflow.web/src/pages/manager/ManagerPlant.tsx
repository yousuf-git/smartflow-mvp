import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  Paper, Chip, Skeleton, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, FormControl, InputLabel, Select, MenuItem,
  FormControlLabel, Switch, IconButton, Tooltip,
} from "@mui/material";
import { Server, Droplets, Clock, QrCode, Printer, Plus, Pencil, Trash2, MapPin } from "lucide-react";
import QRCode from "qrcode";
import {
  getManagerPlant, updatePlantStatus, updateTapStatus, updateControllerStatus,
  createOperatingHour, updateOperatingHour, deleteOperatingHour,
  type AdminPlant, type OperatingHour,
} from "../../lib/managerApi";
import type { AdminPlantTap, AdminPlantController } from "../../lib/adminApi";
import { useGlobalToast } from "../../contexts/ToastContext";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function TapQRDialog({ plant, tap, onClose }: { plant: AdminPlant; tap: AdminPlantTap; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, JSON.stringify({ plant_id: plant.id, tap_id: tap.id }), { width: 200, margin: 2 });
  }, [plant.id, tap.id]);

  const handlePrint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><head><title>QR — ${tap.label}</title><style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;}img{width:250px;height:250px;}h2{margin:16px 0 4px;}p{color:#666;margin:0;}</style></head><body><img src="${dataUrl}" /><h2>${tap.label}</h2><p>${plant.name}</p><script>setTimeout(()=>window.print(),300)</script></body></html>`);
    win.document.close();
  }, [plant.name, tap.label]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <Paper elevation={3} sx={{ borderRadius: 3, p: 3, maxWidth: 320 }} className="text-center" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-ink-900 mb-1">{tap.label}</h3>
        <p className="text-sm text-slate-500 mb-4">{plant.name}</p>
        <canvas ref={canvasRef} className="mx-auto mb-4" />
        <div className="flex gap-2">
          <Button variant="outlined" size="small" onClick={onClose} sx={{ flex: 1, textTransform: "none" }}>Close</Button>
          <Button variant="contained" size="small" startIcon={<Printer className="w-4 h-4" />} onClick={handlePrint} sx={{ flex: 1, textTransform: "none" }}>Print</Button>
        </div>
      </Paper>
    </div>
  );
}

export default function ManagerPlant() {
  const { showToast } = useGlobalToast();
  const [plant, setPlant] = useState<AdminPlant | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [qrTarget, setQrTarget] = useState<{ plant: AdminPlant; tap: AdminPlantTap } | null>(null);

  // Operating hour dialog
  const [ohDialogOpen, setOhDialogOpen] = useState(false);
  const [editOh, setEditOh] = useState<OperatingHour | null>(null);
  const [ohForm, setOhForm] = useState({ day_of_week: 0, opening_time: "08:00", closing_time: "18:00", is_closed: false });

  // Delete confirm
  const [deleteOhTarget, setDeleteOhTarget] = useState<OperatingHour | null>(null);

  const load = () => {
    setLoading(true);
    getManagerPlant().then(setPlant).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const togglePlantStatus = async (status: string, is_active?: boolean) => {
    setSubmitting(true);
    try {
      await updatePlantStatus({ status, is_active });
      load();
      showToast("Plant status updated", "success");
    } catch { showToast("Failed to update status", "error"); }
    finally { setSubmitting(false); }
  };

  const toggleTapStatus = async (tap: AdminPlantTap) => {
    const newStatus = tap.status === "operational" ? "maintenance" : "operational";
    setSubmitting(true);
    try {
      await updateTapStatus(tap.id, { status: newStatus });
      load();
      showToast(`${tap.label} → ${newStatus}`, "success");
    } catch { showToast("Failed to update tap", "error"); }
    finally { setSubmitting(false); }
  };

  const toggleControllerStatus = async (c: AdminPlantController) => {
    const newStatus = c.status === "operational" ? "maintenance" : "operational";
    setSubmitting(true);
    try {
      await updateControllerStatus(c.id, { status: newStatus });
      load();
      showToast(`${c.name} → ${newStatus}`, "success");
    } catch { showToast("Failed to update controller", "error"); }
    finally { setSubmitting(false); }
  };

  // OH CRUD
  const openCreateOh = () => {
    setEditOh(null);
    setOhForm({ day_of_week: 0, opening_time: "08:00", closing_time: "18:00", is_closed: false });
    setOhDialogOpen(true);
  };

  const openEditOh = (oh: OperatingHour) => {
    setEditOh(oh);
    setOhForm({ day_of_week: oh.day_of_week, opening_time: oh.opening_time, closing_time: oh.closing_time, is_closed: oh.is_closed });
    setOhDialogOpen(true);
  };

  const handleOhSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editOh) await updateOperatingHour(editOh.id, ohForm);
      else await createOperatingHour(ohForm);
      setOhDialogOpen(false);
      load();
      showToast(editOh ? "Schedule updated" : "Schedule slot added", "success");
    } catch { showToast("Failed", "error"); }
    finally { setSubmitting(false); }
  };

  const handleDeleteOh = async () => {
    if (!deleteOhTarget) return;
    setSubmitting(true);
    try {
      await deleteOperatingHour(deleteOhTarget.id);
      setDeleteOhTarget(null);
      load();
      showToast("Schedule slot deleted", "success");
    } catch { showToast("Delete failed", "error"); }
    finally { setSubmitting(false); }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton variant="text" width={160} height={36} />
        <Skeleton variant="rounded" height={200} />
      </div>
    );
  }

  if (!plant) {
    return <Paper elevation={0} sx={{ border: "1px solid #EDF0F2", borderRadius: 3 }} className="p-10 text-center text-ink-300">No plant assigned.</Paper>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-900 mb-1">My Plant</h1>
        <p className="text-sm text-ink-300">Infrastructure & status management</p>
      </div>

      <Paper elevation={0} sx={{ border: "1px solid #EDF0F2", borderRadius: 3 }} className="p-6">
        {/* Plant header with status toggles */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-ink-900">{plant.name}</h2>
            {(plant.city || plant.area) && (
              <div className="flex items-center gap-1 text-sm text-ink-300 mt-0.5">
                <MapPin className="w-3.5 h-3.5" />
                {[plant.area, plant.city, plant.province].filter(Boolean).join(", ")}
              </div>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              <Chip label={plant.status} size="small" color={plant.status === "operational" ? "success" : "default"} sx={{ textTransform: "capitalize", fontSize: "0.7rem" }} />
              <Chip label={plant.is_active ? "Active" : "Inactive"} size="small" variant="outlined" color={plant.is_active ? "success" : "default"} sx={{ fontSize: "0.7rem" }} />
            </div>
          </div>
          <div className="flex gap-2">
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Status</InputLabel>
              <Select label="Status" value={plant.status} disabled={submitting} onChange={(e) => togglePlantStatus(e.target.value as string)}>
                <MenuItem value="operational">Operational</MenuItem>
                <MenuItem value="under_review">Under Review</MenuItem>
                <MenuItem value="maintenance">Maintenance</MenuItem>
              </Select>
            </FormControl>
            <FormControlLabel
              control={<Switch checked={plant.is_active} disabled={submitting} onChange={(e) => togglePlantStatus(plant.status, e.target.checked)} />}
              label="Active"
            />
          </div>
        </div>

        {/* Controllers */}
        {plant.controllers.length > 0 && (
          <div className="mb-5">
            <h3 className="text-xs font-semibold text-ink-300 uppercase tracking-wider mb-2">Controllers</h3>
            {plant.controllers.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg bg-ink-100/30 mb-2">
                <Server className="w-5 h-5 text-ink-300" />
                <div className="flex-1">
                  <span className="text-sm font-medium text-ink-900">{c.name}</span>
                  {c.com_id && <span className="text-xs text-ink-300 ml-2">({c.com_id})</span>}
                  <Chip label={c.status} size="small" color={c.status === "operational" ? "success" : "default"} sx={{ ml: 1.5, textTransform: "capitalize", fontSize: "0.65rem" }} />
                </div>
                <Button size="small" variant="outlined" disabled={submitting} onClick={() => toggleControllerStatus(c)} sx={{ textTransform: "none", fontSize: "0.75rem" }}>
                  {c.status === "operational" ? "Set Maintenance" : "Set Operational"}
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Taps with status toggle */}
        <div className="mb-5">
          <h3 className="text-xs font-semibold text-ink-300 uppercase tracking-wider mb-2">Taps ({plant.taps.length})</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {plant.taps.map((tap) => (
              <div key={tap.id} className="flex items-center gap-3 p-3 rounded-lg border border-ink-100">
                <Droplets className={`w-5 h-5 ${tap.is_available ? "text-aqua-600" : "text-ink-300"}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink-900">{tap.label}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Chip label={tap.status} size="small" color={tap.status === "operational" ? "success" : "default"} sx={{ fontSize: "0.6rem", height: 18 }} />
                    <Chip label={tap.is_available ? "Available" : "In use"} size="small" variant="outlined" color={tap.is_available ? "primary" : "default"} sx={{ fontSize: "0.6rem", height: 18 }} />
                  </div>
                </div>
                <div className="flex gap-1">
                  <Tooltip title={tap.status === "operational" ? "Set maintenance" : "Set operational"}>
                    <Button size="small" variant="outlined" disabled={submitting} onClick={() => toggleTapStatus(tap)} sx={{ textTransform: "none", fontSize: "0.7rem", minWidth: 0, px: 1 }}>
                      {tap.status === "operational" ? "Maint." : "Oper."}
                    </Button>
                  </Tooltip>
                  <IconButton size="small" onClick={() => setQrTarget({ plant, tap })} title="QR"><QrCode className="w-4 h-4 text-slate-400" /></IconButton>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Operating Hours with CRUD */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-ink-300 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Operating Hours
            </h3>
            <Button size="small" startIcon={<Plus className="w-3 h-3" />} onClick={openCreateOh} sx={{ textTransform: "none", fontSize: "0.75rem" }}>Add Slot</Button>
          </div>
          {plant.operating_hours.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {plant.operating_hours.map((h) => (
                <div key={h.id} className={`text-center py-2 px-1 rounded-lg text-xs relative group ${h.is_closed ? "bg-slate-50 text-slate-400" : "bg-sky-50 text-sky-700"}`}>
                  <div className="font-semibold mb-0.5">{DAY_NAMES[h.day_of_week]}</div>
                  {h.is_closed ? <div>Closed</div> : <div>{h.opening_time}<br />{h.closing_time}</div>}
                  <div className="absolute top-0.5 right-0.5 hidden group-hover:flex gap-0.5">
                    <IconButton size="small" onClick={() => openEditOh(h)} sx={{ p: 0.3 }}><Pencil className="w-3 h-3" /></IconButton>
                    <IconButton size="small" onClick={() => setDeleteOhTarget(h)} sx={{ p: 0.3 }}><Trash2 className="w-3 h-3 text-red-400" /></IconButton>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-300">No schedule configured.</p>
          )}
        </div>
      </Paper>

      {qrTarget && <TapQRDialog plant={qrTarget.plant} tap={qrTarget.tap} onClose={() => setQrTarget(null)} />}

      {/* OH dialog */}
      <Dialog open={ohDialogOpen} onClose={() => setOhDialogOpen(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleOhSubmit}>
          <DialogTitle sx={{ fontWeight: 700 }}>{editOh ? "Edit" : "Add"} Schedule Slot</DialogTitle>
          <DialogContent className="!space-y-4 !pt-2">
            <FormControl fullWidth size="small">
              <InputLabel>Day</InputLabel>
              <Select label="Day" value={ohForm.day_of_week} onChange={(e) => setOhForm({ ...ohForm, day_of_week: Number(e.target.value) })}>
                {DAY_NAMES.map((d, i) => <MenuItem key={i} value={i}>{d}</MenuItem>)}
              </Select>
            </FormControl>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Opening" type="time" value={ohForm.opening_time} onChange={(e) => setOhForm({ ...ohForm, opening_time: e.target.value })} size="small" slotProps={{ inputLabel: { shrink: true } }} />
              <TextField label="Closing" type="time" value={ohForm.closing_time} onChange={(e) => setOhForm({ ...ohForm, closing_time: e.target.value })} size="small" slotProps={{ inputLabel: { shrink: true } }} />
            </div>
            <FormControlLabel control={<Switch checked={ohForm.is_closed} onChange={(e) => setOhForm({ ...ohForm, is_closed: e.target.checked })} />} label="Closed" />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setOhDialogOpen(false)} sx={{ textTransform: "none" }}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={submitting} sx={{ textTransform: "none", fontWeight: 600 }}>Save</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* OH delete confirm */}
      <Dialog open={!!deleteOhTarget} onClose={() => setDeleteOhTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete Schedule Slot</DialogTitle>
        <DialogContent><p className="text-sm text-ink-700">Delete {deleteOhTarget ? DAY_NAMES[deleteOhTarget.day_of_week] : ""} slot?</p></DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteOhTarget(null)} sx={{ textTransform: "none" }}>Cancel</Button>
          <Button onClick={handleDeleteOh} variant="contained" color="error" disabled={submitting} sx={{ textTransform: "none", fontWeight: 600 }}>Delete</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
