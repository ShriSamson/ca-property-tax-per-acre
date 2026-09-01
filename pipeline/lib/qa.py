"""QA report helpers: accumulate named counts/samples, print and save as JSON."""
import json
from pathlib import Path


class QAReport:
    def __init__(self, step: str):
        self.step = step
        self.items: dict = {}

    def add(self, key: str, value):
        self.items[key] = value
        print(f"QA [{self.step}] {key}: {value}")

    def add_samples(self, key: str, values, limit: int = 50):
        sample = list(values)[:limit]
        self.items[key] = sample
        print(f"QA [{self.step}] {key} ({len(sample)} shown): {sample[:10]}")

    def save(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        existing = {}
        if path.exists():
            existing = json.loads(path.read_text())
        existing[self.step] = self.items
        path.write_text(json.dumps(existing, indent=2, default=str))
        print(f"QA [{self.step}] saved to {path}")
