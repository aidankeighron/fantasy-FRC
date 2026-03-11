"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import styles from "./ConfirmDialog.module.css";

interface ConfirmOptions {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}

interface DialogState {
  open: boolean;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
}

function ConfirmOverlay({ state, onResolve }: { state: DialogState; onResolve: (value: boolean) => void }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !state.open) return null;

  return createPortal(
    <div className={styles.overlay} onClick={() => onResolve(false)}>
      <div className={`glass-panel ${styles.dialog}`} onClick={(e) => e.stopPropagation()}>
        <p className={styles.message}>{state.message}</p>
        <div className={styles.actions}>
          <button className="btn-secondary" onClick={() => onResolve(false)}>
            {state.cancelLabel}
          </button>
          <button className="btn-primary" onClick={() => onResolve(true)}>
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DialogState>({
    open: false,
    message: "",
    confirmLabel: "Confirm",
    cancelLabel: "Cancel",
  });

  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm: ConfirmFn = useCallback((options) => {
    const opts = typeof options === "string" ? { message: options } : options;
    setState({
      open: true,
      message: opts.message,
      confirmLabel: opts.confirmLabel || "Confirm",
      cancelLabel: opts.cancelLabel || "Cancel",
    });
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const handleResolve = useCallback((value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setState((prev) => ({ ...prev, open: false }));
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmOverlay state={state} onResolve={handleResolve} />
    </ConfirmContext.Provider>
  );
}
