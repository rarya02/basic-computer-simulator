class Memory:
    """4096 x 16 main memory"""

    def __init__(self, size: int = 4096):
        self.size = size  # memory size
        self.data = [0] * size  # actual memory array
        self.reads = 0  # profiling counter
        self.writes = 0

    def _mask_addr(self, addr: int) -> int:
        return addr & 0x0FFF  # wrap address to 12 bits

    def read(self, addr: int) -> int:
        addr = self._mask_addr(addr)  # ensure valid address
        self.reads += 1  # count read
        return self.data[addr]

    def write(self, addr: int, value: int):
        addr = self._mask_addr(addr)
        self.data[addr] = value & 0xFFFF  # mask to 16 bits
        self.writes += 1

    # load hex file into memory
    def load_file(self, filename: str):
        try:
            lowest = None  # track first program address
            with open(filename, "r") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or line.startswith(";"):
                        continue  # ignore comments & blank lines
                    parts = line.replace(":", " ").split()
                    if len(parts) < 2:
                        continue
                    addr = int(parts[0], 16)
                    val = int(parts[1], 16)
                    if 0 <= addr < self.size:
                        self.data[addr] = val & 0xFFFF
                        if lowest is None or addr < lowest:
                            lowest = addr  # record program start
            return lowest
        except FileNotFoundError:
            return None
