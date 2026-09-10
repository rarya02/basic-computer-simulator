import os
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext

from simulator.machine import Machine
from assembler.assembler import Assembler
from gui.datapath_view import DatapathView

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(PROJECT_ROOT, "data")


class ManoApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Mano Basic Computer Simulator")
        self.root.geometry("1400x850")

        self.machine = Machine()
        self.assembler = Assembler()
        self.is_running = False      # True while the RUN loop is active
        self.run_speed = 300         # delay between instructions in RUN mode (ms)
        self.program_loaded = False
        self.last_micro_op = ""

        os.makedirs(DATA_DIR, exist_ok=True)
        self.prog_path = os.path.join(DATA_DIR, "program.txt")
        self.data_path = os.path.join(DATA_DIR, "data.txt")

        # 3-column layout
        self.main_frame = tk.Frame(self.root, padx=10, pady=10)
        self.main_frame.pack(fill="both", expand=True)
        self.main_frame.columnconfigure(0, weight=1)
        self.main_frame.columnconfigure(1, weight=2)
        self.main_frame.columnconfigure(2, weight=1)
        self.main_frame.rowconfigure(0, weight=1)

        self._build_left_panel()
        self._build_center_panel()
        self._build_right_panel()

        self._log("Welcome to Mano Basic Computer Simulator.")
        self.update_ui()

    # ---------- Layout ----------

    def _build_left_panel(self):
        left = tk.Frame(self.main_frame, bd=2, relief="groove")
        left.grid(row=0, column=0, sticky="nsew", padx=5)

        tk.Label(left, text="Assembler", font=("Arial", 12, "bold")).pack(pady=(10, 5))

        btn_frame = tk.Frame(left)
        btn_frame.pack(fill="x", padx=10)
        tk.Button(btn_frame, text="Import assembly.txt", command=self.load_and_assemble).pack(fill="x", pady=2)
        tk.Button(btn_frame, text="Load Hex (program.txt)", command=self.load_program_hex).pack(fill="x", pady=2)

        tk.Label(left, text="Execution Log", font=("Arial", 12, "bold")).pack(pady=(20, 5))
        self.cli_text = scrolledtext.ScrolledText(
            left, height=18, state="disabled", bg="#f4f4f4", font=("Courier", 9)
        )
        self.cli_text.pack(fill="both", expand=True, padx=10)

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

    def _build_center_panel(self):
        center = tk.Frame(self.main_frame, bd=2, relief="flat")
        center.grid(row=0, column=1, sticky="nsew", padx=5)

        self.datapath_view = DatapathView(center)
        self.datapath_view.pack(expand=True)

    def _build_right_panel(self):
        right = tk.Frame(self.main_frame, bd=2, relief="groove")
        right.grid(row=0, column=2, sticky="nsew", padx=5)

        # Run / reset / exit
        top_btns = tk.Frame(right)
        top_btns.pack(fill="x", padx=10, pady=(8, 4))
        tk.Button(top_btns, text="RUN", bg="#d1e7dd", width=8, command=self.cmd_run).pack(side="left", padx=4)
        tk.Button(top_btns, text="RESET", bg="#f8d7da", width=8, command=self.cmd_reset).pack(side="left", padx=4)
        tk.Button(top_btns, text="EXIT", width=8, command=self.root.destroy).pack(side="left", padx=4)

        # Cycle stepping
        row2 = tk.Frame(right)
        row2.pack(fill="x", padx=10, pady=4)
        tk.Button(row2, text="NEXT CYCLE", width=12, command=self.cmd_next_cycle).pack(side="left", padx=4)
        tk.Label(row2, text="N:").pack(side="left")
        self.fast_cycle_entry = tk.Entry(row2, width=4)
        self.fast_cycle_entry.insert(0, "10")
        self.fast_cycle_entry.pack(side="left", padx=2)
        tk.Button(row2, text="FAST CYCLE", width=10, command=self.cmd_fast_cycle).pack(side="left", padx=4)

        # Instruction stepping
        row3 = tk.Frame(right)
        row3.pack(fill="x", padx=10, pady=4)
        tk.Button(row3, text="NEXT INSTR", width=12, command=self.cmd_next_inst).pack(side="left", padx=4)
        tk.Label(row3, text="N:").pack(side="left")
        self.fast_inst_entry = tk.Entry(row3, width=4)
        self.fast_inst_entry.insert(0, "5")
        self.fast_inst_entry.pack(side="left", padx=2)
        tk.Button(row3, text="FAST INSTR", width=10, command=self.cmd_fast_inst).pack(side="left", padx=4)

        # Run speed
        speed_frame = tk.Frame(right)
        speed_frame.pack(fill="x", padx=10, pady=(4, 8))
        tk.Label(speed_frame, text="Run Speed (ms):").pack(anchor="w")
        self.speed_scale = tk.Scale(
            speed_frame, from_=10, to=2000, orient="horizontal", command=self._on_speed_change
        )
        self.speed_scale.set(self.run_speed)
        self.speed_scale.pack(anchor="w", fill="x")

        # Current state
        current_frame = tk.LabelFrame(right, text="State", font=("Arial", 10, "bold"))
        current_frame.pack(fill="x", padx=10, pady=5)
        self.lbl_instr_hand = tk.Label(current_frame, text="IR: -", anchor="w")
        self.lbl_instr_hand.pack(fill="x")
        self.lbl_micro = tk.Label(current_frame, text="Micro: -", anchor="w", fg="blue")
        self.lbl_micro.pack(fill="x")
        self.lbl_seq = tk.Label(current_frame, text="Seq: T0", anchor="w")
        self.lbl_seq.pack(fill="x")

        # Memory table
        tk.Label(right, text="MEMORY (000 - FFF)", font=("Arial", 10, "bold")).pack(pady=(5, 0))
        mem_frame = tk.Frame(right)
        mem_frame.pack(fill="both", expand=True, padx=10, pady=5)

        self.mem_tree = ttk.Treeview(mem_frame, columns=("addr", "hex", "dec"), show="headings")
        for col, title, width in (("addr", "Addr", 60), ("hex", "Hex", 80), ("dec", "Dec", 80)):
            self.mem_tree.heading(col, text=title)
            self.mem_tree.column(col, width=width, anchor="center")
        self.mem_tree.tag_configure("pc", background="#ADD8E6")
        self.mem_tree.tag_configure("ar", background="#90EE90")

        scroll = ttk.Scrollbar(mem_frame, orient="vertical", command=self.mem_tree.yview)
        self.mem_tree.configure(yscrollcommand=scroll.set)
        self.mem_tree.pack(side="left", fill="both", expand=True)
        scroll.pack(side="right", fill="y")

    # ---------- Logging ----------

    def _log(self, msg):
        self.cli_text.config(state="normal")
        self.cli_text.insert("end", f"> {msg}\n")
        self.cli_text.see("end")
        self.cli_text.config(state="disabled")

    def _log_instruction_state(self):
        ac = self.machine.format_word(self.machine.AC.value)
        self._log(f"Instruction executed: {self.machine.format_word(self.machine.IR.value)}")
        self._log(f"PC = 0x{self.machine.PC.value:03X} AC = {ac}")

    def _log_changed_set(self, changed):
        self._log("Changed: " + (", ".join(sorted(changed)) if changed else "None"))

    # ---------- Helpers ----------

    def _on_speed_change(self, value):
        self.run_speed = int(float(value))

    def _ensure_program_loaded(self):
        if not self.program_loaded:
            self._log("Error: Load program first.")
            return False
        return True

    def _read_count(self, entry):
        try:
            return int(entry.get())
        except ValueError:
            self._log("Invalid N")
            return None

    # ---------- Program loading ----------

    def load_and_assemble(self):
        path = filedialog.askopenfilename(filetypes=[("Text Files", "*.txt")])
        if not path:
            return
        try:
            self.assembler.assemble(path, self.prog_path, self.data_path)
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
        self.machine = Machine()
        try:
            self.machine.load_program_and_data(self.prog_path, self.data_path)
            self.program_loaded = True
            self.last_micro_op = ""
            self.is_running = False
            self._log("Program loaded into machine.")
            self.update_ui()
        except Exception as e:
            self._log(f"Load Error: {e}")

    # ---------- Commands ----------

    def cmd_next_cycle(self):
        if not self._ensure_program_loaded():
            return
        if self.machine.S.value == 0:
            self._log("Machine HALTED.")
            return

        micro, changed = self.machine.step_cycle()
        self._after_step(micro, changed)
        self._log(micro)
        self._log_changed_set(changed)

    def cmd_fast_cycle(self):
        if not self._ensure_program_loaded():
            return
        n = self._read_count(self.fast_cycle_entry)
        if n is None:
            return

        last_micro, last_changed = "", set()
        for _ in range(n):
            if self.machine.S.value == 0:
                break
            last_micro, last_changed = self.machine.step_cycle()

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

        last_micro, last_changed = self.machine.step_instruction()
        self._after_step(last_micro, last_changed)
        self._log(f"Instruction done. Last micro-op: {last_micro}")
        self._log_instruction_state()

    def cmd_fast_inst(self):
        if not self._ensure_program_loaded():
            return
        n = self._read_count(self.fast_inst_entry)
        if n is None:
            return

        last_micro, last_changed = "", set()
        for _ in range(n):
            if self.machine.S.value == 0:
                break
            last_micro, last_changed = self.machine.step_instruction()

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
            return
        self.is_running = True
        self._run_loop()

    def _run_loop(self):
        if not self.is_running:
            return

        last_micro, changed = self.machine.step_instruction()
        self._after_step(last_micro, changed)
        self._log_instruction_state()

        if self.machine.S.value == 0:
            self.is_running = False
            self._log("Halted.")
            self.update_ui()
            return

        self.root.after(self.run_speed, self._run_loop)

    def cmd_reset(self):
        """Reset the machine, reloading the program if one was loaded."""
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

    # ---------- Display ----------

    def _after_step(self, micro, changed):
        self.last_micro_op = micro
        self.lbl_micro.config(text=f"Micro: {micro}")
        self.update_ui(changed)

    def update_ui(self, changed_set=None):
        self.datapath_view.update_from_machine(self.machine, changed_set or set(), self.last_micro_op)

        cycles = self.machine.total_cycles
        instrs = self.machine.instr_count
        cpi = cycles / instrs if instrs > 0 else 0.0
        self.lbl_cycles.config(text=f"Total cycles: {cycles}")
        self.lbl_instr.config(text=f"Instr executed: {instrs}")
        self.lbl_cpi.config(text=f"CPI: {cpi:.2f}")
        self.lbl_mem_bw.config(text=f"Mem BW: {self.machine.memory.reads + self.machine.memory.writes}")

        if self.program_loaded:
            self.lbl_instr_hand.config(text=f"IR: {self.machine.IR.value:04X}")
        else:
            self.lbl_instr_hand.config(text="IR: -")
        self.lbl_seq.config(text=f"Seq: T{self.machine.SC.value}")

        # Rebuild the memory table, highlighting the cells PC and AR point to
        self.mem_tree.delete(*self.mem_tree.get_children())
        item_ids = []
        for addr, val in enumerate(self.machine.memory.data):
            tags = []
            if self.program_loaded:
                if addr == self.machine.PC.value:
                    tags.append("pc")
                if addr == self.machine.AR.value:
                    tags.append("ar")
            item_ids.append(
                self.mem_tree.insert("", "end", values=(f"{addr:03X}", f"{val:04X}", str(val)), tags=tags)
            )

        if self.program_loaded:
            ar_item = item_ids[self.machine.AR.value]
            self.mem_tree.see(ar_item)
            self.mem_tree.selection_set(ar_item)


if __name__ == "__main__":
    root = tk.Tk()
    ManoApp(root)
    root.mainloop()
