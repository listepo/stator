// Phase 3 exit check: city registry. One flat namespace per Task 3.11, so every
// top-level name in this program is unique across all five files.

export const cityNames: string[] = [];
export const cityZones: number[] = [];
const cityIndex = new Map<string, number>();

export function registerCity(name: string, zone: number): number {
  const id = cityNames.length;
  cityNames[cityNames.length] = name;
  cityZones[cityZones.length] = zone;
  cityIndex.set(name, id);
  return id;
}

export function cityCount(): number {
  return cityNames.length;
}

export function cityName(id: number): string {
  return cityNames[id] as string;
}

export function cityZone(id: number): number {
  return cityZones[id] as number;
}

export function cityId(name: string): number {
  if (!cityIndex.has(name)) {
    throw `unknown city: ${name}`;
  }
  return cityIndex.get(name) as number;
}

registerCity("Harbor", 1);
registerCity("Mill", 1);
registerCity("Foundry", 2);
registerCity("Docks", 1);
registerCity("Junction", 2);
registerCity("Orchard", 3);
registerCity("Summit", 4);
registerCity("Quarry", 3);
registerCity("Terrace", 2);
registerCity("Meadow", 3);
registerCity("Lighthouse", 1);
registerCity("Observatory", 4);
