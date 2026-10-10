export type InsightEvidence = 'none' | 'limited' | 'initial';
export type InsightTrend = {
  direction: 'up' | 'down' | 'stable' | 'insufficient';
  previousQuestions: number; recentQuestions: number;
  previousAccuracy: number | null; recentAccuracy: number | null;
  changePoints: number | null; repeatedQuestions: number;
};
export type PartInsight = {
  part: number; title: string; questions: number; correct: number; wrong: number; skipped: number;
  accuracy: number | null; evidence: InsightEvidence; availableQuestions: number | null;
  assessment: 'unseen' | 'collect_more' | 'focus' | 'consolidate' | 'maintain';
  trend: InsightTrend;
};
export type SkillInsight = {
  id: string; name: string; questions: number; correct: number; skipped: number;
  accuracy: number; needsPractice: boolean; evidence: 'limited' | 'initial'; parts: number[];
};
export type PracticeRecommendation = {
  kind: 'focus' | 'explore' | 'maintain'; part: number; count: number;
  title: string; reason: string; steps: string[];
};
export type LearningInsights = {
  version: 1; generatedAt: string;
  window: { from: string; to: string; days: 30; limited: boolean; attemptLimit: 100; answersPerAttemptLimit: 50 };
  summary: { attempts: number; answerEvents: number; uniqueQuestions: number; correct: number; wrong: number;
    skipped: number; accuracy: number | null; taggedQuestions: number };
  parts: PartInsight[]; skills: SkillInsight[]; recommendations: PracticeRecommendation[];
  method: { partMinimum: 20; skillMinimum: 10; trendMinimum: 10; practiceTarget: 70; distinctQuestionsOnly: true };
};
