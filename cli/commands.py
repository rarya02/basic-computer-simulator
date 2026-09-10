def _print_cycle_state(machine, micro, changed):
    """Print the current instruction, micro-operation and changed elements."""
    changed_str = ", ".join(sorted(changed)) if changed else "None"
    print(f"Instruction in hand: {machine.format_word(machine.IR.value)}")
    print(f"Micro-operation: {micro}")
    print(f"Changed: {changed_str}")


def _print_instruction_state(machine):
    """Print the instruction just executed along with PC and AC."""
    print(f"Instruction executed: {machine.format_word(machine.IR.value)}")
    print(f"PC = 0x{machine.PC.value:03X} AC = {machine.format_word(machine.AC.value)}")


def cmd_next_cycle(machine):
    micro, changed = machine.step_cycle()
    _print_cycle_state(machine, micro, changed)


def cmd_fast_cycle(machine, n):
    """Execute up to n cycles, stopping early if the CPU halts."""
    micro, changed = "", set()
    for _ in range(n):
        micro, changed = machine.step_cycle()
        if machine.S.value == 0:
            break
    _print_cycle_state(machine, micro, changed)


def cmd_next_inst(machine):
    machine.step_instruction()
    _print_instruction_state(machine)


def cmd_fast_inst(machine, n):
    """Execute up to n instructions, stopping early if the CPU halts."""
    for _ in range(n):
        if machine.S.value == 0:
            break
        machine.step_instruction()
        _print_instruction_state(machine)


def cmd_run(machine):
    """Run until HLT executes."""
    while machine.S.value != 0:
        machine.step_instruction()
        _print_instruction_state(machine)


def cmd_show(machine, args):
    if not args:
        print("Usage: show [REG|mem|all|profiler] ...")
        return

    what = args[0].lower()

    if what == "mem":
        if len(args) < 2:
            print("Usage: show mem ADDR [COUNT]")
            return
        try:
            addr = int(args[1], 16)  # accepts an optional 0x prefix
        except ValueError:
            print("Address must be hex")
            return

        count = 1
        if len(args) > 2:
            try:
                count = int(args[2])
            except ValueError:
                print("COUNT must be an integer")
                return

        print(machine.show_mem(addr, count))
    elif what == "all":
        print(machine.show_all())
    elif what == "profiler":
        print(machine.show_profiler())
    else:
        print(machine.show_reg(what))
