export type Framework = {
  id: string;
  name: string;
  shortName: string | null;
  version: string | null;
  sourceType: string | null;
  licenseStatus: string | null;
  distributedByAudity: boolean;
  statusLabel: "Built-in" | "Readiness Workflow Only" | "User License Required" | string | null;
  disclaimer: string | null;
  importedBy: string | null;
  importedAt: string | null;
  licenseConfirmed: boolean;
  controlCount: number;
};

export type FrameworkControl = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  question: string | null;
  evidenceExamples: string[];
  tags: string[];
};

export type FrameworkDomain = {
  id: string;
  name: string;
  description: string | null;
  controls: FrameworkControl[];
};

export type QuestionAnswer = {
  id: string;
  score: number | null;
  answerState: string;
  evidenceStatus: string;
  confidenceLevel: string;
  notes: string;
  updatedAt: string;
};

export type QuestionMapping = {
  controlId: string;
  code: string;
  title: string;
  framework: string | null;
  mappingType: string;
};

export type GuidedQuestion = {
  questionId: string;
  controlId: string;
  code: string;
  title: string;
  description: string | null;
  question: string;
  evidenceExamples: string[];
  mappings: QuestionMapping[];
  answer: QuestionAnswer | null;
};

export type QuestionDomain = {
  id: string;
  name: string;
  description: string | null;
  totalControls: number;
  answeredControls: number;
  coverage: number;
  questions: GuidedQuestion[];
};

export type AssessmentQuestionsPayload = {
  framework: Framework;
  coverage: {
    totalControls: number;
    answeredControls: number;
    percentage: number;
  };
  domains: QuestionDomain[];
};
