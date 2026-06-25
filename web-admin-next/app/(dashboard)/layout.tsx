"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";
import { AppSettingsProvider } from "@/hooks/useSettings";
import { ToastProvider } from "@/hooks/useToast";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { isMenuAllowed } from "@/lib/api";
import PWAUpdatePrompt from "@/components/PWAUpdatePrompt";
import InstallPrompt from "@/components/InstallPrompt";
import PanicAlertBanner from "@/components/PanicAlertBanner";

function RoleGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // Dashboard root "/" is allowed for all authenticated users
  const allowed = pathname === "/" || isMenuAllowed(pathname);
  // [6-3] Redirect dipindah ke useEffect (bukan saat render) agar tidak memicu
  // anti-pattern React "Cannot update a component while rendering". Proteksi
  // tetap: user tak berwenang diarahkan ke /unauthorized, render null sementara.
  useEffect(() => {
    if (!allowed) router.replace("/unauthorized");
  }, [allowed, router]);
  if (!allowed) return null;
  return <>{children}</>;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useIdleTimeout();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  // Mobile drawer: auto-close after navigating to a new page.
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-inner">
          <div className="spinner-ring" />
          <span>Memuat sistem...</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <AppSettingsProvider>
      <ToastProvider>
        <PanicAlertBanner />
        <div className="app-layout">
          {sidebarOpen && (
            <div
              className="sidebar-backdrop"
              onClick={() => setSidebarOpen(false)}
            />
          )}
          <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          <div className="main-wrapper">
            <TopBar onMenuClick={() => setSidebarOpen(true)} />
            <main className="main-content">
              <RoleGate>{children}</RoleGate>
            </main>
          </div>
        </div>
        <PWAUpdatePrompt />
        <InstallPrompt />
      </ToastProvider>
    </AppSettingsProvider>
  );
}
