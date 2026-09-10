import tkinter as tk

REGISTERS = ["AR", "PC", "DR", "AC", "IR", "TR"]
REG_FILL = "#F9F9F9"
HIGHLIGHT_FILL = "#FFEB3B"
LINE_COLOR = "#888"
BUS_COLOR = "#444"

# Micro-ops whose data passes from DR through the ALU into AC
ALU_OPS = ["AC <- DR", "AC <- AC + DR", "AC <- AC & DR", "AC <- AC ∧ DR"]


class DatapathView(tk.Frame):
    """Common-bus datapath diagram, animated from each cycle's micro-op text."""

    def __init__(self, master, *args, **kwargs):
        super().__init__(master, *args, **kwargs)

        tk.Label(self, text="Register Transfer Datapath", font=("Arial", 12, "bold")).pack(pady=(5, 5))

        self.canvas_width = 520
        self.canvas_height = 550
        self.canvas = tk.Canvas(
            self,
            width=self.canvas_width,
            height=self.canvas_height,
            bg="white",
            highlightthickness=1,
            relief="sunken",
        )
        self.canvas.pack(expand=True)

        self.reg_boxes = {}     # name -> {"rect", "text", "y_center"} canvas items
        self.flag_widgets = {}  # E/I/S -> Label

        self._draw_layout()
        self._build_flags()

    # ---------- Drawing ----------

    def _draw_layout(self):
        center_x = self.canvas_width / 2
        reg_width = 160
        self.reg_x1 = center_x - reg_width / 2
        self.reg_x2 = center_x + reg_width / 2

        self.bus_left_x = 50
        self.bus_right_x = self.canvas_width - 50
        bus_top_y = 30
        bus_bottom_y = 500

        # Bus loop: register outputs join on the right, flow along the bottom, and feed inputs on the left
        self.canvas.create_line(
            self.bus_right_x, bus_top_y, self.bus_right_x, bus_bottom_y,
            width=4, fill=BUS_COLOR, arrow=tk.LAST
        )
        self.canvas.create_text(self.bus_right_x, 20, text="BUS", font=("Arial", 8, "bold"), fill=BUS_COLOR)
        self.canvas.create_line(
            self.bus_right_x, bus_bottom_y, self.bus_left_x, bus_bottom_y,
            width=4, fill=BUS_COLOR, arrow=tk.LAST
        )
        self.canvas.create_line(
            self.bus_left_x, bus_bottom_y, self.bus_left_x, bus_top_y,
            width=4, fill=BUS_COLOR, arrow=tk.LAST
        )

        for row, name in enumerate(["MEM", *REGISTERS]):
            self._draw_register(name, row)

        self._draw_alu_block()
        self._draw_mem_addr_line()

    def _draw_register(self, name, row):
        y1 = 50 + row * 65
        y2 = y1 + 45
        mid_y = (y1 + y2) / 2

        # Input from the bus (AC is fed only by the ALU)
        if name != "AC":
            self.canvas.create_line(
                self.bus_left_x, mid_y, self.reg_x1, mid_y,
                width=2, fill=LINE_COLOR, arrow=tk.LAST
            )
        # Output to the bus
        self.canvas.create_line(
            self.reg_x2, mid_y, self.bus_right_x, mid_y,
            width=2, fill=LINE_COLOR, arrow=tk.LAST
        )

        rect = self.canvas.create_rectangle(
            self.reg_x1, y1, self.reg_x2, y2,
            outline="#333", width=2, fill=REG_FILL
        )
        self.canvas.create_text(
            self.reg_x1 + 15, y1 + 12,
            text=name, font=("Arial", 8, "bold"), fill="#555", anchor="w"
        )
        txt = self.canvas.create_text(
            (self.reg_x1 + self.reg_x2) / 2, mid_y + 5,
            text="0000", font=("Consolas", 14, "bold")
        )

        self.reg_boxes[name] = {"rect": rect, "text": txt, "y_center": mid_y}

    def _draw_alu_block(self):
        """Draw the ALU between DR and AC, with its E flip-flop."""
        y_dr = self.reg_boxes["DR"]["y_center"]
        y_ac = self.reg_boxes["AC"]["y_center"]
        self.alu_center_y = (y_dr + y_ac) / 2

        alu_height = 40
        alu_width = 60
        alu_y1 = self.alu_center_y - alu_height / 2
        alu_y2 = self.alu_center_y + alu_height / 2
        self.alu_x2 = self.reg_x1 - 25
        self.alu_x1 = self.alu_x2 - alu_width

        self.canvas.create_rectangle(
            self.alu_x1, alu_y1, self.alu_x2, alu_y2,
            fill="#EFEFEF", outline="#333", width=2
        )
        self.canvas.create_text(
            (self.alu_x1 + self.alu_x2) / 2, self.alu_center_y,
            text="ALU", font=("Arial", 10, "bold")
        )

        # DR -> ALU
        self.canvas.create_line(
            self.reg_x1, y_dr, self.alu_x2, self.alu_center_y,
            width=2, fill=LINE_COLOR, arrow=tk.LAST
        )
        # ALU -> AC
        self.canvas.create_line(
            self.alu_x1, self.alu_center_y, self.reg_x1, y_ac,
            width=2, fill=LINE_COLOR, arrow=tk.LAST
        )

        e_x = (self.alu_x1 + self.reg_x1) / 2
        e_y = self.alu_center_y - 20
        self.canvas.create_rectangle(e_x - 12, e_y - 10, e_x + 12, e_y + 10, fill="#FFFFFF", outline="#333")
        self.canvas.create_text(e_x, e_y, text="E", font=("Arial", 8, "bold"))

    def _draw_mem_addr_line(self):
        """Draw the AR -> MEM address path."""
        x = self.reg_x2
        self.canvas.create_line(
            x, self.reg_boxes["AR"]["y_center"], x, self.reg_boxes["MEM"]["y_center"],
            width=2, fill="#AA0000", arrow=tk.LAST
        )

    def _build_flags(self):
        f_frame = tk.Frame(self)
        f_frame.pack(side="bottom", pady=5)

        for name in ["E", "I", "S"]:
            lbl = tk.Label(
                f_frame,
                text=f"{name}: 0",
                font=("Arial", 12, "bold"),
                width=6,
                bd=1,
                relief="solid",
                bg="white",
            )
            lbl.pack(side="left", padx=5)
            self.flag_widgets[name] = lbl

    # ---------- Updating ----------

    def update_from_machine(self, machine, changed_set, micro_op_str=""):
        for name, box in self.reg_boxes.items():
            if name == "MEM":
                text = f"R:{machine.memory.reads} W:{machine.memory.writes}"
            else:
                text = f"{getattr(machine, name).value & 0xFFFF:04X}"
            self.canvas.itemconfigure(box["text"], text=text)
            self.canvas.itemconfigure(box["rect"], fill=REG_FILL)

        m = micro_op_str.replace("←", "<-")

        alu_event = any(op in m for op in ALU_OPS)
        if alu_event:
            self._animate_alu()

        if "M[AR]" in m and "<-" in m:
            self._animate_mem_address()

        # Animate a bus transfer if the first micro-op moves data between registers
        first = m.split(",", 1)[0]
        if not alu_event and "<-" in first:
            lhs, rhs = first.split("<-", 1)
            lhs = lhs.split(":")[-1].strip().upper()
            rhs = rhs.strip().upper()
            dest = self._map_reg(lhs)
            src = self._map_reg(rhs)

            # Increments, arithmetic and constant loads stay inside the register
            internal = (
                lhs in rhs
                or any(op in rhs for op in "+-&|^")
                or rhs in ("0", "1", "CLR", "INC")
            )
            if not internal and src and dest and dest != "AC":  # AC is fed only by the ALU
                self._animate_packet(src, "source", "blue")
                self._animate_packet(dest, "dest", "red")

        for name in changed_set:
            if name in self.reg_boxes:
                self.canvas.itemconfigure(self.reg_boxes[name]["rect"], fill=HIGHLIGHT_FILL)

        for name, lbl in self.flag_widgets.items():
            lbl.config(
                text=f"{name}: {getattr(machine, name).value}",
                bg=HIGHLIGHT_FILL if name in changed_set else "white",
            )

    @staticmethod
    def _map_reg(s):
        """Map an operand from micro-op text to a register name, "MEM", or None."""
        if "M[" in s or "MEM" in s:
            return "MEM"
        for r in REGISTERS:
            if r in s:
                return r
        return None

    # ---------- Animation ----------

    def _animate_ball(self, start, end, color, radius=6, steps=20, delay=20, on_done=None):
        """Move a small circle from start to end (x, y) over `steps` frames, then delete it."""
        (x0, y0), (x1, y1) = start, end
        ball = self.canvas.create_oval(
            x0 - radius, y0 - radius, x0 + radius, y0 + radius,
            fill=color, outline="black"
        )
        dx = (x1 - x0) / steps
        dy = (y1 - y0) / steps

        def step(i):
            if i >= steps:
                self.canvas.delete(ball)
                if on_done:
                    on_done()
                return
            self.canvas.move(ball, dx, dy)
            self.after(delay, lambda: step(i + 1))

        step(0)

    def _animate_packet(self, reg, direction, color):
        """Animate data leaving a register onto the bus ("source") or entering it ("dest")."""
        y = self.reg_boxes[reg]["y_center"]
        if direction == "source":
            self._animate_ball((self.reg_x2, y), (self.bus_right_x, y), color, delay=25)
        else:
            self._animate_ball((self.bus_left_x, y), (self.reg_x1, y), color, delay=25)

    def _animate_alu(self):
        """Animate DR -> ALU, then ALU -> AC."""
        y_dr = self.reg_boxes["DR"]["y_center"]
        y_ac = self.reg_boxes["AC"]["y_center"]

        def alu_to_ac():
            self._animate_ball((self.alu_x1, self.alu_center_y), (self.reg_x1, y_ac), "red")

        self._animate_ball((self.reg_x1, y_dr), (self.alu_x2, self.alu_center_y), "blue", on_done=alu_to_ac)

    def _animate_mem_address(self):
        """Animate the address travelling from AR to MEM."""
        x = self.reg_x2
        self._animate_ball(
            (x, self.reg_boxes["AR"]["y_center"]), (x, self.reg_boxes["MEM"]["y_center"]),
            "purple", radius=5, steps=16
        )
