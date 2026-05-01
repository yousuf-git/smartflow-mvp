import { useEffect, useState } from "react";
import { Paper, CircularProgress, Chip, TextField, InputAdornment, Button, Dialog, DialogTitle, DialogContent, IconButton } from "@mui/material";
import { MapPin, Search, Clock, Droplets, CalendarDays, X } from "lucide-react";
import MobilePageHeader from "../../components/MobilePageHeader";
import {
  getCustomerPlants,
  type CustomerPlant,
} from "../../lib/customerApi";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CustomerPlants() {
  const [plants, setPlants] = useState<CustomerPlant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [schedulePlant, setSchedulePlant] = useState<CustomerPlant | null>(null);

  useEffect(() => {
    getCustomerPlants()
      .then(setPlants)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <CircularProgress />
      </div>
    );
  }

  const filtered = plants.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.city.toLowerCase().includes(search.toLowerCase()) ||
    p.area.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="px-4 pt-6">
      <MobilePageHeader icon={MapPin} title="Water Plants" subtitle="Find an available tap" />

      <TextField
        fullWidth
        size="small"
        placeholder="Search plants..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 3 }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <Search className="w-4 h-4 text-slate-400" />
              </InputAdornment>
            ),
          },
        }}
      />

      {filtered.length === 0 ? (
        <p className="text-center text-slate-400 py-10">No plants found</p>
      ) : (
        <div className="space-y-4">
          {filtered.map((plant) => (
            <Paper
              key={plant.id}
              elevation={0}
              sx={{ borderRadius: 3, overflow: "hidden" }}
              className="border border-slate-100"
            >
              {/* Header */}
              <div className="px-4 pt-4 pb-3 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-sky-50 flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-sky-500" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-ink-900">{plant.name}</h3>
                    {(plant.area || plant.city) && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {[plant.area, plant.city, plant.province].filter(Boolean).join(", ")}
                      </p>
                    )}
                    <Chip
                      label={plant.status}
                      size="small"
                      sx={{
                        mt: 0.5, fontWeight: 500, fontSize: "0.7rem", height: 22,
                        bgcolor: plant.status === "operational" ? "#ecfdf5" : "#fef3c7",
                        color: plant.status === "operational" ? "#059669" : "#d97706",
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Tap info */}
              <div className="px-4 pb-3 flex gap-4">
                <div className="flex items-center gap-1.5 text-sm text-slate-600">
                  <Droplets className="w-3.5 h-3.5 text-sky-400" />
                  <span>{plant.available_taps}/{plant.tap_count} taps available</span>
                </div>
              </div>

              {/* Individual taps */}
              {plant.taps.length > 0 && (
                <div className="px-4 pb-3 flex flex-wrap gap-2">
                  {plant.taps.map((tap) => {
                    const busy = tap.is_busy || !tap.is_available;
                    const maintenance = tap.status !== "operational";
                    return (
                      <Chip
                        key={tap.id}
                        label={`${tap.label}${maintenance ? " (maint.)" : busy ? " (busy)" : ""}`}
                        size="small"
                        variant="outlined"
                        sx={{
                          fontSize: "0.7rem",
                          borderColor: maintenance ? "#fca5a5" : busy ? "#fbbf24" : "#86efac",
                          color: maintenance ? "#dc2626" : busy ? "#d97706" : "#16a34a",
                          bgcolor: maintenance ? "#fef2f2" : busy ? "#fffbeb" : "#f0fdf4",
                        }}
                      />
                    );
                  })}
                </div>
              )}

              {/* Operating Hours */}
              {plant.operating_hours.length > 0 && (
                <div className="px-4 pb-4">
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<Clock className="w-3.5 h-3.5" />}
                    onClick={() => setSchedulePlant(plant)}
                    sx={{ textTransform: "none", borderRadius: 2 }}
                  >
                    View schedule
                  </Button>
                </div>
              )}
            </Paper>
          ))}
        </div>
      )}

      <Dialog open={!!schedulePlant} onClose={() => setSchedulePlant(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700, pr: 6 }}>
          {schedulePlant?.name} Schedule
          <IconButton
            size="small"
            onClick={() => setSchedulePlant(null)}
            sx={{ position: "absolute", right: 12, top: 12 }}
          >
            <X className="w-4 h-4" />
          </IconButton>
        </DialogTitle>
        <DialogContent className="!pt-1 !pb-4">
          <div className="space-y-2">
            {DAY_NAMES.map((day, dayIndex) => {
              const slots = schedulePlant?.operating_hours.filter((h) => h.day_of_week === dayIndex) ?? [];
              return (
                <div key={day} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <CalendarDays className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-semibold text-ink-900">{day}</span>
                  </div>
                  {slots.length === 0 ? (
                    <p className="text-xs text-slate-400">No schedule set</p>
                  ) : (
                    <div className="space-y-1">
                      {slots.map((slot) => (
                        <div key={`${slot.day_of_week}-${slot.opening_time}-${slot.closing_time}`} className={`rounded-lg px-3 py-2 text-sm ${slot.is_closed ? "bg-slate-50 text-slate-500" : "bg-sky-50 text-sky-700"}`}>
                          {slot.is_closed ? "Closed" : `${slot.opening_time} - ${slot.closing_time}`}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
