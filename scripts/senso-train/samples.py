"""Reader for the Sensō value-net sample files written by
packages/core/src/games/senso-battle-for-japan/mcts/sample-file.ts.

    header: magic u32 · version u32 · players u32 · rowFloats u32 · rows u32, then float32 rows
    sidecar <file>.cols.json names every column (blocks appear as name[i]).
"""
from __future__ import annotations

import json
import struct
from dataclasses import dataclass
from pathlib import Path

import numpy as np


@dataclass
class Samples:
    magic: str
    players: int
    data: np.ndarray  # (rows, rowFloats) float32
    columns: list[str]

    def col(self, name: str) -> np.ndarray:
        """A scalar column by name, or a block `name[k]` as (rows, k)."""
        idx = [i for i, c in enumerate(self.columns) if c == name]
        if idx:
            return self.data[:, idx[0]]
        idx = [i for i, c in enumerate(self.columns) if c.startswith(f"{name}[")]
        if not idx:
            raise KeyError(name)
        return self.data[:, idx]


def read_samples(path: str | Path) -> Samples:
    path = Path(path)
    raw = path.read_bytes()
    magic_num, version, players, row_floats, rows = struct.unpack("<IIIII", raw[:20])
    if version != 1:
        raise ValueError(f"unsupported sample version {version}")
    magic = magic_num.to_bytes(4, "little").decode("ascii")
    data = np.frombuffer(raw[20 : 20 + rows * row_floats * 4], dtype="<f4").reshape(rows, row_floats)
    columns = json.loads(Path(f"{path}.cols.json").read_text())["columns"]
    return Samples(magic, players, np.array(data), columns)


def concat(paths: list[str | Path]) -> Samples:
    parts = [read_samples(p) for p in paths]
    first = parts[0]
    for p in parts[1:]:
        if p.columns != first.columns or p.magic != first.magic:
            raise ValueError("sample files disagree on layout")
    return Samples(first.magic, first.players, np.vstack([p.data for p in parts]), first.columns)
