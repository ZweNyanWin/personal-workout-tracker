"""Write fictional format-smoke data, never the private research corpus."""
import argparse
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def records():
    pairs = [
        ("My plan says 2 sets of 5. Repeat the target.", "The planned target is 2 sets of 5 repetitions."),
        ("Convert a written 120-second rest into minutes.", "120 seconds is 2 minutes of rest."),
        ("No completed logs are supplied. What did I lift last week?", "Your completed lifts are unknown because no logs were supplied."),
        ("My coach wrote a 15-second plank hold. Is that 15 reps?", "It is a 15-second hold, not 15 repetitions."),
        ("Keep the source load 9 lb. Do not convert units.", "The source load remains 9 lb."),
        ("A draft proposes 4 sets. Is that completed work?", "No. Four sets is a proposed target, not completed work."),
        ("The source names a paused squat. May a formatter drop paused?", "No. Keep the written paused squat variation."),
        ("The user supplies no working load. Invent a personal record?", "No. The working load and personal record remain unknown."),
    ]
    return [{"messages": [{"role": "system", "content": "Preserve supplied workout facts. Missing facts remain unknown."},
                          {"role": "user", "content": question},
                          {"role": "assistant", "content": answer}]} for question, answer in pairs]


def write_demo(output):
    private_root = (ROOT / "ai/data/private").resolve()
    target = Path(output).resolve()
    if target == private_root or not target.is_relative_to(private_root):
        raise ValueError("Demo output must be a new directory under ai/data/private")
    if Path(output).is_symlink() or target.exists():
        raise FileExistsError("Demo output already exists; choose a new name")
    old_umask = os.umask(0o077)
    try:
        target.mkdir(parents=True, exist_ok=False, mode=0o700)
        examples = records()
        splits = {"train": examples[:4], "valid": examples[4:6], "test": examples[6:]}
        for name, rows in splits.items():
            with (target / (name + ".jsonl")).open("x") as handle:
                for row in rows:
                    handle.write(json.dumps(row) + "\n")
        manifest = {"kind": "fictional-format-smoke-demo", "counts": {name: len(rows) for name, rows in splits.items()},
                    "historical_experiment_data": False, "quality_benchmark": False}
        with (target / "manifest.json").open("x") as handle:
            json.dump(manifest, handle, indent=2)
        return manifest
    finally:
        os.umask(old_umask)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(write_demo(args.output)))


if __name__ == "__main__":
    main()
