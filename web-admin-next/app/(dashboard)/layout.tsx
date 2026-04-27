"use client";
import { useEffect } from "react";
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
  if (pathname === "/") return <>{children}</>;
  
  if (!isMenuAllowed(pathname)) {
    router.replace("/unauthorized");
    return null;
  }
  return <>{children}</>;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  useIdleTimeout();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

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
          <Sidebar />
          <div className="main-wrapper">
            <TopBar />
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
