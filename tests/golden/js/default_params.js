function greet(name = "world") {
  return name;
}
function add(a, b = 1) {
  return a + b;
}
function usesPrev(a, b = a) {
  return b;
}
console.log(greet());
console.log(greet("hi"));
console.log(add(2));
console.log(add(2, 3));
console.log(usesPrev(7));
console.log(add(2, undefined));
