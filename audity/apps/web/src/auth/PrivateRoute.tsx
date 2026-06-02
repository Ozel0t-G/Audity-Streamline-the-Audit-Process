import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export function PrivateRoute() {
  const { accessToken } = useAuth();
  return accessToken ? <Outlet /> : <Navigate to="/login" replace />;
}
