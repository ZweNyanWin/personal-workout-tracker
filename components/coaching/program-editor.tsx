"use client";

import { useId, useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { restMinutes, restSeconds } from "@/lib/rest-minutes";
import type { WorkflowProgramDraft } from "@/lib/coach/workflow-schema";

type Exercise =
  WorkflowProgramDraft["weeks"][number]["days"][number]["exercises"][number];
const textareaClass =
  "min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-base leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 md:text-sm";
const selectClass =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-base md:text-sm";

function TextField({
  label,
  value,
  onChange,
  multiline,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          rows={2}
          value={value}
          maxLength={1200}
          onChange={(event) => onChange(event.target.value)}
          className={textareaClass}
          disabled={disabled}
        />
      ) : (
        <Input
          id={id}
          value={value}
          maxLength={1200}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
        />
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium">
        {label}
      </label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={1}
        value={Number.isFinite(value) ? value : ""}
        onChange={(event) =>
          onChange(event.target.value === "" ? 0 : Number(event.target.value))
        }
        disabled={disabled}
      />
    </div>
  );
}

function RestMinutesField({
  seconds,
  onChange,
  disabled,
}: {
  seconds: number;
  onChange: (seconds: number) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? (seconds > 0 ? String(restMinutes(seconds)) : "");

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium">
        Rest · minutes
      </label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={0.25}
        max={10}
        step={0.01}
        value={value}
        onBlur={() => setDraft(null)}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          const minutes = Number(next);
          onChange(
            next !== "" && Number.isFinite(minutes) ? restSeconds(minutes) : 0,
          );
        }}
        disabled={disabled}
      />
    </div>
  );
}

