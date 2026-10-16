import { randomUUID } from "node:crypto";
import { writtenProgramWeeks } from "./program-input.mjs";
import { extractTrainingConstraints, trainingExerciseProblems } from "./training-constraints.mjs";

const key = name => name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();

/** The verified coach's numbered source rows authorize draft names, not model
 * inventions. No library/database write occurs here. Approval still creates a
 * private client snapshot through the existing transactional path. */
export function catalogWithWrittenExercises(catalog, brief, trainingContext = "") {
  if (!writtenProgramWeeks(brief)) return catalog;
  const constraints=extractTrainingConstraints(brief,trainingContext), supplied=[], seen=new Set();
  for(const line of brief.split(/\r?\n/)) {
    const row=/^\s*\d+[.)]\s+([^:\r\n]{1,120})\s*:\s*(.+)$/.exec(line);
    if(!row || !/^\d+(?:\s*[-–]\s*\d+)?\s*(?:[x×]|attempts?\b|holds?\b|sets?\b)/i.test(row[2]))continue;
    const name=row[1].trim().replace(/\s+(?:(?:top|working)\s+)?(?:single|top\s+set|backdowns?|back[- ]?off(?:\s+sets?)?)\s*$/i,"");
    if(!name || /[\u0000-\u001f\u007f]/.test(name) || seen.has(key(name)))continue;
    const existing=catalog.find(entry=>key(entry.name)===key(name));
    const entry=existing ?? {id:randomUUID(),name,equipment:"other"};
    if(trainingExerciseProblems(entry,constraints).length)continue;
    supplied.push(entry);seen.add(key(name));
  }
  // A later coach-written bodyweight day can name the unweighted counterpart
  // of a weighted source movement. It is an explicit variant, not permission
  // to force added weight or let the model invent another movement.
  for(const weighted of [...supplied]) {
    if(!/^weighted\s+/i.test(weighted.name))continue;
    const name=weighted.name.replace(/^weighted\s+/i,"");
    const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/[-\s]+/g,"[-\\s]*");
    const written=new RegExp(`(?:^|[\\n|:])\\s*(?:\\*\\s*)?${escaped}\\s*:[^\\n|]{0,180}\\b(?:bodyweight|bw)\\b`,"im");
    if(!written.test(brief)||seen.has(key(name)))continue;
    const entry=catalog.find(item=>key(item.name)===key(name))??{id:randomUUID(),name,equipment:"bodyweight"};
    if(trainingExerciseProblems(entry,constraints).length)continue;
    supplied.push(entry);seen.add(key(name));
  }
  const result=[];
  for(const entry of [...supplied,...catalog]) {
    if(result.some(item=>key(item.name)===key(entry.name)))continue;
    if(result.length>=150 || JSON.stringify([...result,entry]).length>12000) {
      if(supplied.includes(entry))throw new Error("The written exercise list exceeds this draft's bounded capacity. Split the program without dropping source movements.");
      continue;
    }
    result.push(entry);
  }
  return result;
}
