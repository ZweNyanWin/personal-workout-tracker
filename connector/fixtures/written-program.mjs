// Fictional development fixture; no client program or evaluation records.
const names = ["Low-Bar Squat", "Bulgarian Split Squat", "Calf Raise", "Bench Press", "Weighted Pull-up", "Weighted Dip", "Conventional Deadlift", "Paused Low-Bar Squat", "Hamstring Curl", "Larsen Press", "Weighted Chin-up", "Push-up", "L-Sit"];
export const syntheticCatalog = names.map((name,index)=>({id:`87000000-0000-4000-8000-${String(index+1).padStart(12,"0")}`,name,equipment:/Push-up|L-Sit|Calf/.test(name)?"bodyweight":"barbell"}));
const line = (name, dose, load, rpe=7, cue="") => `${name}: ${dose} @ ${load}, RPE ${rpe}, rest 2 min${cue ? `. Coach cue: ${cue}` : ""}`;
export function syntheticWrittenProgram(count=12) {
  return "Import my written program without changing targets. No automatic progression.\n" + Array.from({length:count},(_,i)=>{
    const n=i+1;
    return `WEEK ${n} — Written block\nDay 1 — Lower A\n${line("Low-Bar Squat top single","1x1",`${101+n} kg`)}\n${line("Low-Bar Squat backdown","2x3",`${81+n} kg`)}\n${line("Bulgarian Split Squat","2x8–12","Bodyweight")}\n${line("Calf Raise","2x15","Bodyweight")}\nDay 2 — Upper A\n${line("Bench Press top single","1x1",`${71+n} kg`,8)}\n${line("Bench Press backdown","2x4",`${56+n} kg`)}\n${line("Weighted Pull-up","2x6–8",`${21+n} lb`)}\n${line("Weighted Dip","2x6–10",`${11+n} kg`)}\nDay 3 — Lower B\n${line("Conventional Deadlift top single","1x1",`${141+n} kg`)}\n${line("Conventional Deadlift backdown","2x3",`${121+n} kg`)}\n${line("Paused Low-Bar Squat","2x5",`${61+n} kg`,7,"pause for 2 seconds inside each repetition")}\n${line("Hamstring Curl","2x10–15","External load unknown")}\nDay 4 — Upper B\n${line("Larsen Press","2x6",`${46+n} kg`)}\n${line("Weighted Chin-up","2x8–12",`${6+n} kg`)}\n${line("Push-up","2x8–15","Bodyweight")}\n${line("L-Sit","3 holds of 10–20 seconds","Bodyweight",7,`week ${n} final source cue; use controlled positions`)}\n`;
  }).join("\n");
}
