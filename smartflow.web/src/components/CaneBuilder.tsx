import { useMemo } from "react";
import {
  Button,
  Chip,
  IconButton,
  InputAdornment,
  Paper,
  TextField,
  Typography,
  Divider,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import WaterDropOutlinedIcon from "@mui/icons-material/WaterDropOutlined";
import type { Plant, Me } from "../lib/api";

const MAX_LITRES_PER_CANE = Number(import.meta.env.VITE_MAX_LITRES ?? 100);
const MAX_CANES_PER_TAP = 2;
const MAX_TAPS_PER_PURCHASE = 2;

export type DraftCane = { key: string; tap_id: number; litres: string };

type Props = {
  plant: Plant;
  me: Me;
  draft: DraftCane[];
  onChange: (next: DraftCane[]) => void;
  onConfirm: () => void;
  submitting: boolean;
};

type Derived = {
  totalLitres: number;
  totalPrice: number;
  errors: string[];
  tapsUsed: Set<number>;
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

  const tapsUsed = new Set(draft.map((c) => c.tap_id));
  if (tapsUsed.size > MAX_TAPS_PER_PURCHASE) {
    errors.push(`Max ${MAX_TAPS_PER_PURCHASE} taps per purchase.`);
  }
  for (const [tapId, count] of Object.entries(tapCaneCount)) {
    if (count > MAX_CANES_PER_TAP) {
      errors.push(`Max ${MAX_CANES_PER_TAP} canes on ${tapId}.`);
    }
  }
  if (draft.length === 0) {
    errors.push("Add at least one cane.");
  }
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
      `Balance too low — need ${me.currency} ${totalPrice.toFixed(2)}, free ${me.currency} ${free.toFixed(2)}.`,
    );
  }
  if (totalLitres > me.daily_remaining_litres) {
    errors.push(
      `Daily limit — ${totalLitres.toFixed(1)} L exceeds remaining ${me.daily_remaining_litres.toFixed(1)} L.`,
    );
  }

  return { totalLitres, totalPrice, errors, tapsUsed, tapCaneCount };
}

export default function CaneBuilder({ plant, me, draft, onChange, onConfirm, submitting }: Props) {
  const derived = useMemo(() => derive(plant, me, draft), [plant, me, draft]);

  const addCane = (tap_id: number) => {
    const key = `${tap_id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    onChange([...draft, { key, tap_id, litres: "10" }]);
  };
  const removeCane = (key: string) => onChange(draft.filter((c) => c.key !== key));
  const updateLitres = (key: string, litres: string) =>
    onChange(draft.map((c) => (c.key === key ? { ...c, litres } : c)));

  return (
    <Paper
      elevation={0}
      sx={{ border: "1px solid #EDF0F2", borderRadius: 3 }}
      className="p-5 sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <Typography
            variant="overline"
            className="tracking-widest"
            sx={{ color: "text.secondary" }}
          >
            {plant.name}
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Build your purchase
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
            {me.currency} {me.price_per_litre.toFixed(2)} per litre · up to 2 canes per tap, 2 taps max.
          </Typography>
        </div>
      </div>

      <Divider sx={{ my: 3 }} />

      <div className="flex flex-col gap-4">
        {plant.taps.map((tap) => {
          const tapCanes = draft.filter((c) => c.tap_id === tap.id);
          const canAdd =
            tapCanes.length < MAX_CANES_PER_TAP &&
            (derived.tapsUsed.has(tap.id) || derived.tapsUsed.size < MAX_TAPS_PER_PURCHASE);
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
                  disabled={!canAdd || submitting}
                  onClick={() => addCane(tap.id)}
                  sx={{ textTransform: "none" }}
                >
                  Add cane
                </Button>
              </div>

              {tapCanes.length === 0 ? (
                <Typography
                  variant="body2"
                  sx={{ color: "text.secondary", mt: 1.5, fontStyle: "italic" }}
                >
                  No canes on this tap.
                </Typography>
              ) : (
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
                      <Typography variant="body2" sx={{ color: "text.secondary", minWidth: 72, textAlign: "right" }}>
                        {me.currency} {(Number(c.litres || 0) * me.price_per_litre).toFixed(2)}
                      </Typography>
                      <IconButton
                        aria-label="Remove"
                        size="small"
                        onClick={() => removeCane(c.key)}
                        disabled={submitting}
                      >
                        <DeleteOutlineIcon />
                      </IconButton>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Divider sx={{ my: 3 }} />

      <div className="flex items-center justify-between">
        <div>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Total
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {derived.totalLitres.toFixed(1)} L · {me.currency} {derived.totalPrice.toFixed(2)}
          </Typography>
        </div>
        <Button
          variant="contained"
          size="large"
          disabled={submitting || derived.errors.length > 0}
          onClick={onConfirm}
          sx={{ height: 52, fontWeight: 600, textTransform: "none", minWidth: 180 }}
        >
          {submitting ? "Holding funds…" : "Confirm purchase"}
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
    </Paper>
  );
}
