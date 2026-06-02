export type Customer = {
  id: string;
  name: string;
  industry: string | null;
  regulatoryContext: string | null;
  criticalSystems: string[];
  businessCriticality: string | null;
  status: string;
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
  language: string;
  targetDate: string | null;
  status: string;
  scope: AssessmentScope;
};
