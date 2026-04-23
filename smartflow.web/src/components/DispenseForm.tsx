import { useState, type FormEvent } from "react";
import {
  Button,
  InputAdornment,
  Paper,
  TextField,
  Typography,
  CircularProgress,
} from "@mui/material";
import WaterDropOutlinedIcon from "@mui/icons-material/WaterDropOutlined";

const MAX_LITRES = Number(import.meta.env.VITE_MAX_LITRES ?? 100);

type Props = {
  submitting: boolean;
  onSubmit: (litres: number) => void;
};

export default function DispenseForm({ submitting, onSubmit }: Props) {
  const [value, setValue] = useState<string>("20");
  const [touched, setTouched] = useState(false);

  const parsed = Number(value);
  const invalid =
    value.trim() === "" ||
    Number.isNaN(parsed) ||
    parsed <= 0 ||
    parsed > MAX_LITRES;

  const handleSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    setTouched(true);
    if (invalid || submitting) return;
    onSubmit(parsed);
  };

  return (
    <Paper
      elevation={0}
      className="p-6 sm:p-8 rounded-2xl border border-ink-100"
      sx={{ border: "1px solid #EDF0F2" }}
    >
      <Typography
        variant="overline"
        className="tracking-widest"
        sx={{ color: "text.secondary" }}
      >
        SmartFlow · V1
      </Typography>
      <Typography variant="h5" className="mt-1" sx={{ fontWeight: 600 }}>
        How many litres?
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mt: 1 }}>
        Enter the amount and start dispensing. The tap will confirm before any
        water flows.
      </Typography>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <TextField
          label="Litres"
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setTouched(true)}
          error={touched && invalid}
          helperText={
            touched && invalid
              ? `Enter a number between 1 and ${MAX_LITRES}.`
              : " "
          }
          disabled={submitting}
          fullWidth
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <WaterDropOutlinedIcon color="primary" />
                </InputAdornment>
              ),
              inputProps: { min: 1, max: MAX_LITRES, step: 1 },
            },
          }}
        />
        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={submitting || (touched && invalid)}
          startIcon={
            submitting ? (
              <CircularProgress size={18} color="inherit" />
            ) : undefined
          }
          sx={{ height: 52, fontWeight: 600, textTransform: "none" }}
        >
          {submitting ? "Waiting for tap…" : "Dispense"}
        </Button>
      </form>
    </Paper>
  );
}
