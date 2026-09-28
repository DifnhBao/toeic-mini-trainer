export type QuestionGroup = {
  id?: string;
  groupType?: string;
  passageText: string | null;
  audioUrl: string | null;
  imageUrl: string | null;
};

export type TestQuestion = {
  id: string;
  part: number;
  content: string | null;
  options: Record<string, string>;
  group: QuestionGroup | null;
};

export type TestData = {
  id: string;
  title: string;
  createdAt: string;
  questions: Array<{ orderIndex: number; question: TestQuestion }>;
};

export type AttemptSummary = {
  id: string;
  title: string;
  testId: string;
  score: number;
  total: number;
  accuracy: number;
  durationSeconds: number | null;
  completedAt: string;
};

export type AttemptAnswer = {
  id: string;
  selectedOption: string | null;
  isCorrect: boolean;
  aiExplanation: {
    explanationText: string;
    suggestedSkills: unknown;
  } | null;
  question: TestQuestion & { correctAnswer: string };
};

export type AttemptDetail = {
  id: string;
  score: number | null;
  total: number;
  durationSeconds: number | null;
  completedAt: string;
  test: { id: string; title: string };
  userAnswers: AttemptAnswer[];
};

export type ProgressSummary = {
  totalTests: number;
  overallAccuracy: number;
  totalAnswered: number;
  partStats: Array<{ part: number; total: number; accuracy: number }>;
};

export type CoachTurn = {
  role: 'user' | 'assistant';
  content: string;
};

export type CoachResponse = {
  answer: string;
};

export type ExplainResponse = {
  explanation: {
    explanationText: string;
    suggestedSkills: unknown;
    cached: boolean;
  };
};

export type AssetKind = 'DOCUMENT' | 'AUDIO' | 'IMAGE';

export type UploadIntent = {
  asset: { id: string; kind: AssetKind; status: 'PENDING' };
  upload: {
    method: 'PUT';
    url: string;
    headers: Record<string, string>;
    expiresIn: number;
  };
};

export type ExtractedQuestionGroup = {
  group?: {
    groupType: 'AUDIO' | 'TEXT' | 'MIXED';
    passageText?: string | null;
    audioAssetId?: string | null;
    imageAssetId?: string | null;
  } | null;
  questions: Array<{
    part: number;
    content?: string | null;
    options: Record<string, string>;
    correctAnswer: string;
  }>;
};

export type IngestionJob = {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'IMPORTING' | 'IMPORTED' | 'FAILED';
  importStalled?: boolean;
  attemptCount: number;
  errorCode: string | null;
  result: { data: ExtractedQuestionGroup[] } | null;
  importedAt: string | null;
};
