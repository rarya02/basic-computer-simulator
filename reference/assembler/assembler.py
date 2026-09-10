import os


class Assembler:
    """Two-pass assembler for the Mano Basic Computer."""

    # Memory-reference instructions (direct addressing; "I" sets bit 15)
    MRI_TABLE = {
        "AND": 0x0000, "ADD": 0x1000, "LDA": 0x2000, "STA": 0x3000,
        "BUN": 0x4000, "BSA": 0x5000, "ISZ": 0x6000,
    }
    # Register-reference and I/O instructions
    RRI_TABLE = {
        "CLA": 0x7800, "CLE": 0x7400, "CMA": 0x7200, "CME": 0x7100,
        "CIR": 0x7080, "CIL": 0x7040, "INC": 0x7020,
        "SPA": 0x7010, "SNA": 0x7008, "SZA": 0x7004, "SZE": 0x7002,
        "HLT": 0x7001,
        "INP": 0xF800, "OUT": 0xF400, "SKI": 0xF200, "SKO": 0xF100,
        "ION": 0xF080, "IOF": 0xF040,
    }

    def __init__(self):
        self.symbol_table = {}  # label -> address

    @staticmethod
    def clean_line(line):
        """Strip comments (starting with # or /) and surrounding whitespace."""
        for marker in ("#", "/"):
            line = line.split(marker, 1)[0]
        return line.strip()

    def pass_one(self, lines):
        """Pass 1: build the symbol table."""
        lc = 0  # location counter

        for line in lines:
            line = self.clean_line(line)
            if not line:
                continue

            parts = line.replace(",", " ").split()
            token = parts[0]

            if token == "ORG":
                if len(parts) > 1:
                    lc = int(parts[1], 16)
                continue
            if token == "END":
                break

            # Label definition, e.g. "LOP, LDA X" or "LOP," on its own line
            if "," in line:
                self.symbol_table[token] = lc
                if len(parts) == 1:
                    continue

            lc += 1

    def pass_two(self, lines):
        """Pass 2: generate machine code.

        Returns (program_lines, data_lines), each formatted as "ADDR  CODE   # source".
        HEX/DEC statements go to data_lines, everything else to program_lines.
        """
        lc = 0
        program_output = []
        data_output = []

        for line in lines:
            source = line.strip()
            line = self.clean_line(line)
            if not line:
                continue

            parts = line.replace(",", " ").split()
            token = parts[0]

            if token == "ORG":
                lc = int(parts[1], 16)
                continue
            if token == "END":
                break

            # Drop a leading label; a label alone on its line generates nothing
            if token in self.symbol_table:
                if len(parts) == 1:
                    continue
                parts = parts[1:]
                token = parts[0]

            is_data = False

            if token in self.MRI_TABLE:
                operand = parts[1]
                if operand in self.symbol_table:
                    address = self.symbol_table[operand]
                else:
                    try:
                        address = int(operand, 16)
                    except ValueError:
                        print(f"Error: Undefined symbol {operand}")
                        address = 0
                code = self.MRI_TABLE[token] | address
                if len(parts) > 2 and parts[2] == "I":
                    code |= 0x8000

            elif token in self.RRI_TABLE:
                code = self.RRI_TABLE[token]

            elif token == "HEX":
                is_data = True
                code = int(parts[1].replace("O", "0"), 16)  # tolerate letter O typed for zero

            elif token == "DEC":
                is_data = True
                code = int(parts[1]) & 0xFFFF  # two's complement for negatives

            else:
                print(f"Unknown Instruction: {token}")
                lc += 1
                continue

            output_line = f"{lc:03X}  {code:04X}   # {source}"
            (data_output if is_data else program_output).append(output_line)
            lc += 1

        return program_output, data_output

    def assemble(self, input_file, program_file, data_file):
        """Assemble input_file into program_file (instructions) and data_file (HEX/DEC values)."""
        self.symbol_table = {}
        try:
            print(f"Reading from: {input_file}")
            with open(input_file, "r") as f:
                lines = f.readlines()

            print("Starting Pass 1...")
            self.pass_one(lines)
            print("Symbol Table:", self.symbol_table)

            print("Starting Pass 2...")
            prog_lines, data_lines = self.pass_two(lines)

            os.makedirs(os.path.dirname(program_file), exist_ok=True)
            with open(program_file, "w") as f:
                f.write("\n".join(prog_lines))
            with open(data_file, "w") as f:
                f.write("\n".join(data_lines))

            print("Assembly Complete.")
            print(f"Program output: {program_file}")
            print(f"Data output:    {data_file}")

        except FileNotFoundError:
            print(f"Error: Input file '{input_file}' not found.")
        except Exception as e:
            print(f"An error occurred: {e}")


if __name__ == "__main__":
    data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
    Assembler().assemble(
        os.path.join(data_dir, "assembly_code.txt"),
        os.path.join(data_dir, "program.txt"),
        os.path.join(data_dir, "data.txt"),
    )
