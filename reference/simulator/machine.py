from .registers import Register, Flag
from .memory import Memory
from .instruction_set import InstructionSet


class Machine:
    def __init__(self):
        self.AR = Register("AR", 12)  # address register
        self.PC = Register("PC", 12)  # program counter
        self.DR = Register("DR", 16)  # data register
        self.AC = Register("AC", 16)  # accumulator
        self.IR = Register("IR", 16)  # instruction register
        self.TR = Register("TR", 16)  # temporary register
        self.SC = Register("SC", 4)   # sequence counter

        self.E = Flag("E")  # carry
        self.I = Flag("I")  # indirect bit
        self.S = Flag("S")  # start/stop (0 = halted)
        self.S.set()

        self.registers = {r.name: r for r in (self.AR, self.PC, self.DR, self.AC, self.IR, self.TR, self.SC)}
        self.flags = {f.name: f for f in (self.E, self.I, self.S)}

        self.memory = Memory()
        self.iset = InstructionSet(self)

        self.total_cycles = 0
        self.instr_count = 0

    def finish_instruction(self):
        self.SC.clear()
        self.instr_count += 1

    @staticmethod
    def format_word(val: int) -> str:
        return f"0x{val & 0xFFFF:04X}"

    @staticmethod
    def format_bin16(val: int) -> str:
        s = f"{val & 0xFFFF:016b}"
        return " ".join(s[i:i + 4] for i in range(0, 16, 4))

    def load_program_and_data(self, prog_file, data_file):
        prog_start = self.memory.load_file(prog_file)
        self.memory.load_file(data_file)
        if prog_start is not None:
            self.PC.load(prog_start)
        self.SC.clear()
        self.S.set()

    def _elements(self):
        return (*self.registers.values(), *self.flags.values())

    def step_cycle(self):
        """Execute one clock cycle. Returns (micro-op text, set of changed element names)."""
        for element in self._elements():
            element.reset_state()

        if self.S.value == 0:
            self.total_cycles += 1
            return "CPU halted (HLT executed)", set()

        T = self.SC.value
        changed = set()

        # fetch and decode
        if T == 0:
            self.AR.load(self.PC.value)
            self.SC.increment()
            micro = "T0: AR ← PC"

        elif T == 1:
            self.IR.load(self.memory.read(self.AR.value))
            self.PC.increment()
            self.SC.increment()
            micro = "T1: IR ← M[AR], PC ← PC + 1"

        elif T == 2:
            self.AR.load(self.IR.value)
            self.I.load((self.IR.value >> 15) & 1)
            self.SC.increment()
            micro = "T2: AR ← IR(0–11), I ← IR(15)"

        # execute
        else:
            opcode = (self.IR.value >> 12) & 0x7
            if opcode == 0b111 and self.I.value == 0:
                micro, changed = self.iset.execute_register_ref(T)
            else:
                micro, changed = self.iset.execute_memory_ref(opcode, T)

        self.total_cycles += 1

        for element in self._elements():
            if element.updated:
                changed.add(element.name)

        return micro, changed

    def step_instruction(self):
        """Execute cycles until the current instruction completes or the CPU halts."""
        if self.S.value == 0:
            return "CPU halted (HLT executed)", set()

        while True:
            micro, changed = self.step_cycle()
            if self.S.value == 0 or self.SC.value == 0:
                return micro, changed

    def show_reg(self, name: str) -> str:
        n = name.upper()
        if n == "SC":
            return f"SC = {self.SC.value}"
        if n in self.flags:
            return f"{n} = {self.flags[n].value}"
        if n not in self.registers:
            return f"Unknown register {name}"
        value = self.registers[n].value
        return f"{n} = {self.format_word(value)} (binary: {self.format_bin16(value)})"

    def show_all(self) -> str:
        return (
            f"AC={self.format_word(self.AC.value)} "
            f"DR={self.format_word(self.DR.value)} "
            f"AR=0x{self.AR.value:03X} "
            f"PC=0x{self.PC.value:03X} "
            f"IR={self.format_word(self.IR.value)} "
            f"TR={self.format_word(self.TR.value)} "
            f"E={self.E.value} I={self.I.value} SC={self.SC.value}"
        )

    def show_mem(self, addr: int, count: int = 1) -> str:
        lines = []
        for i in range(count):
            a = (addr + i) & 0x0FFF
            val = self.memory.data[a]
            if count == 1:
                lines.append(f"M[{a:03X}] = {self.format_word(val)} (binary: {self.format_bin16(val)})")
            else:
                lines.append(f"0x{a:03X} | {self.format_word(val)}")
        return "\n".join(lines)

    def show_profiler(self) -> str:
        cpi = self.total_cycles / self.instr_count if self.instr_count > 0 else 0.0
        return (
            f"Total cycles: {self.total_cycles}\n"
            f"Instructions executed: {self.instr_count}\n"
            f"Average CPI: {cpi:.2f}\n"
            f"Memory reads: {self.memory.reads}\n"
            f"Memory writes: {self.memory.writes}"
        )
