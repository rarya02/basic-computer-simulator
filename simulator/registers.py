class Register:
    def __init__(self, name: str, bits: int):
        self.name = name  # register name
        self.bits = bits  # width in bits
        self.value = 0
        self._mask = (1 << bits) - 1  # mask for bit width
        self.updated = False  # UI update flag

    def load(self, val: int):
        previous_value = self.value  # old value
        self.value = val & self._mask  # load masked value
        self.updated = True  # mark change

    def increment(self):
        self.value = (self.value + 1) & self._mask  # wrap on overflow
        self.updated = True

    def clear(self):
        self.value = 0  # zero register
        self.updated = True

    def reset_state(self):
        self.updated = False  # clear update flag

    def __str__(self):
        return f"0x{self.value:X}"  # hex formatting

    def get_binary(self):
        return format(self.value, f'0{self.bits}b')  # binary formatting


class Flag:
    def __init__(self, name: str):
        self.name = name
        self.value = 0  # 1-bit flag
        self.updated = False

    def set(self):
        self.value = 1  # set flag
        self.updated = True

    def clear(self):
        self.value = 0  # clear flag
        self.updated = True

    def complement(self):
        self.value = 1 - self.value  # flip flag
        self.updated = True

    def reset_state(self):
        self.updated = False  # clear update tracking
