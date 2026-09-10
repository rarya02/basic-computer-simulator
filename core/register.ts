export function mask(value: number, width: number): number {
  return value & ((1 << width) - 1);
}

export class Register {
  readonly width: number;
  #value = 0;

  constructor(width: number) {
    this.width = width;
  }

  get value(): number {
    return this.#value;
  }

  load(value: number): void {
    this.#value = mask(value, this.width);
  }

  increment(): void {
    this.load(this.#value + 1);
  }

  clear(): void {
    this.load(0);
  }
}
