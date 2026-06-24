import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useApi } from "../api/client";

type CustomerContextValue = {
  customerLabel: string;
  customerId: string;
  assessmentId: string;
  setCustomerLabel: (label: string) => void;
  setAssessmentId: (id: string) => void;
};

const CustomerContext = createContext<CustomerContextValue | null>(null);

const STORAGE_KEY = "audity_current_customer_label";

export function CustomerContextProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const location = useLocation();
  const [customerLabel, setCustomerLabelState] = useState<string>(() => window.localStorage.getItem(STORAGE_KEY) ?? "");
  const [customerId, setCustomerId] = useState<string>("");
  const [assessmentId, setAssessmentIdState] = useState<string>("");

  function setCustomerLabel(next: string) {
    setCustomerLabelState(next);
    if (next) {
      window.localStorage.setItem(STORAGE_KEY, next);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }

  function setAssessmentId(next: string) {
    setAssessmentIdState(next);
  }

  useEffect(() => {
    let cancelled = false;
    // Match /customers/:id as well as the tabbed audit views /customers/:id/<tab>;
    // without the optional trailing segment the phase tabs fell through to the
    // "else" branch and wiped the customer/audit context (so the sidebar lost it).
    const customerMatch = location.pathname.match(/^\/customers\/([0-9a-f-]{36})(?:\/|$)/i);
    const assessmentMatch = location.pathname.match(/^\/assessments\/([0-9a-f-]{36})\//i);

    if (customerMatch) {
      const nextCustomerId = customerMatch[1];
      setCustomerId(nextCustomerId);
      // The active audit on a tab view is carried in ?audit=; reflect it so the
      // sidebar shows the selected audit's navigation.
      setAssessmentIdState(new URLSearchParams(location.search).get("audit") ?? "");
      void api<{ customer: { name: string } }>(`/api/customers/${nextCustomerId}`)
        .then((payload) => {
          if (!cancelled) setCustomerLabel(payload.customer.name);
        })
        .catch(() => {
          if (!cancelled) setCustomerLabel("");
        });
    } else if (assessmentMatch) {
      const nextAssessmentId = assessmentMatch[1];
      setAssessmentIdState(nextAssessmentId);
      void api<{ assessment: { customerId: string } }>(`/api/assessments/${nextAssessmentId}`)
        .then((assessmentPayload) => {
          if (cancelled) return null;
          setCustomerId(assessmentPayload.assessment.customerId);
          return api<{ customer: { name: string } }>(`/api/customers/${assessmentPayload.assessment.customerId}`);
        })
        .then((customerPayload) => {
          if (!cancelled && customerPayload) setCustomerLabel(customerPayload.customer.name);
        })
        .catch(() => {
          if (!cancelled) {
            setCustomerLabel("");
            setCustomerId("");
          }
        });
    } else {
      setCustomerLabel("");
      setCustomerId("");
      setAssessmentIdState("");
    }

    return () => {
      cancelled = true;
    };
  }, [api, location.pathname, location.search]);

  const value = useMemo<CustomerContextValue>(() => ({
    customerLabel,
    customerId,
    assessmentId,
    setCustomerLabel,
    setAssessmentId
  }), [customerLabel, customerId, assessmentId]);

  return <CustomerContext.Provider value={value}>{children}</CustomerContext.Provider>;
}

export function useCustomerContext(): CustomerContextValue {
  const ctx = useContext(CustomerContext);
  if (!ctx) {
    throw new Error("useCustomerContext must be used within a CustomerContextProvider");
  }
  return ctx;
}
