/* Todo demo, ts-mode entry: statically compiled against the shared core.
 *
 * Build: node packages/compiler/src/cli/main.ts build examples/todo/main-ts.ts -o todo-ts
 * Ground truth: node examples/todo/main-ts.ts must print the same bytes.
 */

import type { Task } from './shared.ts';
import { clearCompleted, countOpen, createTask, summarize, toggleTask } from './shared.ts';

const tasks: Task[] = [];
tasks.push(createTask('write the shared core'));
tasks.push(createTask('compile it statically'));
tasks.push(createTask('fix the blockers'));

const first: Task | undefined = tasks[0];
if (first !== undefined) {
  tasks[0] = toggleTask(first);
}
console.log(summarize(tasks));

const remaining: Task[] = clearCompleted(tasks);
console.log(summarize(remaining));
console.log(`still open: ${countOpen(remaining)}`);
