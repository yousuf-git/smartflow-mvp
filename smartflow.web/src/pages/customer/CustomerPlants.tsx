import { useEffect, useState } from "react";
import { Paper, CircularProgress, TextField, InputAdornment, Dialog, DialogTitle, DialogContent, IconButton } from "@mui/material";
import { MapPin, Search, Droplets, X, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import MobilePageHeader from "../../components/MobilePageHeader";
import {
  getCustomerPlants,
  type CustomerPlant,
} from "../../lib/customerApi";
import { formatTime12h } from "../../lib/time";

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
      <div className="flex items-center justify-center h-screen bg-white">
        <CircularProgress sx={{ color: "#00A3FF" }} />
      </div>
    );
  }

  const filtered = plants.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.city.toLowerCase().includes(search.toLowerCase()) ||
    p.area.toLowerCase().includes(search.toLowerCase()),
  );

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 15, opacity: 0 },
    visible: { y: 0, opacity: 1 },
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="relative min-h-screen pb-10 overflow-x-hidden"
    >
      {/* Subtle Background Accent */}
      <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-slate-50 to-transparent -z-10" />

      <div className="px-5 pt-8">
        <motion.div variants={itemVariants}>
          <MobilePageHeader icon={MapPin} title="Water Plants" subtitle="Available taps in your area" />
        </motion.div>

        {/* Search Bar - Clean & Minimal */}
        <motion.div variants={itemVariants} className="mb-6">
          <TextField
            fullWidth
            placeholder="Search plants..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search className="w-4.5 h-4.5 text-slate-400" />
                  </InputAdornment>
                ),
                sx: {
                  borderRadius: '16px',
                  bgcolor: '#F8FAFC',
                  border: '1px solid #F1F5F9',
                  '& fieldset': { border: 'none' },
                  '&:hover': { bgcolor: '#F1F5F9' },
                  fontSize: '0.9rem',
                  fontWeight: 500
                }
              },
            }}
          />
        </motion.div>

        {filtered.length === 0 ? (
          <motion.div variants={itemVariants} className="py-20 text-center">
            <p className="text-slate-400 font-medium text-sm">No plants found matching your search</p>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {filtered.map((plant) => (
              <motion.div key={plant.id} variants={itemVariants}>
                <Paper
                  elevation={0}
                  className="bg-white border border-slate-100 rounded-[24px] p-5 shadow-sm active:scale-[0.98] transition-transform"
                >
                  {/* Card Top: Info & Availability */}
                  <div className="flex justify-between items-start mb-5">
                    <div className="flex gap-4 min-w-0">
                      <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center shrink-0">
                        <MapPin className="w-5.5 h-5.5 text-pure-aqua" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-slate-900 leading-tight truncate">{plant.name}</h3>
                        <p className="text-xs font-medium text-slate-400 mt-1 truncate">
                          {[plant.area, plant.city].filter(Boolean).join(", ")}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                       <div className="flex items-center gap-1 text-pure-aqua">
                          <Droplets className="w-3.5 h-3.5" />
                          <span className="text-sm font-semibold">{plant.available_taps}/{plant.tap_count}</span>
                       </div>
                       <span className="text-[10px] font-medium text-slate-300 uppercase tracking-widest mt-0.5">Available</span>
                    </div>
                  </div>

                  {/* Taps Section */}
                  {plant.taps.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-5">
                      {plant.taps.map((tap) => {
                        const busy = tap.is_busy || !tap.is_available;
                        const maintenance = tap.status !== "operational";

                        let dotColor = "bg-emerald-400";
                        if (maintenance) dotColor = "bg-red-400";
                        else if (busy) dotColor = "bg-amber-400";

                        return (
                          <div
                            key={tap.id}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100/50"
                          >
                             <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                             <span className="text-[11px] font-medium text-slate-600">{tap.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <div className={`w-2 h-2 rounded-full ${plant.status === "operational" ? "bg-emerald-400" : "bg-amber-400"}`} />
                       <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-tight">{plant.status}</span>
                    </div>
                    <button
                      onClick={() => setSchedulePlant(plant)}
                      className="flex items-center gap-1 text-xs font-semibold text-pure-aqua py-1"
                    >
                       View Operating Hours <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </Paper>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Schedule Modal - Simplified & Clean */}
      <Dialog
        open={!!schedulePlant}
        onClose={() => setSchedulePlant(null)}
        fullWidth
        maxWidth="xs"
        slotProps={{
          paper: {
            sx: { borderRadius: '24px', p: 0.5, overflow: 'hidden' }
          }
        }}
      >
        <DialogTitle sx={{ p: 3, pb: 2 }}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 leading-none mb-1.5">Operating Hours</h2>
              <p className="text-xs font-medium text-slate-400">{schedulePlant?.name}</p>
            </div>
            <IconButton
              size="small"
              onClick={() => setSchedulePlant(null)}
              sx={{ bgcolor: '#F8FAFC' }}
            >
              <X className="w-4 h-4 text-slate-400" />
            </IconButton>
          </div>
        </DialogTitle>
        <DialogContent sx={{ p: 3, pt: 1 }}>
          <div className="space-y-1.5 mt-2">
            {DAY_NAMES.map((day, dayIndex) => {
              const slots = schedulePlant?.operating_hours.filter((h) => h.day_of_week === dayIndex) ?? [];
              const isToday = new Date().getDay() === dayIndex;

              return (
                <div
                  key={day}
                  className={`flex items-center justify-between p-3.5 rounded-2xl border ${isToday ? 'bg-pure-aqua/[0.03] border-pure-aqua/10' : 'bg-white border-transparent'}`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-[13px] font-semibold w-8 ${isToday ? 'text-pure-aqua' : 'text-slate-900'}`}>{day}</span>
                    {isToday && <span className="text-[10px] font-semibold text-pure-aqua uppercase bg-pure-aqua/10 px-1.5 py-0.5 rounded-md">Today</span>}
                  </div>

                  {slots.length === 0 ? (
                    <span className="text-xs font-medium text-slate-300">No schedule</span>
                  ) : (
                    <div className="text-right">
                      {slots.map((slot) => (
                        <div key={`${slot.day_of_week}-${slot.opening_time}`} className="flex items-center gap-2">
                          <span className={`text-xs font-semibold ${slot.is_closed ? "text-slate-300" : "text-slate-600"}`}>
                             {slot.is_closed ? "Closed" : `${formatTime12h(slot.opening_time)} — ${formatTime12h(slot.closing_time)}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button
            onClick={() => setSchedulePlant(null)}
            className="w-full mt-6 py-3.5 rounded-2xl bg-pure-aqua text-white text-sm font-semibold shadow-lg shadow-pure-aqua/20 active:scale-[0.98] transition-all"
          >
            Done
          </button>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
