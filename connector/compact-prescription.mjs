import { extractWrittenPrescription, hasNegativeWrittenReserve } from "./written-prescription.mjs";
import { isMainCompound, expectedDoseKind, mainRpeValue } from "../lib/coach/exercise-rules.mjs";

const normalized = text => String(text).normalize("NFKC").toLowerCase()
  .replace(/calves/g,"calf").replace(/flies/g,"fly").replace(/\bcurls\b/g,"curl")
  .replace(/[^\p{L}\p{N}]+/gu," ").trim();
const words = text => normalized(text).split(" ").filter(Boolean);
const withoutRole = text => text.replace(/\s+(?:(?:top|working)\s+)?(?:single|backdowns?|back[- ]?off|top\s+set)\s*$/i,"").trim();
const unique = list => [...new Map(list.map(item=>[normalized(item.name),item])).values()];
const subset = (query,name) => words(query).every(word=>words(name).some(part=>part===word || word.length>=3 && part.length>=3 && (part.startsWith(word)||word.startsWith(part))));
const rirTarget = target => /\b(?:last\s+set\s+)?\d+(?:\.\d+)?(?:\s*(?:[-–—]|to)\s*\d+(?:\.\d+)?)?\s*RIR\b|\b(?:last\s+set\s+)?RIR\s*[:=]?\s*\d+(?:\.\d+)?(?:\s*(?:[-–—]|to)\s*\d+(?:\.\d+)?)?/i.exec(target)?.[0]?.replace(/\s+(?:to)\s+|\s*—\s*/i,"–");
function permitsFailure(target) {
  const rir=rirTarget(target), reserves=rir?.match(/\d+(?:\.\d+)?/g)?.map(Number)??[];
  const rpe=/\bRPE\s*(\d+(?:\.\d+)?)(?:\s*(?:[-–—]|to)\s*(\d+(?:\.\d+)?))?/i.exec(target);
  return /\bfailure\b/i.test(target.replace(/\bno\s+failure\b/gi,"")) || reserves.some(value=>value===0)
    || Boolean(rpe && Math.max(Number(rpe[1]),Number(rpe[2]??rpe[1]))>=10);
}

/** Parse only bounded, coach-written shorthand whose day and exercise identity
 * can be grounded in an earlier explicit source week. No model-generated
 * prescription becomes source data, and unknown quantities remain null. */
