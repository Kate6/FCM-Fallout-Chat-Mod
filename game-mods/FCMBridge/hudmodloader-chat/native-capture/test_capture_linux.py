#!/usr/bin/env python3
import os
from pathlib import Path
import tempfile
import unittest

from capture_hud_session import LogTail, fingerprint, find_process, sanitize


class LinuxCaptureTests(unittest.TestCase):
    def test_sanitizes_sensitive_fields(self):
        raw = 'token=abc "body":"hello" userId=123456789012345678 wss://falloutchatmod.com/relay'
        clean = sanitize(raw)
        for secret in ("abc", "hello", "123456789012345678", "falloutchatmod.com"):
            self.assertNotIn(secret, clean)

    def test_tails_only_new_complete_lines(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "xscal.log"
            path.write_text("old\n", encoding="utf-8")
            tail = LogTail(path)
            with path.open("a", encoding="utf-8") as handle:
                handle.write("new one\npartial")
            self.assertEqual(tail.read(), ["new one"])
            with path.open("a", encoding="utf-8") as handle:
                handle.write(" line\n")
            self.assertEqual(tail.read(), ["partial line"])

    def test_fingerprint_and_exact_process_selection(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            game = root / "game"
            game.mkdir()
            executable = game / "Fallout76.exe"
            executable.write_bytes(b"fixture")
            proc = root / "proc" / "123"
            proc.mkdir(parents=True)
            (proc / "comm").write_text("Fallout76.exe\n", encoding="utf-8")
            (proc / "cmdline").write_bytes(os.fsencode(str(executable)) + b"\0")
            (proc / "cwd").symlink_to(game, target_is_directory=True)
            self.assertEqual(find_process(game, None, root / "proc"), 123)
            self.assertEqual(fingerprint(executable)["sha256"], "f16d05ec6b29248d2c61adb1e9263f78e4f7bace1b955014a2d17872cfe4064d")

    def test_prefers_exact_game_comm_over_proton_wrappers(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            game = root / "game"
            game.mkdir()
            executable = game / "Fallout76.exe"
            executable.write_bytes(b"fixture")
            for pid, comm in (("100", "reaper"), ("200", "Fallout76.exe")):
                proc = root / "proc" / pid
                proc.mkdir(parents=True)
                (proc / "comm").write_text(comm + "\n", encoding="utf-8")
                (proc / "cmdline").write_bytes(os.fsencode(str(executable)) + b"\0")
                (proc / "cwd").symlink_to(game, target_is_directory=True)
            self.assertEqual(find_process(game, None, root / "proc"), 200)


if __name__ == "__main__":
    unittest.main()
