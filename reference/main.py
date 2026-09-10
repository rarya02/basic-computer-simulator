"""Launcher: choose between the CLI and GUI front ends."""

try:
    from cli.interface import main as cli_main
    cli_error = None
except ImportError as e:
    cli_main, cli_error = None, e

try:
    import tkinter as tk
    from gui.app import ManoApp
    gui_error = None
except ImportError as e:
    gui_error = e


def gui_main():
    root = tk.Tk()
    ManoApp(root)
    root.mainloop()


def choose_mode():
    """Prompt the user to choose CLI or GUI mode and run it."""
    while True:
        print("Mano Basic Computer Simulator")
        print("1) CLI mode")
        print("2) GUI mode")
        print("Q) Quit")
        choice = input("Select mode [1/2/Q]: ").strip().lower()

        if choice in ("1", "cli"):
            if cli_error:
                print(f"\n[ERROR] Could not start CLI mode: {cli_error}\n")
                continue
            print("\nStarting CLI mode...\n")
            cli_main()
            return

        if choice in ("2", "gui"):
            if gui_error:
                print(f"\n[ERROR] Could not start GUI mode: {gui_error}\n")
                continue
            print("\nStarting GUI mode...\n")
            gui_main()
            return

        if choice in ("q", "quit", "exit"):
            print("Exiting.")
            return

        print("Invalid choice, please enter 1, 2, or Q.\n")


if __name__ == "__main__":
    choose_mode()
