import { LinearProgress, Paper, Typography } from "@mui/material";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import type { Me } from "../lib/api";

type Props = { me: Me };

export default function WalletHeader({ me }: Props) {
  const usedLitres = me.daily_limit_litres - me.daily_remaining_litres;
  const usedPct =
    me.daily_limit_litres > 0
      ? Math.min(100, (usedLitres / me.daily_limit_litres) * 100)
      : 0;

  return (
    <Paper
      elevation={0}
      sx={{ border: "1px solid #EDF0F2", borderRadius: 3 }}
      className="p-5 sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        {/* Balance */}
        <div>
          <Typography
            variant="overline"
            sx={{ color: "text.secondary", letterSpacing: 2 }}
          >
            Hello, {me.first_name}
          </Typography>
          <div className="flex items-baseline gap-2 mt-1">
            <AccountBalanceWalletOutlinedIcon color="primary" fontSize="small" />
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {me.currency} {me.balance.toFixed(2)}
            </Typography>
          </div>
          {me.hold_balance > 0 && (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {me.currency} {me.hold_balance.toFixed(2)} reserved in active session
            </Typography>
          )}
        </div>

        {/* Daily allowance */}
        <div style={{ minWidth: 140 }} className="text-right">
          <Typography
            variant="overline"
            sx={{ color: "text.secondary", letterSpacing: 2, display: "block" }}
          >
            Daily allowance
          </Typography>

          {/* Progress bar: filled = used portion */}
          <LinearProgress
            variant="determinate"
            value={usedPct}
            sx={{
              mt: 1,
              mb: 0.75,
              height: 6,
              borderRadius: 4,
              bgcolor: "#E8F6FB",
              "& .MuiLinearProgress-bar": { bgcolor: "#0F8CB0", borderRadius: 4 },
            }}
          />

          <div className="flex items-baseline justify-end gap-1">
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {me.daily_remaining_litres.toFixed(1)} L
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              of {me.daily_limit_litres.toFixed(1)} L
            </Typography>
          </div>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {usedLitres > 0
              ? `${usedLitres.toFixed(1)} L used today`
              : "none used today"}
          </Typography>
        </div>
      </div>
    </Paper>
  );
}
