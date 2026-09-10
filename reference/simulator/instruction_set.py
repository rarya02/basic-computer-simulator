class InstructionSet:
    """Execute-phase (T3 onward) micro-operations for each instruction.

    Every method returns (micro-op text, changed). `changed` only needs to list
    memory cells; the machine adds updated registers and flags itself.
    """

    def __init__(self, machine):
        self.m = machine
        self._mem_handlers = {
            0: self._mem_AND,
            1: self._mem_ADD,
            2: self._mem_LDA,
            3: self._mem_STA,
            4: self._mem_BUN,
            5: self._mem_BSA,
            6: self._mem_ISZ,
        }

    def execute_memory_ref(self, opcode: int, T: int):
        changed = set()
        indirect = self.m.I.value

        if T == 3:
            if indirect:
                self.m.AR.load(self.m.memory.read(self.m.AR.value))
                self.m.SC.increment()
                return "T3: AR ← M[AR] (indirect)", changed
            self.m.SC.increment()
            return "T3: (direct address, no micro-op)", changed

        effT = T - 1 if indirect else T  # indirect shifts micro-ops by 1

        handler = self._mem_handlers.get(opcode)
        if handler is None:
            return f"T{T}: (unknown memory-reference opcode)", changed
        return handler(effT, T, changed)

    def _mem_AND(self, effT, T, changed):
        if effT == 4:
            self.m.DR.load(self.m.memory.read(self.m.AR.value))
            self.m.SC.increment()
            return f"T{T}: DR ← M[AR]", changed

        if effT == 5:
            self.m.AC.load(self.m.AC.value & self.m.DR.value)
            self.m.finish_instruction()
            return f"T{T}: AC ← AC ∧ DR", changed

        return f"T{T}: (no-op for AND)", changed

    def _mem_ADD(self, effT, T, changed):
        if effT == 4:
            self.m.DR.load(self.m.memory.read(self.m.AR.value))
            self.m.SC.increment()
            return f"T{T}: DR ← M[AR]", changed

        if effT == 5:
            result = self.m.AC.value + self.m.DR.value
            self.m.AC.load(result)
            self.m.E.load(result > 0xFFFF)
            self.m.finish_instruction()
            return f"T{T}: AC ← AC + DR, E ← carry", changed

        return f"T{T}: (no-op for ADD)", changed

    def _mem_LDA(self, effT, T, changed):
        if effT == 4:
            self.m.DR.load(self.m.memory.read(self.m.AR.value))
            self.m.SC.increment()
            return f"T{T}: DR ← M[AR]", changed

        if effT == 5:
            self.m.AC.load(self.m.DR.value)
            self.m.finish_instruction()
            return f"T{T}: AC ← DR", changed

        return f"T{T}: (no-op for LDA)", changed

    def _mem_STA(self, effT, T, changed):
        if effT == 4:
            self.m.memory.write(self.m.AR.value, self.m.AC.value)
            changed.add(f"M[{self.m.AR.value:03X}]")
            self.m.finish_instruction()
            return f"T{T}: M[AR] ← AC", changed

        return f"T{T}: (no-op for STA)", changed

    def _mem_BUN(self, effT, T, changed):
        if effT == 4:
            self.m.PC.load(self.m.AR.value)
            self.m.finish_instruction()
            return f"T{T}: PC ← AR", changed

        return f"T{T}: (no-op for BUN)", changed

    def _mem_BSA(self, effT, T, changed):
        if effT == 4:
            self.m.memory.write(self.m.AR.value, self.m.PC.value)  # save return address
            changed.add(f"M[{self.m.AR.value:03X}]")
            self.m.AR.load(self.m.AR.value + 1)
            self.m.SC.increment()
            return f"T{T}: M[AR] ← PC, AR ← AR + 1", changed

        if effT == 5:
            self.m.PC.load(self.m.AR.value)
            self.m.finish_instruction()
            return f"T{T}: PC ← AR", changed

        return f"T{T}: (no-op for BSA)", changed

    def _mem_ISZ(self, effT, T, changed):
        if effT == 4:
            self.m.DR.load(self.m.memory.read(self.m.AR.value))
            self.m.SC.increment()
            return f"T{T}: DR ← M[AR]", changed

        if effT == 5:
            self.m.DR.load(self.m.DR.value + 1)
            self.m.SC.increment()
            return f"T{T}: DR ← DR + 1", changed

        if effT == 6:
            self.m.memory.write(self.m.AR.value, self.m.DR.value)
            changed.add(f"M[{self.m.AR.value:03X}]")
            micro = f"T{T}: M[AR] ← DR"
            if self.m.DR.value == 0:
                self.m.PC.increment()  # skip next instruction
                micro += "; if DR = 0 then PC ← PC + 1"
            self.m.finish_instruction()
            return micro, changed

        return f"T{T}: (no-op for ISZ)", changed

    def execute_register_ref(self, T: int):
        changed = set()
        if T != 3:
            return f"T{T}: (idle for register-reference)", changed

        m = self.m
        instr = m.IR.value & 0x0FFF
        parts = []

        def bit(n: int) -> int:
            return (instr >> n) & 1

        if bit(11):
            m.AC.clear()
            parts.append("CLA")

        if bit(10):
            m.E.clear()
            parts.append("CLE")

        if bit(9):
            m.AC.load(~m.AC.value)
            parts.append("CMA")

        if bit(8):
            m.E.complement()
            parts.append("CME")

        if bit(7):  # rotate right through E
            combined = (m.E.value << 16) | m.AC.value
            m.E.load(combined & 1)
            m.AC.load(combined >> 1)
            parts.append("CIR")

        if bit(6):  # rotate left through E
            combined = (m.E.value << 16) | m.AC.value
            m.E.load((combined >> 16) & 1)
            m.AC.load((combined << 1) & 0x1FFFF)
            parts.append("CIL")

        if bit(5):
            m.AC.load(m.AC.value + 1)
            parts.append("INC")

        if bit(4):
            if (m.AC.value & 0x8000) == 0:
                m.PC.increment()
            parts.append("SPA")

        if bit(3):
            if (m.AC.value & 0x8000) != 0:
                m.PC.increment()
            parts.append("SNA")

        if bit(2):
            if m.AC.value == 0:
                m.PC.increment()
            parts.append("SZA")

        if bit(1):
            if m.E.value == 0:
                m.PC.increment()
            parts.append("SZE")

        if bit(0):
            m.S.clear()
            parts.append("HLT")

        m.finish_instruction()

        if not parts:
            return "T3: (no register-reference bit set)", changed
        return "T3: " + ", ".join(parts), changed
