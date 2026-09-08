/* Shared task-store core for the examples/todo demo.
 *
 * One typed module, two entries: `main-ts.ts` (ts mode) and `main-js.js`
 * (js mode) import these same functions, so the demo proves a single
 * implementation serves both modes — the ts entry as a static import, the
 * js entry as a mixed-graph import of typed code into untyped code.
 *
 * Deliberately small on purpose: interfaces, object literals with
 * identifier keys, arrays, `for`-`of`, and pure functions. Everything here
 * is long-landed surface, so the example tracks the compiler rather than
 * the roadmap. New tasks are returned, never mutated in place.
 */

export interface Task {
  readonly title: string;
  readonly done: boolean;
}

export function createTask(title: string): Task {
  return { title: title, done: false };
}

export function toggleTask(task: Task): Task {
  if (task.done) {
    return { title: task.title, done: false };
  }
  return { title: task.title, done: true };
}

export function countOpen(tasks: Task[]): number {
  let open = 0;
  for (const task of tasks) {
    if (!task.done) {
      open = open + 1;
    }
  }
  return open;
}

export function clearCompleted(tasks: Task[]): Task[] {
  const kept: Task[] = [];
  for (const task of tasks) {
    if (!task.done) {
      kept.push(task);
    }
  }
  return kept;
}

export function summarize(tasks: Task[]): string {
  const lines: string[] = [];
  for (const task of tasks) {
    let mark = '[ ]';
    if (task.done) {
      mark = '[x]';
    }
    lines.push(`${mark} ${task.title}`);
  }
  lines.push(`open: ${countOpen(tasks)}/${tasks.length}`);
  return lines.join('\n');
}
