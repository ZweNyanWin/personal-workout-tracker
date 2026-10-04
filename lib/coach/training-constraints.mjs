import { isMainCompound } from "./exercise-rules.mjs";

const normalize = (text) => String(text ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const equipmentWords = [
  ["dumbbell", /\b(?:dumbbells?|db)\b/i], ["bands", /\b(?:bands?|elastic)\b/i],
  ["barbell", /\bbarbells?\b/i], ["kettlebell", /\bkettlebells?\b/i],
  ["cable", /\bcables?\b/i], ["machine", /\b(?:machines?|pec[- ]?deck|leg[- ]?press|smith)\b/i],
  ["parallettes", /\bparallettes?\b/i], ["rings", /\b(?:gymnastic\s+)?rings?\b/i],
  ["pullup-bar", /\b(?:pull[- ]?up|chin[- ]?up)\s+bars?\b/i],
  ["bench", /\b(?:weight|workout|adjustable|flat|incline)\s+bench\b/i],
];
const mentionedEquipment = (text) => equipmentWords.filter(([, pattern]) => pattern.test(text)).map(([kind]) => kind);
const noEquipment = /\b(?:no\s+(?:exercise\s+)?equipment|without\s+(?:any\s+)?equipment|body[- ]?weight\s+only)\b/i;
function affirmativeInventory(text) {
  // Commas, "and" and "or" continue a negated equipment list. Only a new
  // clause or an explicit affirmative correction ends its scope; decimal
  // weights do not end a sentence. Keep this bounded to stated inventories.
  return String(text ?? "").split(/[;\n]|\.(?=\s|$)|\b(?:but|instead)\b|(?=\b(?:i|we|the\s+client)\s+(?:also\s+)?(?:have|own|use)\b)/i)
    .map((clause) => clause.replace(/\b(?:no|without|do\s+not\s+have|don't\s+have|don’t\s+have|unavailable)\b[\s\S]*$/i, ""))
    .join(" ");
}
const bodyweightSetup = (text) => /^(?:(?:a|the|my|stable|sturdy|bare|empty)\s+)*(?:floor|ground|walls?)(?:\s*(?:and|or|,|\+)\s*(?:(?:a|the|my|stable|sturdy|bare|empty)\s+)*(?:floor|ground|walls?))*\s*[:;,]?\s*$/i.test(text.trim());

function equipmentSpecification(input) {
  const lines = String(input ?? "").split(/\r?\n/);
  let specification = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].replace(/^\s*>\s?/, "").replace(/\*\*/g, "").trim();
    const heading = /(?:^|[.;]\s*)(?:#{1,6}\s*)?(?:available\s+)?equipment\s*:\s*(.*)$/i.exec(line);
    if (!heading) continue;
    const block = [heading[1]];
    for (let cursor = index + 1; cursor < lines.length && block.join(" ").length < 1000; cursor++) {
      const next = lines[cursor].replace(/^\s*>\s?/, "").replace(/\*\*/g, "").trim();
      if (!next && block.some((part) => part.trim())) break;
      if (/^(?:#{1,6}\s|(?:goal|duration|rest|effort|weekly|daily|progression|safety)\b\s*:)/i.test(next)) break;
      block.push(next);
    }
    const text = block.join(" ");
    if (mentionedEquipment(text).length || noEquipment.test(text) || bodyweightSetup(affirmativeInventory(text))
      || /^(?:none|bodyweight|body weight)$/i.test(text.trim())) specification = { text, line: index };
  }
  // Only a stated exclusive inventory closes the equipment list. "Home" alone
  // does not establish that a coach lacks a barbell or has a particular machine.
  const exclusive = /\b(?:only\s+(?:have|own|use|using|with)?|(?:all\s+(?:i|we|the\s+client)\s+have\s+is))\s*([^.!?\n]{1,220})/gi;
  for (const match of String(input ?? "").matchAll(exclusive)) {
    const line = String(input).slice(0, match.index).split(/\r?\n/).length - 1;
    if ((mentionedEquipment(match[1]).length || bodyweightSetup(affirmativeInventory(match[1])))
      && (!specification || line >= specification.line)) specification = { text: match[1], line };
  }
  for (const [index, line] of lines.entries()) {
    // A latest standalone correction can replace a pasted equipment list.
    // Individual exercise rows do not establish a whole-program inventory.
    if (!line.includes("|") && noEquipment.test(line) && (!specification || index > specification.line)) specification = { text: "No equipment", line: index };
  }
  return specification?.text ?? null;
}

function equipmentOnlyItem(phrase) {
  // Inventory exclusions are resolved by the latest explicit equipment list.
  // Do not persist an implement name as an exercise ban. Movement words such
  // as "row", "press" and "fly" remain, including in named gym exercises.
  const gear = /\b(?:equipment|dumbbells?|db|bands?|elastic|barbells?|kettlebells?|cables?|machines?|parallettes?|rings?|pull up bars?|chin up bars?|bench(?:es)?|floor|ground|walls?)\b/g;
  const item = normalize(phrase);
  if (!gear.test(item)) return false;
  gear.lastIndex = 0;
  return !item.replace(gear, " ").replace(/\b(?:a|an|the|any|my|our|have|available|one|two|three|pair|of|set|kg|kgs|kilograms?|lb|lbs|pounds?|weight|workout|exercise|gym|adjustable|flat|incline|stable|sturdy|bare|empty|gymnastic|resistance|\d+)\b/g, " ").trim();
}

function excludedMovements(input) {
  const text = String(input ?? "");
  const excluded = new Set();
  const movements = [
    ["dips", /\bdips?\b/i], ["pull ups", /\bpull[- ]?ups?\b/i], ["chin ups", /\bchin[- ]?ups?\b/i],
    ["push ups", /\bpush[- ]?ups?\b/i], ["handstand", /\bhandstands?\b/i],
    ["plank", /\bplanks?\b/i], ["lunges", /\blunges?\b/i],
  ];
  for (const fragment of text.split(/[\n.!?;]|\bbut\b/i)) {
    const negative = /\b(?:can(?:not|'t|’t)|unable\s+to|do\s+not|don't|don’t|avoid|exclude|no)\s+(?:even\s+)?(?:do\s+|perform\s+|prescribe\s+|include\s+)?/i.exec(fragment);
    if (!negative) continue;
    const tail = fragment.slice(negative.index + negative[0].length, negative.index + negative[0].length + 100);
    // An exclusion stops at an affirmative alternative, so "cannot do dips;
    // use push-ups" does not accidentally prohibit the replacement.
    const limited = tail.split(/\b(?:instead|use|try|replace|because|though|with)\b/i)[0];
    const inventoryExclusion = /\bno\s*$/i.test(negative[0]) || /^(?:have|own)\b/i.test(limited.trim());
    for (const phrase of limited.split(/,|\band\b|\bor\b/i)) {
      if (inventoryExclusion && equipmentOnlyItem(phrase)) continue;
      for (const [name, pattern] of movements) if (pattern.test(phrase)) {
        // Inability to perform the standard floor movement does not prohibit
        // a separately prescribed wall/incline regression or certify ability
        // to perform it. An unqualified push-up exclusion still bans the family.
        const floorPushup = name === "push ups" && /\b(?:standard|regular|full|floor)(?:\s+(?:standard|regular|full|floor))*\s+push[- ]?ups?\b/i.test(phrase);
        excluded.add(floorPushup ? "floor push ups" : name);
      }
      const exact = normalize(phrase.replace(/^(?:the\s+)?(?:exercise\s+)?/, ""));
      if (exact && exact.length <= 70) excluded.add(exact);
    }
  }
  return [...excluded];
}

function futureProgressions(input) {
  const excluded = new Set();
  const text = String(input ?? "");
  // A future progression is not a current prescription or evidence of inability.
  for (const match of text.matchAll(/\bprogress\s+to\s+([^.!?\n]{1,100})\bif\s+possible\b/gi)) {
    for (const alternative of match[1].split(/\bor\b|,/i)) {
      const exact = normalize(alternative.replace(/\*\*/g, ""));
      if (exact && exact.length <= 70) excluded.add(exact);
    }
  }
  return [...excluded];
}

function writtenDumbbellLoad(specification) {
  if (!specification) return null;
  const match = /\b(\d+(?:\.\d+)?)\s*(kg|kgs|kilograms?|lb|lbs|pounds?)\s+dumbbells?\b/i.exec(specification);
  if (!match) return null;
  const unit = /^k/i.test(match[2]) ? "kg" : "lb";
  const two = /\b(?:two|2|pair)\b|(?:x|×)\s*2\b/i.test(specification);
  return { value: Number(match[1]), unit, count: two ? 2 : 1 };
}

/** Parse bounded explicit equipment and ability facts, never historical planned
 * gym exercises. A fresh brief inventory supersedes the client's saved inventory. */
export function extractTrainingConstraints(brief, trainingContext = "") {
  const explicit = equipmentSpecification(brief);
  const specification = explicit ?? equipmentSpecification(trainingContext);
  const text = `${trainingContext}\n${brief}`;
  return {
    environment: /\b(?:home[- ]?(?:based|workout|training)|at\s+home|no\s+gym)\b/i.test(brief) ? "home" : null,
    equipmentRestricted: specification !== null,
    availableEquipment: specification === null || noEquipment.test(specification) ? [] : mentionedEquipment(affirmativeInventory(specification)),
    dumbbellLoad: writtenDumbbellLoad(affirmativeInventory(specification)),
    excludedExercises: excludedMovements(text),
    futureProgressions: futureProgressions(text),
    noCompetitionLifts: /\b(?:no|without|exclude|avoid)\s+competition[- ]?(?:style\s+)?lifts?\b/i.test(brief),
  };
}

function movementEquipment(exercise) {
  const name = String(exercise?.name ?? "");
  const required = new Set();
  const metadata = String(exercise?.equipment ?? "").toLowerCase();
  if (metadata && !["bodyweight", "other"].includes(metadata)) required.add(metadata === "band" ? "bands" : metadata);
  for (const [kind, pattern] of equipmentWords) if (pattern.test(name)) required.add(kind);
  if (/\b(?:db)\b/i.test(name)) required.add("dumbbell");
  if (/\b(?:incline|decline|bench)\b.{0,35}\bpress\b/i.test(name) && !/\bfloor\b/i.test(name)) required.add("bench");
  if (/\b(?:leg\s+press|pec[- ]?deck|hack\s+squat|leg\s+(?:curl|extension))\b/i.test(name)) required.add("machine");
  if (/\b(?:pull[- ]?up|chin[- ]?up)\b/i.test(name) && !required.has("rings")) required.add("pullup-bar");
  if (isMainCompound(name)) required.add("barbell");
  if (!required.size && !/\b(?:body[- ]?weight|push[- ]?up|plank|lunge|air\s+squat|wall[- ]?sit|dead\s+bug|bird\s+dog|glute\s+bridge|walking|walk|mobility|stretch|hollow|sit[- ]?up|crunch)\b/i.test(name)) {
    if (metadata !== "bodyweight") required.add("unverified");
  }
  return [...required];
}

function loadEquipmentMentions(text) {
  const positive = new Set(), negated = new Set();
  for (const [kind, pattern] of equipmentWords) {
    for (const match of String(text).matchAll(new RegExp(pattern.source, "gi"))) {
      const before = String(text).slice(Math.max(0, match.index - 45), match.index);
      const after = String(text).slice(match.index + match[0].length, match.index + match[0].length + 70);
      const excluded = /\b(?:no|without|not(?:\s+using|\s+with)?|exclude|excluding|omit)\s+(?:(?:any|a|the|additional|added)\s+)?$/i.test(before)
        || /^\s*(?:(?:is|was|will\s+be)\s+)?(?:not\s+(?:used|using|required|included|available)|unused|omitted|excluded|unavailable)\b/i.test(after);
      (excluded ? negated : positive).add(kind);
    }
  }
  return { positive: [...positive], negated: [...negated] };
}

export function trainingExerciseProblems(exercise, constraints) {
  const name = String(exercise?.name ?? "");
  const key = normalize(name);
  const issues = [];
  if (constraints.excludedExercises.some((excluded) => ` ${key} `.includes(` ${excluded} `)
    || (excluded === "dips" && /\bdips?\b/i.test(name))
    || (excluded === "lunges" && /\blunges?\b/i.test(name))
    || (excluded === "pull ups" && /\bpull[- ]?ups?\b/i.test(name))
    || (excluded === "chin ups" && /\bchin[- ]?ups?\b/i.test(name))
    || (excluded === "floor push ups" && /\bpush[- ]?ups?\b/i.test(name) && !/\b(?:wall|incline|knee|kneeling|assisted)\b/i.test(name))
    || (excluded === "push ups" && /\bpush[- ]?ups?\b/i.test(name)))) {
    issues.push(`${name} conflicts with the client's stated ability or excluded exercises. Choose a compatible current exercise; a future progression is not permission to prescribe it now.`);
  }
  if ((constraints.futureProgressions ?? []).some((future) => ` ${key} `.includes(` ${future} `))) {
    issues.push(`${name} is mentioned only as a conditional future progression, not a current working exercise. Do not infer the client cannot perform it.`);
  }
  if (constraints.noCompetitionLifts && isMainCompound(name) && /\b(?:squat|bench|deadlift|high[- ]?bar|low[- ]?bar)\b/i.test(name)) {
    issues.push(`${name} conflicts with the brief's exclusion of competition-style lifts.`);
  }
  if (!constraints.equipmentRestricted) return issues;
  const required = movementEquipment(exercise);
  const unavailable = required.filter((kind) => !constraints.availableEquipment.includes(kind));
  if (unavailable.length) issues.push(`${name} requires unavailable or unverified equipment (${unavailable.join(", ")}). Use only the stated available equipment; a dumbbell load cannot turn a cable/machine/barbell exercise into a home variation.`);
  const load = String(exercise?.loadOrAssistance ?? "");
  if (!load) return issues; // Outline names have no load yet.
  const { positive: loadEquipment, negated: negatedLoadEquipment } = loadEquipmentMentions(load);
  const unavailableLoad = loadEquipment.filter((kind) => !constraints.availableEquipment.includes(kind));
  if (unavailableLoad.length) issues.push(`${name} prescribes unavailable equipment in its load/assistance (${unavailableLoad.join(", ")}).`);
  const typedRequired = required.filter((kind) => ["dumbbell", "bands", "barbell", "kettlebell", "cable", "machine"].includes(kind));
  if (typedRequired.some((kind) => negatedLoadEquipment.includes(kind))) issues.push(`${name} explicitly says its required equipment is not used. A negated equipment mention cannot satisfy the exercise's load/assistance.`);
  if (typedRequired.length && loadEquipment.length && typedRequired.some((kind) => !loadEquipment.includes(kind))) {
    issues.push(`${name} has a load/assistance field for different equipment than its canonical exercise.`);
  }
  if (typedRequired.length && loadEquipment.some((kind) => ["dumbbell", "bands", "barbell", "kettlebell", "cable", "machine"].includes(kind) && !required.includes(kind))) {
    issues.push(`${name} mixes a different loading implement into its load/assistance. Preserve the canonical exercise equipment instead of merging another exercise's instructions.`);
  }
  if (required.includes("dumbbell") && constraints.dumbbellLoad) {
    const known = constraints.dumbbellLoad;
    const loads = [...load.matchAll(/\b(\d+(?:\.\d+)?)\s*(kg|kgs|kilograms?|lb|lbs|pounds?)\b/gi)];
    const matches = loads.every((match) => {
      const unit = /^k/i.test(match[2]) ? "kg" : "lb";
      return unit === known.unit && (Number(match[1]) === known.value || (known.count === 2 && Number(match[1]) === known.value * 2 && /\b(?:total|combined|both)\b/i.test(load)));
    });
    if (!loads.length || !matches) issues.push(`${name} must use the supplied ${known.value} ${known.unit} dumbbell weight (${known.count} available), rather than inventing a weight or saying it was not supplied.`);
  }
  return [...new Set(issues)];
}

export function trainingWeekProblems(week, constraints, catalog = []) {
  const identities = new Map(catalog.map((entry) => [normalize(entry.name), entry]));
  return [...new Set((week?.days ?? []).flatMap((day) => (day.exercises ?? []).flatMap((exercise) => {
    // Equipment metadata is canonical server data; output cannot override it.
    const identity = identities.get(normalize(exercise.name)) ?? identities.get(normalize(String(exercise.name).replace(/\s*(?:[—–-]\s*|\(\s*)(?:top\s+(?:set|single)|backdowns?|back[- ]?off(?:\s+sets?)?|technique|primary|secondary)\)?\s*$/i, "")));
    return trainingExerciseProblems({ ...exercise, ...(identity ? { equipment: identity.equipment } : {}) }, constraints);
  })))];
}

export function filterTrainingCatalog(catalog, constraints) {
  return catalog.filter((exercise) => !trainingExerciseProblems(exercise, constraints).length);
}

/** A conditional future option does not establish a person's current inability. */
export function trainingNarrativeProblems(value, constraints) {
  const fields = [...(value?.assumptions ?? []), value?.progression ?? "", value?.regression ?? ""];
  const issues = [];
  for (const future of constraints.futureProgressions ?? []) {
    if (constraints.excludedExercises.some((excluded) => ` ${future} `.includes(` ${excluded} `))) continue;
    for (const field of fields) for (const sentence of String(field).split(/[.!?;\n]/)) {
      if (normalize(sentence).includes(future) && /\b(?:cannot|can't|can’t|unable\s+to|explicitly\s+excluded)\b/i.test(sentence)) {
        issues.push(`The draft falsely describes "${future}" as a stated inability. It is only conditional future progression advice; do not invent client limitations.`);
      }
    }
  }
  return [...new Set(issues)];
}

export function trainingConstraintContext(constraints) {
  if (!constraints.equipmentRestricted && !constraints.excludedExercises.length && !constraints.futureProgressions?.length && !constraints.noCompetitionLifts) return "";
  return `CURRENT TRAINING AVAILABILITY (must override incompatible gym favorites and reference templates):\n${JSON.stringify(constraints)}\nUse only compatible exact names from the supplied catalog. Do not turn Cable Fly/Pec Deck into a dumbbell fly, Leg Press into a bodyweight squat, or Barbell Row into a band row by changing the load text. These are different exercise identities. Preserve supplied dumbbell weights; a resistance band's stated rating does not establish constant force throughout the movement. Do not prescribe an exercise the client cannot do, or a conditional future progression. futureProgressions is not an inability list: never claim the client cannot do an exercise merely because it is conditional future advice. If the compatible library is insufficient, ask the coach to add the missing exercise instead of forcing a gym substitute.\n`;
}
