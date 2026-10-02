// A re-export hub: renamed, default, namespace and star re-exports of two modules.
export * from "./shapes.ts";
export * as counter from "./counter.ts";
export { increment as bump, default as describeCounter } from "./counter.ts";
export { default as shapeLabel } from "./shapes.ts";
console.log("init hub");
