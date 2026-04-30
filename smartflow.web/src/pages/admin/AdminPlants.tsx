import { useCallback, useEffect, useRef, useState } from "react";
import { Paper, Chip, Skeleton, Button } from "@mui/material";
import { Server, Droplets, Clock, QrCode, Printer } from "lucide-react";
import QRCode from "qrcode";
import { getAdminPlants, type AdminPlant, type AdminPlantTap } from "../../lib/adminApi";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function TapQRDialog({
  plant,
  tap,
  onClose,
}: {
  plant: AdminPlant;
  tap: AdminPlantTap;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const qrData = JSON.stringify({ plant_id: plant.id, tap_id: tap.id });
    QRCode.toCanvas(canvasRef.current, qrData, { width: 200, margin: 2 });
  }, [plant.id, tap.id]);

  const handlePrint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>QR — ${tap.label}</title>
      <style>
        body { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; font-family:sans-serif; }
        img { width:250px; height:250px; }
        h2 { margin:16px 0 4px; }
        p { color:#666; margin:0; }
      </style></head><body>
        <img src="${dataUrl}" />
        <h2>${tap.label}</h2>
        <p>${plant.name}</p>
        <script>setTimeout(()=>window.print(),300)</script>
      </body></html>
    `);
    win.document.close();
  }, [plant.name, tap.label]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <Paper
        elevation={3}
        sx={{ borderRadius: 3, p: 3, maxWidth: 320 }}
        className="text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-ink-900 mb-1">{tap.label}</h3>
        <p className="text-sm text-slate-500 mb-4">{plant.name}</p>
        <canvas ref={canvasRef} className="mx-auto mb-4" />
        <div className="flex gap-2">
          <Button
            variant="outlined"
            size="small"
            onClick={onClose}
            sx={{ flex: 1, textTransform: "none" }}
          >
            Close
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={<Printer className="w-4 h-4" />}
            onClick={handlePrint}
            sx={{ flex: 1, textTransform: "none" }}
          >
            Print
          </Button>
        </div>
      </Paper>
    </div>
  );
}

export default function AdminPlants() {
  const [plants, setPlants] = useState<AdminPlant[]>([]);
  const [loading, setLoading] = useState(true);
  const [qrTarget, setQrTarget] = useState<{
    plant: AdminPlant;
    tap: AdminPlantTap;
  } | null>(null);

  useEffect(() => {
    getAdminPlants()
      .then(setPlants)
      .finally(() => setLoading(false));
  }, []);

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
      <div>
        <h1 className="text-xl font-bold text-ink-900 mb-1">Plants</h1>
        <p className="text-sm text-ink-300">Water plant infrastructure</p>
      </div>

      {plants.map((plant) => (
        <Paper
          key={plant.id}
          elevation={0}
          sx={{ border: "1px solid #EDF0F2", borderRadius: 3 }}
          className="p-6"
        >
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold text-ink-900">{plant.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <Chip
                  label={plant.status}
                  size="small"
                  color={plant.status === "operational" ? "success" : "default"}
                  sx={{ textTransform: "capitalize", fontSize: "0.7rem" }}
                />
                <Chip
                  label={plant.is_active ? "Active" : "Inactive"}
                  size="small"
                  variant="outlined"
                  color={plant.is_active ? "success" : "default"}
                  sx={{ fontSize: "0.7rem" }}
                />
              </div>
            </div>
          </div>

          {/* Controller */}
          {plant.controller && (
            <div className="mb-5">
              <h3 className="text-xs font-semibold text-ink-300 uppercase tracking-wider mb-2">
                Controller
              </h3>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-ink-100/30">
                <Server className="w-5 h-5 text-ink-300" />
                <div>
                  <span className="text-sm font-medium text-ink-900">
                    {plant.controller.name}
                  </span>
                  <Chip
                    label={plant.controller.status}
                    size="small"
                    color={
                      plant.controller.status === "operational"
                        ? "success"
                        : "default"
                    }
                    sx={{
                      ml: 1.5,
                      textTransform: "capitalize",
                      fontSize: "0.65rem",
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Taps */}
          <div className="mb-5">
            <h3 className="text-xs font-semibold text-ink-300 uppercase tracking-wider mb-2">
              Taps ({plant.taps.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {plant.taps.map((tap) => (
                <div
                  key={tap.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-ink-100"
                >
                  <Droplets
                    className={`w-5 h-5 ${tap.is_available ? "text-aqua-600" : "text-ink-300"}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink-900">
                      {tap.label}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Chip
                        label={tap.status}
                        size="small"
                        color={
                          tap.status === "operational" ? "success" : "default"
                        }
                        sx={{ fontSize: "0.6rem", height: 18 }}
                      />
                      <Chip
                        label={tap.is_available ? "Available" : "In use"}
                        size="small"
                        variant="outlined"
                        color={tap.is_available ? "primary" : "default"}
                        sx={{ fontSize: "0.6rem", height: 18 }}
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => setQrTarget({ plant, tap })}
                    className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                    title="Show QR Code"
                  >
                    <QrCode className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Operating Hours */}
          {plant.operating_hours?.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-ink-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Operating Hours
              </h3>
              <div className="grid grid-cols-7 gap-2">
                {plant.operating_hours.map((h) => (
                  <div
                    key={h.day_of_week}
                    className={`text-center py-2 px-1 rounded-lg text-xs ${
                      h.is_closed
                        ? "bg-slate-50 text-slate-400"
                        : "bg-sky-50 text-sky-700"
                    }`}
                  >
                    <div className="font-semibold mb-0.5">
                      {DAY_NAMES[h.day_of_week]}
                    </div>
                    {h.is_closed ? (
                      <div>Closed</div>
                    ) : (
                      <div>
                        {h.opening_time}
                        <br />
                        {h.closing_time}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Paper>
      ))}

      {plants.length === 0 && (
        <Paper
          elevation={0}
          sx={{ border: "1px solid #EDF0F2", borderRadius: 3 }}
          className="p-10 text-center text-ink-300"
        >
          No plants configured.
        </Paper>
      )}

      {qrTarget && (
        <TapQRDialog
          plant={qrTarget.plant}
          tap={qrTarget.tap}
          onClose={() => setQrTarget(null)}
        />
      )}
    </div>
  );
}
