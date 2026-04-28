import { useCallback, useState } from "react";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Paper,
  Typography,
} from "@mui/material";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import CloseIcon from "@mui/icons-material/Close";
import QRCode from "qrcode";
import CameraScanner from "./CameraScanner";
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
  const [scanOpen, setScanOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
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

  const handlePrint = useCallback(async () => {
    if (!catalogue) return;
    const plant = catalogue.plants[0];
    const tap = plant?.taps[0];
    if (!plant || !tap) return;

    setPrinting(true);
    try {
      const payload: QRPayload = { plant_id: plant.id, tap_id: tap.id };
      const dataUrl = await QRCode.toDataURL(JSON.stringify(payload), {
        width: 300,
        margin: 2,
        color: { dark: "#111718", light: "#ffffff" },
      });

      const win = window.open("", "_blank", "width=450,height=600");
      if (!win) {
        showToast("Popup blocked — allow popups and try again.", "warning");
        return;
      }
      win.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>SmartFlow Test QR</title>
            <style>
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body { font-family: -apple-system, sans-serif; text-align: center; padding: 40px 32px; background: #fff; }
              h2 { font-size: 20px; font-weight: 700; color: #111718; margin-bottom: 4px; }
              .sub { font-size: 13px; color: #3A464C; margin-bottom: 28px; }
              img { display: block; margin: 0 auto 20px; border: 1px solid #EDF0F2; border-radius: 8px; padding: 8px; }
              .meta { font-size: 12px; color: #3A464C; line-height: 1.8; }
              .payload { font-size: 10px; color: #aaa; margin-top: 8px; font-family: monospace; }
              @media print { body { padding: 20px; } }
            </style>
          </head>
          <body>
            <h2>SmartFlow Test QR</h2>
            <p class="sub">Use this code to test QR scanning</p>
            <img src="${dataUrl}" width="240" height="240" />
            <div class="meta">
              <div><strong>Plant:</strong> ${plant.name} (ID: ${plant.id})</div>
              <div><strong>Tap:</strong> ${tap.label} (ID: ${tap.id})</div>
            </div>
            <div class="payload">${JSON.stringify(payload)}</div>
            <script>window.onload = function() { window.print(); }<\/script>
          </body>
        </html>
      `);
      win.document.close();
    } catch {
      showToast("Could not generate QR for printing.", "error");
    } finally {
      setPrinting(false);
    }
  }, [catalogue, showToast]);

  return (
    <>
      <Paper
        elevation={0}
        sx={{ border: "1px solid #EDF0F2", borderRadius: 3 }}
        className="p-8 sm:p-10"
      >
        <div className="flex flex-col items-center gap-6 text-center">
          {/* Brand */}
          <div>
            <Typography
              variant="overline"
              sx={{ color: "primary.main", fontWeight: 700, letterSpacing: 3 }}
            >
              SmartFlow
            </Typography>
          </div>

          {/* Icon */}
          <div
            className="flex items-center justify-center rounded-full"
            style={{ width: 88, height: 88, background: "#E8F6FB" }}
          >
            <QrCodeScannerIcon sx={{ fontSize: 48, color: "#0F8CB0" }} />
          </div>

          {/* Headline */}
          <div>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Start your fill
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: "text.secondary", mt: 1, maxWidth: 320, lineHeight: 1.6 }}
            >
              Scan the QR code at your tap. It tells the system which station
              you're at so your session is set up automatically.
            </Typography>
          </div>

          {/* Primary action */}
          <Button
            variant="contained"
            size="large"
            startIcon={<QrCodeScannerIcon />}
            onClick={() => setScanOpen(true)}
            disabled={!catalogue}
            sx={{
              height: 52,
              fontWeight: 600,
              textTransform: "none",
              minWidth: 200,
              borderRadius: 2,
            }}
          >
            Scan QR Code
          </Button>

          <Divider sx={{ width: "100%" }}>
            <Typography variant="caption" sx={{ color: "text.secondary", px: 1 }}>
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
              sx={{ textTransform: "none", minWidth: 200, borderRadius: 2 }}
            >
              Use defaults
            </Button>

            <Button
              variant="text"
              size="small"
              startIcon={printing ? <CircularProgress size={14} /> : <PrintOutlinedIcon />}
              onClick={() => void handlePrint()}
              disabled={!catalogue || printing}
              sx={{ textTransform: "none", color: "text.secondary" }}
            >
              Print test QR
            </Button>
          </div>
        </div>
      </Paper>

      {/* Camera dialog */}
      <Dialog
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle
          sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 1 }}
        >
          <span>Scan QR Code</span>
          <IconButton size="small" onClick={() => setScanOpen(false)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pb: 3 }}>
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
            Hold your phone steady over the QR code on the water tap label.
          </Typography>
          {scanOpen && (
            <CameraScanner onResult={handleResult} onError={handleCameraError} />
          )}
        </DialogContent>
      </Dialog>

      <Toast {...toastProps} />
    </>
  );
}
