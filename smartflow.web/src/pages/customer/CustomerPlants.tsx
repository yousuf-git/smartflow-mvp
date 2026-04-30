import { useEffect, useState } from "react";
import { Paper, CircularProgress, Chip, TextField, InputAdornment } from "@mui/material";
import { MapPin, Search, Clock, Droplets } from "lucide-react";
import {
  getCustomerPlants,
  type CustomerPlant,
} from "../../lib/customerApi";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CustomerPlants() {
  const [plants, setPlants] = useState<CustomerPlant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

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
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="px-4 pt-6">
      <h1 className="text-xl font-bold text-ink-900 mb-4">Water Plants</h1>

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
                    <h3 className="text-base font-semibold text-ink-900">
                      {plant.name}
                    </h3>
                    <Chip
                      label={plant.status}
                      size="small"
                      sx={{
                        mt: 0.5,
                        fontWeight: 500,
                        fontSize: "0.7rem",
                        height: 22,
                        bgcolor:
                          plant.status === "operational"
                            ? "#ecfdf5"
                            : "#fef3c7",
                        color:
                          plant.status === "operational"
                            ? "#059669"
                            : "#d97706",
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

              {/* Operating Hours */}
              {plant.operating_hours.length > 0 && (
                <div className="px-4 pb-4">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-2">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Operating Hours</span>
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {plant.operating_hours.map((h) => (
                      <div
                        key={h.day_of_week}
                        className={`text-center py-1.5 rounded-lg text-[10px] ${
                          h.is_closed
                            ? "bg-slate-50 text-slate-400"
                            : "bg-sky-50 text-sky-700"
                        }`}
                      >
                        <div className="font-semibold">
                          {DAY_NAMES[h.day_of_week]}
                        </div>
                        {h.is_closed ? (
                          <div>Off</div>
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
        </div>
      )}
    </div>
  );
}
