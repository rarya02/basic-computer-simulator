#!/usr/bin/env python3
"""Dump a golden cycle trace from the Python reference for every program in programs/.

Each programs/NAME.asm is assembled by the reference assembler, loaded by the
reference loader, and stepped one clock cycle at a time until HLT. The trace is
written to tests/golden/NAME.trace, one line per cycle:

    CYCLE T<n> AR=hhh PC=hhh DR=hhhh AC=hhhh IR=hhhh TR=hhhh SC=h E=b I=b S=b

CYCLE is 1-based and zero-padded to five digits, T<n> is the T-state the cycle
executed in, and the registers and flip-flops show the state after the clock
edge. The reference models no I/O or interrupt hardware, so INPR, OUTR, R, IEN,
FGI and FGO are absent. tests/trace.ts must produce the identical format.
"""

import contextlib
import io
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PROGRAMS = REPO / "programs"
GOLDEN = Path(__file__).resolve().parent
MAX_CYCLES = 100_000

sys.path.insert(0, str(REPO / "reference"))

from assembler.assembler import Assembler  # noqa: E402
from simulator.machine import Machine  # noqa: E402


def format_line(cycle, t, m):
    return (
        f"{cycle:05d} T{t} AR={m.AR.value:03X} PC={m.PC.value:03X} "
        f"DR={m.DR.value:04X} AC={m.AC.value:04X} IR={m.IR.value:04X} "
        f"TR={m.TR.value:04X} SC={m.SC.value:X} "
        f"E={m.E.value} I={m.I.value} S={m.S.value}"
    )


def load(asm_path):
    """Assemble and load through the reference, failing on any assembler complaint."""
    with tempfile.TemporaryDirectory() as tmp:
        prog = Path(tmp) / "program.txt"
        data = Path(tmp) / "data.txt"
        log = io.StringIO()
        with contextlib.redirect_stdout(log):
            Assembler().assemble(str(asm_path), str(prog), str(data))
        output = log.getvalue()
        # The reference assembler reports problems by printing and carrying on.
        problems = [
            line for line in output.splitlines()
            if not line.startswith("Symbol Table:") and ("rror" in line or "Unknown" in line)
        ]
        if problems or "Assembly Complete." not in output:
            raise SystemExit(f"{asm_path.name}: reference assembler failed:\n{output}")

        machine = Machine()
        machine.load_program_and_data(str(prog), str(data))
        return machine


def trace(asm_path):
    machine = load(asm_path)
    lines = []
    for cycle in range(1, MAX_CYCLES + 1):
        t = machine.SC.value
        machine.step_cycle()
        lines.append(format_line(cycle, t, machine))
        if machine.S.value == 0:
            return lines
    raise SystemExit(f"{asm_path.name}: did not halt within {MAX_CYCLES} cycles")


def main():
    programs = sorted(PROGRAMS.glob("*.asm"))
    if not programs:
        raise SystemExit(f"no programs found in {PROGRAMS}")

    expected = set()
    for asm_path in programs:
        out = GOLDEN / f"{asm_path.stem}.trace"
        lines = trace(asm_path)
        out.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
        expected.add(out)
        print(f"{asm_path.name}: {len(lines)} cycles -> {out.relative_to(REPO)}")

    for stale in set(GOLDEN.glob("*.trace")) - expected:
        stale.unlink()
        print(f"removed stale {stale.relative_to(REPO)}")


if __name__ == "__main__":
    main()
