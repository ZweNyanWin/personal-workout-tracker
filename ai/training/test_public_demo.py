import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("public_demo", Path(__file__).with_name("prepare_demo_data.py"))
demo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(demo)


class DemoBoundaries(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.previous_root = demo.ROOT
        self.addCleanup(setattr, demo, "ROOT", self.previous_root)
        demo.ROOT = Path(self.folder.name)

    def test_private_fresh_output_and_disjoint_splits(self):
        target = demo.ROOT / "ai/data/private/demo"
        result = demo.write_demo(target)
        self.assertEqual(result["counts"], {"train": 4, "valid": 2, "test": 2})
        prompts = set()
        for name in ["train", "valid", "test"]:
            file = target / (name + ".jsonl")
            self.assertEqual(file.stat().st_mode & 0o777, 0o600)
            for line in file.read_text().splitlines():
                row = json.loads(line)
                self.assertEqual([message["role"] for message in row["messages"]], ["system", "user", "assistant"])
                prompt = row["messages"][1]["content"]
                self.assertNotIn(prompt, prompts)
                prompts.add(prompt)
        self.assertFalse(result["historical_experiment_data"])
        self.assertFalse(result["quality_benchmark"])
        before = (target / "train.jsonl").read_bytes()
        with self.assertRaises(FileExistsError):
            demo.write_demo(target)
        self.assertEqual((target / "train.jsonl").read_bytes(), before)

    def test_public_paths_and_symlink_escape_are_rejected(self):
        with self.assertRaises(ValueError):
            demo.write_demo(demo.ROOT / "public/demo")
        private = demo.ROOT / "ai/data/private"
        private.mkdir(parents=True)
        with self.assertRaises(ValueError):
            demo.write_demo(private)
        outside = demo.ROOT / "outside"
        outside.mkdir()
        (private / "alias").symlink_to(outside, target_is_directory=True)
        with self.assertRaises(ValueError):
            demo.write_demo(private / "alias/new")
        self.assertFalse((outside / "new").exists())


if __name__ == "__main__":
    unittest.main()
