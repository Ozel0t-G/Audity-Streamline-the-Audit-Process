export type Finding = {
  id: string;
  assessmentId: string;
  assessmentQuestionId: string | null;
  frameworkControlId: string | null;
  controlCode: string | null;
  controlTitle: string | null;
  controlDescription: string | null;
  question: string | null;
  score: number | null;
  title: string;
  status: string;
  priority: string | null;
  severityImpact: number | null;
  severityLikelihood: number | null;
  observation: string | null;
  recommendation: string | null;
  sourceExplanation: string | null;
  acceptedRisk: boolean;
  mappings: Array<{ controlId: string; code: string; title: string; mappingType: string }>;
};

export type Risk = {
  id: string;
  assessmentId: string;
  findingId: string | null;
  title: string;
  likelihood: number;
  impact: number;
  riskScore: number;
  rating: "Low" | "Medium" | "High" | "Critical";
  treatmentOption: string | null;
  owner: string | null;
  treatmentPlan: string | null;
  dueDate: string | null;
  status: string;
  draft: boolean;
  sourceType: string | null;
  sourceAssessmentQuestionId: string | null;
  sourceFrameworkControlId: string | null;
  sourceScore: number | null;
  sourceGeneratedAt: string | null;
  sourceExplanation: string | null;
  acceptanceReason: string | null;
  acceptedBy: string | null;
  acceptedAt: string | null;
  acceptanceExpiresAt: string | null;
  findingTitle: string | null;
};

export type RoadmapItem = {
  id: string;
  assessmentId: string;
  riskId: string | null;
  phase: string;
  phaseStartDate: string | null;
  phaseEndDate: string | null;
  action: string;
  owner: string | null;
  dueDate: string | null;
  effortEstimate: string | null;
  status: string;
  sourceRiskRating: string | null;
  riskTitle: string | null;
};

export type HistoryEvent = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userEmail: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
};

export type ReviewComment = {
  id: string;
  assessmentId: string;
  entityType: string;
  entityId: string;
  userEmail: string | null;
  comment: string;
  resolvedAt: string | null;
  createdAt: string;
};
