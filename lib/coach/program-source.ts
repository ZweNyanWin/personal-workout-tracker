import type { WorkflowProgramDraft } from "./workflow-schema.ts";
import { extractTrainingConstraints, trainingWeekProblems } from "./training-constraints.mjs";

/** Keep the prior saved content as recovery, but don't force incompatible gym
 * prescriptions into a request with new explicit equipment/ability facts. */
export function compatibleGenerationSource(
  previous: WorkflowProgramDraft | undefined,
  brief: string,
  trainingContext: string,
  catalog: { name: string; equipment?: string | null }[],
) {
  if (!previous) return undefined;
  const constraints = extractTrainingConstraints(brief, trainingContext);
  if ((constraints.equipmentRestricted || constraints.excludedExercises.length || constraints.noCompetitionLifts)
    && previous.weeks.some((week) => trainingWeekProblems(week, constraints, catalog).length)) return undefined;
  return previous.weeks;
}
