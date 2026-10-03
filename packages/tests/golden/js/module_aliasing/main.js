// Per-module namespaces in js mode, across a mixed JS/TS graph (plan.md §11c T11.5a).
import * as both from "./both.js";
import { onlyA as a, onlyB, n, bumpA } from "./both.js";
import answer, { typedHelper } from "./typed.ts";

function helper() {
  return "main.helper";
}

console.log("dup" in both, both.onlyA, a, onlyB, both.own);
console.log(n, both.n);
bumpA();
console.log(n, both.n);
console.log(helper(), typedHelper(), answer);
