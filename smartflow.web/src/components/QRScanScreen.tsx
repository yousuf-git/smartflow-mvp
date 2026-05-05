import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Divider,
  Paper,
  Typography,
} from "@mui/material";
import { QrCode, ArrowLeft } from "lucide-react";
import QRScannerModal from "./QRScannerModal";
import Toast from "./Toast";
import { useToast } from "../lib/useToast";
import type { Catalogue, Plant, Tap } from "../lib/api";

type QRPayload = { plant_id: number; tap_id: number };

type Props = {
  catalogue: Catalogue | null;
  onScanned: (plant: Plant, tap: Tap) => void;
  onBypass: () => void;
};

export default function QRScanScreen({ catalogue, onScanned, onBypass }: Props) {
  const navigate = useNavigate();
  const [scanOpen, setScanOpen] = useState(false);
  const { toastProps, showToast } = useToast();

  const handleResult = useCallback(
    (text: string) => {
      setScanOpen(false);
      if (!catalogue) return;
      try {
        const payload = JSON.parse(text) as QRPayload;
        const plant = catalogue.plants.find((p) => p.id === payload.plant_id);
        if (!plant) {
          showToast("QR not recognised — wrong system or plant.", "error");
          return;
        }
        const tap = plant.taps.find((t) => t.id === payload.tap_id);
        if (!tap) {
          showToast("Tap not found on this plant.", "error");
          return;
        }
        onScanned(plant, tap);
      } catch {
        showToast("Invalid QR code format.", "error");
      }
    },
    [catalogue, onScanned, showToast],
  );

  const handleCameraError = useCallback(
    (msg: string) => {
      setScanOpen(false);
      showToast(`Camera unavailable: ${msg}`, "error");
    },
    [showToast],
  );

  return (
    <>
      <Paper
        elevation={0}
        sx={{ border: "1px solid #F1F5F9", borderRadius: '28px' }}
        className="p-8 sm:p-10 bg-white shadow-sm relative overflow-hidden"
      >
        {/* Navigation */}
        <div className="absolute top-6 left-6">
           <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-500 active:scale-90 transition-all"
           >
              <ArrowLeft className="w-5 h-5" />
           </button>
        </div>

        <div className="flex flex-col items-center gap-6 text-center pt-10">
          {/* Icon */}
          <div
            className="flex items-center justify-center rounded-3xl"
            style={{ width: 88, height: 88, background: "#F0F9FF" }}
          >
            <QrCode style={{ fontSize: 48, width: 48, height: 48 }} className="text-pure-aqua" />
          </div>

          {/* Headline */}
          <div>
            <Typography variant="h5" sx={{ fontWeight: 600, tracking: '-0.01em' }}>
              Start your fill
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: "text.secondary", mt: 1, maxWidth: 300, lineHeight: 1.6, fontWeight: 500 }}
            >
              Scan the QR code at your tap to automatically set up your session.
            </Typography>
          </div>

          {/* Primary action */}
          <Button
            variant="contained"
            size="large"
            startIcon={<QrCode size={20} />}
            onClick={() => setScanOpen(true)}
            disabled={!catalogue}
            sx={{
              height: 56,
              fontWeight: 600,
              textTransform: "none",
              minWidth: 220,
              borderRadius: 4,
              bgcolor: '#00A3FF',
              boxShadow: '0 8px 16px -4px rgba(0, 163, 255, 0.25)',
              '&:hover': { bgcolor: '#008BD9' }
            }}
          >
            Scan QR Code
          </Button>

          <Divider sx={{ width: "100%" }}>
            <Typography variant="caption" sx={{ color: "text.disabled", px: 1, fontWeight: 700, textTransform: 'uppercase' }}>
              or
            </Typography>
          </Divider>

          {/* Secondary actions */}
          <div className="flex flex-col gap-2 items-center w-full">
            <Button
              variant="outlined"
              size="medium"
              onClick={onBypass}
              disabled={!catalogue}
              sx={{
                textTransform: "none",
                minWidth: 220,
                borderRadius: 4,
                borderWidth: 1,
                fontWeight: 600,
                borderColor: '#E2E8F0',
                color: 'text.secondary',
                '&:hover': { borderWidth: 1, borderColor: '#CBD5E1', bgcolor: '#F8FAFC' }
              }}
            >
              Use Manual Selection
            </Button>
          </div>
        </div>
      </Paper>

      <QRScannerModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onResult={handleResult}
        onError={handleCameraError}
      />

      <Toast {...toastProps} />
    </>
  );
}
