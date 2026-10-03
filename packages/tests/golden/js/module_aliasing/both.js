// Two star re-exports bind `dup` differently: ES drops it from the namespace.
export * from "./a.js";
export * from "./b.js";
export const own = "both.own";
