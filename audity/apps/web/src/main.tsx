import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { PrivateRoute } from "./auth/PrivateRoute";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { CustomerDetailPage } from "./pages/customers/CustomerDetailPage";
import { CustomerListPage } from "./pages/customers/CustomerListPage";
import { FrameworkLibraryPage } from "./pages/frameworks/FrameworkLibraryPage";
import { GuidedQuestionsPage } from "./pages/frameworks/GuidedQuestionsPage";
import { AssessmentWorkflowPage } from "./pages/workflow/AssessmentWorkflowPage";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<PrivateRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/customers" element={<CustomerListPage />} />
            <Route path="/customers/:id" element={<CustomerDetailPage />} />
            <Route path="/frameworks" element={<FrameworkLibraryPage />} />
            <Route path="/assessments/:id/questions" element={<GuidedQuestionsPage />} />
            <Route path="/assessments/:id/workflow" element={<AssessmentWorkflowPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
