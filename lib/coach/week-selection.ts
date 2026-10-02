/** Interpret week references without treating a range as only its first week. */
export function requestedProgramWeeks(question: string, available: number[]): number[] | null {
  if (/\b(?:all|every|each)\s+(?:the\s+)?weeks?\b|\b(?:full|entire)\s+(?:\d{1,2}[-\s]*)?week\s+(?:block|plan|program)\b/i.test(question)) {
    return available;
  }
  const requested = new Set<number>();
  let found = false;
  for (const match of question.matchAll(/\bweeks?\s+((?:\d{1,2}\s*(?:-|–|to|and|,)\s*)*\d{1,2})\b/gi)) {
    found = true;
    const group = match[1];
    for (const number of group.matchAll(/\d{1,2}/g)) requested.add(Number(number[0]));
    for (const range of group.matchAll(/(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})/gi)) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (end >= start && end - start <= 15) {
        for (let week = start; week <= end; week++) requested.add(week);
      }
    }
  }
  return found ? [...requested].sort((a, b) => a - b) : null;
}
