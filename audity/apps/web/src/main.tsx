import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { PrivateRoute } from "./auth/PrivateRoute";
import { AdminLayout, AppLayout } from "./components/AppLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { AdminDashboardPage } from "./pages/admin/AdminDashboardPage";
import { CustomerDetailPage } from "./pages/customers/CustomerDetailPage";
import { CustomerListPage } from "./pages/customers/CustomerListPage";
import { FrameworkLibraryPage } from "./pages/frameworks/FrameworkLibraryPage";
import { GuidedQuestionsPage } from "./pages/frameworks/GuidedQuestionsPage";
import { AssessmentAssetsPage } from "./pages/reports/AssessmentAssetsPage";
import { AssessmentWorkflowPage } from "./pages/workflow/AssessmentWorkflowPage";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<PrivateRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/customers" element={<CustomerListPage />} />
              <Route path="/customers/:id" element={<CustomerDetailPage />} />
              <Route path="/assessments/:id/questions" element={<GuidedQuestionsPage />} />
              <Route path="/assessments/:id/workflow" element={<AssessmentWorkflowPage />} />
              <Route path="/assessments/:id/assets" element={<AssessmentAssetsPage />} />
            </Route>
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<Navigate to="/admin/activity" replace />} />
              <Route path="/admin/activity" element={<AdminDashboardPage section="activity" />} />
              <Route path="/admin/audit" element={<AdminDashboardPage section="audit" />} />
              <Route path="/admin/users" element={<AdminDashboardPage section="users" />} />
              <Route path="/admin/frameworks" element={<FrameworkLibraryPage />} />
              <Route path="/admin/branding" element={<AdminDashboardPage section="branding" />} />
              <Route path="/admin/email" element={<AdminDashboardPage section="email" />} />
              <Route path="/admin/backup" element={<AdminDashboardPage section="backup" />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
