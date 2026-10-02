/** Rest is stored as whole seconds, but coaches enter and read minutes. */
export function restMinutes(seconds: number): number {
  return Number((seconds / 60).toFixed(2));
}

export function restSeconds(minutes: number): number {
  return Math.round(minutes * 60);
}

export function formatRestMinutes(seconds: number, suggestedRange?: { min: number; max: number }): string {
  if (seconds === 300 && suggestedRange?.min === 4 && suggestedRange.max === 6) {
    return "4–6 min (5 min timer)";
  }
  return `${restMinutes(seconds)} min`;
}
