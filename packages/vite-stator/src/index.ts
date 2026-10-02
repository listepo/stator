/* vite-stator (plan.md §11d T12.2): the adapter `stator build --mode=js` loads by default, as this
 * module's default export, and the `stator()` Vite plugin. */

export { adapter, adapter as default, bundle } from './adapter.ts';
export { stator, type StatorPluginOptions } from './plugin.ts';
