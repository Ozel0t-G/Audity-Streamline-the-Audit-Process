export type Customer = {
  id: string;
  name: string;
  industry: string | null;
  regulatoryContext: string | null;
  criticalSystems: string[];
  businessCriticality: string | null;
  status: string;
  createdByUserId?: string | null;
  createdByName?: string | null;
  createdByEmail?: string | null;
  sharedWith?: Array<{ id: string; name: string | null; email: string }>;
  selectedFrameworks?: Array<{ id: string; name: string; shortName: string | null }>;
  createdAt?: string;
  updatedAt?: string;
};

export type AssessmentScope = {
  inScopeSystems: string[];
  outOfScope: string[];
  businessProcesses: string[];
  regulatoryContext: string;
  assumptions: string;
  limitations: string;
  criticality: string;
};

export type Assessment = {
  id: string;
  customerId: string;
  type: string;
  audience: string | null;
  framework: string | null;
  frameworkId?: string | null;
  language: string;
  targetDate: string | null;
  status: string;
  scope: AssessmentScope;
};
