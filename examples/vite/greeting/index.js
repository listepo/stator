// A package like any on npm: untyped JavaScript, bundled by Vite into the program's vendor module.
export function greet(name) {
  return `Hello, ${name}!`;
}

export function shout(text) {
  return text.toUpperCase();
}

export default function banner(text) {
  const line = '-'.repeat(text.length);
  return `${line}\n${text}\n${line}`;
}
