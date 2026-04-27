"use client";
import React, { createContext, useContext, useState, useCallback, useRef } from "react";

type ToastType = "success" | "error" | "info" | "warning";
interface Toast { id: number; type: ToastType; msg: string; }
interface ToastContextType { toast: (msg: string, type?: ToastType) => void; }

const ToastCtx = createContext<ToastContextType>({ toast: () => {} });

export function useToast() { return useContext(ToastCtx); }

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const toast = useCallback((msg: string, type: ToastType = "success") => {
    const id = ++idRef.current;
    setToasts((p) => [...p, { id, type, msg }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4000);
  }, []);

  const icons: Record<string, string> = {
    success: "fa-check-circle", error: "fa-times-circle",
    info: "fa-info-circle", warning: "fa-exclamation-triangle",
  };

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <i className={`fas ${icons[t.type]} toast-icon`} />
            <span className="toast-msg">{t.msg}</span>
            <button className="toast-close" onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))}>&times;</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
