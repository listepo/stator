// Whole-program ESM (plan.md Task 3.11): main -> b -> c must initialize c, b, main.
import { doubled } from "./b.ts";
import { base, describe } from "./c.ts";
console.log("init a");
console.log(doubled + base);
console.log(describe(doubled));
