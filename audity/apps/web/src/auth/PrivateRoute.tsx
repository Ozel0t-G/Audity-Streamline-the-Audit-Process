import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export function PrivateRoute() {
  const { accessToken, user } = useAuth();
  const location = useLocation();
  if (!accessToken) return <Navigate to="/login" replace />;
  if (user && !user.alphaAcceptedAt && location.pathname !== "/alpha-disclaimer") {
    return <Navigate to="/alpha-disclaimer" replace />;
  }
  return <Outlet />;
}
