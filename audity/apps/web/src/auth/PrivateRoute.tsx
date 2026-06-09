import { Navigate, Outlet, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./AuthProvider";

export function PrivateRoute() {
  const { accessToken, isLoading, user } = useAuth();
  const location = useLocation();
  if (isLoading) {
    return <div className="min-h-screen bg-audity-app p-6 text-sm text-audity-secondary">Loading session...</div>;
  }
  if (!accessToken) return <Navigate to="/login" replace />;
  if (user && !user.alphaAcceptedAt && location.pathname !== "/alpha-disclaimer") {
    return <Navigate to="/alpha-disclaimer" replace />;
  }
  return <Outlet />;
}

export function RequirePermission({
  children,
  instanceAdminOnly = false,
  permission
}: {
  children: ReactNode;
  instanceAdminOnly?: boolean;
  permission?: string;
}) {
  const { isLoading, user } = useAuth();
  if (isLoading) {
    return <div className="min-h-screen bg-audity-app p-6 text-sm text-audity-secondary">Loading session...</div>;
  }
  if (instanceAdminOnly && user?.role !== "Instance Admin") {
    return <Navigate to="/dashboard" replace />;
  }
  if (permission && !user?.permissions.includes(permission)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
