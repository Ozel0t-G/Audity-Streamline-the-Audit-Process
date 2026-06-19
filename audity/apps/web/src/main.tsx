import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { PrivateRoute, RequirePermission } from "./auth/PrivateRoute";
import { AdminLayout, AppLayout } from "./components/AppLayout";
import { ConfirmProvider, PageSkeleton, ToastProvider } from "./components/ui";
import { LoginPage } from "./pages/LoginPage";
import { SetupPage } from "./pages/SetupPage";
import "./styles.css";

const DashboardPage = lazy(() => import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const ManualPage = lazy(() => import("./pages/ManualPage").then((m) => ({ default: m.ManualPage })));
const UserSettingsPage = lazy(() => import("./pages/UserSettingsPage").then((m) => ({ default: m.UserSettingsPage })));
const WorkbenchPage = lazy(() => import("./pages/WorkbenchPage").then((m) => ({ default: m.WorkbenchPage })));
const AdminDashboardPage = lazy(() => import("./pages/admin/AdminDashboardPage").then((m) => ({ default: m.AdminDashboardPage })));
const ConnectorAdminPage = lazy(() => import("./pages/admin/ConnectorAdminPage").then((m) => ({ default: m.ConnectorAdminPage })));
const AlphaDisclaimerPage = lazy(() => import("./pages/AlphaDisclaimerPage").then((m) => ({ default: m.AlphaDisclaimerPage })));
const AuditCenterPage = lazy(() => import("./pages/audit/AuditCenterPage").then((m) => ({ default: m.AuditCenterPage })));
const CustomerDetailPage = lazy(() => import("./pages/customers/CustomerDetailPage").then((m) => ({ default: m.CustomerDetailPage })));
const CustomerListPage = lazy(() => import("./pages/customers/CustomerListPage").then((m) => ({ default: m.CustomerListPage })));
const FrameworkLibraryPage = lazy(() => import("./pages/frameworks/FrameworkLibraryPage").then((m) => ({ default: m.FrameworkLibraryPage })));
const GuidedQuestionsPage = lazy(() => import("./pages/frameworks/GuidedQuestionsPage").then((m) => ({ default: m.GuidedQuestionsPage })));
const AssessmentAssetsPage = lazy(() => import("./pages/reports/AssessmentAssetsPage").then((m) => ({ default: m.AssessmentAssetsPage })));
const AssessmentWorkflowPage = lazy(() => import("./pages/workflow/AssessmentWorkflowPage").then((m) => ({ default: m.AssessmentWorkflowPage })));

function LazyRoute({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageSkeleton cards={3} showTable />}>{children}</Suspense>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
       <ToastProvider>
        <ConfirmProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route element={<PrivateRoute />}>
            <Route path="/alpha-disclaimer" element={<LazyRoute><AlphaDisclaimerPage /></LazyRoute>} />
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<LazyRoute><DashboardPage /></LazyRoute>} />
              <Route path="/manual" element={<LazyRoute><ManualPage /></LazyRoute>} />
              <Route path="/customers" element={<LazyRoute><CustomerListPage /></LazyRoute>} />
              <Route path="/customers/my" element={<LazyRoute><CustomerListPage mode="my" /></LazyRoute>} />
              <Route path="/customers/shared" element={<LazyRoute><CustomerListPage mode="shared" /></LazyRoute>} />
              <Route path="/customers/:id" element={<LazyRoute><CustomerDetailPage /></LazyRoute>} />
              <Route path="/user-settings" element={<LazyRoute><UserSettingsPage /></LazyRoute>} />
              <Route path="/assessments/:id/questions" element={<LazyRoute><GuidedQuestionsPage /></LazyRoute>} />
              <Route path="/assessments/:id/audit-center" element={<LazyRoute><AuditCenterPage /></LazyRoute>} />
              <Route path="/assessments/:id/workflow" element={<LazyRoute><AssessmentWorkflowPage /></LazyRoute>} />
              <Route path="/assessments/:id/assets" element={<LazyRoute><AssessmentAssetsPage /></LazyRoute>} />
            </Route>
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<Navigate to="/admin/activity" replace />} />
              <Route path="/admin/activity" element={<RequirePermission permission="activitylog.view"><LazyRoute><AdminDashboardPage section="activity" /></LazyRoute></RequirePermission>} />
              <Route path="/admin/audit" element={<RequirePermission permission="auditlog.view"><LazyRoute><AdminDashboardPage section="audit" /></LazyRoute></RequirePermission>} />
              <Route path="/admin/users" element={<RequirePermission permission="roles.manage"><LazyRoute><AdminDashboardPage section="users" /></LazyRoute></RequirePermission>} />
              <Route path="/admin/frameworks" element={<RequirePermission permission="assessment.view"><LazyRoute><FrameworkLibraryPage /></LazyRoute></RequirePermission>} />
              <Route path="/admin/branding" element={<RequirePermission permission="branding.manage"><LazyRoute><AdminDashboardPage section="branding" /></LazyRoute></RequirePermission>} />
              <Route path="/admin/email" element={<RequirePermission permission="email.manage"><LazyRoute><AdminDashboardPage section="email" /></LazyRoute></RequirePermission>} />
              <Route path="/admin/connectors" element={<RequirePermission permission="connectors.manage"><LazyRoute><ConnectorAdminPage /></LazyRoute></RequirePermission>} />
              <Route path="/admin/workbench" element={<RequirePermission permission="settings.manage"><LazyRoute><WorkbenchPage /></LazyRoute></RequirePermission>} />
              <Route path="/admin/system" element={<RequirePermission permission="settings.manage"><LazyRoute><AdminDashboardPage section="system" /></LazyRoute></RequirePermission>} />
              <Route path="/admin/backup" element={<RequirePermission instanceAdminOnly><LazyRoute><AdminDashboardPage section="backup" /></LazyRoute></RequirePermission>} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </ConfirmProvider>
       </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
