// Dijkstra over the CSR graph, plus fare rules and route formatting. The route is
// rebuilt from the predecessor array, then rendered leg by leg.

import { cityCount, cityName, cityZone } from "./cities.ts";
import { Graph } from "./links.ts";
import { MinHeap } from "./heap.ts";

// Far beyond any reachable path total, standing in for Infinity so an
// unreached node is recognizable without a sentinel type.
export const UNREACHED: number = 1000000;

export class Plan {
  stops: number[] = [];
  spans: number[] = [];
  totalKm: number = 0;
  found: boolean = false;
}

export function shortestPath(graph: Graph, from: number, to: number): Plan {
  const n = cityCount();
  const dist: number[] = [];
  const prev: number[] = [];
  const settled: boolean[] = [];
  for (let i = 0; i < n; i += 1) {
    dist[dist.length] = UNREACHED;
    prev[prev.length] = -1;
    settled[settled.length] = false;
  }
  dist[from] = 0;
  const queue = new MinHeap();
  queue.push(0, from);

  while (!queue.isEmpty()) {
    const key = queue.minKey();
    const node = queue.pop();
    if (settled[node] as boolean) {
      continue;
    }
    settled[node] = true;
    if (node === to) {
      break;
    }
    const degree = graph.degree(node);
    for (let k = 0; k < degree; k += 1) {
      const next = graph.neighbor(node, k);
      if (settled[next] as boolean) {
        continue;
      }
      const candidate = key + graph.span(node, k);
      if (candidate < (dist[next] as number)) {
        dist[next] = candidate;
        prev[next] = node;
        queue.push(candidate, next);
      }
    }
  }

  const plan = new Plan();
  if ((dist[to] as number) === UNREACHED) {
    return plan;
  }
  plan.found = true;
  plan.totalKm = dist[to] as number;

  // Walk predecessors back to the origin, then reverse in place.
  let at = to;
  while (at !== -1) {
    plan.stops[plan.stops.length] = at;
    at = prev[at] as number;
  }
  let lo = 0;
  let hi = plan.stops.length - 1;
  while (lo < hi) {
    const tmp = plan.stops[lo] as number;
    plan.stops[lo] = plan.stops[hi] as number;
    plan.stops[hi] = tmp;
    lo += 1;
    hi -= 1;
  }
  for (let i = 1; i < plan.stops.length; i += 1) {
    const a = plan.stops[i - 1] as number;
    const b = plan.stops[i] as number;
    plan.spans[plan.spans.length] = (dist[b] as number) - (dist[a] as number);
  }
  return plan;
}

// Fare: a flat boarding charge plus a per-km rate, doubled for every zone
// boundary the route crosses. Everything stays in whole cents so the printed
// totals are exact.
export function fareCents(plan: Plan): number {
  if (!plan.found) {
    return 0;
  }
  let boundaries = 0;
  for (let i = 1; i < plan.stops.length; i += 1) {
    const zoneA = cityZone(plan.stops[i - 1] as number);
    const zoneB = cityZone(plan.stops[i] as number);
    if (zoneA !== zoneB) {
      boundaries += 1;
    }
  }
  const kmCents = (plan.totalKm * 40 + 0.5) | 0;
  return 250 + kmCents + boundaries * 75;
}

export function centsLabel(cents: number): string {
  const whole = (cents / 100) | 0;
  const rest = cents % 100;
  if (rest < 10) {
    return `$${whole}.0${rest}`;
  }
  return `$${whole}.${rest}`;
}

export function describePlan(plan: Plan, origin: string, destination: string): string {
  if (!plan.found) {
    return `${origin} -> ${destination}: no route`;
  }
  let line = `${origin}`;
  for (let i = 1; i < plan.stops.length; i += 1) {
    const stop = cityName(plan.stops[i] as number);
    const km = plan.spans[i - 1] as number;
    line += ` -[${km} km]-> ${stop}`;
  }
  const fare = centsLabel(fareCents(plan));
  return `${line} | total ${plan.totalKm} km, ${plan.stops.length - 1} legs, fare ${fare}`;
}
