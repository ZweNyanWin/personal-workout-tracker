/** Rest is stored as whole seconds, but coaches enter and read minutes. */
export function restMinutes(seconds: number): number {
  return Number((seconds / 60).toFixed(2));
}

export function restSeconds(minutes: number): number {
  return Math.round(minutes * 60);
}

export function formatRestMinutes(seconds: number): string {
  return `${restMinutes(seconds)} min`;
}
