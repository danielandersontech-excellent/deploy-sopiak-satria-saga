"use client";
import { useEffect } from "react";
import { AppSettingsProvider } from "@/hooks/useSettings";
import { ToastProvider } from "@/hooks/useToast";
import { documentTitle } from "@/lib/pageTitles";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  // [Misi V3 / E] judul tab halaman login.
  useEffect(() => { document.title = documentTitle("/login"); }, []);
  return (
    <AppSettingsProvider>
      <ToastProvider>
        {children}
      </ToastProvider>
    </AppSettingsProvider>
  );
}
