export const x: number = 42;
function inner(): number {
  return 1;
}
export { inner as renamed };
export default function (): number {
  return 7;
}
