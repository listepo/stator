// Rolldown spells every top-level class `var X = class { … }` (plan.md §11d T12.3).
import { Point } from 'geom';
const p = new Point(3, 4);
console.log(p.length(), p.toString());
