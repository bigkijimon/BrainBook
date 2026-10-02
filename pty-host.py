"""Run one Hermes process in a pseudo-terminal for BrainBook (Python standard library only).

BrainBook's server (terminal.mjs) starts this helper and talks to it over pipes:
  stdin  <- frames: 1 type byte + 4-byte big-endian length + payload
            b"d" = keystrokes for Hermes, b"r" = resize ("rows,cols")
  stdout -> raw terminal output from Hermes

The command is fixed by the server (ASTER_PTY_ARGV) and is always the Hermes CLI.
There is no shell in between, so when Hermes exits the terminal ends.
"""
import errno
import fcntl
import json
import os
import pty
import select
import signal
import struct
import sys
import termios


def set_size(fd: int, rows: int, cols: int) -> None:
    rows, cols = max(10, rows), max(40, cols)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))


def write_all(fd: int, data: bytes) -> None:
    view = memoryview(data)
    while view:
        try:
            view = view[os.write(fd, view):]
        except OSError as exc:
            if exc.errno != errno.EAGAIN:
                raise
            select.select([], [fd], [], 1)


def main() -> int:
    argv = json.loads(os.environ.pop("ASTER_PTY_ARGV"))
    rows, cols = (int(v) for v in os.environ.pop("ASTER_PTY_SIZE", "30,100").split(","))
    pid, fd = pty.fork()
    if pid == 0:
        try:
            os.execv(argv[0], argv)
        finally:
            os._exit(127)
    set_size(fd, rows, cols)
    signal.signal(signal.SIGTERM, lambda *_: os.kill(pid, signal.SIGHUP))

    pending = b""
    stdin_open = True
    while True:
        readers = [fd] + ([0] if stdin_open else [])
        try:
            ready, _, _ = select.select(readers, [], [])
        except InterruptedError:
            continue
        if fd in ready:
            try:
                data = os.read(fd, 65536)
            except OSError:
                data = b""
            if not data:
                break
            write_all(1, data)
        if 0 in ready:
            chunk = os.read(0, 65536)
            if not chunk:  # BrainBook went away: hang up Hermes
                stdin_open = False
                os.kill(pid, signal.SIGHUP)
                continue
            pending += chunk
            while len(pending) >= 5:
                kind, size = pending[:1], struct.unpack(">I", pending[1:5])[0]
                if len(pending) < 5 + size:
                    break
                payload, pending = pending[5:5 + size], pending[5 + size:]
                if kind == b"d":
                    write_all(fd, payload)
                elif kind == b"r":
                    r, c = (int(v) for v in payload.decode().split(","))
                    set_size(fd, r, c)
                    os.kill(pid, signal.SIGWINCH)
    _, status = os.waitpid(pid, 0)
    return os.waitstatus_to_exitcode(status) if hasattr(os, "waitstatus_to_exitcode") else status >> 8


if __name__ == "__main__":
    sys.exit(main())
