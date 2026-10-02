// A module with private helpers that share their spelling with the importer's own.
let count: number = 0;
function helper(): string {
  return "counter.helper";
}
export function increment(): number {
  count += 1;
  return count;
}
export { count as current, helper as counterHelper };
export default function (): string {
  return `counter at ${count}`;
}
console.log("init counter");
