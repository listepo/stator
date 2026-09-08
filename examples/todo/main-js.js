/* Todo demo, js-mode entry: untyped code over the same shared core.
 *
 * The import below is a mixed graph — a `.js` entry importing typed `.ts`.
 * Calls into the shared functions cross the boundary with runtime checks;
 * correct arguments pass straight through.
 *
 * Build: node packages/compiler/src/cli/main.ts build examples/todo/main-js.js -o todo-js --mode=js
 * Ground truth: node examples/todo/main-js.js must print the same bytes.
 */
import { clearCompleted, createTask, summarize, toggleTask } from './shared.ts';

const inbox = [];
inbox.push(createTask('draft the list'));
inbox.push(createTask('toggle one item'));
inbox.push(createTask('drop what is done'));
inbox.push(createTask('print what is left'));

const second = inbox[1];
if (second !== undefined) {
  inbox[1] = toggleTask(second);
}
const third = inbox[2];
if (third !== undefined) {
  inbox[2] = toggleTask(third);
}
console.log(summarize(inbox));
console.log('---');
console.log(summarize(clearCompleted(inbox)));
