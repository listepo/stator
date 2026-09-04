/** The CLI's human-facing rendering layer (owner directive, plan-notes 187): every line a user
 * reads goes through ink, and every line a MACHINE reads does not — `--json` output bypasses this
 * module entirely, because React rendering buys nothing for `JSON.stringify`.
 *
 * Two invariants, both measured against ink 7's source and pinned by the byte-for-byte suites:
 *  - Render exactly one main-region frame and unmount immediately. On a pipe ink defers a
 *    main-region frame to unmount as `text + '\n'` in a SINGLE write (ink.js L362-369, L558); a
 *    `<Static>`-only tree was spiked to append a second trailing newline, so this module never
 *    uses `<Static>`.
 *  - Color is keyed off `stream.isTTY`, never ambient environment: a pinned-Node spawn is never a
 *    TTY, so an ANSI byte can only reach a human's terminal, never a test's comparison buffer.
 */

import type { Diagnostic } from '../support/diagnostics.ts';
import { renderDiagnostic } from '../support/diagnostics.ts';

/** Named sparingly on purpose: the palette is part of the CLI's visual contract, and every new
 * color is a user-facing decision, not a local styling choice. */
export const INK_COLORS = {
  error: 'red',
  notYet: 'yellow',
  staticVerdict: 'green',
  dynamic: 'cyan',
  dim: 'gray',
} as const;

export type InkColor = (typeof INK_COLORS)[keyof typeof INK_COLORS];

export interface Line {
  readonly text: string;
  readonly color?: InkColor;
}

/** ink's yoga layout gives an empty `<Text>` zero height — blank lines disappear. Run-length
 * grouping by color keeps blank lines literal (they live INSIDE a multi-line Text) without
 * changing per-line colors, so `print` reproduces its input exactly, blanks included. */
function runs(lines: readonly Line[]): { text: string; color?: InkColor | undefined }[] {
  const grouped: { text: string; color?: InkColor | undefined }[] = [];
  for (const line of lines) {
    const last = grouped[grouped.length - 1];
    if (last !== undefined && last.color === line.color) {
      last.text += `\n${line.text}`;
    } else {
      grouped.push({ text: line.text, color: line.color });
    }
  }
  return grouped;
}

/** Diagnostics as render Lines: `not-yet` yellow, everything else that stops the build red.
 * The byte content stays exactly `renderDiagnostic`'s — color is display-only. */
export function diagnosticLines(diagnostics: readonly Diagnostic[]): Line[] {
  return diagnostics.map((d) => ({
    text: renderDiagnostic(d),
    color: d.class === 'not-yet' ? INK_COLORS.notYet : INK_COLORS.error,
  }));
}

/** Writes `lines` (joined with '\n', plus one trailing newline) to `stream` and returns only
 * after the bytes are flushed. An empty array is a no-op: rendering nothing must cost nothing,
 * and ink unmount of an empty frame would still emit a stray newline.
 *
 * ink is imported HERE rather than at module scope, and that is a measured decision, not a style
 * one: importing it costs ~1.6s (ink pulls yoga's wasm through a top-level await), which every
 * `stator` process used to pay whether or not it rendered a byte. Almost none of them render —
 * `explain --json` writes JSON directly and a successful `build` prints nothing — so the whole
 * cost landed on the test suites, which spawn the CLI hundreds of times. Deferring it changes no
 * output: every line a user reads still goes through ink (plan-notes 187), just not every line a
 * user never reads. This is also why `print` is async and why `build`/`explain` are. */
export async function print(lines: readonly Line[], stream: NodeJS.WriteStream): Promise<void> {
  if (lines.length === 0) {
    return;
  }
  const [{ Box, render, Text }, { createElement }] = await Promise.all([
    import('ink'),
    import('react'),
  ]);
  const colored = stream.isTTY;
  // exactOptionalPropertyTypes forbids `color: undefined` in the props object — the color key is
  // present only when there is a color to apply.
  const rows = runs(lines).map((run, index) =>
    createElement(
      Text,
      colored && run.color !== undefined ? { key: index, color: run.color } : { key: index },
      run.text,
    ),
  );
  const tree = createElement(Box, { flexDirection: 'column' }, ...rows);
  const { unmount } = render(tree, {
    stdout: stream,
    patchConsole: false,
    exitOnCtrlC: false,
  });
  unmount();
}
