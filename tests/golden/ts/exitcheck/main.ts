// Phase 3 exit check (plan.md §5): a real typed TS program -- a transit route
// planner -- compiled by stator and diffed byte-for-byte against Node. It leans
// on most of the Phase-3 subset: classes, Map, arrays with the append idiom,
// for-of, closures via the module graph, generics, exceptions, and modules.

import { cityCount, cityId, cityName, cityZone } from "./cities.ts";
import { Graph, linkCount, linkKm } from "./links.ts";
import { Plan, UNREACHED, describePlan, fareCents, centsLabel, shortestPath } from "./planner.ts";

// A small generic exercised at two element types: the last element via for-of,
// because for-of is the typed way to read an array without a cast.
function lastOf<T>(items: T[], fallback: T): T {
  let out = fallback;
  for (const item of items) {
    out = item;
  }
  return out;
}

function planBetween(graph: Graph, origin: string, destination: string): Plan {
  return shortestPath(graph, cityId(origin), cityId(destination));
}

function reportRoute(graph: Graph, origin: string, destination: string): void {
  const plan = planBetween(graph, origin, destination);
  console.log(describePlan(plan, origin, destination));
}

function networkSummary(graph: Graph): void {
  let totalKm = 0;
  let longest = 0;
  for (const km of linkKm) {
    totalKm += km;
    if (km > longest) {
      longest = km;
    }
  }
  let busiest = 0;
  let busiestDegree = 0;
  for (let node = 0; node < cityCount(); node += 1) {
    const degree = graph.degree(node);
    if (degree > busiestDegree) {
      busiestDegree = degree;
      busiest = node;
    }
  }
  console.log(`network: ${cityCount()} stops, ${linkCount()} directed links`);
  console.log(`track: ${totalKm} km laid, longest single link ${longest} km`);
  console.log(`hub: ${cityName(busiest)} with ${busiestDegree} links`);
}

function zoneCensus(): void {
  const zoneCounts = new Map<number, number>();
  const seenZones: number[] = [];
  for (let id = 0; id < cityCount(); id += 1) {
    const zone = cityZone(id);
    if (zoneCounts.has(zone)) {
      zoneCounts.set(zone, (zoneCounts.get(zone) as number) + 1);
    } else {
      zoneCounts.set(zone, 1);
      seenZones[seenZones.length] = zone;
    }
  }
  for (const zone of seenZones) {
    console.log(`zone ${zone}: ${zoneCounts.get(zone) as number} stops`);
  }
}

function fareTable(graph: Graph, origins: string[], destination: string): void {
  console.log(`fares to ${destination}:`);
  let cheapest = UNREACHED;
  let cheapestFrom = "";
  for (const origin of origins) {
    const plan = planBetween(graph, origin, destination);
    const cents = fareCents(plan);
    console.log(`  ${origin}: ${centsLabel(cents)} for ${plan.totalKm} km`);
    if (cents > 0 && cents < cheapest) {
      cheapest = cents;
      cheapestFrom = origin;
    }
  }
  console.log(`  cheapest boarding: ${cheapestFrom} at ${centsLabel(cheapest)}`);
}

const network = new Graph();
networkSummary(network);
zoneCensus();
console.log("");

reportRoute(network, "Harbor", "Summit");
reportRoute(network, "Lighthouse", "Observatory");
reportRoute(network, "Docks", "Meadow");
reportRoute(network, "Foundry", "Harbor");
console.log("");

fareTable(network, ["Harbor", "Docks", "Mill", "Orchard"], "Summit");
console.log("");

const walkKeys: string[] = [];
walkKeys[walkKeys.length] = "Harbor";
walkKeys[walkKeys.length] = "Junction";
walkKeys[walkKeys.length] = "Summit";
console.log(`survey ends at ${lastOf(walkKeys, "nowhere")}`);
const zeroes: number[] = [];
console.log(`empty survey falls back to ${lastOf(zeroes, -1)}`);

try {
  reportRoute(network, "Atlantis", "Summit");
} catch (problem) {
  if (typeof problem === "string") {
    console.log(`rejected: ${problem}`);
  } else {
    console.log("rejected: unexpected failure");
  }
}
console.log("done");
