

import os
import sys

#import paths

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CLI_DIR = os.path.join(BASE_DIR, "cli")
GUI_DIR = os.path.join(BASE_DIR, "gui")

for path in (BASE_DIR, CLI_DIR, GUI_DIR):
    if path not in sys.path:
        sys.path.insert(0, path)

#import CLI

cli_main = None
cli_error = None

try:
    # cli/interface.py defines def main(): ...
    from cli.interface import main as cli_main
except Exception as e:
    cli_error = e

#import GUI

gui_main = None
gui_error = None

try:
    import tkinter as tk
    # gui/app.py defines class ManoApp
    from gui.app import ManoApp

    def gui_main():
        root = tk.Tk()
        app = ManoApp(root)
        root.mainloop()

except Exception as e:
    gui_error = e


def choose_mode():
    """Prompt user to choose CLI or GUI and run it."""
    import sys as _sys

    while True:
        print("Mano Basic Computer Simulator")
        print("1) CLI mode")
        print("2) GUI mode")
        print("Q) Quit")
        choice = input("Select mode [1/2/Q]: ").strip().lower()

        #CLI
        if choice in ("1", "cli"):
            if cli_main is None:
                print("\n[CRITICAL ERROR] Could not start CLI mode.")
                print(f"Reason: {cli_error}\n")
                continue
            print("\nStarting CLI mode...\n")
            cli_main()
            break

        #GUI
        elif choice in ("2", "gui"):
            if gui_main is None:
                print("\n[CRITICAL ERROR] Could not start GUI mode.")
                print(f"Reason: {gui_error}\n")
                continue
            print("\nStarting GUI mode...\n")
            gui_main()
            break

        #Quit
        elif choice in ("q", "quit", "exit"):
            print("Exiting.")
            _sys.exit(0)

        else:
            print("Invalid choice, please enter 1, 2, or Q.\n")


if __name__ == "__main__":
    choose_mode()
