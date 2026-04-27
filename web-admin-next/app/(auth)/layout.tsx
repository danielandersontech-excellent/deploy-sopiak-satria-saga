"use client";
import { AppSettingsProvider } from "@/hooks/useSettings";
import { ToastProvider } from "@/hooks/useToast";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppSettingsProvider>
      <ToastProvider>
        {children}
      </ToastProvider>
    </AppSettingsProvider>
  );
}
