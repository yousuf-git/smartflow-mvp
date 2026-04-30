import { useEffect, useState } from "react";
import { Paper, Chip, Skeleton } from "@mui/material";
import { getSystemLogs, type SystemLogRow } from "../../lib/adminApi";

const LEVELS = ["", "info", "warning", "error", "critical"];
const LEVEL_COLORS: Record<string, "default" | "info" | "warning" | "error"> = {
  info: "info",
  warning: "warning",
  error: "error",
  critical: "error",
};

export default function AdminSystemLogs() {
  const [logs, setLogs] = useState<SystemLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState("");

  const load = (level?: string) => {
    setLoading(true);
    getSystemLogs(level || undefined, 200)
      .then(setLogs)
      .finally(() => setLoading(false));
  };

  useEffect(() => load(levelFilter), [levelFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-900 mb-1">System Logs</h1>
        <p className="text-sm text-ink-300">Audit trail and system events</p>
      </div>

      <div className="flex gap-1.5">
        {LEVELS.map((l) => (
          <Chip
            key={l}
            label={l || "All"}
            size="small"
            variant={levelFilter === l ? "filled" : "outlined"}
            color={levelFilter === l ? (LEVEL_COLORS[l] ?? "primary") : "default"}
            onClick={() => setLevelFilter(l)}
            sx={{ textTransform: "capitalize", fontWeight: 500 }}
          />
        ))}
      </div>

      <Paper elevation={0} sx={{ border: "1px solid #EDF0F2", borderRadius: 3, overflow: "hidden" }}>
        {loading ? (
          <div className="p-6 space-y-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} variant="rounded" height={40} />)}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-ink-100/30">
                  <th className="text-left px-5 py-3 font-semibold text-ink-700 w-20">Level</th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700">Message</th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700 hidden md:table-cell">Source</th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700 hidden lg:table-cell">User</th>
                  <th className="text-left px-5 py-3 font-semibold text-ink-700 whitespace-nowrap">Time</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-ink-100/50 hover:bg-ink-100/20 transition-colors">
                    <td className="px-5 py-3">
                      <Chip label={log.level} size="small" color={LEVEL_COLORS[log.level] ?? "default"} variant="outlined" sx={{ fontSize: "0.65rem", minWidth: 60 }} />
                    </td>
                    <td className="px-5 py-3 text-ink-900 max-w-md truncate">{log.message}</td>
                    <td className="px-5 py-3 text-ink-300 hidden md:table-cell font-mono text-xs">{log.source}</td>
                    <td className="px-5 py-3 text-ink-300 hidden lg:table-cell">{log.user_id ?? "—"}</td>
                    <td className="px-5 py-3 text-ink-300 whitespace-nowrap text-xs">{new Date(log.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {logs.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-ink-300">No logs found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Paper>
    </div>
  );
}
