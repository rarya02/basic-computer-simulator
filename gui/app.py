
import os
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext

try:
    # Import machine/assembler + datapath UI
    from simulator.machine import Machine
    from assembler.assembler import Assembler
    from gui.datapath_view import DatapathView
except ImportError as e:
    print(f"CRITICAL ERROR: Could not import modules. {e}")
    import sys
    sys.exit()


class ManoApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Mano Basic Computer Simulator")
        self.root.geometry("1400x850")  # Main window size

        # CORE
        self.machine = Machine()        # machine doing everything for us
        self.assembler = Assembler()    # assembler
        self.is_running = False         # run-loop flag
        self.run_speed = 300            # default run speed
        self.program_loaded = False     # set once program.txt loaded
        self.last_micro_op = ""         # last executed micro-op

        # project directories
        current_dir = os.path.dirname(os.path.abspath(__file__))
        if os.path.basename(current_dir).lower() == "gui":
            self.project_root = os.path.dirname(current_dir)
        else:
            self.project_root = current_dir

        # Paths for program/data files
        self.data_dir = os.path.join(self.project_root, "data")
        os.makedirs(self.data_dir, exist_ok=True)
        self.prog_path = os.path.join(self.data_dir, "program.txt")
        self.data_path = os.path.join(self.data_dir, "data.txt")

        #layout
        self.main_frame = tk.Frame(self.root, padx=10, pady=10)
        self.main_frame.pack(fill="both", expand=True)

        # 3-column layout
        self.main_frame.columnconfigure(0, weight=1)
        self.main_frame.columnconfigure(1, weight=2)
        self.main_frame.columnconfigure(2, weight=1)
        self.main_frame.rowconfigure(0, weight=1)

        # Build UI panels
        self._build_left_panel()
        self._build_center_panel()
        self._build_right_panel()

        self._log("Welcome to Mano Basic Computer Simulator.")
        self.update_ui()

    # LEFT PANEL
    def _build_left_panel(self):
        left = tk.Frame(self.main_frame, bd=2, relief="groove")
        left.grid(row=0, column=0, sticky="nsew", padx=5)

        tk.Label(left, text="Assembler", font=("Arial", 12, "bold")).pack(pady=(10, 5))

        # Buttons for loading files
        btn_frame = tk.Frame(left)
        btn_frame.pack(fill="x", padx=10)
        tk.Button(btn_frame, text="Import assembly.txt", command=self.load_and_assemble).pack(fill="x", pady=2)
        tk.Button(btn_frame, text="Load Hex (program.txt)", command=self.load_program_hex).pack(fill="x", pady=2)

        # Execution log window
        tk.Label(left, text="Execution Log", font=("Arial", 12, "bold")).pack(pady=(20, 5))
        self.cli_text = scrolledtext.ScrolledText(
            left, height=18, state="disabled", bg="#f4f4f4", font=("Courier", 9)
        )
        self.cli_text.pack(fill="both", expand=True, padx=10)

        # Profiler statistics
        prof = tk.LabelFrame(left, text="Profiler", font=("Arial", 11, "bold"), padx=10, pady=10)
        prof.pack(fill="x", padx=10, pady=10)

        self.lbl_cycles = tk.Label(prof, text="Total cycles: 0", anchor="w")
        self.lbl_cycles.pack(fill="x")
        self.lbl_instr = tk.Label(prof, text="Instr executed: 0", anchor="w")
        self.lbl_instr.pack(fill="x")
        self.lbl_cpi = tk.Label(prof, text="CPI: 0.00", anchor="w")
        self.lbl_cpi.pack(fill="x")
        self.lbl_mem_bw = tk.Label(prof, text="Mem BW: 0", anchor="w")
        self.lbl_mem_bw.pack(fill="x")

    # CENTER PANEL
    def _build_center_panel(self):
        center = tk.Frame(self.main_frame, bd=2, relief="flat")
        center.grid(row=0, column=1, sticky="nsew", padx=5)

        # The graphical datapath diagram
        self.datapath_view = DatapathView(center)
        self.datapath_view.pack(expand=True)

    # RIGHT PANEL
    def _build_right_panel(self):
        right = tk.Frame(self.main_frame, bd=2, relief="groove")
        right.grid(row=0, column=2, sticky="nsew", padx=5)

        #run, reset, exit
        top_btns = tk.Frame(right)
        top_btns.pack(fill="x", padx=10, pady=(8, 4))
        tk.Button(top_btns, text="RUN", bg="#d1e7dd", width=8, command=self.cmd_run).pack(side="left", padx=4)
        tk.Button(top_btns, text="RESET", bg="#f8d7da", width=8, command=self.cmd_reset).pack(side="left", padx=4)
        tk.Button(top_btns, text="EXIT", width=8, command=self.root.destroy).pack(side="left", padx=4)

        #cycle step contols
        row2 = tk.Frame(right)
        row2.pack(fill="x", padx=10, pady=4)
        tk.Button(row2, text="NEXT CYCLE", width=12, command=self.cmd_next_cycle).pack(side="left", padx=4)
        tk.Label(row2, text="N:").pack(side="left")
        self.fast_cycle_entry = tk.Entry(row2, width=4)
        self.fast_cycle_entry.insert(0, "10")
        self.fast_cycle_entry.pack(side="left", padx=2)
        tk.Button(row2, text="FAST CYCLE", width=10, command=self.cmd_fast_cycle).pack(side="left", padx=4)

        #inst step controls
        row3 = tk.Frame(right)
        row3.pack(fill="x", padx=10, pady=4)
        tk.Button(row3, text="NEXT INSTR", width=12, command=self.cmd_next_inst).pack(side="left", padx=4)
        tk.Label(row3, text="N:").pack(side="left")
        self.fast_inst_entry = tk.Entry(row3, width=4)
        self.fast_inst_entry.insert(0, "5")
        self.fast_inst_entry.pack(side="left", padx=2)
        tk.Button(row3, text="FAST INSTR", width=10, command=self.cmd_fast_inst).pack(side="left", padx=4)

        #sim. speed
        speed_frame = tk.Frame(right)
        speed_frame.pack(fill="x", padx=10, pady=(4, 8))
        tk.Label(speed_frame, text="Run Speed (ms):").pack(anchor="w")
        self.speed_scale = tk.Scale(
            speed_frame, from_=10, to=2000, orient="horizontal", command=self._on_speed_change
        ) # 10 to 2000ms, configurable
        self.speed_scale.set(self.run_speed)  # starting value
        self.speed_scale.pack(anchor="w", fill="x")

        #current state indicators
        current_frame = tk.LabelFrame(right, text="State", font=("Arial", 10, "bold"))
        current_frame.pack(fill="x", padx=10, pady=5)
        self.lbl_instr_hand = tk.Label(current_frame, text="IR: -", anchor="w")
        self.lbl_instr_hand.pack(fill="x")
        self.lbl_micro = tk.Label(current_frame, text="Micro: -", anchor="w", fg="blue")
        self.lbl_micro.pack(fill="x")
        self.lbl_seq = tk.Label(current_frame, text="Seq: T0", anchor="w")
        self.lbl_seq.pack(fill="x")

        #memory
        tk.Label(right, text="MEMORY (000 - FFF)", font=("Arial", 10, "bold")).pack(pady=(5, 0))
        mem_frame = tk.Frame(right)
        mem_frame.pack(fill="both", expand=True, padx=10, pady=5)

        cols = ("addr", "hex", "dec")
        self.mem_tree = ttk.Treeview(mem_frame, columns=cols, show="headings")

        # column titles
        self.mem_tree.heading("addr", text="Addr")
        self.mem_tree.heading("hex", text="Hex")
        self.mem_tree.heading("dec", text="Dec")

        # Column sizes
        self.mem_tree.column("addr", width=60, anchor="center")
        self.mem_tree.column("hex", width=80, anchor="center")
        self.mem_tree.column("dec", width=80, anchor="center")

        # scrollbar
        scroll = ttk.Scrollbar(mem_frame, orient="vertical", command=self.mem_tree.yview)
        self.mem_tree.configure(yscrollcommand=scroll.set)
        self.mem_tree.pack(side="left", fill="both", expand=True)
        scroll.pack(side="right", fill="y")

    #LOGGING
    def _log(self, msg):
        # Append message to log window
        self.cli_text.config(state="normal")
        self.cli_text.insert("end", f"> {msg}\n")
        self.cli_text.see("end")
        self.cli_text.config(state="disabled")

    def _log_instruction_state(self, prefix="Instruction executed"):
        # Log IR + PC + AC after instruction, similar to the CLI
        inst_hex = self.machine.format_word(self.machine.IR.value)
        pc = self.machine.PC.value
        ac = self.machine.format_word(self.machine.AC.value)
        self._log(f"{prefix}: {inst_hex}")
        self._log(f"PC = 0x{pc:03X} AC = {ac}")

    def _log_changed_set(self, changed):
        # Log set of registers changed
        if not changed:
            self._log("Changed: None")
        else:
            self._log("Changed: " + ", ".join(sorted(changed)))


    # UTILITY
    def _on_speed_change(self, value):
        self.run_speed = int(float(value))  # update ms delay

    def _ensure_program_loaded(self):
        # Prevent running without a program
        if not self.program_loaded:
            self._log("Error: Load program first.")
            return False
        return True

    # PROGRAM LOADING
    def load_and_assemble(self):
        path = filedialog.askopenfilename(filetypes=[("Text Files", "*.txt")])
        if not path:
            return
        try:
            self.assembler.assemble(path, self.prog_path, self.data_path)  # assemble into program.txt
            self._log(f"Assembled {os.path.basename(path)}.")
            self._load_program_to_machine()
        except Exception as e:
            self._log(f"Assembly Error: {e}")
            messagebox.showerror("Error", str(e))

    def load_program_hex(self):
        if not os.path.exists(self.prog_path):
            messagebox.showwarning("Missing", "program.txt not found.")
            return
        self._load_program_to_machine()

    def _load_program_to_machine(self):
        # Recreate new fresh machine like CLI does
        self.machine = Machine()
        try:
            # Load program + data
            self.machine.load_program_and_data(self.prog_path, self.data_path)
            self.program_loaded = True
            self.last_micro_op = ""
            self.is_running = False
            self._log("Program loaded into machine.")
            self.update_ui()
        except Exception as e:
            self._log(f"Load Error: {e}")

    # COMMANDS
    def cmd_next_cycle(self):
        if not self._ensure_program_loaded():
            return
        if self.machine.S.value == 0:
            self._log("Machine HALTED.")
            return

        # Execute one clock cycle
        micro, changed = self.machine.step_cycle()
        self._after_step(micro, changed)
        self._log(micro)
        self._log_changed_set(changed)

    def cmd_fast_cycle(self):
        if not self._ensure_program_loaded():
            return
        try:
            n = int(self.fast_cycle_entry.get())
        except Exception:
            self._log("Invalid N")
            return

        last_micro, last_changed = "", set()
        for _ in range(n):
            if self.machine.S.value == 0:
                break
            micro, changed = self.machine.step_cycle()
            last_micro, last_changed = micro, changed

        if last_micro:
            self._after_step(last_micro, last_changed)
            self._log(f"Fast Cycle x{n}. Last: {last_micro}")
            self._log_changed_set(last_changed)
        else:
            self._log("Fast Cycle: nothing executed.")

    def cmd_next_inst(self):
        if not self._ensure_program_loaded():
            return
        if self.machine.S.value == 0:
            self._log("Machine HALTED.")
            return

        # Execute full instruction cycle
        last_micro, last_changed = self.machine.step_instruction()
        self._after_step(last_micro, last_changed)
        self._log(f"Instruction done. Last micro-op: {last_micro}")
        self._log_instruction_state()

    def cmd_fast_inst(self):
        if not self._ensure_program_loaded():
            return
        try:
            n = int(self.fast_inst_entry.get())
        except Exception:
            self._log("Invalid N")
            return

        last_micro, last_changed = "", set()
        for _ in range(n):
            if self.machine.S.value == 0:
                break
            micro, changed = self.machine.step_instruction()
            last_micro, last_changed = micro, changed

        if last_micro:
            self._after_step(last_micro, last_changed)
            self._log(f"Fast Instr x{n}. Last micro-op: {last_micro}")
            self._log_instruction_state()
        else:
            self._log("Fast Instr: nothing executed.")

    def cmd_run(self):
        if not self._ensure_program_loaded():
            return
        if self.machine.S.value == 0:
            self._log("Machine HALTED.")
            return
        if self.is_running:
            return  # prevent multiple clicks
        self.is_running = True
        self._run_loop()

    def _run_loop(self):
        if not self.is_running:
            return

        # Always execute next instruction
        last_micro, changed = self.machine.step_instruction()
        self._after_step(last_micro, changed)
        self._log_instruction_state()

        # Stop if halted
        if self.machine.S.value == 0:
            self.is_running = False
            self._log("Halted.")
            self.update_ui()
            return

        # Schedule next instruction
        self.root.after(self.run_speed, self._run_loop)

    def cmd_reset(self):
        # Reset machine (reloads program if loaded)
        self.is_running = False
        self.machine = Machine()

        if self.program_loaded:
            try:
                self.machine.load_program_and_data(self.prog_path, self.data_path)
                self._log("Machine reset + program reloaded.")
            except Exception as e:
                self._log(f"Reset Load Error: {e}")
        else:
            self._log("Machine reset.")

        self.last_micro_op = ""
        self.update_ui()

    #USER INTERFACE
    def _after_step(self, micro, changed):
        # Called after every micro-op
        self.last_micro_op = micro
        self.lbl_micro.config(text=f"Micro: {micro}")
        self.update_ui(changed)

    def update_ui(self, changed_set=None):
        if changed_set is None:
            changed_set = set()

        # Update datapath diagram animation
        self.datapath_view.update_from_machine(self.machine, changed_set, self.last_micro_op)

        #Profiler
        cycles = self.machine.total_cycles
        instrs = self.machine.instr_count
        reads = self.machine.memory.reads
        writes = self.machine.memory.writes

        self.lbl_cycles.config(text=f"Total cycles: {cycles}")
        self.lbl_instr.config(text=f"Instr executed: {instrs}")
        self.lbl_mem_bw.config(text=f"Mem BW: {reads + writes}")

        cpi = cycles / instrs if instrs > 0 else 0.0
        self.lbl_cpi.config(text=f"CPI: {cpi:.2f}")

        # Update IR and SC display
        if self.program_loaded:
            self.lbl_instr_hand.config(text=f"IR: {self.machine.IR.value:04X}")
        else:
            self.lbl_instr_hand.config(text="IR: -")

        self.lbl_seq.config(text=f"Seq: T{self.machine.SC.value}")

        self.mem_tree.delete(*self.mem_tree.get_children())
        item_ids = []

        for addr in range(0x1000):  # 4096 addresses
            val = self.machine.memory.data[addr]
            tags = []

            # Highlight PC and AR in memory
            if self.program_loaded:
                if addr == self.machine.PC.value:
                    tags.append("pc")
                if addr == self.machine.AR.value:
                    tags.append("ar")

            iid = self.mem_tree.insert(
                "", "end",
                values=(f"{addr:03X}", f"{val:04X}", str(val)),
                tags=tags,
            )
            item_ids.append(iid)

        # Tag colors
        self.mem_tree.tag_configure("pc", background="#ADD8E6")
        self.mem_tree.tag_configure("ar", background="#90EE90")

        # super cool auto-scroll to AR, also highlight
        if self.program_loaded:
            current_ar = self.machine.AR.value & 0x0FFF
            if 0 <= current_ar < len(item_ids):
                self.mem_tree.see(item_ids[current_ar])
                self.mem_tree.selection_set(item_ids[current_ar])


if __name__ == "__main__":
    root = tk.Tk()
    app = ManoApp(root)
    root.mainloop()
