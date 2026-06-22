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
const AiSettingsPage = lazy(() => import("./pages/admin/AiSettingsPage").then((m) => ({ default: m.AiSettingsPage })));
const AdminArchivePage = lazy(() => import("./pages/admin/AdminArchivePage").then((m) => ({ default: m.AdminArchivePage })));
const AdminFrameworkThresholdsPage = lazy(() => import("./pages/admin/AdminFrameworkThresholdsPage").then((m) => ({ default: m.AdminFrameworkThresholdsPage })));
const FrameworkImportReviewPage = lazy(() => import("./pages/admin/FrameworkImportReviewPage").then((m) => ({ default: m.FrameworkImportReviewPage })));
const AlphaDisclaimerPage = lazy(() => import("./pages/AlphaDisclaimerPage").then((m) => ({ default: m.AlphaDisclaimerPage })));
const AuditCenterPage = lazy(() => import("./pages/audit/AuditCenterPage").then((m) => ({ default: m.AuditCenterPage })));
const CustomerAuditCenterPage = lazy(() => import("./pages/customers/CustomerAuditCenterPage").then((m) => ({ default: m.CustomerAuditCenterPage })));
const CustomerDetailLegacyPage = lazy(() => import("./pages/customers/CustomerDetailPage").then((m) => ({ default: m.CustomerDetailPage })));
const CustomerListPage = lazy(() => import("./pages/customers/CustomerListPage").then((m) => ({ default: m.CustomerListPage })));
const ArchivePage = lazy(() => import("./pages/customers/ArchivePage").then((m) => ({ default: m.ArchivePage })));
const PlanPhasePage = lazy(() => import("./pages/customers/phases/PlanPhasePage").then((m) => ({ default: m.PlanPhasePage })));
const ControlsPhasePage = lazy(() => import("./pages/customers/phases/ControlsPhasePage").then((m) => ({ default: m.ControlsPhasePage })));
const FindingsPhasePage = lazy(() => import("./pages/customers/phases/FindingsPhasePage").then((m) => ({ default: m.FindingsPhasePage })));
const ReportPhasePage = lazy(() => import("./pages/customers/phases/ReportPhasePage").then((m) => ({ default: m.ReportPhasePage })));
const InboxPage = lazy(() => import("./pages/InboxPage").then((m) => ({ default: m.InboxPage })));
const RedirectAuditCenter = lazy(() => import("./pages/RedirectAuditCenter").then((m) => ({ default: m.RedirectAuditCenter })));
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
              <Route path="/inbox" element={<LazyRoute><InboxPage /></LazyRoute>} />
              <Route path="/manual" element={<LazyRoute><ManualPage /></LazyRoute>} />
              <Route path="/customers" element={<LazyRoute><CustomerListPage /></LazyRoute>} />
              <Route path="/customers/my" element={<LazyRoute><CustomerListPage mode="my" /></LazyRoute>} />
              <Route path="/customers/shared" element={<LazyRoute><CustomerListPage mode="shared" /></LazyRoute>} />
              <Route path="/customers/archive" element={<LazyRoute><ArchivePage /></LazyRoute>} />
              <Route path="/customers/:id" element={<LazyRoute><CustomerAuditCenterPage /></LazyRoute>} />
              <Route path="/customers/:id/plan" element={<LazyRoute><PlanPhasePage /></LazyRoute>} />
              <Route path="/customers/:id/controls" element={<LazyRoute><ControlsPhasePage /></LazyRoute>} />
              <Route path="/customers/:id/findings" element={<LazyRoute><FindingsPhasePage /></LazyRoute>} />
              <Route path="/customers/:id/report" element={<LazyRoute><ReportPhasePage /></LazyRoute>} />
              <Route path="/customers/:id/legacy" element={<LazyRoute><CustomerDetailLegacyPage /></LazyRoute>} />
              <Route path="/user-settings" element={<LazyRoute><UserSettingsPage /></LazyRoute>} />
              <Route path="/assessments/:id/questions" element={<LazyRoute><GuidedQuestionsPage /></LazyRoute>} />
              <Route path="/assessments/:id/audit-center" element={<LazyRoute><RedirectAuditCenter /></LazyRoute>} />
              <Route path="/assessments/:id/audit-center-legacy" element={<LazyRoute><AuditCenterPage /></LazyRoute>} />
              <Route path="/assessments/:id/workflow" element={<LazyRoute><AssessmentWorkflowPage /></LazyRoute>} />
              <Route path="/assessments/:id/assets" element={<LazyRoute><AssessmentAssetsPage /></LazyRoute>} />
            </Route>
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<Navigate to="/admin/activity" replace />} />
              <Route path="/admin/activity" element={<RequirePermission permission="activitylog.view"><LazyRoute><AdminDashboardPage section="activity" /></LazyRoute></RequirePermission>} />
              <Route path="/admin/audit" element={<RequirePermission permission="auditlog.view"><LazyRoute><AdminDashboardPage section="audit" /></LazyRoute></RequirePermission>} />
              <Route path="/admin/users" element={<RequirePermission permission="roles.manage"><LazyRoute><AdminDashboardPage section="users" /></LazyRoute></RequirePermission>} />
              <Route path="/admin/frameworks" element={<RequirePermission permission="assessment.view"><LazyRoute><FrameworkLibraryPage /></LazyRoute></RequirePermission>} />
              <Route path="/admin/frameworks/thresholds" element={<RequirePermission permission="settings.manage"><LazyRoute><AdminFrameworkThresholdsPage /></LazyRoute></RequirePermission>} />
              <Route path="/admin/branding" element={<RequirePermission permission="branding.manage"><LazyRoute><AdminDashboardPage section="branding" /></LazyRoute></RequirePermission>} />
              <Route path="/admin/email" element={<RequirePermission permission="email.manage"><LazyRoute><AdminDashboardPage section="email" /></LazyRoute></RequirePermission>} />
              <Route path="/admin/connectors" element={<RequirePermission permission="connectors.manage"><LazyRoute><ConnectorAdminPage /></LazyRoute></RequirePermission>} />
              <Route path="/admin/ai" element={<RequirePermission permission="settings.manage"><LazyRoute><AiSettingsPage /></LazyRoute></RequirePermission>} />
              <Route path="/admin/frameworks/imports/:importId" element={<RequirePermission permission="settings.manage"><LazyRoute><FrameworkImportReviewPage /></LazyRoute></RequirePermission>} />
              <Route path="/admin/workbench" element={<RequirePermission permission="settings.manage"><LazyRoute><WorkbenchPage /></LazyRoute></RequirePermission>} />
              <Route path="/admin/system" element={<RequirePermission permission="settings.manage"><LazyRoute><AdminDashboardPage section="system" /></LazyRoute></RequirePermission>} />
              <Route path="/admin/backup" element={<RequirePermission instanceAdminOnly><LazyRoute><AdminDashboardPage section="backup" /></LazyRoute></RequirePermission>} />
              <Route path="/admin/archive" element={<RequirePermission permission="archive.approve"><LazyRoute><AdminArchivePage /></LazyRoute></RequirePermission>} />
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
