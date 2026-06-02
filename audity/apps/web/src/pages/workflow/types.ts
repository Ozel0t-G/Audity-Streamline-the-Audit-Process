export type Finding = {
  id: string;
  assessmentId: string;
  assessmentQuestionId: string | null;
  frameworkControlId: string | null;
  controlCode: string | null;
  controlTitle: string | null;
  question: string | null;
  score: number | null;
  title: string;
  status: string;
  priority: string | null;
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
  findingTitle: string | null;
};

export type RoadmapItem = {
  id: string;
  assessmentId: string;
  riskId: string | null;
  phase: string;
  action: string;
  owner: string | null;
  dueDate: string | null;
  effortEstimate: string | null;
  status: string;
  sourceRiskRating: string | null;
  riskTitle: string | null;
};
