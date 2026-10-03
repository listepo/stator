// A CommonJS package reading `__filename` (plan.md §11d T12.3, plan-notes 316): its basename only,
// so the output holds no path.
import { file, where } from 'loc';
console.log(file, where);
