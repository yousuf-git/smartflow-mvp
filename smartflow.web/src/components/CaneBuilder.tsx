import { useCallback, useMemo, useState } from "react";
import {
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import WaterDropOutlinedIcon from "@mui/icons-material/WaterDropOutlined";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import CloseIcon from "@mui/icons-material/Close";
import CameraScanner from "./CameraScanner";
import Toast from "./Toast";
import { useToast } from "../lib/useToast";
import type { Plant, Me } from "../lib/api";

const MAX_LITRES_PER_CANE = Number(import.meta.env.VITE_MAX_LITRES ?? 100);
const MAX_CANES_PER_TAP = 2;
const MAX_TAPS_PER_PURCHASE = 2;

export type DraftCane = { key: string; tap_id: number; litres: string };

type QRPayload = { plant_id: number; tap_id: number };

type Props = {
  plant: Plant;
  me: Me;
  draft: DraftCane[];
  onChange: (next: DraftCane[]) => void;
  onConfirm: () => void;
  onBack: () => void;
  submitting: boolean;
};

type Derived = {
  totalLitres: number;
  totalPrice: number;
  errors: string[];
  activeTapIds: number[];
  tapCaneCount: Record<number, number>;
};

function derive(_plant: Plant, me: Me, draft: DraftCane[]): Derived {
  const errors: string[] = [];
  const tapCaneCount: Record<number, number> = {};
  let totalLitres = 0;

  for (const c of draft) {
    tapCaneCount[c.tap_id] = (tapCaneCount[c.tap_id] ?? 0) + 1;
    const l = Number(c.litres);
    if (!c.litres.trim() || Number.isNaN(l) || l <= 0) continue;
    if (l > MAX_LITRES_PER_CANE) continue;
    totalLitres += l;
  }
  const totalPrice = totalLitres * me.price_per_litre;
  const activeTapIds = [...new Set(draft.map((c) => c.tap_id))];

  for (const [, count] of Object.entries(tapCaneCount)) {
    if (count > MAX_CANES_PER_TAP) errors.push(`Max ${MAX_CANES_PER_TAP} canes per tap.`);
  }
  if (draft.length === 0) errors.push("Add at least one cane.");
  for (const c of draft) {
    const l = Number(c.litres);
    if (!c.litres.trim() || Number.isNaN(l) || l <= 0) {
      errors.push("Each cane needs a positive litres value.");
      break;
    }
    if (l > MAX_LITRES_PER_CANE) {
      errors.push(`Each cane must be ≤ ${MAX_LITRES_PER_CANE} L.`);
      break;
    }
  }
  const free = me.balance - me.hold_balance;
  if (totalPrice > free) {
    errors.push(
      `Insufficient credit — need ${me.currency} ${totalPrice.toFixed(2)}, available ${me.currency} ${free.toFixed(2)}.`,
    );
  }
  if (totalLitres > me.daily_remaining_litres) {
    errors.push(
      `Exceeds daily limit — ${totalLitres.toFixed(1)} L requested, ${me.daily_remaining_litres.toFixed(1)} L remaining.`,
    );
  }

  return { totalLitres, totalPrice, errors, activeTapIds, tapCaneCount };
}

export default function CaneBuilder({
  plant,
  me,
  draft,
  onChange,
  onConfirm,
  onBack,
  submitting,
}: Props) {
  const derived = useMemo(() => derive(plant, me, draft), [plant, me, draft]);
  const [addTapOpen, setAddTapOpen] = useState(false);
  const { toastProps, showToast } = useToast();

  const addCane = (tap_id: number) => {
    const key = `${tap_id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    onChange([...draft, { key, tap_id, litres: "10" }]);
  };
  const removeCane = (key: string) => onChange(draft.filter((c) => c.key !== key));
  const updateLitres = (key: string, litres: string) =>
    onChange(draft.map((c) => (c.key === key ? { ...c, litres } : c)));

  const handleAddTapScan = useCallback(
    (text: string) => {
      setAddTapOpen(false);
      let payload: QRPayload;
      try {
        payload = JSON.parse(text) as QRPayload;
      } catch {
        showToast("Invalid QR code format.", "error");
        return;
      }

      if (payload.plant_id !== plant.id) {
        showToast("QR is for a different plant.", "error");
        return;
      }

      const tap = plant.taps.find((t) => t.id === payload.tap_id);
      if (!tap) {
        showToast("Tap not found on this plant.", "error");
        return;
      }

      if (derived.activeTapIds.includes(tap.id)) {
        showToast(
          `${tap.label} is already in your session. Scan a different tap, or add more canes to the existing tap.`,
          "warning",
        );
        return;
      }

      if (derived.activeTapIds.length >= MAX_TAPS_PER_PURCHASE) {
        showToast(`Already at the ${MAX_TAPS_PER_PURCHASE}-tap limit.`, "warning");
        return;
      }

      const key = `${tap.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      onChange([...draft, { key, tap_id: tap.id, litres: "10" }]);
    },
    [plant, draft, derived, onChange, showToast],
  );

  const handleAddTapError = useCallback(
    (msg: string) => {
      setAddTapOpen(false);
      showToast(`Camera unavailable: ${msg}`, "error");
    },
    [showToast],
  );

  const canAddTap = derived.activeTapIds.length < MAX_TAPS_PER_PURCHASE && !submitting;
  const activeTaps = plant.taps.filter((t) => derived.activeTapIds.includes(t.id));

  return (
    <Paper
      elevation={0}
      sx={{ border: "1px solid #EDF0F2", borderRadius: 3 }}
      className="p-5 sm:p-6"
    >
      {/* Header */}
      <div className="flex items-start gap-2">
        <IconButton
          size="small"
          onClick={onBack}
          disabled={submitting}
          sx={{ mt: 0.25, color: "text.secondary" }}
          aria-label="Back to scan"
        >
          <ArrowBackRoundedIcon fontSize="small" />
        </IconButton>

        <div className="flex-1">
          <Typography
            variant="overline"
            sx={{ color: "text.secondary", letterSpacing: 2 }}
          >
            {plant.name}
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            Fill your canes
          </Typography>

          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Chip
              icon={<WaterDropOutlinedIcon style={{ fontSize: 14 }} />}
              label={`${me.currency} ${me.price_per_litre.toFixed(2)} / L`}
              size="small"
              sx={{ bgcolor: "#E8F6FB", color: "#074E66", fontWeight: 600 }}
            />
          </div>
          <Typography variant="caption" sx={{ color: "text.secondary", mt: 0.5, display: "block" }}>
            Up to {MAX_CANES_PER_TAP} canes per tap · {MAX_TAPS_PER_PURCHASE} taps per session
          </Typography>
        </div>
      </div>

      <Divider sx={{ my: 3 }} />

      {/* Tap sections */}
      <div className="flex flex-col gap-4">
        {activeTaps.map((tap) => {
          const tapCanes = draft.filter((c) => c.tap_id === tap.id);
          const canAddCane = tapCanes.length < MAX_CANES_PER_TAP && !submitting;
          return (
            <div key={tap.id} className="rounded-xl p-3" style={{ background: "#F6F8F9" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Chip
                    label={tap.label}
                    size="small"
                    sx={{ bgcolor: "#0F8CB0", color: "#fff", fontWeight: 600 }}
                  />
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    {tapCanes.length}/{MAX_CANES_PER_TAP} canes
                  </Typography>
                </div>
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  disabled={!canAddCane}
                  onClick={() => addCane(tap.id)}
                  sx={{ textTransform: "none" }}
                >
                  Add cane
                </Button>
              </div>

              <div className="mt-2 flex flex-col gap-2">
                {tapCanes.map((c, idx) => (
                  <div key={c.key} className="flex items-center gap-2">
                    <Chip
                      label={`Cane ${idx + 1}`}
                      size="small"
                      variant="outlined"
                      sx={{ bgcolor: "#fff" }}
                    />
                    <TextField
                      type="number"
                      size="small"
                      value={c.litres}
                      onChange={(e) => updateLitres(c.key, e.target.value)}
                      disabled={submitting}
                      slotProps={{
                        input: {
                          endAdornment: (
                            <InputAdornment position="end">
                              <WaterDropOutlinedIcon color="primary" fontSize="small" />
                              <span className="ml-1 text-sm">L</span>
                            </InputAdornment>
                          ),
                          inputProps: { min: 1, max: MAX_LITRES_PER_CANE, step: 1 },
                        },
                      }}
                      sx={{ flex: 1, bgcolor: "#fff", borderRadius: 1 }}
                    />
                    <Typography
                      variant="body2"
                      sx={{ color: "text.secondary", minWidth: 72, textAlign: "right" }}
                    >
                      {me.currency} {(Number(c.litres || 0) * me.price_per_litre).toFixed(2)}
                    </Typography>
                    <IconButton
                      aria-label="Remove cane"
                      size="small"
                      onClick={() => removeCane(c.key)}
                      disabled={submitting}
                    >
                      <DeleteOutlineIcon />
                    </IconButton>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {canAddTap && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<QrCodeScannerIcon />}
            onClick={() => setAddTapOpen(true)}
            sx={{ textTransform: "none", borderStyle: "dashed", alignSelf: "flex-start" }}
          >
            Add another tap
          </Button>
        )}
      </div>

      <Divider sx={{ my: 3 }} />

      {/* Footer */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline gap-1.5">
            <WaterDropOutlinedIcon color="primary" sx={{ fontSize: 18, mb: "-2px" }} />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {derived.totalLitres.toFixed(1)} L
            </Typography>
          </div>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {me.currency} {derived.totalPrice.toFixed(2)} to reserve on confirm
          </Typography>
        </div>
        <Button
          variant="contained"
          size="large"
          disabled={submitting || derived.errors.length > 0}
          onClick={onConfirm}
          sx={{ height: 52, fontWeight: 700, textTransform: "none", minWidth: 160, borderRadius: 2 }}
        >
          {submitting ? "Reserving…" : "Confirm"}
        </Button>
      </div>

      {derived.errors.length > 0 && (
        <div className="mt-3 flex flex-col gap-1">
          {derived.errors.map((e, i) => (
            <Typography key={i} variant="body2" sx={{ color: "error.main" }}>
              • {e}
            </Typography>
          ))}
        </div>
      )}

      {/* Add second tap dialog */}
      <Dialog
        open={addTapOpen}
        onClose={() => setAddTapOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle
          sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 1 }}
        >
          <span>Add Second Tap</span>
          <IconButton size="small" onClick={() => setAddTapOpen(false)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pb: 3 }}>
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
            Scan the QR code on the second tap you want to include in this session.
          </Typography>
          {addTapOpen && (
            <CameraScanner onResult={handleAddTapScan} onError={handleAddTapError} />
          )}
        </DialogContent>
      </Dialog>

      <Toast {...toastProps} />
    </Paper>
  );
}
