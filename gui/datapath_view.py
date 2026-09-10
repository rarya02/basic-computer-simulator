import tkinter as tk


class DatapathView(tk.Frame):
    def __init__(self, master, *args, **kwargs):
        super().__init__(master, *args, **kwargs)

        # Title label above the datapath canvas
        tk.Label(self, text="Register Transfer Datapath", font=("Arial", 12, "bold")).pack(pady=(5, 5))

        # Canvas dimensions
        self.canvas_width = 520
        self.canvas_height = 550

        # Main canvas where the datapath is drawn
        self.canvas = tk.Canvas(
            self,
            width=self.canvas_width,
            height=self.canvas_height,
            bg="white",
            highlightthickness=1,
            relief="sunken",
        )
        self.canvas.pack(expand=True)

        # Dictionary to hold register rectangles and text items
        self.reg_boxes = {}
        # Dictionary to hold flag labels (E, I, S)
        self.flag_widgets = {}

        # ALU and memory address line coordinates (initialized later)
        self.alu_x1 = None
        self.alu_x2 = None
        self.alu_y1 = None
        self.alu_y2 = None
        self.mem_addr_x = None
        self.mem_addr_y_ar = None
        self.mem_addr_y_mem = None

        # Draw fixed layout of registers, bus, ALU, and memory address line
        self._draw_layout()
        # Create flag widgets at the bottom
        self._build_flags()

    def _draw_layout(self):
        # Compute horizontal center and register width
        center_x = self.canvas_width / 2
        reg_width = 160

        # Register left and right x-coordinates
        self.reg_x1 = center_x - (reg_width / 2)
        self.reg_x2 = center_x + (reg_width / 2)

        # Coordinates for the outer bus rectangle
        self.bus_right_x = self.canvas_width - 50
        self.bus_left_x = 50
        self.bus_bottom_y = 500
        self.bus_top_y = 30

        # Right vertical bus line
        self.canvas.create_line(
            self.bus_right_x, self.bus_top_y, self.bus_right_x, self.bus_bottom_y,
            width=4, fill="#444", arrow=tk.LAST
        )
        self.canvas.create_text(
            self.bus_right_x, 20, text="BUS", font=("Arial", 8, "bold"), fill="#444"
        )

        # Bottom horizontal bus line
        self.canvas.create_line(
            self.bus_right_x, self.bus_bottom_y, self.bus_left_x, self.bus_bottom_y,
            width=4, fill="#444", arrow=tk.LAST
        )

        # Left vertical bus line
        self.canvas.create_line(
            self.bus_left_x, self.bus_bottom_y, self.bus_left_x, self.bus_top_y,
            width=4, fill="#444", arrow=tk.LAST
        )

        # Local helper to create a single register box with its arrows
        def make_reg(name, row):
            # Compute vertical position for this row
            y1 = 50 + row * 65
            y2 = y1 + 45
            mid_y = (y1 + y2) / 2

            # Input line from left bus into register (AC has no left input)
            if name != "AC":
                self.canvas.create_line(
                    self.bus_left_x, mid_y, self.reg_x1, mid_y,
                    width=2, fill="#888", arrow=tk.LAST
                )

            # Output line from register to right bus
            self.canvas.create_line(
                self.reg_x2, mid_y, self.bus_right_x, mid_y,
                width=2, fill="#888", arrow=tk.LAST
            )

            # Draw the register rectangle
            rect = self.canvas.create_rectangle(
                self.reg_x1, y1, self.reg_x2, y2,
                outline="#333", width=2, fill="#F9F9F9"
            )

            # Register name label near top-left of the box
            self.canvas.create_text(
                self.reg_x1 + 15, y1 + 12,
                text=name, font=("Arial", 8, "bold"), fill="#555", anchor="w"
            )

            # Text item for the current value inside the register
            txt = self.canvas.create_text(
                (self.reg_x1 + self.reg_x2) / 2, mid_y + 5,
                text="0000", font=("Consolas", 14, "bold")
            )

            # Store references for later update/animation
            self.reg_boxes[name] = {
                "rect": rect,
                "text": txt,
                "cx": (self.reg_x1 + self.reg_x2) / 2,
                "cy": mid_y,
                "y_center": mid_y,
            }

        # Create all the main registers used by the machine
        make_reg("MEM", 0)
        make_reg("AR", 1)
        make_reg("PC", 2)
        make_reg("DR", 3)
        make_reg("AC", 4)
        make_reg("IR", 5)
        make_reg("TR", 6)

        # Draw the ALU block between DR and AC
        self._draw_alu_block()
        # Draw the AR to MEM vertical address line
        self._draw_mem_addr_line()

    def _draw_alu_block(self):
        # Get DR and AC register centers to place the ALU in between
        dr = self.reg_boxes["DR"]
        ac = self.reg_boxes["AC"]
        y_dr = dr["y_center"]
        y_ac = ac["y_center"]
        alu_center_y = (y_dr + y_ac) / 2

        # Size of the ALU box
        alu_height = 40
        alu_width = 60

        # ALU bounding box coordinates
        self.alu_y1 = alu_center_y - (alu_height / 2)
        self.alu_y2 = alu_center_y + (alu_height / 2)
        self.alu_x2 = self.reg_x1 - 25
        self.alu_x1 = self.alu_x2 - alu_width

        # Draw ALU rectangle
        self.canvas.create_rectangle(
            self.alu_x1, self.alu_y1, self.alu_x2, self.alu_y2,
            fill="#EFEFEF", outline="#333", width=2
        )
        self.canvas.create_text(
            (self.alu_x1 + self.alu_x2) / 2, (self.alu_y1 + self.alu_y2) / 2,
            text="ALU", font=("Arial", 10, "bold")
        )

        # Line from DR to ALU
        self.canvas.create_line(
            self.reg_x1, y_dr, self.alu_x2, alu_center_y,
            width=2, fill="#888", arrow=tk.LAST
        )

        # Line from ALU to AC
        self.canvas.create_line(
            self.alu_x1, alu_center_y, self.reg_x1, y_ac,
            width=2, fill="#888", arrow=tk.LAST
        )

        # Small E flip-flop box near ALU to represent E flag
        e_x = (self.alu_x1 + self.reg_x1) / 2
        e_y = alu_center_y - 20
        self.canvas.create_rectangle(
            e_x - 12, e_y - 10, e_x + 12, e_y + 10,
            fill="#FFFFFF", outline="#333"
        )
        self.canvas.create_text(e_x, e_y, text="E", font=("Arial", 8, "bold"))

    def _draw_mem_addr_line(self):
        # Connect AR vertically down to MEM to show address path
        ar = self.reg_boxes["AR"]
        mem = self.reg_boxes["MEM"]
        y_ar = ar["y_center"]
        y_mem = mem["y_center"]

        # Store coordinates for animation later
        self.mem_addr_x = self.reg_x2
        self.mem_addr_y_ar = y_ar
        self.mem_addr_y_mem = y_mem

        # Address line from AR to MEM in red
        self.canvas.create_line(
            self.mem_addr_x, y_ar, self.mem_addr_x, y_mem,
            width=2, fill="#AA0000", arrow=tk.LAST
        )

    def _build_flags(self):
        # Frame to hold the E/I/S flag labels under the canvas
        f_frame = tk.Frame(self)
        f_frame.pack(side="bottom", pady=5)

        # Create labeled rectangles for each flag
        for n in ["E", "I", "S"]:
            lbl = tk.Label(
                f_frame,
                text=f"{n}: 0",
                font=("Arial", 12, "bold"),
                width=6,
                bd=1,
                relief="solid",
                bg="white",
            )
            lbl.pack(side="left", padx=5)
            self.flag_widgets[n] = lbl

    def update_from_machine(self, machine, changed_set, micro_op_str=""):
        # update regsiters
        reg_map = {
            "MEM": None,
            "AR": machine.AR,
            "PC": machine.PC,
            "DR": machine.DR,
            "AC": machine.AC,
            "IR": machine.IR,
            "TR": machine.TR,
        }
        for name, reg in reg_map.items():
            box = self.reg_boxes[name]
            if name == "MEM":
                r = machine.memory.reads
                w = machine.memory.writes
                text = f"R:{r} W:{w}"
            else:
                text = f"{reg.value & 0xFFFF:04X}"
            self.canvas.itemconfigure(box["text"], text=text)
            self.canvas.itemconfigure(box["rect"], fill="#F9F9F9")

        # Normalize micro-op string arrows
        m = micro_op_str.replace("←", "<-")

        # checking high instructions
        alu_ops = ["AC <- DR", "AC <- AC + DR", "AC <- AC & DR", "AC <- AC ∧ DR"]
        alu_event = any(p in m for p in alu_ops)

        reg_ref = m.startswith("T3:") and any(
            k in m for k in ["CLA", "CLE", "CMA", "CME", "CIR", "CIL",
                             "INC", "SPA", "SNA", "SZA", "SZE", "HLT"]
        )

        mem_ref = ("M[AR]" in m) and ("<-" in m)

        # By default assume no bus data animation
        bus_src = None
        bus_dest = None

        # Keep track of regs that are explicitly internal-only (INC / CLR on same reg)
        no_bus_regs = set()

        # Mark explicit internal patterns like R <- R + 1 or R <- 0
        for r in ["AR", "PC", "DR", "AC", "IR", "TR"]:
            if f"{r} <- {r} + 1" in m or f"{r} <- 0" in m:
                no_bus_regs.add(r)

        internal = False

        # ALU event: animate ALU only, no bus between DR and AC
        if alu_event:
            self._animate_alu()
            internal = True  # treat as internal to ALU, no bus

        # Memory reference: animate address line
        if mem_ref:
            self._animate_mem_address()

        # parse micoops and check if movement
        if "<-" in m and not alu_event and not reg_ref:
            first = m.split(",", 1)[0]  # only consider first micro-op for animation
            if "<-" in first:
                lhs, rhs = first.split("<-", 1)
                lhs = lhs.split(":")[-1].strip().upper()
                rhs = rhs.strip().upper()

                dest = self._map_reg(lhs)
                src = self._map_reg(rhs)

                # for internal ops:
                # same register on both sides (PC <- PC + 1)
                # any arithmetic / logic expression
                # pure immediate forms (0, 1, CLR, INC)
                same = lhs in rhs
                aluop = any(op in rhs for op in ["+", "-", "&", "|", "^"])
                imm = rhs in ("0", "1", "CLR", "INC")

                if same or aluop or imm or lhs in no_bus_regs:
                    internal = True
                else:
                    # rhs contains another register or M[AR] -> actual data movement
                    if src and dest and dest != "AC":  # AC is fed by ALU only
                        bus_src = src
                        bus_dest = dest

        # trigger bus animation only if real movement
        if bus_src is not None:
            self._animate_packet(bus_src, "source", "blue")
        if bus_dest is not None:
            self._animate_packet(bus_dest, "dest", "red")

        # Highlight changed registers, also not travelling thru bus
        for name in changed_set:
            if name in self.reg_boxes:
                self.canvas.itemconfigure(self.reg_boxes[name]["rect"], fill="#FFEB3B")

        # update flags
        for f in ["E", "I", "S"]:
            v = int(getattr(machine, f).value)
            self.flag_widgets[f].config(
                text=f"{f}: {v}",
                bg="#FFEB3B" if f in changed_set else "white",
            )

    def _map_reg(self, s):
        # Map string from micro-op text to register name or MEM
        if "M[" in s or "MEM" in s:
            return "MEM"
        for r in ["AR", "PC", "DR", "AC", "IR", "TR"]:
            if r in s:
                return r
        return None

    def _animate_packet(self, reg, direction, color):
        # Draw small moving circle representing data on the bus
        box = self.reg_boxes[reg]
        y = box["y_center"]

        # Determine start and end x positions based on direction
        if direction == "source":
            start = self.reg_x2
            end = self.bus_right_x
        else:
            start = self.bus_left_x
            end = self.reg_x1

        r = 6
        ball = self.canvas.create_oval(start - r, y - r, start + r, y + r, fill=color, outline="black")

        steps = 20
        dx = (end - start) / steps

        # Move the packet step by step along x direction
        def step(i):
            if i >= steps:
                self.canvas.delete(ball)
                return
            self.canvas.move(ball, dx, 0)
            self.after(25, lambda: step(i + 1))

        step(0)

    def _animate_alu(self):
        # Animate data going from DR to ALU and then from ALU to AC
        dr = self.reg_boxes["DR"]
        ac = self.reg_boxes["AC"]
        y_dr = dr["y_center"]
        y_ac = ac["y_center"]
        alu_center_y = (y_dr + y_ac) / 2

        start1 = self.reg_x1
        end1 = self.alu_x2
        start2 = self.alu_x1
        end2 = self.reg_x1
        r = 6

        # Blue ball traveling from DR to ALU
        ball1 = self.canvas.create_oval(
            start1 - r, y_dr - r, start1 + r, y_dr + r,
            fill="blue", outline="black"
        )

        steps = 20
        dx1 = (end1 - start1) / steps
        dy1 = (alu_center_y - y_dr) / steps

        # Move the blue ball into the ALU, then start the red ball toward AC
        def move1(i):
            if i >= steps:
                self.canvas.delete(ball1)
                move2(0)
                return
            self.canvas.move(ball1, dx1, dy1)
            self.after(20, lambda: move1(i + 1))

        # alu to ac ball
        def move2(i):
            ball2 = self.canvas.create_oval(
                start2 - r, alu_center_y - r, start2 + r, alu_center_y + r,
                fill="red", outline="black"
            )
            dx2 = (end2 - start2) / steps
            dy2 = (y_ac - alu_center_y) / steps

            def m2(j):
                if j >= steps:
                    self.canvas.delete(ball2)
                    return
                self.canvas.move(ball2, dx2, dy2)
                self.after(20, lambda: m2(j + 1))

            m2(0)

        move1(0)

    def _animate_mem_address(self):
        # purple ball
        if self.mem_addr_x is None:
            return

        x = self.mem_addr_x
        start_y = self.mem_addr_y_ar
        end_y = self.mem_addr_y_mem
        r = 5

        ball = self.canvas.create_oval(
            x - r, start_y - r, x + r, start_y + r,
            fill="purple", outline="black"
        )

        steps = 16
        dy = (end_y - start_y) / steps

        # Move the ball down the address line
        def step(i):
            if i >= steps:
                self.canvas.delete(ball)
                return
            self.canvas.move(ball, 0, dy)
            self.after(20, lambda: step(i + 1))

        step(0)
