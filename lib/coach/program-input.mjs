// Aligned with coaching_drafts.brief in migration 016. Chat has separate limits.
export const PROGRAM_BRIEF_LIMIT = 64000;
export const PROGRAM_REQUEST_BYTES = 512000;

/** Preserve whole explicit week sections and shared preamble, including units.
 * Headings identify source data; they do not override the requested schedule. */
export function writtenProgramWeeks(brief) {
  const headings = [...brief.matchAll(/^[\t ]*(?:#{1,6}[\t ]+)?(?:\*\*)?WEEK[\t ]+#?[\t ]*(\d{1,2})\b[^\r\n]*/gim)];
  if (headings.length < 2) return null;
  const seen = new Set();
  for (const heading of headings) {
    const number = Number(heading[1]);
    if (number < 1 || number > 52 || seen.has(number)) throw new Error("Give each written week one unique heading between Week 1 and Week 52.");
    seen.add(number);
  }
  return { preamble: brief.slice(0, headings[0].index), weeks: headings.map((heading, index) => ({
    number: Number(heading[1]), text: brief.slice(heading.index, headings[index + 1]?.index ?? brief.length),
  })) };
}

/** Never cut a prescription into a character prefix. Unwritten weeks and
 * explicit cross-week/global directives retain the complete source document. */
export function programBriefForWeek(brief, number) {
  const source = writtenProgramWeeks(brief);
  const current = source?.weeks.find(week => week.number === number);
  if (!current) return brief;
  // "two sets each" at a section's end followed by "WEEK 2" is not an
  // instruction for every week. Do not join that heading to the prior clause.
  if (/\b(?:all|every|each)[\t ]+weeks?\b|\bthroughout\b|\b(?:same|repeat|as)\b.{0,35}\bweek\s*\d/i.test(source.weeks.map(week => week.text).join("\n"))) return brief;
  return source.preamble + current.text;
}
