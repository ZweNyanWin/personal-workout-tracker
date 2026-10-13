// Reviewed general first-aid boundaries. These are source-based responses,
// never personalized medication dosing or a diagnosis. Only current user text
// is evaluated; reference files and assistant messages cannot activate a rule.
const cdc = "https://www.cdc.gov/diabetes/treatment/treatment-low-blood-sugar-hypoglycemia.html";
const nhs = "https://www.nhs.uk/conditions/anaphylaxis/";

export function safetyAnswer(question) {
  const text = String(question).normalize("NFKC").toLowerCase();
  const current = text.replace(/\b(?:no|without|denies)\s+(?:chest pain|breathing (?:trouble|difficulty)|tongue swelling|throat swelling|fainting|hypoglycemia)\b/g, "");
  const swelling = /\b(?:tongue|throat|mouth|lips?)\b.{0,40}\b(?:swell\w*|swollen|tight\w*)\b|\b(?:swollen|swelling)\b.{0,25}\b(?:tongue|throat|mouth|lips?)\b/.test(current);
  const breathing = /\b(?:difficulty|trouble|struggling|cannot|can't|can’t|hard|unable)\b.{0,20}\b(?:breath\w*|swallow\w*)\b|\b(?:wheez\w*|gasping|choking|shortness of breath)\b/.test(current);
  if (swelling || (breathing && /\b(?:allerg\w*|anaphyla\w*)\b/.test(current))) return `Stop training and call local emergency services now. Tongue/throat swelling or breathing difficulty after a possible allergen needs urgent help; do not wait until tomorrow. If you have a prescribed adrenaline/epinephrine auto-injector, use it according to its instructions and your emergency plan while help is called. Do not stand or walk; follow the emergency dispatcher's guidance. This is an emergency precaution, not a diagnosis. [NHS guidance](${nhs})`;
  const severe = /\b(?:unconscious|unresponsive|passed out|cannot be woken|not waking|unable to swallow|cannot swallow|can't swallow)\b/.test(current);
  const diabetes = /\b(?:diabet\w*|hypoglyc\w*|blood (?:sugar|glucose)|insulin|glucagon)\b/.test(current);
  if (severe) return `Call local emergency services now and stop exercise. Do not give food, drink or glucose by mouth to someone unconscious or unable to swallow. Follow the dispatcher's first-aid instructions. ${diabetes ? "If prescribed glucagon is available and you know how to use it, follow its instructions/personal emergency plan while help is called. " : ""}Do not delay emergency care to finish training or change medication. ${diabetes ? `[CDC guidance](${cdc})` : ""}`.trim();
  if ((/\bchest\s+pain\b/.test(current) && /\b(?:faint\w*|dizz\w*|breath\w*|collapse\w*)\b/.test(current)) || (breathing && /\b(?:severe|sudden|at rest)\b/.test(current))) return "Stop exercise and call local emergency services now. Chest pain with fainting, collapse or breathing difficulty needs urgent assessment. Do not continue sets or wait for a training plan. Follow the dispatcher's instructions.";
  const mg = /\b(\d+(?:\.\d+)?)\s*mg\s*\/\s*dl\b/.exec(current);
  const mmol = /\b(\d+(?:\.\d+)?)\s*mmol\s*\/\s*l\b/.exec(current);
  const low = diabetes && ((mg && Number(mg[1]) < 70) || (mmol && Number(mmol[1]) < 3.9) || /\b(?:hypoglyc\w*|low blood (?:sugar|glucose))\b/.test(current));
  if (low) {
    if (/\b(?:child|infant|toddler|baby|minor)\b|\b(?:[1-9]|1[0-7])[- ](?:year[- ]old|years old)\b/.test(current)) return `Stop exercise and follow the child's prescribed low-glucose plan immediately. Children can need different carbohydrate amounts; contact their diabetes team urgently for guidance. If they are confused, unconscious or unable to swallow, call emergency services and give nothing by mouth; use prescribed glucagon only according to its instructions/emergency plan. [CDC guidance](${cdc})`;
    return `Stop exercise now; do not finish the remaining sets. Follow your personal diabetes plan. For an adult who is awake and able to swallow, general guidance is 15 g of fast-acting carbohydrate, then recheck blood glucose after about 15 minutes; repeat if still below the target/70 mg/dL. Use a reliably labeled fast-acting source such as glucose tablets. If confused, unable to swallow, unconscious or worsening, call emergency services, give nothing by mouth, and use prescribed glucagon only according to its instructions/emergency plan if available and you know how. Contact your diabetes clinician about recurring lows; do not change insulin or other medication yourself. [CDC guidance](${cdc})`;
  }
  if (/\b(?:purged|purging|self-induced vomiting|made myself vomit|deliberately vomit\w*|laxatives to|laxative abuse)\b/.test(current)) return "I won't give a fasting, calorie-cutting or exercise plan to compensate for eating or purging. You deserve support: contact a healthcare professional or eating-disorder service promptly and tell someone you trust. Stop compensatory training. If there is fainting, chest pain, blood in vomit, severe weakness or dehydration, seek urgent medical care. [NHS guidance](https://www.nhs.uk/mental-health/conditions/bulimia/)";
  if (diabetes && /\b(?:change|reduce|increase|halve|double|skip|adjust)\b.{0,45}\b(?:insulin|medication|dose)\b/.test(current)) return "Tommy cannot change insulin or other medication doses. Ask your diabetes clinician to review fasting, exercise, food and glucose monitoring together; these can affect hypoglycemia risk. Follow your existing care plan and keep an appropriate low-glucose treatment available. [CDC guidance](" + cdc + ")";
  const maximalLift = /\b(?:squat|bench(?: press)?)\b/.test(current) && /\b(?:1[- ]?rm|max(?:imal|imum)?|personal record|rpe\s*(?:9\.5|10))\b/.test(current);
  const missingSafety = /\b(?:no|without|lack of)\s+(?:(?:usable|working|configured|qualified|trained|competent)\s+)?(?:spotters?|safeties|safety (?:bars|arms|pins))\b|\b(?:safeties|safety (?:bars|arms|pins))\s+(?:are\s+)?(?:missing|unusable|unavailable)\b/.test(current);
  if (maximalLift && missingSafety) return "Do not attempt that maximal squat or bench press until a qualified coach verifies an appropriate safety setup and trained spotting/supervision. Owning a rack or barbell does not establish configured, usable safeties or readiness. Tommy cannot guarantee safety or replace those checks with a mat, improvised equipment or an aggressive attempt plan. [NSCA safety and supervision standards](https://www.nsca.com/globalassets/about/position-statements/nsca_strength_and_conditioning_professional_standards_and_guidelines.pdf)";
  return null;
}

/** Completion is a hard boundary: partial/repeating output is never a verified
 * reply and must not reach the persistent conversation callback. */
export function completeAnswer(result) {
  const answer = result?.message?.content?.trim();
  if (result?.done !== true || result.done_reason === "length" || typeof answer !== "string" || !answer || answer.length > 20000) throw new Error("Incomplete response");
  const sentences = answer.toLowerCase().split(/[.!?\n]+/).map(x => x.trim()).filter(x => x.length >= 45);
  const count = new Map();
  for (const sentence of sentences) {
    count.set(sentence, (count.get(sentence) ?? 0) + 1);
    if (count.get(sentence) >= 4) throw new Error("Repeating response");
  }
  return answer;
}

/** Narrow, source-bound arithmetic. Unsupported recipes, cooked/raw basis,
 * density, missing portions and mixed-unit prompts stay with clarification;
 * there is no assumption that grams equal millilitres. */
export function calculationAnswer(question) {
  const text = String(question).normalize("NFKC");
  const clean = text.toLowerCase();
  if (/[-−]\s*\d|\d\s*(?:[-–]|to)\s*\d/i.test(text)) return null;
  if (/\b(?:raw|cooked|dry|recipe|unknown|missing|density|ml|millilit|hypogly|diabet|not consumed|did not eat|planned|tomorrow|replace|instead|correction)\b/i.test(text)) return null;
  const value = "(\\d+(?:\\.\\d+)?)";
  const format = n => String(Number(n.toFixed(4)));
  if (/\b(?:convert|conversion)\b/.test(clean)) {
    const kj = [...text.matchAll(new RegExp(`\\b${value}\\s*kJ\\b`, "gi"))];
    if (kj.length === 1 && /\bkcal\b/.test(clean) && !/\b(?:servings?|portions?|each|per|times)\b/.test(clean)) return `Using 1 kcal = 4.184 kJ: ${kj[0][1]} ÷ 4.184 = ${format(Number(kj[0][1]) / 4.184)} kcal. This converts the supplied energy value; it does not establish food consumed or measurement precision.`;
  }
  const portionMatches = [...text.matchAll(/\b(?:consumed|ate|eaten|portion (?:was|is))\s+(?:exactly\s+)?(\d+(?:\.\d+)?)\s*g\b/gi)];
  const portions = portionMatches.length === 1 ? portionMatches[0] : null;
  if (portions && /\bper\s+100\s*g\b/i.test(text)) {
    const kcal = [...text.matchAll(new RegExp(`\\b${value}\\s*kcal\\b`, "gi"))];
    const protein = [...text.matchAll(new RegExp(`\\b${value}\\s*g\\s+(?:of\\s+)?protein\\b`, "gi"))];
    if (kcal.length === 1 && protein.length === 1 && /\b(?:label|entry|supplied)\b/i.test(text)) {
      const factor = Number(portions[1]) / 100;
      return `From the supplied per-100 g values, the ${portions[1]} g portion is a ${format(factor)}× multiplier: ${format(Number(kcal[0][1]) * factor)} kcal and ${format(Number(protein[0][1]) * factor)} g protein. These are label/entry-based estimates, not laboratory-exact measurements. No other foods were added.`;
    }
  }
  return null;
}
