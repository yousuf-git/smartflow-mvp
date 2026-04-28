import { useCallback, useState } from "react";
import type { ToastProps, ToastSeverity } from "../components/Toast";

type ToastState = { open: boolean; message: string; severity: ToastSeverity };

const CLOSED: ToastState = { open: false, message: "", severity: "info" };

export function useToast() {
  const [state, setState] = useState<ToastState>(CLOSED);

  const showToast = useCallback((message: string, severity: ToastSeverity = "info") => {
    setState({ open: true, message, severity });
  }, []);

  const hideToast = useCallback(() => {
    setState((prev) => ({ ...prev, open: false }));
  }, []);

  const toastProps: ToastProps = {
    open: state.open,
    message: state.message,
    severity: state.severity,
    onClose: hideToast,
  };

  return { toastProps, showToast };
}
