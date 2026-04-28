import { Paper, Typography } from "@mui/material";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import OpacityOutlinedIcon from "@mui/icons-material/OpacityOutlined";
import type { Me } from "../lib/api";

type Props = { me: Me };

export default function WalletHeader({ me }: Props) {
  return (
    <Paper
      elevation={0}
      sx={{ border: "1px solid #EDF0F2", borderRadius: 3 }}
      className="p-5 sm:p-6"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <Typography
            variant="overline"
            className="tracking-widest"
            sx={{ color: "text.secondary" }}
          >
            Hello, {me.first_name} · {me.customer_type}
          </Typography>
          <div className="flex items-baseline gap-2 mt-1">
            <AccountBalanceWalletOutlinedIcon color="primary" fontSize="small" />
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              {me.currency} {me.balance.toFixed(2)}
            </Typography>
            {me.hold_balance > 0 ? (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                · on hold {me.currency} {me.hold_balance.toFixed(2)}
              </Typography>
            ) : null}
          </div>
        </div>
        <div className="text-right">
          <Typography
            variant="overline"
            className="tracking-widest"
            sx={{ color: "text.secondary" }}
          >
            Today
          </Typography>
          <div className="flex items-baseline justify-end gap-1 mt-1">
            <OpacityOutlinedIcon color="primary" fontSize="small" />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {me.daily_remaining_litres.toFixed(1)} L
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              / {me.daily_limit_litres.toFixed(0)} L left
            </Typography>
          </div>
        </div>
      </div>
    </Paper>
  );
}
