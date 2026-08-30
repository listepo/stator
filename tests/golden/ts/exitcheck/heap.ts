// Binary min-heap keyed by distance, holding node ids. Two accommodations to the
// Phase-3 subset: `| 0` truncation stands in for Math.floor (globals are Phase 4),
// and the backing arrays never shrink -- `.length = n` assignment is not in the
// subset, so heapCount tracks the logical size and pops just overwrite.

export class MinHeap {
  heapKeys: number[] = [];
  heapItems: number[] = [];
  heapCount: number = 0;

  size(): number {
    return this.heapCount;
  }

  isEmpty(): boolean {
    return this.heapCount === 0;
  }

  keyAt(i: number): number {
    return this.heapKeys[i] as number;
  }

  itemAt(i: number): number {
    return this.heapItems[i] as number;
  }

  swap(a: number, b: number): void {
    const key = this.heapKeys[a] as number;
    const item = this.heapItems[a] as number;
    this.heapKeys[a] = this.heapKeys[b] as number;
    this.heapItems[a] = this.heapItems[b] as number;
    this.heapKeys[b] = key;
    this.heapItems[b] = item;
  }

  push(key: number, item: number): void {
    if (this.heapCount === this.heapKeys.length) {
      this.heapKeys[this.heapKeys.length] = key;
      this.heapItems[this.heapItems.length] = item;
    } else {
      this.heapKeys[this.heapCount] = key;
      this.heapItems[this.heapCount] = item;
    }
    this.heapCount += 1;
    let at = this.heapCount - 1;
    while (at > 0) {
      const parent = ((at - 1) / 2) | 0;
      if (this.keyAt(parent) <= this.keyAt(at)) {
        break;
      }
      this.swap(parent, at);
      at = parent;
    }
  }

  // Removes and returns the item with the smallest key; read minKey() first if
  // the key matters, because the pop discards it.
  pop(): number {
    const top = this.itemAt(0);
    this.heapCount -= 1;
    if (this.heapCount > 0) {
      this.heapKeys[0] = this.heapKeys[this.heapCount] as number;
      this.heapItems[0] = this.heapItems[this.heapCount] as number;
      this.siftDown();
    }
    return top;
  }

  minKey(): number {
    return this.keyAt(0);
  }

  siftDown(): void {
    let at = 0;
    while (true) {
      const left = at * 2 + 1;
      const right = left + 1;
      let smallest = at;
      if (left < this.heapCount && this.keyAt(left) < this.keyAt(smallest)) {
        smallest = left;
      }
      if (right < this.heapCount && this.keyAt(right) < this.keyAt(smallest)) {
        smallest = right;
      }
      if (smallest === at) {
        break;
      }
      this.swap(at, smallest);
      at = smallest;
    }
  }
}
