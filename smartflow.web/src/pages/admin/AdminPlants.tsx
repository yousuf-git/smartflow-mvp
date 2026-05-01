import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  Paper, Chip, Skeleton, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Alert, IconButton, Tooltip,
  FormControl, InputLabel, Select, MenuItem, FormControlLabel, Switch,
} from "@mui/material";
import {
  Server, Droplets, Clock, QrCode, Printer, Plus, Pencil, Trash2,
  MapPin,
} from "lucide-react";
import QRCode from "qrcode";
import StateCityFields from "../../components/StateCityFields";
import {
  getAdminPlants, createPlant, updatePlant, deletePlant,
  createController, updateController, deleteController,
  createTap, updateTap, deleteTap,
  createOperatingHour, updateOperatingHour, deleteOperatingHour,
  type AdminPlant, type AdminPlantTap, type AdminPlantController, type OperatingHour,
} from "../../lib/adminApi";
import { formatTime12h } from "../../lib/time";
import { useGlobalToast } from "../../contexts/ToastContext";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function OperatingHoursGrid({
  hours,
  onEdit,
  onDelete,
}: {
  hours: OperatingHour[];
  onEdit: (hour: OperatingHour) => void;
  onDelete: (hour: OperatingHour) => void;
}) {
  const grouped = DAY_NAMES.map((day, dayIndex) => ({
    day,
    slots: hours.filter((hour) => hour.day_of_week === dayIndex),
  }));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {grouped.map(({ day, slots }) => (
        <div key={day} className="rounded-lg border border-ink-100 bg-white p-3">
          <div className="text-xs font-semibold text-ink-700 mb-2">{day}</div>
          {slots.length === 0 ? (
            <div className="text-xs text-ink-300">No slot</div>
          ) : (
            <div className="space-y-1.5">
              {slots.map((slot) => (
                <div key={slot.id} className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs ${slot.is_closed ? "bg-slate-50 text-slate-500" : "bg-sky-50 text-sky-700"}`}>
                  <span>{slot.is_closed ? "Closed" : `${formatTime12h(slot.opening_time)} - ${formatTime12h(slot.closing_time)}`}</span>
                  <span className="flex items-center gap-0.5">
                    <IconButton size="small" onClick={() => onEdit(slot)} sx={{ p: 0.25 }}><Pencil className="w-3 h-3" /></IconButton>
                    <IconButton size="small" onClick={() => onDelete(slot)} sx={{ p: 0.25 }}><Trash2 className="w-3 h-3 text-red-400" /></IconButton>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// QR Dialog (kept from original)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function AdminPlants() {
  const { showToast } = useGlobalToast();
  const [plants, setPlants] = useState<AdminPlant[]>([]);
  const [loading, setLoading] = useState(true);
  const [qrTarget, setQrTarget] = useState<{ plant: AdminPlant; tap: AdminPlantTap } | null>(null);

  // Plant dialog
  const [plantDialogOpen, setPlantDialogOpen] = useState(false);
  const [editPlant, setEditPlant] = useState<AdminPlant | null>(null);
  const [plantForm, setPlantForm] = useState({ name: "", city: "", province: "", area: "", address: "", status: "under_review", is_active: false });
  const [plantError, setPlantError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Controller dialog
  const [ctrlDialogOpen, setCtrlDialogOpen] = useState(false);
  const [ctrlPlantId, setCtrlPlantId] = useState(0);
  const [editCtrl, setEditCtrl] = useState<AdminPlantController | null>(null);
  const [ctrlForm, setCtrlForm] = useState({ name: "", com_id: "", status: "operational", is_active: true });

  // Tap dialog
  const [tapDialogOpen, setTapDialogOpen] = useState(false);
  const [tapPlant, setTapPlant] = useState<AdminPlant | null>(null);
  const [editTapTarget, setEditTapTarget] = useState<AdminPlantTap | null>(null);
  const [tapForm, setTapForm] = useState({ controller_id: 0, label: "", gpio_pin_number: 0, status: "operational" });

  // Operating hour dialog
  const [ohDialogOpen, setOhDialogOpen] = useState(false);
  const [ohPlantId, setOhPlantId] = useState(0);
  const [editOh, setEditOh] = useState<OperatingHour | null>(null);
  const [ohForm, setOhForm] = useState({ day_of_week: 0, opening_time: "08:00", closing_time: "18:00", is_closed: false });

  // Delete confirm
  const [deleteDialog, setDeleteDialog] = useState<{ type: string; id: number; label: string } | null>(null);

  const load = () => {
    setLoading(true);
    getAdminPlants().then(setPlants).finally(() => setLoading(false));
  };
  useEffect(load, []);

  // Plant CRUD
  const openCreatePlant = () => {
    setEditPlant(null);
    setPlantForm({ name: "", city: "", province: "", area: "", address: "", status: "under_review", is_active: false });
    setPlantError("");
    setPlantDialogOpen(true);
  };

  const openEditPlant = (p: AdminPlant) => {
    setEditPlant(p);
    setPlantForm({ name: p.name, city: p.city, province: p.province, area: p.area, address: p.address, status: p.status, is_active: p.is_active });
    setPlantError("");
    setPlantDialogOpen(true);
  };

  const handlePlantSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPlantError("");
    setSubmitting(true);
    try {
      if (editPlant) {
        await updatePlant(editPlant.id, plantForm);
      } else {
        await createPlant(plantForm);
      }
      setPlantDialogOpen(false);
      load();
      showToast(editPlant ? "Plant updated" : "Plant created", "success");
    } catch (err: unknown) {
      setPlantError((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Controller CRUD
  const openCreateCtrl = (plantId: number) => {
    setEditCtrl(null);
    setCtrlPlantId(plantId);
    setCtrlForm({ name: "", com_id: "", status: "operational", is_active: true });
    setPlantError("");
    setCtrlDialogOpen(true);
  };

  const openEditCtrl = (c: AdminPlantController, plantId: number) => {
    setEditCtrl(c);
    setCtrlPlantId(plantId);
    setCtrlForm({ name: c.name, com_id: c.com_id, status: c.status, is_active: c.is_active });
    setPlantError("");
    setCtrlDialogOpen(true);
  };

  const handleCtrlSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editCtrl) {
        await updateController(editCtrl.id, ctrlForm);
      } else {
        await createController(ctrlPlantId, ctrlForm);
      }
      setCtrlDialogOpen(false);
      load();
      showToast(editCtrl ? "Controller updated" : "Controller created", "success");
    } catch (err: unknown) {
      setPlantError((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Tap CRUD
  const openCreateTap = (plant: AdminPlant) => {
    setEditTapTarget(null);
    setTapPlant(plant);
    setTapForm({ controller_id: plant.controllers[0]?.id ?? 0, label: "", gpio_pin_number: 0, status: "operational" });
    setPlantError("");
    setTapDialogOpen(true);
  };

  const openEditTap = (tap: AdminPlantTap, plant: AdminPlant) => {
    setEditTapTarget(tap);
    setTapPlant(plant);
    setTapForm({ controller_id: 0, label: tap.label, gpio_pin_number: tap.gpio_pin_number, status: tap.status });
    setPlantError("");
    setTapDialogOpen(true);
  };

  const handleTapSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editTapTarget) {
        await updateTap(editTapTarget.id, { label: tapForm.label, gpio_pin_number: tapForm.gpio_pin_number, status: tapForm.status });
      } else {
        await createTap(tapPlant!.id, { controller_id: tapForm.controller_id, label: tapForm.label, gpio_pin_number: tapForm.gpio_pin_number });
      }
      setTapDialogOpen(false);
      load();
      showToast(editTapTarget ? "Tap updated" : "Tap created", "success");
    } catch (err: unknown) {
      setPlantError((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Operating hour CRUD
  const openCreateOh = (plantId: number) => {
    setEditOh(null);
    setOhPlantId(plantId);
    setOhForm({ day_of_week: 0, opening_time: "08:00", closing_time: "18:00", is_closed: false });
    setPlantError("");
    setOhDialogOpen(true);
  };

  const openEditOh = (oh: OperatingHour, plantId: number) => {
    setEditOh(oh);
    setOhPlantId(plantId);
    setOhForm({ day_of_week: oh.day_of_week, opening_time: oh.opening_time, closing_time: oh.closing_time, is_closed: oh.is_closed });
    setPlantError("");
    setOhDialogOpen(true);
  };

  const handleOhSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editOh) {
        await updateOperatingHour(editOh.id, ohForm);
      } else {
        await createOperatingHour(ohPlantId, ohForm);
      }
      setOhDialogOpen(false);
      load();
      showToast(editOh ? "Schedule updated" : "Schedule slot added", "success");
    } catch (err: unknown) {
      setPlantError((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Generic delete
  const handleDelete = async () => {
    if (!deleteDialog) return;
    setSubmitting(true);
    try {
      if (deleteDialog.type === "plant") await deletePlant(deleteDialog.id);
      else if (deleteDialog.type === "controller") await deleteController(deleteDialog.id);
      else if (deleteDialog.type === "tap") await deleteTap(deleteDialog.id);
      else if (deleteDialog.type === "hour") await deleteOperatingHour(deleteDialog.id);
      setDeleteDialog(null);
      load();
      showToast(`${deleteDialog.type} deleted`, "success");
    } catch (err: unknown) {
      showToast((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Delete failed", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton variant="text" width={160} height={36} />
        <Skeleton variant="rounded" height={200} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900 mb-1">Plants</h1>
          <p className="text-sm text-ink-300">Water plant infrastructure</p>
        </div>
        <Button variant="contained" startIcon={<Plus className="w-4 h-4" />} onClick={openCreatePlant} sx={{ textTransform: "none", fontWeight: 600 }}>
          Add Plant
        </Button>
      </div>

      {plants.map((plant) => (
        <Paper key={plant.id} elevation={0} sx={{ border: "1px solid #EDF0F2", borderRadius: 3 }} className="p-6">
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
            <div className="flex gap-1">
              <Tooltip title="Edit Plant"><IconButton size="small" onClick={() => openEditPlant(plant)}><Pencil className="w-4 h-4 text-ink-300" /></IconButton></Tooltip>
              <Tooltip title="Delete Plant"><IconButton size="small" onClick={() => setDeleteDialog({ type: "plant", id: plant.id, label: plant.name })}><Trash2 className="w-4 h-4 text-red-400" /></IconButton></Tooltip>
            </div>
          </div>

          {/* Controllers */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-ink-300 uppercase tracking-wider">Controllers ({plant.controllers.length})</h3>
              <Button size="small" startIcon={<Plus className="w-3 h-3" />} onClick={() => openCreateCtrl(plant.id)} sx={{ textTransform: "none", fontSize: "0.75rem" }}>Add</Button>
            </div>
            {plant.controllers.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg bg-ink-100/30 mb-2">
                <Server className="w-5 h-5 text-ink-300" />
                <div className="flex-1">
                  <span className="text-sm font-medium text-ink-900">{c.name}</span>
                  {c.com_id && <span className="text-xs text-ink-300 ml-2">({c.com_id})</span>}
                  <Chip label={c.status} size="small" color={c.status === "operational" ? "success" : "default"} sx={{ ml: 1.5, textTransform: "capitalize", fontSize: "0.65rem" }} />
                  <Chip label={c.is_active ? "Active" : "Inactive"} size="small" variant="outlined" sx={{ ml: 0.5, fontSize: "0.65rem" }} />
                </div>
                <Tooltip title="Edit"><IconButton size="small" onClick={() => openEditCtrl(c, plant.id)}><Pencil className="w-3.5 h-3.5 text-ink-300" /></IconButton></Tooltip>
                <Tooltip title="Delete"><IconButton size="small" onClick={() => setDeleteDialog({ type: "controller", id: c.id, label: c.name })}><Trash2 className="w-3.5 h-3.5 text-red-400" /></IconButton></Tooltip>
              </div>
            ))}
          </div>

          {/* Taps */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-ink-300 uppercase tracking-wider">Taps ({plant.taps.length})</h3>
              <Button size="small" startIcon={<Plus className="w-3 h-3" />} onClick={() => openCreateTap(plant)} sx={{ textTransform: "none", fontSize: "0.75rem" }} disabled={plant.controllers.length === 0}>Add</Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
                  <div className="flex gap-0.5">
                    <IconButton size="small" onClick={() => setQrTarget({ plant, tap })} title="QR"><QrCode className="w-3.5 h-3.5 text-slate-400" /></IconButton>
                    <IconButton size="small" onClick={() => openEditTap(tap, plant)}><Pencil className="w-3.5 h-3.5 text-ink-300" /></IconButton>
                    <IconButton size="small" onClick={() => setDeleteDialog({ type: "tap", id: tap.id, label: tap.label })}><Trash2 className="w-3.5 h-3.5 text-red-400" /></IconButton>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Operating Hours */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-ink-300 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Operating Hours
              </h3>
              <Button size="small" startIcon={<Plus className="w-3 h-3" />} onClick={() => openCreateOh(plant.id)} sx={{ textTransform: "none", fontSize: "0.75rem" }}>Add Slot</Button>
            </div>
            {plant.operating_hours.length > 0 ? (
              <OperatingHoursGrid
                hours={plant.operating_hours}
                onEdit={(hour) => openEditOh(hour, plant.id)}
                onDelete={(hour) => setDeleteDialog({ type: "hour", id: hour.id, label: `${DAY_NAMES[hour.day_of_week]} slot` })}
              />
            ) : (
              <p className="text-sm text-ink-300">No schedule configured.</p>
            )}
          </div>
        </Paper>
      ))}

      {plants.length === 0 && (
        <Paper elevation={0} sx={{ border: "1px solid #EDF0F2", borderRadius: 3 }} className="p-10 text-center text-ink-300">No plants configured.</Paper>
      )}

      {/* QR dialog */}
      {qrTarget && <TapQRDialog plant={qrTarget.plant} tap={qrTarget.tap} onClose={() => setQrTarget(null)} />}

      {/* Plant dialog */}
      <Dialog open={plantDialogOpen} onClose={() => setPlantDialogOpen(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handlePlantSubmit}>
          <DialogTitle sx={{ fontWeight: 700 }}>{editPlant ? "Edit" : "Create"} Plant</DialogTitle>
          <DialogContent className="!space-y-4 !pt-2">
            {plantError && <Alert severity="error">{plantError}</Alert>}
            <TextField label="Name" value={plantForm.name} onChange={(e) => setPlantForm({ ...plantForm, name: e.target.value })} required fullWidth size="small" />
            <StateCityFields
              stateName={plantForm.province}
              cityName={plantForm.city}
              onChange={({ stateName, cityName }) => setPlantForm({ ...plantForm, province: stateName, city: cityName })}
            />
            <TextField label="Area" value={plantForm.area} onChange={(e) => setPlantForm({ ...plantForm, area: e.target.value })} fullWidth size="small" />
            <TextField label="Address" value={plantForm.address} onChange={(e) => setPlantForm({ ...plantForm, address: e.target.value })} fullWidth size="small" />
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select label="Status" value={plantForm.status} onChange={(e) => setPlantForm({ ...plantForm, status: e.target.value })}>
                <MenuItem value="operational">Operational</MenuItem>
                <MenuItem value="under_review">Under Review</MenuItem>
                <MenuItem value="maintenance">Maintenance</MenuItem>
              </Select>
            </FormControl>
            <FormControlLabel control={<Switch checked={plantForm.is_active} onChange={(e) => setPlantForm({ ...plantForm, is_active: e.target.checked })} />} label="Active" />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setPlantDialogOpen(false)} sx={{ textTransform: "none" }}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={submitting} sx={{ textTransform: "none", fontWeight: 600 }}>{submitting ? "Saving..." : "Save"}</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Controller dialog */}
      <Dialog open={ctrlDialogOpen} onClose={() => setCtrlDialogOpen(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleCtrlSubmit}>
          <DialogTitle sx={{ fontWeight: 700 }}>{editCtrl ? "Edit" : "Create"} Controller</DialogTitle>
          <DialogContent className="!space-y-4 !pt-2">
            {plantError && <Alert severity="error">{plantError}</Alert>}
            <TextField label="Name" value={ctrlForm.name} onChange={(e) => setCtrlForm({ ...ctrlForm, name: e.target.value })} required fullWidth size="small" />
            <TextField label="COM ID" value={ctrlForm.com_id} onChange={(e) => setCtrlForm({ ...ctrlForm, com_id: e.target.value })} fullWidth size="small" placeholder="DEV-001" />
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select label="Status" value={ctrlForm.status} onChange={(e) => setCtrlForm({ ...ctrlForm, status: e.target.value })}>
                <MenuItem value="operational">Operational</MenuItem>
                <MenuItem value="maintenance">Maintenance</MenuItem>
              </Select>
            </FormControl>
            <FormControlLabel control={<Switch checked={ctrlForm.is_active} onChange={(e) => setCtrlForm({ ...ctrlForm, is_active: e.target.checked })} />} label="Active" />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setCtrlDialogOpen(false)} sx={{ textTransform: "none" }}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={submitting} sx={{ textTransform: "none", fontWeight: 600 }}>Save</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Tap dialog */}
      <Dialog open={tapDialogOpen} onClose={() => setTapDialogOpen(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleTapSubmit}>
          <DialogTitle sx={{ fontWeight: 700 }}>{editTapTarget ? "Edit" : "Create"} Tap</DialogTitle>
          <DialogContent className="!space-y-4 !pt-2">
            {plantError && <Alert severity="error">{plantError}</Alert>}
            <TextField label="Label" value={tapForm.label} onChange={(e) => setTapForm({ ...tapForm, label: e.target.value })} required fullWidth size="small" />
            <TextField label="GPIO Pin" type="number" value={tapForm.gpio_pin_number} onChange={(e) => setTapForm({ ...tapForm, gpio_pin_number: Number(e.target.value) })} fullWidth size="small" />
            {!editTapTarget && tapPlant && (
              <FormControl fullWidth size="small">
                <InputLabel>Controller</InputLabel>
                <Select label="Controller" value={tapForm.controller_id || ""} onChange={(e) => setTapForm({ ...tapForm, controller_id: Number(e.target.value) })}>
                  {tapPlant.controllers.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                </Select>
              </FormControl>
            )}
            {editTapTarget && (
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select label="Status" value={tapForm.status} onChange={(e) => setTapForm({ ...tapForm, status: e.target.value })}>
                  <MenuItem value="operational">Operational</MenuItem>
                  <MenuItem value="maintenance">Maintenance</MenuItem>
                </Select>
              </FormControl>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setTapDialogOpen(false)} sx={{ textTransform: "none" }}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={submitting} sx={{ textTransform: "none", fontWeight: 600 }}>Save</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Operating hour dialog */}
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
              <TextField label="Opening Time" type="time" value={ohForm.opening_time} onChange={(e) => setOhForm({ ...ohForm, opening_time: e.target.value })} size="small" slotProps={{ inputLabel: { shrink: true } }} />
              <TextField label="Closing Time" type="time" value={ohForm.closing_time} onChange={(e) => setOhForm({ ...ohForm, closing_time: e.target.value })} size="small" slotProps={{ inputLabel: { shrink: true } }} />
            </div>
            <FormControlLabel control={<Switch checked={ohForm.is_closed} onChange={(e) => setOhForm({ ...ohForm, is_closed: e.target.checked })} />} label="Closed" />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setOhDialogOpen(false)} sx={{ textTransform: "none" }}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={submitting} sx={{ textTransform: "none", fontWeight: 600 }}>Save</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteDialog} onClose={() => setDeleteDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete {deleteDialog?.type}</DialogTitle>
        <DialogContent><p className="text-sm text-ink-700">Delete <strong>{deleteDialog?.label}</strong>?</p></DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteDialog(null)} sx={{ textTransform: "none" }}>Cancel</Button>
          <Button onClick={handleDelete} variant="contained" color="error" disabled={submitting} sx={{ textTransform: "none", fontWeight: 600 }}>Delete</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
