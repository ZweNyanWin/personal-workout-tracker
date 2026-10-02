import { coachingPrescriptionSchema } from "@/lib/coach/workflow-schema";

export function readPrescription(value: unknown) {
  const parsed = coachingPrescriptionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function doseLabel(
  dose: NonNullable<ReturnType<typeof readPrescription>>["dose"],
) {
  const range = dose.kind === "hold" ? dose.seconds : dose.range;
  const amount =
    range.min === range.max ? String(range.min) : `${range.min}–${range.max}`;
  return dose.kind === "hold"
    ? `${amount} sec hold`
    : `${amount} reps${dose.perSide ? " / side" : ""}`;
}
