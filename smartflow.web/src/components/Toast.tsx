import { Alert, Slide, Snackbar } from "@mui/material";
import type { SlideProps } from "@mui/material";

export type ToastSeverity = "error" | "warning" | "info" | "success";

export type ToastProps = {
  open: boolean;
  message: string;
  severity: ToastSeverity;
  onClose: () => void;
  duration?: number;
};

function SlideUp(props: SlideProps) {
  return <Slide {...props} direction="up" />;
}

export default function Toast({ open, message, severity, onClose, duration = 4000 }: ToastProps) {
  return (
    <Snackbar
      open={open}
      autoHideDuration={duration}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      slots={{ transition: SlideUp }}
    >
      <Alert
        onClose={onClose}
        severity={severity}
        variant="filled"
        sx={{
          width: "100%",
          borderRadius: 2,
          boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
          alignItems: "center",
        }}
      >
        {message}
      </Alert>
    </Snackbar>
  );
}
