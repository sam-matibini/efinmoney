import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type EfmToastType = "success" | "error" | "info";

type ToastItem = { id: string; type: EfmToastType; message: string };

type ToastContextValue = {
  push: (type: EfmToastType, message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_TOASTS = 3;
const DISMISS_MS = 3000;

export function EfmToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((type: EfmToastType, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((current) => [...current, { id, type, message }].slice(-MAX_TOASTS));
    window.setTimeout(() => dismiss(id), DISMISS_MS);
  }, [dismiss]);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="efm-toast-stack" aria-live="polite" aria-relevant="additions">
        {toasts.map((toast) => (
          <div key={toast.id} className={`efm-toast efm-toast-${toast.type}`} role="status">
            <p>{toast.message}</p>
            <button type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss notification">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useEfmToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useEfmToast must be used within EfmToastProvider");
  }
  return context;
}
