import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Snackbar, Alert, type AlertColor } from "@mui/material";

type Toast = { message: string; severity: AlertColor; key: number };

type ToastContextValue = {
  showToast: (message: string, severity?: AlertColor) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let globalShowToast: ToastContextValue["showToast"] | null = null;

export function fireGlobalToast(message: string, severity: AlertColor = "error") {
  globalShowToast?.(message, severity);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((message: string, severity: AlertColor = "error") => {
    setToast({ message, severity, key: Date.now() });
  }, []);

  globalShowToast = showToast;

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Snackbar
        open={!!toast}
        autoHideDuration={5000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        key={toast?.key}
      >
        {toast ? (
          <Alert
            onClose={() => setToast(null)}
            severity={toast.severity}
            variant="filled"
            sx={{ width: "100%", minWidth: 300 }}
          >
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </ToastContext.Provider>
  );
}

export function useGlobalToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useGlobalToast must be used within ToastProvider");
  return ctx;
}
