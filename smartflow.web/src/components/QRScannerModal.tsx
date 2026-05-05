import { Dialog, DialogContent, DialogTitle, IconButton, Typography } from "@mui/material";
import { X } from "lucide-react";
import CameraScanner from "./CameraScanner";

type Props = {
  open: boolean;
  onClose: () => void;
  onResult: (text: string) => void;
  onError: (msg: string) => void;
  title?: string;
  description?: string;
};

export default function QRScannerModal({
  open,
  onClose,
  onResult,
  onError,
  title = "Scan QR Code",
  description = "Hold your phone steady over the QR code on the water tap label."
}: Props) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: { 
          sx: { 
            borderRadius: '28px',
            overflow: 'hidden'
          } 
        }
      }}
    >
      <DialogTitle
        sx={{ 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "space-between", 
          pb: 1, 
          px: 3, 
          pt: 3 
        }}
      >
        <span className="text-lg font-semibold text-slate-900 tracking-tight">{title}</span>
        <IconButton 
          size="small" 
          onClick={onClose} 
          sx={{ bgcolor: '#F8FAFC', '&:hover': { bgcolor: '#F1F5F9' } }}
        >
          <X size={18} className="text-slate-500" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pb: 4, px: 3 }}>
        <Typography 
          variant="body2" 
          sx={{ 
            color: "text.secondary", 
            mb: 3, 
            fontWeight: 500,
            lineHeight: 1.6
          }}
        >
          {description}
        </Typography>
        <div className="rounded-[24px] overflow-hidden border-4 border-slate-50 shadow-inner bg-slate-100">
           {open && (
             <CameraScanner onResult={onResult} onError={onError} />
           )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
