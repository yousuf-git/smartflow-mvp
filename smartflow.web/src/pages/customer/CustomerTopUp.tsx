import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, Paper, TextField, ToggleButton, ToggleButtonGroup } from "@mui/material";
import { CreditCard, Wallet } from "lucide-react";
import MobilePageHeader from "../../components/MobilePageHeader";
import { topUpWallet, type TopUpMethod } from "../../lib/customerApi";

export default function CustomerTopUp() {
  const navigate = useNavigate();
  const [amount, setAmount] = useState(500);
  const [method, setMethod] = useState<TopUpMethod>("Jazzcash");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (amount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setSubmitting(true);
    try {
      await topUpWallet(amount, method);
      navigate("/app/transactions");
    } catch {
      setError("Top-up failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="px-4 pt-6">
      <MobilePageHeader icon={Wallet} title="Top Up" subtitle="Add dummy wallet balance" />
      <Paper elevation={0} sx={{ p: 3, borderRadius: 3 }} className="border border-slate-100">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            fullWidth
            slotProps={{ htmlInput: { min: 1, step: 1 } }}
          />
          <ToggleButtonGroup
            value={method}
            exclusive
            fullWidth
            onChange={(_, value) => value && setMethod(value)}
            color="primary"
          >
            <ToggleButton value="Jazzcash" sx={{ textTransform: "none", gap: 1 }}>
              <CreditCard className="w-4 h-4" /> Jazzcash
            </ToggleButton>
            <ToggleButton value="Easypaisa" sx={{ textTransform: "none", gap: 1 }}>
              <CreditCard className="w-4 h-4" /> Easypaisa
            </ToggleButton>
          </ToggleButtonGroup>
          <Button type="submit" variant="contained" fullWidth disabled={submitting} sx={{ textTransform: "none", py: 1.2, borderRadius: 2 }}>
            {submitting ? "Confirming..." : "Confirm"}
          </Button>
        </form>
      </Paper>
    </div>
  );
}
