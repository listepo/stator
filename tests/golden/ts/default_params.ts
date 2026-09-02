function greet(name: string = "world"): string {
  return name;
}
function add(a: number, b: number = 1): number {
  return a + b;
}
function usesPrev(a: number, b: number = a): number {
  return b;
}
console.log(greet());
console.log(greet("hi"));
console.log(add(2));
console.log(add(2, 3));
console.log(usesPrev(7));
