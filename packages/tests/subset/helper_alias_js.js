export const x = 42;
function inner() {
  return 1;
}
export { inner as renamed };
export default function () {
  return 7;
}
