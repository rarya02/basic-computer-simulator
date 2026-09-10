class InstructionSet:
    def __init__(self, machine):
        self.m = machine  # reference to machine instance

    def execute_memory_ref(self, opcode: int, T: int):
        changed = set()
        I = self.m.I.value  # indirect flag

        if I == 0 and T == 3:
            self.m.SC.increment()  # skip indirect cycle
            return "T3: (direct address, no micro-op)", changed

        if I == 1 and T == 3:
            word = self.m.memory.read(self.m.AR.value)  # fetch indirect address
            self.m.AR.load(word)  # load effective address
            self.m.SC.increment()
            return "T3: AR ← M[AR] (indirect)", changed

        if I == 1:
            effT = T - 1  # indirect shifts micro-ops by 1
        else:
            effT = T

        # decode opcode
        if opcode == 0:
            return self._mem_AND(effT, T, changed)
        if opcode == 1:
            return self._mem_ADD(effT, T, changed)
        if opcode == 2:
            return self._mem_LDA(effT, T, changed)
        if opcode == 3:
            return self._mem_STA(effT, T, changed)
        if opcode == 4:
            return self._mem_BUN(effT, T, changed)
        if opcode == 5:
            return self._mem_BSA(effT, T, changed)
        if opcode == 6:
            return self._mem_ISZ(effT, T, changed)

        return f"T{T}: (unknown memory-reference opcode)", changed

    # AND instruction
    def _mem_AND(self, effT, T, changed):
        if effT == 4:
            self.m.DR.load(self.m.memory.read(self.m.AR.value))  # load operand
            self.m.SC.increment()
            return f"T{T}: DR ← M[AR]", changed

        if effT == 5:
            self.m.AC.load(self.m.AC.value & self.m.DR.value)  # perform AND
            self.m.finish_instruction()
            return f"T{T}: AC ← AC ∧ DR", changed

        return f"T{T}: (no-op for AND)", changed

    # ADD instruction
    def _mem_ADD(self, effT, T, changed):
        if effT == 4:
            self.m.DR.load(self.m.memory.read(self.m.AR.value))  # load operand
            self.m.SC.increment()
            return f"T{T}: DR ← M[AR]", changed

        if effT == 5:
            result = self.m.AC.value + self.m.DR.value  # add values
            self.m.AC.load(result)
            if result > 0xFFFF:
                self.m.E.set()  # carry flag
            else:
                self.m.E.clear()
            self.m.finish_instruction()
            return f"T{T}: AC ← AC + DR, E ← carry", changed

        return f"T{T}: (no-op for ADD)", changed

    # LDA instruction
    def _mem_LDA(self, effT, T, changed):
        if effT == 4:
            self.m.DR.load(self.m.memory.read(self.m.AR.value))  # read memory
            self.m.SC.increment()
            return f"T{T}: DR ← M[AR]", changed

        if effT == 5:
            self.m.AC.load(self.m.DR.value)  # load into AC
            self.m.finish_instruction()
            return f"T{T}: AC ← DR", changed

        return f"T{T}: (no-op for LDA)", changed

    # STA instruction
    def _mem_STA(self, effT, T, changed):
        if effT == 4:
            self.m.memory.write(self.m.AR.value, self.m.AC.value)  # store AC
            changed.add(f"M[{self.m.AR.value:03X}]")
            self.m.finish_instruction()
            return f"T{T}: M[AR] ← AC", changed

        return f"T{T}: (no-op for STA)", changed

    # BUN instruction
    def _mem_BUN(self, effT, T, changed):
        if effT == 4:
            self.m.PC.load(self.m.AR.value)  # jump to AR
            self.m.finish_instruction()
            return f"T{T}: PC ← AR", changed

        return f"T{T}: (no-op for BUN)", changed

    # BSA instruction (store return + jump)
    def _mem_BSA(self, effT, T, changed):
        if effT == 4:
            self.m.memory.write(self.m.AR.value, self.m.PC.value)  # save return
            changed.add(f"M[{self.m.AR.value:03X}]")
            self.m.AR.load(self.m.AR.value + 1)  # next instruction
            self.m.SC.increment()
            return f"T{T}: M[AR] ← PC, AR ← AR + 1", changed

        if effT == 5:
            self.m.PC.load(self.m.AR.value)  # branch to subroutine
            self.m.finish_instruction()
            return f"T{T}: PC ← AR", changed

        return f"T{T}: (no-op for BSA)", changed

    # ISZ instruction
    def _mem_ISZ(self, effT, T, changed):
        if effT == 4:
            self.m.DR.load(self.m.memory.read(self.m.AR.value))  # read operand
            self.m.SC.increment()
            return f"T{T}: DR ← M[AR]", changed

        if effT == 5:
            self.m.DR.load(self.m.DR.value + 1)  # increment
            self.m.SC.increment()
            return f"T{T}: DR ← DR + 1", changed

        if effT == 6:
            self.m.memory.write(self.m.AR.value, self.m.DR.value)  # store result
            changed.add(f"M[{self.m.AR.value:03X}]")
            micro = f"T{T}: M[AR] ← DR"
            if (self.m.DR.value & 0xFFFF) == 0:
                self.m.PC.increment()  # skip next instruction
                changed.add("PC")
                micro += "; if DR = 0 then PC ← PC + 1"
            self.m.finish_instruction()
            return micro, changed

        return f"T{T}: (no-op for ISZ)", changed

    # Register-reference instructions
    def execute_register_ref(self, T: int):
        changed = set()
        if T != 3:
            return f"T{T}: (idle for register-reference)", changed

        instr = self.m.IR.value & 0x0FFF  # bottom 12 bits
        parts = []

        def bit(n: int) -> int:
            return (instr >> n) & 1  # read bit position

        # CLA
        if bit(11):
            self.m.AC.clear()
            parts.append("CLA")
            changed.add("AC")

        # CLE
        if bit(10):
            self.m.E.clear()
            parts.append("CLE")
            changed.add("E")

        # CMA
        if bit(9):
            self.m.AC.load(~self.m.AC.value)  # invert AC
            parts.append("CMA")
            changed.add("AC")

        # CME
        if bit(8):
            self.m.E.complement()
            parts.append("CME")
            changed.add("E")

        # CIR (rotate right)
        if bit(7):
            combined = (self.m.E.value << 16) | self.m.AC.value
            lsb = combined & 1
            combined >>= 1
            if lsb:
                self.m.E.set()
            else:
                self.m.E.clear()
            self.m.AC.load(combined)
            parts.append("CIR")
            changed.update({"AC", "E"})

        # CIL (rotate left)
        if bit(6):
            combined = (self.m.E.value << 16) | self.m.AC.value
            msb = (combined >> 16) & 1
            combined = (combined << 1) & 0x1FFFF
            if msb:
                self.m.E.set()
            else:
                self.m.E.clear()
            self.m.AC.load(combined)
            parts.append("CIL")
            changed.update({"AC", "E"})

        # INC
        if bit(5):
            self.m.AC.load(self.m.AC.value + 1)
            parts.append("INC")
            changed.add("AC")

        # SPA
        if bit(4):
            if (self.m.AC.value & 0x8000) == 0:  # AC positive
                self.m.PC.increment()
                changed.add("PC")
            parts.append("SPA")

        # SNA
        if bit(3):
            if (self.m.AC.value & 0x8000) != 0:  # AC negative
                self.m.PC.increment()
                changed.add("PC")
            parts.append("SNA")

        # SZA
        if bit(2):
            if self.m.AC.value == 0:
                self.m.PC.increment()
                changed.add("PC")
            parts.append("SZA")

        # SZE
        if bit(1):
            if self.m.E.value == 0:
                self.m.PC.increment()
                changed.add("PC")
            parts.append("SZE")

        # HLT
        if bit(0):
            self.m.S.clear()  # halt CPU
            parts.append("HLT")
            changed.add("S")

        self.m.finish_instruction()

        if not parts:
            return "T3: (no register-reference bit set)", changed
        return "T3: " + ", ".join(parts), changed
