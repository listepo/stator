let value = 1;
value = 'text';
console.log(value);
function nested() {
  let local = 2;
  local = 'nested';
  return local;
}
console.log(nested());