export function extractCompactPrescription(brief,scope,catalog,reference) {
  if (!reference?.topologyComplete || scope.weekCount!==1 || /^\s*\|/m.test(brief)) return null;
  const referenceDays=reference.days;
  const lines=brief.split(/\r?\n/).map(line=>line.replace(/^\s*[*-]\s+/,"").trim()).filter(Boolean);
  const records=[],issues=[],shared=[];
  let current;
  const findDay=label=>referenceDays.find(day=>normalized(day.title)===normalized(label));
  for(const line of lines) {
    if (/^(?:#{1,6}\s*)?WEEK\s*#?\s*\d+\b/i.test(line))continue;
    let heading;
    const colon=line.indexOf(":");
    if(colon>=0)heading=findDay(line.slice(0,colon));
    const numbered=/^Day\s*#?\s*(\d+)\s*[—–-]\s*(.+)$/i.exec(line);
    if(numbered)heading=referenceDays.find(day=>day.number===Number(numbered[1]));
    if(heading){
      if(records.some(day=>day.number===heading.number)){issues.push("A shorthand day is repeated; give each day one heading.");continue;}
      current={number:heading.number,title:numbered?numbered[2].trim():heading.title,segments:[]};records.push(current);
      if(!numbered && line.slice(colon+1).trim())current.segments.push(...line.slice(colon+1).split("|").map(x=>x.trim()).filter(Boolean));
    } else if(/^(?:no\s+failure|again\s*,?\s*no\s+failure|do\s+not\s+exceed)\b/i.test(line))shared.push(line);
    else if(/^(?:complete|extend|finish)\b.*\bweek\s*\d/i.test(line))continue;
    else if(current)current.segments.push(...line.split("|").map(x=>x.trim()).filter(Boolean));
    // Other preamble remains intact in program.brief; do not duplicate a long
    // document-level instruction into every bounded exercise note.
  }
  if(!records.length)return null;
  if(records.length!==scope.daysPerWeek)issues.push("Each shorthand week needs every requested day under an earlier source day name or a numbered Day heading.");
  const noFailure=shared.some(line=>/\bno\s+failure\b/i.test(line));
  const singleCap=shared.map(line=>/do\s+not\s+exceed[^\n]*?RPE\s*(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?[^\n]*\bsingles?\b/i.exec(line)).find(Boolean);
  const days=[];
  for(const record of records) {
    const ref=referenceDays.find(day=>day.number===record.number), exercises=[],dayRules=[];
    const resolve=query=>{
      const bare=withoutRole(query);
      if(normalized(bare).length<3)return null;
      if(/^(?:weighted|assisted|deficit|paused)$/i.test(bare))return null;
      const candidates=unique(ref.exercises.filter(item=>subset(bare,item.name)));
      if(candidates.length===1)return candidates[0].name;
      if(/\bsingle\b/i.test(query)||/^(?:squat|bench|deadlift)$/i.test(bare)) {
        const mains=candidates.filter(item=>isMainCompound(item.name));
        if(mains.length===1)return mains[0].name;
      }
      const exact=catalog.filter(item=>normalized(item.name)===normalized(bare));
      if(exact.length===1)return exact[0].name;
      if(/^abs?$/i.test(bare)) {
        const core=unique(ref.exercises.filter(item=>/\b(?:abs?|crunch|leg\s+raise)\b/i.test(item.name)));
        if(core.length===1)return core[0].name;
      }
      if(/^rdl$/i.test(bare)) {
        const hinge=unique(ref.exercises.filter(item=>/\bromanian\s+deadlift\b/i.test(item.name)));
        if(hinge.length===1)return hinge[0].name;
      }
      return null;
    };
    const namesFor=query=>{
      const one=resolve(query);if(one)return [one];
      const split=query.split(/\s*\/\s*|\s+\+\s+/).filter(Boolean);
      if(split.length>1){
        const names=split.map(resolve);
        if(names.every(Boolean))return names;
        // A slash can offer variants of one movement rather than three
        // independent exercises. Choose only a grounded written alternative.
        if(names.filter(Boolean).length===1 && split.some(part=>/^(?:weighted|assisted|deficit|paused)$/i.test(part)))return names.filter(Boolean);
      }
      return null;
    };
    for(const segment of record.segments) {
      if(/^all\s+accessories\b/i.test(segment)){
        if(hasNegativeWrittenReserve(segment))issues.push("A negative written reserve target needs clarification; no sign was removed.");
        dayRules.push(segment);continue;
      }
      let query,target,names;
      const colon=segment.indexOf(":");
      if(colon>=0){query=segment.slice(0,colon).trim();target=segment.slice(colon+1).trim();}
      else if(/^accessories\b/i.test(segment)){query="Accessories";target=segment.replace(/^accessories\s*/i,"");}
      else if(/^skills?\b/i.test(segment)){query="Skills";target=segment.replace(/^skills?\s*/i,"");}
      else if(/^\d/.test(segment)) {query="Backdown";target=segment;}
      else {
        const match=/^(.*?)(\s+(?:light|easy)|\s+\d.*)?$/i.exec(segment);query=match[1].trim();target=(match[2]??"").trim();
      }
      if(/^accessories$/i.test(query))names=unique(ref.exercises.filter(item=>!isMainCompound(item.name)&&!exercises.some(done=>done.name===item.name))).map(item=>item.name);
      else if(/^skills?$/i.test(query))names=unique(ref.exercises.filter(item=>expectedDoseKind(item.name)==="hold"&&!exercises.some(done=>done.name===item.name))).map(item=>item.name);
      else if(/^(?:backdowns?|back[- ]?off)$/i.test(query))names=isMainCompound(exercises.at(-1)?.name) ? [exercises.at(-1).name] : null;
      else names=namesFor(query);
      if(!names?.length){issues.push(`Day ${record.number}: '${query.slice(0,120)}' needs one grounded full saved/source exercise name.`);continue;}
      for(const resolvedName of names) {
        if(noFailure && permitsFailure(target))issues.push("A written failure target conflicts with the week's no-failure instruction; clarify the source.");
        if(hasNegativeWrittenReserve(target))issues.push("A negative written reserve target needs clarification; no sign was removed.");
        let name=resolvedName;
        if(/\b(?:bodyweight|bw)\b/i.test(target)&&!/^weighted\b/i.test(query)&&/^weighted\s+/i.test(name)) {
          const bare=name.replace(/^weighted\s+/i,"");
          const unweighted=catalog.find(item=>normalized(item.name)===normalized(bare));
          if(!unweighted){issues.push("A written bodyweight variation needs its unweighted source/library identity; no added load was forced.");continue;}
          name=unweighted.name;
        }
        let canonicalTarget=target.replace(/\b(\d+)\s+sets?\s+of\s+(\d+(?:\s*[-–]\s*\d+)?)\s+reps?\b/i,"$1x$2")
          .replace(/\b(\d+)\s+sets?\s+of\s+(\d+(?:\s*[-–]\s*\d+)?)\s*(?:seconds?|secs?)\b/i,"$1 holds of $2 seconds"),unitProposal=false;
        const massFirst=/^\+?(\d+(?:\.\d+)?)\s*(kg|lb)\s+(\d+\s*[x×]\s*\d+(?:\s*[-–]\s*\d+)?)(.*)$/i.exec(canonicalTarget);
        if(massFirst)canonicalTarget=`${massFirst[3]} @ ${massFirst[1]} ${massFirst[2]}${massFirst[4]}`;
        // "load x reps" and "load sets x reps" preserve the numeric load.
        // Missing units are visible proposals from that source identity only.
        const loadFirst=/^(\d+(?:\.\d+)?)\s+(\d+\s*[x×]\s*\d+(?:\s*[-–]\s*\d+)?)\s*$/i.exec(target);
        const singleLoad=/^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+)\s*$/i.exec(target);
        if(loadFirst || singleLoad && (Number(singleLoad[1])>10 || singleLoad[1].includes("."))) {
          const load=(loadFirst??singleLoad)[1];
          const prior=ref.exercises.find(item=>item.name===name),unit=/\b(kg|lb)\b/i.exec(prior?.loadOrAssistance??"")?.[1];
          canonicalTarget=`${loadFirst?loadFirst[2]:`1x${singleLoad[2]}`} @ ${load}${unit?` ${unit}`:""}`;
          unitProposal=true;
        } else if(/\bsingle\b/i.test(query)&&!/[x×]/.test(target))canonicalTarget=`1x1 @ ${target}`;
        const parsed=extractWrittenPrescription(`Day 1. ${name}: ${canonicalTarget}`,{startWeek:scope.startWeek,weekCount:1,daysPerWeek:1},catalog);
        if(parsed?.issues.length)issues.push(...parsed.issues);
        const item=parsed?.days[0]?.exercises[0] ?? {name,sets:null,dose:null,loadOrAssistance:null,effort:null,restSeconds:null,restIsExplicit:false};
        if(!parsed) {
          const withoutRest=target.replace(/\brest(?:\s+time)?\s*[:=]?\s*(?:exactly\s+)?\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?\s*(?:min(?:ute)?s?|sec(?:ond)?s?)\b/gi,"");
          if(/\b\d+(?:\s*[-–]\s*\d+)?\s*(?:reps?|holds?|seconds?|secs?|minutes?|mins?)\b/i.test(withoutRest))issues.push("An explicit rep or hold duration has unsupported wording; clarify it rather than proposing a replacement.");
          // A missing rep/hold dose does not make an explicitly written load,
          // effort or rest unknown. Reuse the numeric parser with a temporary
          // dose solely to read these independent fields; never retain that
          // temporary dose or mark it as a supplied target.
          const placeholder=expectedDoseKind(name)==="hold" ? "1 holds of 1 seconds" : "1x1";
          const fields=extractWrittenPrescription(`Day 1. ${name}: ${placeholder}, ${target}`,{startWeek:scope.startWeek,weekCount:1,daysPerWeek:1},catalog);
          if(fields?.issues.length)issues.push(...fields.issues);
          const supplied=fields?.days[0]?.exercises[0];
          if(supplied)for(const field of ["loadOrAssistance","effort","restSeconds","restIsExplicit","restRangeMinutes"])if(supplied[field]!==undefined)item[field]=supplied[field];
          const sets=/\b(\d+)(?:\s*[-–]\s*(\d+))?\s+(?:(?:easy|light)\s+)?sets?\b/i.exec(target);
          const attempts=/\b(\d+)(?:\s*[-–]\s*(\d+))?\s+attempts?\b/i.exec(target);
          if(sets){if(!sets[2]||sets[1]===sets[2])item.sets=Number(sets[1]);else item.setsBounds={min:Number(sets[1]),max:Number(sets[2])};}
          if(attempts)item.attempts={min:Number(attempts[1]),max:Number(attempts[2]??attempts[1])};
          if(/\b(?:bodyweight|bw)\b/i.test(target)&&!item.loadOrAssistance)item.loadOrAssistance="Bodyweight";
        }
        const alternatives=/\b(?:bodyweight|bw)\s*\/\s*\+\s*(\d+(?:\.\d+)?)\s*(kg|lb)\b/i.exec(target);
        if(alternatives)item.loadOrAssistance=`Bodyweight or +${alternatives[1]} ${alternatives[2]} (written alternatives)`;
        if(/\b(?:light|easy)\b/i.test(target)&&!isMainCompound(name)&&(!item.effort || /^(?:easy|comfortable)$/i.test(item.effort)))item.effort="Easy, comfortable effort";
        const rir=rirTarget(target);
        if(rir&&!isMainCompound(name)&&!item.effort?.includes(rir))item.effort=item.effort ? `${item.effort}; ${rir}` : rir;
        item.notes=`Coach source: ${segment}`;
        if(normalized(withoutRole(query))!==normalized(name)&&!/^accessories|skills|backdown/i.test(query))item.notes+=` Shorthand identity proposed from the earlier written day: ${name}; confirm.`;
        if(unitProposal)item.notes+=" Load unit is proposed from the same earlier source identity where available; confirm the unit.";
        if(item.attempts)item.notes+=" Each set is one attempt; hold duration is proposed, not written.";
        if(unitProposal&&!item.loadOrAssistance){
          const load=(loadFirst??singleLoad)[1];item.loadOrAssistance=`External load ${load}; unit not supplied`;
        }
        exercises.push(item);
      }
    }
    for(const item of exercises){
      const rules=[...dayRules,...shared];
      if(rules.length)item.notes+=` Week/day instructions: ${rules.join(" ")}`;
      const accessoryRir=dayRules.map(rirTarget).find(Boolean);
      if(accessoryRir&&!isMainCompound(item.name)) {
        if(item.effort && !/\b(?:RPE|RIR|failure)\b/i.test(item.effort))item.effort+=`; ${accessoryRir}`;
        else if(item.effort && normalized(item.effort)!==normalized(accessoryRir))issues.push("An explicit accessory effort conflicts with the day-wide reserve instruction; clarify the source.");
        else item.effort=accessoryRir;
      }
      if(noFailure&&!item.effort)item.effortCeiling=9.5;
      if(singleCap&&isMainCompound(item.name)&&item.dose?.kind==="reps"&&item.dose.range.min===1&&item.dose.range.max===1)item.effortCeiling=Number(singleCap[2]??singleCap[1]);
      if(item.notes.length>400)issues.push("A shorthand group and its complete source rules exceed the note bound; clarify the source without dropping instructions.");
      for(const bounds of [item.attempts,item.setsBounds])if(bounds&&(bounds.min<1||bounds.max<bounds.min||bounds.max>10))issues.push("The written set or attempt range must be within1–10.");
      if(item.effortCeiling&&mainRpeValue(item.effort)>item.effortCeiling)issues.push("A written RPE conflicts with the week's effort cap; clarify the source.");
      if(noFailure && permitsFailure(item.effort??""))issues.push("A written failure target conflicts with the week's no-failure instruction; clarify the source.");
    }
    if(!exercises.length||exercises.length>12)issues.push("Each shorthand day needs1–12 unambiguous working groups.");
    days.push({number:record.number,title:record.title,exercises});
  }
  return {days,complete:false,topologyComplete:!issues.length,closed:true,issues:[...new Set(issues)]};
}
