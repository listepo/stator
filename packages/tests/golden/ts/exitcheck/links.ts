// Undirected weighted links between cities, stored flat; the Graph class below
// compacts them into CSR form so neighbor iteration is two array reads.

import { cityCount, cityId } from "./cities.ts";

export const linkSrc: number[] = [];
export const linkDst: number[] = [];
export const linkKm: number[] = [];

function addDirected(src: number, dst: number, km: number): void {
  linkSrc[linkSrc.length] = src;
  linkDst[linkDst.length] = dst;
  linkKm[linkKm.length] = km;
}

export function link(a: string, b: string, km: number): void {
  const src = cityId(a);
  const dst = cityId(b);
  addDirected(src, dst, km);
  addDirected(dst, src, km);
}

export function linkCount(): number {
  return linkSrc.length;
}

export class Graph {
  offsets: number[] = [];
  targets: number[] = [];
  weights: number[] = [];

  constructor() {
    const n = cityCount();
    const degrees: number[] = [];
    for (let i = 0; i < n; i += 1) {
      degrees[degrees.length] = 0;
    }
    for (const src of linkSrc) {
      degrees[src] = (degrees[src] as number) + 1;
    }
    let running = 0;
    for (let i = 0; i < n; i += 1) {
      this.offsets[this.offsets.length] = running;
      running += degrees[i] as number;
    }
    this.offsets[this.offsets.length] = running;
    const cursor: number[] = [];
    for (let i = 0; i < n; i += 1) {
      cursor[cursor.length] = this.offsets[i] as number;
      this.targets[this.targets.length] = 0;
      this.weights[this.weights.length] = 0;
    }
    for (let i = n; i < running; i += 1) {
      this.targets[this.targets.length] = 0;
      this.weights[this.weights.length] = 0;
    }
    for (let e = 0; e < linkSrc.length; e += 1) {
      const src = linkSrc[e] as number;
      const at = cursor[src] as number;
      this.targets[at] = linkDst[e] as number;
      this.weights[at] = linkKm[e] as number;
      cursor[src] = at + 1;
    }
  }

  degree(node: number): number {
    return (this.offsets[node + 1] as number) - (this.offsets[node] as number);
  }

  neighbor(node: number, k: number): number {
    return this.targets[(this.offsets[node] as number) + k] as number;
  }

  span(node: number, k: number): number {
    return this.weights[(this.offsets[node] as number) + k] as number;
  }
}

link("Harbor", "Mill", 4.5);
link("Harbor", "Docks", 2.25);
link("Harbor", "Lighthouse", 3.5);
link("Mill", "Foundry", 6.75);
link("Mill", "Junction", 5.5);
link("Docks", "Junction", 8.25);
link("Docks", "Lighthouse", 1.75);
link("Foundry", "Terrace", 4.25);
link("Junction", "Terrace", 3.75);
link("Junction", "Orchard", 7.5);
link("Orchard", "Meadow", 2.5);
link("Orchard", "Quarry", 6.25);
link("Terrace", "Quarry", 5.75);
link("Quarry", "Summit", 9.5);
link("Meadow", "Summit", 11.25);
link("Summit", "Observatory", 3.25);
link("Lighthouse", "Junction", 9.75);
