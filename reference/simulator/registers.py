class Register:
    def __init__(self, name: str, bits: int):
        self.name = name
        self.value = 0
        self._mask = (1 << bits) - 1
        self.updated = False  # set on any write; used to report changes to the UI

    def load(self, val: int):
        self.value = val & self._mask
        self.updated = True

    def increment(self):
        self.value = (self.value + 1) & self._mask
        self.updated = True

    def clear(self):
        self.value = 0
        self.updated = True

    def reset_state(self):
        self.updated = False


class Flag:
    def __init__(self, name: str):
        self.name = name
        self.value = 0
        self.updated = False

    def load(self, bit):
        self.value = 1 if bit else 0
        self.updated = True

    def set(self):
        self.load(1)

    def clear(self):
        self.load(0)

    def complement(self):
        self.load(not self.value)

    def reset_state(self):
        self.updated = False
