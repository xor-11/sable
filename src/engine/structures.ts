/**
 * Hand-written core data structures:
 * 1. DynamicArray<T>: explicit growable capacity-doubling array container.
 * 2. RingBuffer<T>: fixed-capacity circular buffer for the scrolling message log.
 * 3. MinHeap<T>: binary min-heap priority queue powering A* pathfinding.
 */

export class DynamicArray<T> {
  private buffer: Array<T | undefined>;
  private count: number;

  constructor(initialCapacity = 8) {
    const cap = Math.max(1, initialCapacity);
    this.buffer = new Array<T | undefined>(cap);
    this.count = 0;
  }

  get length(): number {
    return this.count;
  }

  get capacity(): number {
    return this.buffer.length;
  }

  /** Append item, doubling backing buffer capacity when full. */
  push(value: T): void {
    if (this.count >= this.buffer.length) {
      const next = new Array<T | undefined>(this.buffer.length * 2);
      for (let i = 0; i < this.count; i++) {
        next[i] = this.buffer[i];
      }
      this.buffer = next;
    }
    this.buffer[this.count++] = value;
  }

  get(index: number): T {
    if (index < 0 || index >= this.count) {
      throw new RangeError(`DynamicArray index out of bounds: ${index}`);
    }
    return this.buffer[index] as T;
  }

  set(index: number, value: T): void {
    if (index < 0 || index >= this.count) {
      throw new RangeError(`DynamicArray index out of bounds: ${index}`);
    }
    this.buffer[index] = value;
  }

  /** Remove element at index, shifting subsequent elements left to preserve order. */
  removeAt(index: number): T {
    const removed = this.get(index);
    for (let i = index; i < this.count - 1; i++) {
      this.buffer[i] = this.buffer[i + 1];
    }
    this.buffer[--this.count] = undefined;
    return removed;
  }

  clear(): void {
    for (let i = 0; i < this.count; i++) {
      this.buffer[i] = undefined;
    }
    this.count = 0;
  }

  toArray(): T[] {
    const result = new Array<T>(this.count);
    for (let i = 0; i < this.count; i++) {
      result[i] = this.buffer[i] as T;
    }
    return result;
  }
}

export class RingBuffer<T> {
  private readonly buffer: Array<T | undefined>;
  private readonly maxCapacity: number;
  private head = 0; // Index of oldest element
  private count = 0;

  constructor(capacity: number) {
    this.maxCapacity = Math.max(1, capacity);
    this.buffer = new Array<T | undefined>(this.maxCapacity);
  }

  get size(): number {
    return this.count;
  }

  get capacity(): number {
    return this.maxCapacity;
  }

  /** Insert newest item; overwrites oldest element when full in O(1) time. */
  push(item: T): void {
    const writeIdx = (this.head + this.count) % this.maxCapacity;
    this.buffer[writeIdx] = item;
    if (this.count < this.maxCapacity) {
      this.count++;
    } else {
      this.head = (this.head + 1) % this.maxCapacity;
    }
  }

  /** Return all elements ordered from oldest to newest. */
  toArray(): T[] {
    const out = new Array<T>(this.count);
    for (let i = 0; i < this.count; i++) {
      out[i] = this.buffer[(this.head + i) % this.maxCapacity] as T;
    }
    return out;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
    for (let i = 0; i < this.maxCapacity; i++) {
      this.buffer[i] = undefined;
    }
  }
}

export interface HeapEntry<T> {
  priority: number;
  value: T;
}

/**
 * Binary Min-Heap priority queue with O(log n) push/pop and O(1) peek.
 */
export class MinHeap<T> {
  private data: HeapEntry<T>[] = [];

  get size(): number {
    return this.data.length;
  }

  isEmpty(): boolean {
    return this.data.length === 0;
  }

  peek(): HeapEntry<T> | undefined {
    return this.data[0];
  }

  push(value: T, priority: number): void {
    this.data.push({ value, priority });
    this.siftUp(this.data.length - 1);
  }

  pop(): T | undefined {
    if (this.data.length === 0) return undefined;
    const min = this.data[0].value;
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.siftDown(0);
    }
    return min;
  }

  private siftUp(index: number): void {
    let idx = index;
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (this.data[idx].priority >= this.data[parent].priority) break;
      const tmp = this.data[idx];
      this.data[idx] = this.data[parent];
      this.data[parent] = tmp;
      idx = parent;
    }
  }

  private siftDown(index: number): void {
    let idx = index;
    const len = this.data.length;
    while (true) {
      const left = (idx << 1) + 1;
      const right = left + 1;
      let smallest = idx;

      if (left < len && this.data[left].priority < this.data[smallest].priority) {
        smallest = left;
      }
      if (right < len && this.data[right].priority < this.data[smallest].priority) {
        smallest = right;
      }
      if (smallest === idx) break;

      const tmp = this.data[idx];
      this.data[idx] = this.data[smallest];
      this.data[smallest] = tmp;
      idx = smallest;
    }
  }
}
