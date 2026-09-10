import os
import sys

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Allow running this file directly (python cli/interface.py)
if ROOT_DIR not in sys.path:
    sys.path.append(ROOT_DIR)

from simulator.machine import Machine
from cli import commands

HELP_TEXT = """Commands:
  next_cycle
  fast_cycle N
  next_inst
  fast_inst N
  run
  show REG
  show mem ADDR [COUNT]
  show all
  show profiler
  exit / quit"""


def _parse_count(args, usage):
    """Return the integer N from args, or None after printing an error."""
    if not args:
        print(f"Usage: {usage}")
        return None
    try:
        return int(args[0])
    except ValueError:
        print("N must be an integer")
        return None


def main():
    data_dir = os.path.join(ROOT_DIR, "data")
    prog_path = os.path.join(data_dir, "program.txt")
    data_path = os.path.join(data_dir, "data.txt")

    machine = Machine()

    print("Mano Basic Computer Simulator")
    if os.path.exists(prog_path):
        machine.load_program_and_data(prog_path, data_path)
        print(f"Program loaded from {prog_path} and {data_path}")
    else:
        print(f"[ERROR] program file not found: {prog_path}")
    print("Type 'help' for list of commands.")

    while True:
        try:
            line = input("> ").strip()
        except EOFError:
            break

        if not line:
            continue

        cmd, *args = line.split()
        cmd = cmd.lower()

        if cmd in ("exit", "quit"):
            break
        elif cmd == "help":
            print(HELP_TEXT)
        elif cmd == "next_cycle":
            commands.cmd_next_cycle(machine)
        elif cmd == "fast_cycle":
            n = _parse_count(args, "fast_cycle N")
            if n is not None:
                commands.cmd_fast_cycle(machine, n)
        elif cmd == "next_inst":
            commands.cmd_next_inst(machine)
        elif cmd == "fast_inst":
            n = _parse_count(args, "fast_inst N")
            if n is not None:
                commands.cmd_fast_inst(machine, n)
        elif cmd == "run":
            commands.cmd_run(machine)
        elif cmd == "show":
            commands.cmd_show(machine, args)
        else:
            print("Unknown command. Type 'help' for commands.")


if __name__ == "__main__":
    main()
