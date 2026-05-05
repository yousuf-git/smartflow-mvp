import { useCallback, useMemo, useState } from "react";
import {
  InputAdornment,
  TextField,
} from "@mui/material";
import {
  Plus,
  ArrowLeft,
  Trash2,
  QrCode,
  Zap,
  Info
} from "lucide-react";
import { motion } from "framer-motion";
import QRScannerModal from "./QRScannerModal";
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
      `Exceeds daily limit — ${totalLitres.toFixed(2)} L requested, ${me.daily_remaining_litres.toFixed(2)} L remaining.`,
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

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0 }
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="flex flex-col gap-6"
    >
      {/* Page Header */}
      <motion.div variants={itemVariants} className="flex items-center gap-4">
         <button
            onClick={onBack}
            disabled={submitting}
            className="w-11 h-11 rounded-2xl bg-white border border-slate-100 shadow-sm flex items-center justify-center text-slate-600 active:scale-90 transition-all disabled:opacity-50"
         >
            <ArrowLeft className="w-5 h-5" />
         </button>
         <div>
            <h2 className="text-xl font-semibold text-slate-900 tracking-tight leading-none mb-1.5">Configure Fill</h2>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">{plant.name}</p>
         </div>
      </motion.div>

      {/* Info Card */}
      <motion.div variants={itemVariants} className="bg-pure-aqua/5 rounded-[24px] p-4 flex items-center gap-3 border border-pure-aqua/10">
         <div className="w-10 h-10 rounded-xl bg-pure-aqua/10 flex items-center justify-center text-pure-aqua">
            <Zap className="w-5 h-5" />
         </div>
         <div className="flex-1">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Pricing Model</p>
            <p className="text-sm font-semibold text-slate-900">{me.currency} {me.price_per_litre.toFixed(2)} / Litre</p>
         </div>
      </motion.div>

      {/* Tap List */}
      <div className="flex flex-col gap-4">
        {activeTaps.map((tap) => {
          const tapCanes = draft.filter((c) => c.tap_id === tap.id);
          const canAddCane = tapCanes.length < MAX_CANES_PER_TAP && !submitting;
          return (
            <motion.div
              key={tap.id}
              variants={itemVariants}
              className="bg-white border border-slate-100 rounded-[28px] p-5 shadow-sm"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center text-white text-[11px] font-semibold">
                     {tap.label}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Active Tap</h3>
                    <p className="text-[10px] font-medium text-slate-400 uppercase tracking-tighter">{tapCanes.length} of {MAX_CANES_PER_TAP} Canes Ready</p>
                  </div>
                </div>
                <button
                  disabled={!canAddCane}
                  onClick={() => addCane(tap.id)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-pure-aqua py-2 px-3 rounded-xl bg-pure-aqua/5 active:scale-95 transition-all disabled:opacity-30"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Cane
                </button>
              </div>

              <div className="flex flex-col gap-3">
                {tapCanes.map((c, idx) => (
                  <div
                    key={c.key}
                    className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100/50"
                  >
                    <div className="w-8 h-8 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-[10px] font-semibold text-slate-400">
                       #{idx + 1}
                    </div>
                    <div className="flex-1">
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
                                <span className="text-[10px] font-semibold text-slate-300 uppercase">Ltrs</span>
                              </InputAdornment>
                            ),
                            sx: { borderRadius: '12px', bgcolor: 'white', fontWeight: 600, fontSize: '0.9rem' }
                          },
                        }}
                        fullWidth
                      />
                    </div>
                    <div className="text-right min-w-[60px]">
                       <p className="text-xs font-semibold text-slate-900">{me.currency} {(Number(c.litres || 0) * me.price_per_litre).toFixed(2)}</p>
                    </div>
                    <button
                      onClick={() => removeCane(c.key)}
                      disabled={submitting}
                      className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-red-500 active:scale-90 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          );
        })}

        {canAddTap && (
          <motion.button
            variants={itemVariants}
            onClick={() => setAddTapOpen(true)}
            className="w-full py-4 border-2 border-dashed border-slate-100 rounded-[24px] text-slate-400 text-xs font-semibold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-50 transition-all"
          >
            <QrCode className="w-4 h-4" /> Add Another Tap
          </motion.button>
        )}
      </div>

      {/* Summary Footer */}
      <motion.div variants={itemVariants} className="mt-4 bg-white border border-slate-100 rounded-[32px] p-6 shadow-lg shadow-slate-200/50">
        <div className="flex items-center justify-between mb-6">
          <div className="flex flex-col">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Total Volume</p>
            <div className="flex items-baseline gap-1">
               <span className="text-2xl font-semibold text-slate-900">{derived.totalLitres.toFixed(2)}</span>
               <span className="text-xs font-semibold text-slate-400">LITRES</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Total Cost</p>
            <div className="flex items-baseline justify-end gap-1">
               <span className="text-xs font-semibold text-slate-400">{me.currency}</span>
               <span className="text-2xl font-bold text-pure-aqua">{derived.totalPrice.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {derived.errors.length > 0 ? (
          <div className="bg-red-50 rounded-2xl p-4 flex gap-3 border border-red-100">
             <Info className="w-5 h-5 text-red-500 shrink-0" />
             <p className="text-xs font-semibold text-red-600 leading-relaxed">
                {derived.errors[0]}
             </p>
          </div>
        ) : (
          <button
            disabled={submitting}
            onClick={onConfirm}
            className="w-full py-4.5 bg-pure-aqua text-white rounded-[24px] font-semibold text-sm uppercase tracking-widest shadow-xl shadow-pure-aqua/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
          >
            {submitting ? "Reserving..." : "Confirm Purchase"}
          </button>
        )}
      </motion.div>

      <QRScannerModal
        open={addTapOpen}
        onClose={() => setAddTapOpen(false)}
        onResult={handleAddTapScan}
        onError={handleAddTapError}
        title="Add Another Tap"
        description="Scan the QR code on the second tap to include it in this dispense session."
      />

      <Toast {...toastProps} />
    </motion.div>
  );
}
