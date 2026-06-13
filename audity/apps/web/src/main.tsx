import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { PrivateRoute, RequirePermission } from "./auth/PrivateRoute";
import { AdminLayout, AppLayout } from "./components/AppLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { ManualPage } from "./pages/ManualPage";
import { UserSettingsPage } from "./pages/UserSettingsPage";
import { WorkbenchPage } from "./pages/WorkbenchPage";
import { AdminDashboardPage } from "./pages/admin/AdminDashboardPage";
import { ConnectorAdminPage } from "./pages/admin/ConnectorAdminPage";
import { AlphaDisclaimerPage } from "./pages/AlphaDisclaimerPage";
import { AuditCenterPage } from "./pages/audit/AuditCenterPage";
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
            <Route path="/alpha-disclaimer" element={<AlphaDisclaimerPage />} />
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/manual" element={<ManualPage />} />
              <Route path="/customers" element={<CustomerListPage />} />
              <Route path="/customers/my" element={<CustomerListPage mode="my" />} />
              <Route path="/customers/shared" element={<CustomerListPage mode="shared" />} />
              <Route path="/customers/:id" element={<CustomerDetailPage />} />
              <Route path="/user-settings" element={<UserSettingsPage />} />
              <Route path="/assessments/:id/questions" element={<GuidedQuestionsPage />} />
              <Route path="/assessments/:id/audit-center" element={<AuditCenterPage />} />
              <Route path="/assessments/:id/workflow" element={<AssessmentWorkflowPage />} />
              <Route path="/assessments/:id/assets" element={<AssessmentAssetsPage />} />
            </Route>
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<Navigate to="/admin/activity" replace />} />
              <Route path="/admin/activity" element={<RequirePermission permission="activitylog.view"><AdminDashboardPage section="activity" /></RequirePermission>} />
              <Route path="/admin/audit" element={<RequirePermission permission="auditlog.view"><AdminDashboardPage section="audit" /></RequirePermission>} />
              <Route path="/admin/users" element={<RequirePermission permission="roles.manage"><AdminDashboardPage section="users" /></RequirePermission>} />
              <Route path="/admin/frameworks" element={<RequirePermission permission="assessment.view"><FrameworkLibraryPage /></RequirePermission>} />
              <Route path="/admin/branding" element={<RequirePermission permission="branding.manage"><AdminDashboardPage section="branding" /></RequirePermission>} />
              <Route path="/admin/email" element={<RequirePermission permission="email.manage"><AdminDashboardPage section="email" /></RequirePermission>} />
              <Route path="/admin/connectors" element={<RequirePermission permission="connectors.manage"><ConnectorAdminPage /></RequirePermission>} />
              <Route path="/admin/workbench" element={<RequirePermission permission="settings.manage"><WorkbenchPage /></RequirePermission>} />
              <Route path="/admin/system" element={<RequirePermission permission="settings.manage"><AdminDashboardPage section="system" /></RequirePermission>} />
              <Route path="/admin/backup" element={<RequirePermission instanceAdminOnly><AdminDashboardPage section="backup" /></RequirePermission>} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
