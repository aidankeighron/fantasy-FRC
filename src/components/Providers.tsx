"use client";

import { AuthProvider } from "@/context/AuthContext";
import { ToastProvider } from "@/components/Toast";
import { ConfirmProvider } from "@/components/ConfirmDialog";

export default function Providers({ children }: { children: React.ReactNode }) {
  console.log("[Providers] rendering");
  return (
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          {children}
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
