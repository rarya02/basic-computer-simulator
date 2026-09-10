##  Mano Basic Computer Simulator (COE 341)

This project is the complete COE 341 **Basic Computer Simulator**, implemented in **Python** based on **Mano's Computer System Architecture (3rd Edition)**. It allows you to execute and analyze programs written for the Mano Basic Computer architecture in both hexadecimal machine code and assembly language.

-----

##  Project Structure

The project includes all necessary components and input files.

  * `simulator/`: The core **CPU simulation logic**.
  * `cli/`: The **Command-Line Interface** component.
  * `gui/`: The optional **Graphical User Interface** component.
  * `assembler/`: The Python **assembler** script.
  * `MANO SIMULATOR.py`: The main launcher script.
  * `data/`:
      * `program.txt`: Contains **hexadecimal instructions** (automatically loaded).
      * `data.txt`: Contains optional initial **memory data** (automatically loaded).
      * `assembly_code.txt`: File for writing assembly programs.

-----

##  Program Execution

You can run the simulator using either pre-assembled hexadecimal files or by assembling your own assembly code.

### 1\. Preparing the Program

#### A) Running with `program.txt` + `data.txt` (HEX mode)

This is the fastest method if you already have the machine code.

1.  Open the folder: `/Mano_Simulator/data`
2.  Edit `program.txt` to include your **hexadecimal instructions**.
3.  Edit `data.txt` to include any initial **memory values**.
4.  Save the files. They will be automatically loaded when you run the simulator.

#### B) Running Assembly Code (Recommended)

1.  Open the file: `/Mano_Simulator/data/assembly_code.txt`
2.  Write your **VALID Mano assembly program** inside it.
3.  Run the assembler:
    ```bash
    python assembler/assembler.py
    ```
4.  This automatically updates the input files for the simulator:
      * `program.txt` - machine instructions
      * `data.txt` - variables / DEC values

-----

### 2\. Running the Simulator

You can start the simulator using the main launcher or by running a component directly.

#### A) Option 1 - Using the Launcher

Run the main launcher script:

```bash
python MANO SIMULATOR.py
```

This displays a menu allowing you to select the mode:

```
Mano Basic Computer Simulator
1) CLI Mode
2) GUI Mode
Q) Quit
Select mode [1/2/Q]:
```

#### B) Option 2 - Running Components Directly

  * Run **CLI**:
    ```bash
    python -m cli.interface
    ```
  * Run **GUI**:
    ```bash
    python -m gui.app
    ```

> **Note:** If `program.txt` and `data.txt` are not present or correctly formatted in the `\Mano_Simulator\data` directory, the simulator may not behave as intended.

-----

## ⚙️ CLI Mode Commands

The Command-Line Interface (CLI) provides robust controls for stepping through execution and inspecting memory/registers.

| Command | Description |
| :--- | :--- |
| `help` | Shows the list of available commands. |
| `next_cycle` | Executes and shows the result of the **next single clock cycle**. |
| `fast_cycle N` | Executes and shows the result after **N** (integer) cycles are completed. |
| `next_inst` | Executes and shows the result of the **next instruction** (completes all cycles for that instruction). |
| `fast_inst N` | Executes and shows the result after **N** (integer) instructions are executed. |
| `run` | Runs the entire program until a **HLT** instruction is encountered. |
| `show REG` | Shows the value stored in the specified **register** (e.g., `AC`, `IR`, `PC`, `DR`). |
| `show mem ADDR [COUNT]` | Shows the values of **COUNT** number of consecutive memory addresses, starting from the hexadecimal address **ADDR**. |
| `show all` | Shows the value of **all registers**. |
| `show profiler` | Shows the **profiler statistics** (cycle count, instruction count, etc.). |
| `exit` / `quit` | Exits the CLI. |

-----

##  GUI Mode

The Graphical User Interface (GUI) offers an alternative, visual way to interact with the simulator.

  * The GUI also requires `program.txt` and `data.txt` to be present.
  * You can run the assembler directly within the GUI by clicking **'Import assembly.txt'** to assemble the code from `assembly_code.txt` into the required `program.txt` and `data.txt`.

-----

##  Assembler Details

The assembler translates assembly code into machine code for the simulator.

  * To run the assembler manually, execute `assembler.py` from the `\Mano_Simulator\assembler` directory:
    ```bash
    python assembler/assembler.py
    ```
  * **Important:** Labels within the assembly code **must** be followed by a comma (`,`) for proper functionality (e.g., `LABEL, ISZ COUNT`).

-----

##  Sample Programs for Profiler

These examples can be used to test the simulator and compare the performance metrics displayed by the `show profiler` command.

### 1\. Proper (Efficient) Code

```assembly
ORG 100
LDA AL
ADD BL
STA CL
CLA
CIL
ADD AH
ADD BH
STA CH
HLT
AL, DEC 12
AH, DEC 32
BL, DEC 40
BH, DEC 02
CL, DEC 0
CH, DEC 0
END
```

### 2\. Wasteful (Inefficient) Code

```assembly
ORG 100

        CLA
        LDA AL
        ADD BL
        STA SUM1

DELAY1, ISZ COUNT1
        BUN DELAY1
        STA TEMP
        LDA TEMP
        ADD ZERO
        STA CL

        CLA
        CIL
        LDA AH
        STA TEMP2
        LDA BH
        ADD TEMP2
        STA SUM2

DELAY2, ISZ COUNT2
        BUN DELAY2
        ADD ZERO
        STA CH

        HLT

ZERO,   DEC 0
SUM1,   DEC 0
SUM2,   DEC 0
TEMP,   DEC 0
TEMP2,  DEC 0
COUNT1, DEC -2
COUNT2, DEC -3

AL,     DEC 12
AH,     DEC 32
BL,     DEC 40
BH,     DEC 2
CL,     DEC 0
CH,     DEC 0
        END
```
