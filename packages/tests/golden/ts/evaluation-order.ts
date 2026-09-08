// Every BinaryOp evaluates its operands left to right, including when each operand is a call.
// The emitter must not rely on C's unspecified function-argument evaluation order.
function record(value: number): number {
  console.log(value);
  return value;
}

console.log(record(1) + record(2));
console.log(record(3) * record(4));
console.log(`a${record(5)}b${record(6)}`);
