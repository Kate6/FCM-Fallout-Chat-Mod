#!/usr/bin/env python3
"""Read-only Linux/Proton HUD evidence collector. It never sends input or signals."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time
import uuid


def sanitize(line: str) -> str:
    line = re.sub(r"(?i)(authorization|token|secret|password)(\s*[:=]\s*)([^\s,;]+)", r"\1\2<redacted>", line)
    line = re.sub(r"(?i)wss?://[^/\s]+", "wss://<redacted-host>", line)
    line = re.sub(r"(?i)https?://[^/\s]+", "https://<redacted-host>", line)
    line = re.sub(r'(?i)"(body|content|displayName|username|userId|linkedUserId)"\s*:\s*"(?:\\.|[^"])*"', r'"\1":"<redacted>"', line)
    line = re.sub(r"(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b", "<redacted-uuid>", line)
    return re.sub(r"\b\d{15,22}\b", "<redacted-id>", line)


def fingerprint(path: Path) -> dict[str, object] | None:
    if not path.is_file():
        return None
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return {"name": path.name, "sizeBytes": path.stat().st_size, "sha256": digest.hexdigest()}


def process_matches(pid: int, game_root: Path, proc_root: Path = Path("/proc")) -> bool:
    process = proc_root / str(pid)
    try:
        comm = (process / "comm").read_text(encoding="utf-8").strip().lower()
        args = (process / "cmdline").read_bytes().split(b"\0")
        decoded = [value.decode("utf-8", "replace") for value in args if value]
        name_matches = comm in {"fallout76", "fallout76.exe"} or any(
            value.replace("\\", "/").lower().endswith("/fallout76.exe") for value in decoded
        )
        if not name_matches:
            return False
        expected = (game_root / "Fallout76.exe").resolve()
        for value in decoded:
            candidate = value.replace("Z:\\", "/").replace("\\", "/")
            if candidate.startswith("/") and Path(candidate).resolve() == expected:
                return True
        return (process / "cwd").resolve() == game_root.resolve()
    except (FileNotFoundError, PermissionError, ProcessLookupError, OSError):
        return False


def find_process(game_root: Path, requested_pid: int | None, proc_root: Path = Path("/proc")) -> int:
    if requested_pid is not None:
        if not process_matches(requested_pid, game_root, proc_root):
            raise RuntimeError("the supplied PID is not Fallout76 from the supplied game directory")
        return requested_pid
    candidates = [entry for entry in proc_root.iterdir() if entry.name.isdigit()]
    exact = []
    for entry in candidates:
        try:
            if (entry / "comm").read_text(encoding="utf-8").strip().lower() in {"fallout76", "fallout76.exe"} \
                    and process_matches(int(entry.name), game_root, proc_root):
                exact.append(int(entry.name))
        except (FileNotFoundError, PermissionError, ProcessLookupError, OSError):
            continue
    if len(exact) == 1:
        return exact[0]
    matches = [int(entry.name) for entry in candidates
               if process_matches(int(entry.name), game_root, proc_root)]
    if len(matches) != 1:
        raise RuntimeError(f"expected exactly one matching Fallout76 process; found {len(matches)}")
    return matches[0]


class LogTail:
    def __init__(self, path: Path):
        self.path = path
        self.offset = path.stat().st_size if path.is_file() else 0
        self.remainder = ""

    def read(self) -> list[str]:
        if not self.path.is_file():
            return []
        size = self.path.stat().st_size
        if size < self.offset:
            self.offset = 0
            self.remainder = ""
        with self.path.open("rb") as handle:
            handle.seek(self.offset)
            data = handle.read()
            self.offset = handle.tell()
        text = self.remainder + data.decode("utf-8", "replace")
        parts = text.split("\n")
        self.remainder = parts.pop()
        return [sanitize(part.rstrip("\r")) for part in parts]


def atomic_json(path: Path, value: dict[str, object]) -> None:
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--game-directory", type=Path, required=True)
    parser.add_argument("--output-directory", type=Path, default=Path(__file__).parents[1] / "simulator" / "artifacts")
    parser.add_argument("--duration-seconds", type=int, default=120)
    parser.add_argument("--pid", type=int)
    args = parser.parse_args()
    if not 10 <= args.duration_seconds <= 1800:
        parser.error("--duration-seconds must be between 10 and 1800")

    game_root = args.game_directory.resolve(strict=True)
    pid = find_process(game_root, args.pid)
    run_id = uuid.uuid4().hex
    run_dir = args.output_directory / f"native-linux-{run_id}"
    run_dir.mkdir(parents=True, exist_ok=False)
    sources = {
        "sim-xscal.log": LogTail(game_root / "xscal.log"),
        "sim-zfe.log": LogTail(game_root / "zfe.log"),
    }
    manifest: dict[str, object] = {
        "schemaVersion": 1,
        "evidence": "REAL FALLOUT/PROTON SESSION; LOG CONTENT SANITIZED",
        "runId": run_id,
        "startedAtUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "durationSeconds": args.duration_seconds,
        "process": {"name": "Fallout76.exe", "pid": pid, "launchedByCollector": False},
        "host": {
            "platform": "linux-proton",
            "sessionType": os.environ.get("XDG_SESSION_TYPE", "unknown"),
            "desktop": os.environ.get("XDG_CURRENT_DESKTOP", "unknown"),
            "waylandAvailable": bool(os.environ.get("WAYLAND_DISPLAY")),
            "x11Available": bool(os.environ.get("DISPLAY")),
            "inputAutomation": False,
        },
        "artifacts": {
            "fallout": fingerprint(game_root / "Fallout76.exe"),
            "xscal": fingerprint(game_root / "dxgi.dll"),
            "widget": fingerprint(game_root / "Data" / "FCMChatWidget.ba2"),
            "hudModLoader": fingerprint(game_root / "Data" / "HUDModLoader.ba2"),
        },
    }
    manifest_path = run_dir / "manifest.json"
    atomic_json(manifest_path, manifest)
    print(f"Capturing fresh diagnostics for {args.duration_seconds}s; control Fallout manually.")
    deadline = time.monotonic() + args.duration_seconds
    try:
        while time.monotonic() < deadline and process_matches(pid, game_root):
            for output_name, tail in sources.items():
                lines = tail.read()
                if not lines:
                    continue
                with (run_dir / output_name).open("a", encoding="utf-8", newline="\n") as output:
                    for line in lines:
                        output.write(line + "\n")
                        print(f"[{output_name}] {line}")
            time.sleep(0.25)
    except KeyboardInterrupt:
        print("Capture interrupted; finalizing collected evidence.", file=sys.stderr)
    finally:
        manifest["endedAtUtc"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        atomic_json(manifest_path, manifest)
        print(f"Capture stopped without sending input or signals. Evidence: {run_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