function ExerciseEditor({
  exercise,
  index,
  update,
  remove,
  duplicate,
  disabled,
}: {
  exercise: Exercise;
  index: number;
  update: (change: Partial<Exercise>) => void;
  remove: () => void;
  duplicate: () => void;
  disabled?: boolean;
}) {
  const dose = exercise.dose;
  const range = dose.kind === "hold" ? dose.seconds : dose.range;
  const kindId = useId();
  const perSideId = useId();
  function updateRange(key: "min" | "max", value: number) {
    update({
      dose:
        dose.kind === "hold"
          ? { kind: "hold", seconds: { ...range, [key]: value } }
          : { ...dose, range: { ...range, [key]: value } },
    });
  }
  return (
    <div className="rounded-xl border border-border bg-background/70 p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">
          Exercise group {index + 1}
        </span>
        {!disabled && (
          <div className="flex gap-1">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              title="Duplicate exercise group for top sets or backdowns"
              aria-label={`Duplicate exercise group ${index + 1}`}
              onClick={duplicate}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Remove exercise group ${index + 1}`}
              onClick={remove}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
      <TextField
        label="Exercise / exact variation"
        value={exercise.name}
        onChange={(name) => update({ name })}
        disabled={disabled}
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NumberField
          label="Sets"
          value={exercise.sets}
          min={1}
          max={10}
          onChange={(sets) => update({ sets })}
          disabled={disabled}
        />
        <div className="space-y-1.5">
          <label htmlFor={kindId} className="text-xs font-medium">
            Dose
          </label>
          <select
            id={kindId}
            value={dose.kind}
            className={selectClass}
            disabled={disabled}
            onChange={(event) =>
              update({
                dose:
                  event.target.value === "hold"
                    ? { kind: "hold", seconds: { min: 10, max: 20 } }
                    : {
                        kind: "reps",
                        range: { min: 5, max: 8 },
                        perSide: false,
                      },
              })
            }
          >
            <option value="reps">Repetitions</option>
            <option value="hold">Hold · seconds</option>
          </select>
        </div>
        <NumberField
          label={dose.kind === "hold" ? "Seconds · minimum" : "Reps · minimum"}
          value={range.min}
          min={1}
          max={dose.kind === "hold" ? 120 : 100}
          onChange={(value) => updateRange("min", value)}
          disabled={disabled}
        />
        <NumberField
          label={dose.kind === "hold" ? "Seconds · maximum" : "Reps · maximum"}
          value={range.max}
          min={1}
          max={dose.kind === "hold" ? 120 : 100}
          onChange={(value) => updateRange("max", value)}
          disabled={disabled}
        />
      </div>
      {dose.kind === "reps" && (
        <label htmlFor={perSideId} className="flex items-center gap-2 text-xs">
          <input
            id={perSideId}
            type="checkbox"
            checked={dose.perSide}
            onChange={(event) =>
              update({ dose: { ...dose, perSide: event.target.checked } })
            }
            disabled={disabled}
            className="h-4 w-4 accent-primary"
          />
          Repetitions are per side
        </label>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Load or assistance · include units"
          value={exercise.loadOrAssistance}
          onChange={(loadOrAssistance) => update({ loadOrAssistance })}
          disabled={disabled}
        />
        <TextField
          label="Effort · RPE / RIR / hold quality"
          value={exercise.effort}
          onChange={(effort) => update({ effort })}
          disabled={disabled}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <RestMinutesField
          seconds={exercise.restSeconds}
          onChange={(restSeconds) => update({ restSeconds })}
          disabled={disabled}
        />
        <TextField
          label="Coaching notes · optional"
          value={exercise.notes ?? ""}
          onChange={(notes) => update({ notes })}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

/** Edits individual prescription groups without merging repeated exercise names. */
export function CoachingProgramEditor({
  program,
  onChange,
  disabled = false,
}: {
  program: WorkflowProgramDraft;
  onChange: (program: WorkflowProgramDraft) => void;
  disabled?: boolean;
}) {
  const [selectedWeek, setSelectedWeek] = useState(
    program.weeks[0]?.number ?? 1,
  );
  const weekIndex = Math.max(
    0,
    program.weeks.findIndex((week) => week.number === selectedWeek),
  );
  const week = program.weeks[weekIndex];
  function updateWeek(change: Partial<WorkflowProgramDraft["weeks"][number]>) {
    onChange({
      ...program,
      weeks: program.weeks.map((value, index) =>
        index === weekIndex ? { ...value, ...change } : value,
      ),
    });
  }
  function updateDay(
    dayIndex: number,
    change: Partial<(typeof week.days)[number]>,
  ) {
    updateWeek({
      days: week.days.map((value, index) =>
        index === dayIndex ? { ...value, ...change } : value,
      ),
    });
  }
  return (
    <div className="space-y-4">
      <TextField
        label="Program title"
        value={program.title}
        onChange={(title) => onChange({ ...program, title })}
        disabled={disabled}
      />
      <details className="rounded-xl border border-border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Block guidance and assumptions
        </summary>
        <div className="mt-4 space-y-3">
          <TextField
            label="Assumptions · one per line"
            value={program.assumptions.join("\n")}
            multiline
            onChange={(value) =>
              onChange({ ...program, assumptions: value.split("\n") })
            }
            disabled={disabled}
          />
          <TextField
            label="Progression rules"
            value={program.progression}
            multiline
            onChange={(progression) => onChange({ ...program, progression })}
            disabled={disabled}
          />
          <TextField
            label="Regression and recovery rules"
            value={program.regression}
            multiline
            onChange={(regression) => onChange({ ...program, regression })}
            disabled={disabled}
          />
        </div>
      </details>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Review every week before assigning. Top sets and backdowns stay in
          separate exercise groups.
        </p>
        <nav aria-label="Draft weeks" className="flex flex-wrap gap-2">
          {program.weeks.map((value) => (
            <Button
              key={value.number}
              type="button"
              variant={value.number === week.number ? "default" : "outline"}
              size="sm"
              aria-current={value.number === week.number ? "step" : undefined}
              onClick={() => setSelectedWeek(value.number)}
            >
              Week {value.number}
            </Button>
          ))}
        </nav>
      </div>
      {week && (
        <div className="space-y-4">
          <TextField
            label={`Week ${week.number} focus`}
            value={week.focus}
            onChange={(focus) => updateWeek({ focus })}
            disabled={disabled}
          />
          {week.days.map((day, dayIndex) => (
            <details
              key={`${week.number}-${day.number}`}
              open={dayIndex === 0}
              className="rounded-xl border border-border bg-card p-4"
            >
              <summary className="cursor-pointer text-sm font-semibold [overflow-wrap:anywhere]">
                Day {day.number} · {day.title || "Untitled session"}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {day.exercises.length} groups
                </span>
              </summary>
              <div className="mt-4 space-y-4">
                <TextField
                  label="Session title"
                  value={day.title}
                  onChange={(title) => updateDay(dayIndex, { title })}
                  disabled={disabled}
                />
                <TextField
                  label="Warm-up · separate from working sets"
                  value={day.warmup}
                  multiline
                  onChange={(warmup) => updateDay(dayIndex, { warmup })}
                  disabled={disabled}
                />
                {day.exercises.map((exercise, exerciseIndex) => (
                  <ExerciseEditor
                    key={exerciseIndex}
                    exercise={exercise}
                    index={exerciseIndex}
                    disabled={disabled}
                    update={(change) =>
                      updateDay(dayIndex, {
                        exercises: day.exercises.map((value, index) =>
                          index === exerciseIndex
                            ? { ...value, ...change }
                            : value,
                        ),
                      })
                    }
                    remove={() =>
                      updateDay(dayIndex, {
                        exercises: day.exercises.filter(
                          (_, index) => index !== exerciseIndex,
                        ),
                      })
                    }
                    duplicate={() =>
                      updateDay(dayIndex, {
                        exercises: day.exercises.flatMap((value, index) =>
                          index === exerciseIndex
                            ? [value, structuredClone(value)]
                            : [value],
                        ),
                      })
                    }
                  />
                ))}
                {!disabled && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={day.exercises.length >= 12}
                    onClick={() =>
                      updateDay(dayIndex, {
                        exercises: [
                          ...day.exercises,
                          {
                            name: "",
                            sets: 3,
                            dose: {
                              kind: "reps",
                              range: { min: 5, max: 8 },
                              perSide: false,
                            },
                            loadOrAssistance: "",
                            effort: "",
                            restSeconds: 120,
                          },
                        ],
                      })
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add exercise group
                  </Button>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
      {disabled && (
        <p className={cn("text-xs text-muted-foreground")}>
          Approved prescriptions are preserved. Create a new draft to change the
          next block.
        </p>
      )}
    </div>
  );
}
