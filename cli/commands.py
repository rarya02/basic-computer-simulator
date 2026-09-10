def _print_cycle_state(machine, micro, changed):
    # helper to print current instruction, micro-op, and changed elements
    inst_hex = machine.format_word(machine.IR.value)
    changed_str = ", ".join(sorted(changed)) if changed else "None"
    print(f"Instruction in hand: {inst_hex}")
    print(f"Micro-operation: {micro}")
    print(f"Changed: {changed_str}")


def cmd_next_cycle(machine):
    # execute a single clock cycle
    micro, changed = machine.step_cycle()
    _print_cycle_state(machine, micro, changed)


def cmd_fast_cycle(machine, n):
    # execute up to n cycles or until CPU halts
    last_micro = ""
    last_changed = set()
    for _ in range(n):
        micro, changed = machine.step_cycle()
        last_micro, last_changed = micro, changed
        if machine.S.value == 0:
            break
    _print_cycle_state(machine, last_micro, last_changed)


def cmd_next_inst(machine):
    # execute exactly one full instruction
    machine.step_instruction()
    instr_hex = machine.format_word(machine.IR.value)
    print(f"Instruction executed: {instr_hex}")
    print(f"PC = 0x{machine.PC.value:03X} AC = {machine.format_word(machine.AC.value)}")


def cmd_fast_inst(machine, n):
    # execute up to n instructions or until CPU halts
    for _ in range(n):
        if machine.S.value == 0:
            break
        machine.step_instruction()
        instr_hex = machine.format_word(machine.IR.value)
        print(f"Instruction executed: {instr_hex}")
        print(f"PC = 0x{machine.PC.value:03X} AC = {machine.format_word(machine.AC.value)}")


def cmd_run(machine):
    # run continuously until HLT executes
    while machine.S.value != 0:
        machine.step_instruction()
        instr_hex = machine.format_word(machine.IR.value)
        print(f"Instruction executed: {instr_hex}")
        print(f"PC = 0x{machine.PC.value:03X} AC = {machine.format_word(machine.AC.value)}")


def cmd_show(machine, args):
    # generic show command
    if not args:
        print("Usage: show [REG|mem|all|profiler] ...")
        return

    what = args[0].lower()

    if what == "mem":
        # show memory contents
        if len(args) < 2:
            print("Usage: show mem ADDR [COUNT]")
            return

        addr_str = args[1]
        if addr_str.lower().startswith("0x"):
            addr_str = addr_str[2:]
        try:
            addr = int(addr_str, 16)
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
        # show all key registers and flags
        print(machine.show_all())

    elif what == "profiler":
        # show execution statistics
        print(machine.show_profiler())

    else:
        # show a specific register or flag
        print(machine.show_reg(what))
