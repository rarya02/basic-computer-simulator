# super duper assembler

import os

class Assembler:
    def __init__(self):
        # Symbol Table: Stores label -> address mapping
        self.symbol_table = {}
        # Opcode Table for Memory Reference Instructions (MRI)
        # Direct Addressing (I=0) Opcodes
        self.mri_table = {
            "AND": 0x0000, "ADD": 0x1000, "LDA": 0x2000, "STA": 0x3000,
            "BUN": 0x4000, "BSA": 0x5000, "ISZ": 0x6000
        }
        # Opcode Table for Register Reference Instructions (RRI) & I/O
        self.rri_table = {
            "CLA": 0x7800, "CLE": 0x7400, "CMA": 0x7200, "CME": 0x7100,
            "CIR": 0x7080, "CIL": 0x7040, "INC": 0x7020,
            "SPA": 0x7010, "SNA": 0x7008, "SZA": 0x7004, "SZE": 0x7002,
            "HLT": 0x7001,
            "INP": 0xF800, "OUT": 0xF400, "SKI": 0xF200, "SKO": 0xF100,
            "ION": 0xF080, "IOF": 0xF040
        }

    def clean_line(self, line):
        """Removes comments and whitespace."""
        # Remove comments starting with # or /
        if '#' in line:
            line = line.split('#')[0]
        if '/' in line:
            line = line.split('/')[0]
        return line.strip()

    def pass_one(self, lines):
        """
        Pass 1: Identify Labels and build the Symbol Table.
        """
        lc = 0  # Location Counter
        
        for line in lines:
            line = self.clean_line(line)
            if not line:
                continue

            parts = line.replace(',', ' ').split()
            token = parts[0]

            # Handle ORG
            if token == 'ORG':
                if len(parts) > 1:
                    lc = int(parts[1], 16) # Mano usually uses Hex addresses
                continue
            
            # Handle END
            if token == 'END':
                break

            # Check for Label definition (Ends with comma)
            # Example: "LOP, LDA X"
            if "," in line or (len(parts) > 1 and "," in parts[0]):
                label = parts[0].replace(',', '')
                self.symbol_table[label] = lc
                
                # Check if the label is on a line with an instruction
                # e.g., "LOP, LDA X" -> Label LOP, Instruction LDA
                if len(parts) == 1:
                    # Label is on its own line, e.g.:
                    # LOP,
                    #      LDA X
                    continue 
            
            # Increment Location Counter
            # Every line that contains an instruction or data takes 1 word
            lc += 1

    def pass_two(self, lines):
        """
        Pass 2: Generate Hex Code.
        Returns two lists: program_data and memory_data
        """
        lc = 0
        program_output = [] # List of (address, hex_code, comment)
        data_output = []    # List of (address, hex_code, comment)

        for line in lines:
            original_line = line.strip()
            line = self.clean_line(line)
            if not line:
                continue

            parts = line.replace(',', ' ').split()
            token = parts[0]

            # 1. Handle Pseudo-Ops
            if token == 'ORG':
                lc = int(parts[1], 16)
                continue
            if token == 'END':
                break

            # 2. Handle Label stripping
            # If line starts with label (e.g., "LOP, LDA X"), skip the label part
            if token.replace(',', '') in self.symbol_table:
                if len(parts) > 1:
                    parts = parts[1:] # Remove label from parts
                    token = parts[0]  # New token is the instruction (e.g., LDA)
                else:
                    # Label on standalone line, skip generation
                    continue

            # 3. Decode Instruction
            hex_code = 0x0000
            is_data = False

            # Case A: Memory Reference (MRI)
            if token in self.mri_table:
                opcode = self.mri_table[token]
                operand_str = parts[1]
                
                # --- INDIRECT ADDRESSING LOGIC ---
                # Check if "I" is present as the third part
                # e.g., "ADD X I"
                is_indirect = False
                if len(parts) > 2 and parts[2] == 'I':
                    is_indirect = True
                
                # Resolve Address
                if operand_str in self.symbol_table:
                    address = self.symbol_table[operand_str]
                else:
                    try:
                        address = int(operand_str, 16)
                    except:
                        print(f"Error: Undefined symbol {operand_str}")
                        address = 0

                # Construct Code: Opcode + Address
                hex_code = opcode | address
                
                # If Indirect, set the 15th bit (add 0x8000)
                if is_indirect:
                    hex_code |= 0x8000 

            # Case B: Register Reference / IO
            elif token in self.rri_table:
                hex_code = self.rri_table[token]

            # Case C: Pseudo-ops (HEX, DEC)
            elif token == 'HEX':
                is_data = True
                val_str = parts[1]
                # Fix common OCR/Typo: 'O' instead of '0'
                val_str = val_str.replace('O', '0')
                hex_code = int(val_str, 16)
                
            elif token == 'DEC':
                is_data = True
                val = int(parts[1])
                # Handle Negative Numbers (2's Complement)
                if val < 0:
                    val = (1 << 16) + val
                hex_code = val & 0xFFFF

            else:
                print(f"Unknown Instruction: {token}")
                lc += 1
                continue

            # 4. Format Output
            # Format: "Address  HexCode  # Original Source"
            output_line = f"{lc:03X}  {hex_code:04X}   # {original_line}"

            if is_data:
                data_output.append(output_line)
            else:
                program_output.append(output_line)

            lc += 1

        return program_output, data_output

    def assemble(self, input_file, program_file, data_file):
        try:
            print(f"Reading from: {input_file}")
            with open(input_file, 'r') as f:
                lines = f.readlines()

            print("Starting Pass 1...")
            self.pass_one(lines)
            print("Symbol Table:", self.symbol_table)

            print("Starting Pass 2...")
            prog_lines, data_lines = self.pass_two(lines)

            # Ensure directories exist
            os.makedirs(os.path.dirname(program_file), exist_ok=True)

            # Write Program File
            with open(program_file, 'w') as f:
                f.write("\n".join(prog_lines))
            
            # Write Data File
            with open(data_file, 'w') as f:
                f.write("\n".join(data_lines))

            print(f"Assembly Complete.")
            print(f"Program output: {program_file}")
            print(f"Data output:    {data_file}")

        except FileNotFoundError:
            print(f"Error: Input file '{input_file}' not found.")
        except Exception as e:
            print(f"An error occurred: {e}")

# Entry point
if __name__ == "__main__":
    asm = Assembler()
    
    # Calculate paths relative to this script's location
    # Assumes structure:
    # /Mano_Simulator/
    #   ├── assembler/assembler.py
    #   └── data/assembly_code.txt
    
    current_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Go up one level to root, then into data
    input_path = os.path.join(current_dir, '..', 'data', 'assembly_code.txt')
    program_out = os.path.join(current_dir, '..', 'data', 'program.txt')
    data_out = os.path.join(current_dir, '..', 'data', 'data.txt')
    
    # Resolve to absolute paths to be safe
    input_path = os.path.abspath(input_path)
    program_out = os.path.abspath(program_out)
    data_out = os.path.abspath(data_out)
    
    asm.assemble(input_path, program_out, data_out)
    #raghav is so smart