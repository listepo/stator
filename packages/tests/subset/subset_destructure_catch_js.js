// @mode: js
// @verdict: dynamic
// SUBSET.md: Destructuring a caught value

export function run() {
  try {
    throw { message: "x" };
  } catch ({ message }) {
    return message;
  }
}
