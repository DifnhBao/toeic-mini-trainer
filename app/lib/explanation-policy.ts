export const EXPLANATION_PROMPT_VERSION = 1;
export const EXPLANATION_LOCALE = "vi";

export const hiddenExplanationSelection = {
  where: { status: "HIDDEN" as const, locale: EXPLANATION_LOCALE, promptVersion: EXPLANATION_PROMPT_VERSION },
  select: { contentRevision: true },
};

export function currentExplanationHidden(revision: number, hidden: ReadonlyArray<{ contentRevision: number }>) {
  return hidden.some(cache => cache.contentRevision === revision);
}
