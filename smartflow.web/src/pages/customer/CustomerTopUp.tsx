import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, CircularProgress, TextField } from "@mui/material";
import { CreditCard, Wallet, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import MobilePageHeader from "../../components/MobilePageHeader";
import { topUpWallet, type TopUpMethod } from "../../lib/customerApi";

const PRESETS = [100, 500, 1000, 2000, 5000];

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

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemVariants = {
    hidden: { y: 15, opacity: 0 },
    visible: { y: 0, opacity: 1 }
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="relative min-h-screen pb-12 overflow-x-hidden"
    >
      <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-slate-50 to-transparent -z-10" />

      <div className="px-5 pt-8">
        <motion.div variants={itemVariants}>
          <MobilePageHeader icon={Wallet} title="Add Balance" subtitle="Top up your wallet credits" />
        </motion.div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <motion.div variants={itemVariants}>
              <Alert severity="error" sx={{ borderRadius: '16px', fontWeight: 600 }}>{error}</Alert>
            </motion.div>
          )}

          {/* Amount Section */}
          <motion.div variants={itemVariants} className="bg-white border border-slate-100 rounded-[32px] p-6 shadow-sm">
             <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.2em] ml-1 mb-4">Select Amount</p>

             <div className="mb-6">
                <TextField
                  fullWidth
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  placeholder="0.00"
                  slotProps={{
                    htmlInput: { min: 1, step: 1 },
                    input: {
                      startAdornment: <span className="text-xl font-bold text-slate-400 mr-2">Rs.</span>,
                      sx: {
                        borderRadius: '20px',
                        bgcolor: '#F8FAFC',
                        fontSize: '1.5rem',
                        fontWeight: 700,
                        '& fieldset': { border: 'none' }
                      }
                    }
                  }}
                />
             </div>

             <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setAmount(p)}
                    className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      amount === p
                        ? "bg-pure-aqua text-white shadow-md shadow-pure-aqua/20"
                        : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                    }`}
                  >
                    +{p}
                  </button>
                ))}
             </div>
          </motion.div>

          {/* Method Section */}
          <motion.div variants={itemVariants} className="space-y-3">
             <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.2em] ml-4">Payment Method</p>
             <div className="grid grid-cols-1 gap-3">
                {[
                  { id: 'Jazzcash', name: 'JazzCash', desc: 'Secure mobile payment' },
                  { id: 'Easypaisa', name: 'EasyPaisa', desc: 'Fast digital wallet' }
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethod(m.id as TopUpMethod)}
                    className={`flex items-center justify-between p-4 rounded-3xl border transition-all ${
                      method === m.id
                        ? "bg-white border-pure-aqua shadow-md"
                        : "bg-white border-slate-100 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                       <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${method === m.id ? 'bg-pure-aqua/10 text-pure-aqua' : 'bg-slate-50 text-slate-400'}`}>
                          <CreditCard className="w-6 h-6" />
                       </div>
                       <div className="text-left">
                          <p className="text-sm font-semibold text-slate-900">{m.name}</p>
                          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">{m.desc}</p>
                       </div>
                    </div>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${method === m.id ? 'border-pure-aqua bg-pure-aqua' : 'border-slate-100'}`}>
                       {method === m.id && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </button>
                ))}
             </div>
          </motion.div>

          {/* Submit Button */}
          <motion.div variants={itemVariants} className="pt-4">
             <button
                type="submit"
                disabled={submitting}
                className="w-full py-4.5 bg-pure-aqua text-white rounded-[24px] font-semibold text-sm uppercase tracking-widest shadow-xl shadow-pure-aqua/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
             >
                {submitting ? (
                  <CircularProgress size={20} color="inherit" />
                ) : (
                  <span className="flex items-center gap-2">Confirm Top Up <ChevronRight className="w-4.5 h-4.5" /></span>
                )}
             </button>
          </motion.div>
        </form>

        <motion.p variants={itemVariants} className="mt-8 text-center text-[10px] font-medium text-slate-400 px-8 leading-relaxed">
           This is a demonstration system. No real currency will be charged from your JazzCash or EasyPaisa account.
        </motion.p>
      </div>
    </motion.div>
  );
}
