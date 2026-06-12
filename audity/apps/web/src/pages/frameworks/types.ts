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
  deliveryMode?: string | null;
  contentClass?: string | null;
  officialStandardTextIncluded?: boolean;
  officialControlCatalogueIncluded?: boolean;
  licensedContentImportSupported?: boolean;
  redistributionNote?: string | null;
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
  audityObjective?: string | null;
  defaultWeight?: number;
  readinessPassCondition?: string | null;
  gapCondition?: string | null;
  reportMapping?: Record<string, unknown> | null;
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
  sourceQuestionId?: string;
  controlId: string;
  code: string;
  title: string;
  description: string | null;
  question: string;
  answerScale?: string;
  minimumEvidenceExpected?: number;
  preferredEvidenceTypes?: string[];
  gapTrigger?: string | null;
  defaultWeight?: number;
  readinessPassCondition?: string | null;
  gapCondition?: string | null;
  evidenceGap?: boolean;
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
