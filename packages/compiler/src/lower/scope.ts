/* The lowering's lexical scope (plan.md §8 step 14, plan-notes 215).
 *
 * HIR names are SOURCE names, and that is not a shorthand -- it is the contract every consumer
 * downstream relies on: the verifier's binding map, the emitter's slot table, the capture analysis
 * and the passes all key bindings by the name written in the program. The one place it breaks is
 * SHADOWING. `const x = 1; { const x = 2; }` is two bindings and one name, so all of those
 * consumers give the two one home: the block's write lands in the outer slot and the outer `x`
 * reads back 2, where the pinned Node says 1 (plan-notes 209).
 *
 * The fix is alpha-renaming at the lowering: a declaration that would SHADOW a visible binding is
 * emitted under a fresh name no source can spell, and every reference inside that scope resolves
 * to the fresh name. Nothing downstream learns about scopes -- it only ever sees names that are
 * already distinct, which is what makes this correct by construction for all of them at once.
 *
 * Two facts are kept apart on purpose. `types` is what a name means; `names` is what it is CALLED
 * in the HIR. They differ only for a renamed binding, and every declaration records both, so a
 * reference can ask for the spelling without knowing whether a rename happened. */

import type { HType } from '../hir/types.ts';

/** A HIR name no source can spell: no identifier may contain U+0000, so this can never collide
 * with a binding the user wrote, and the source name rides along for anything that prints it.
 * The counter is global rather than per scope, for the same reason `nextBindTemp`'s is: two
 * sibling scopes cannot then mint the same name for two different bindings, which keeps "one name,
 * one binding" true for the whole module instead of only within a scope. */
let shadowCounter = 0;

function shadowName(source: string): string {
  shadowCounter += 1;
  return `\u0000shadow:${source}#${String(shadowCounter)}`;
}

export class Scope {
  private readonly types: Map<string, HType>;
  private readonly hirNames: Map<string, string>;
  /** Names this scope itself declared, as opposed to ones it inherited. A re-declaration in the
   * SAME scope shares its home (that is `var`, and it is a duplicate function declaration, where
   * the last one wins); a declaration that shadows an ANCESTOR's name gets a fresh one. */
  private readonly declaredHere: Set<string>;

  /** Every name declared anywhere in this FUNCTION unit so far -- shared by every block of the
   * unit, fresh at each function and at the module.
   *
   * Visibility alone is not enough to decide a rename, and this set is the reason. Two sibling
   * blocks both declaring `let value` share no visible binding, but they DO share the unit's slot
   * space: the emitter allocates one global (or frame) slot per HIR name. Sharing is harmless
   * while both blocks are transient -- and wrong the moment a closure from the first outlives it,
   * because the second declaration overwrites the slot the closure still reads. `{ const value =
   * 'block'; push(() => value); } const value = 'module';` printed `module` twice for exactly
   * that reason (plan-notes 216). */
  private readonly unitDeclared: Set<string>;

  private constructor(
    types: Map<string, HType>,
    hirNames: Map<string, string>,
    declaredHere: Set<string>,
    unitDeclared: Set<string>,
  ) {
    this.types = types;
    this.hirNames = hirNames;
    this.declaredHere = declaredHere;
    this.unitDeclared = unitDeclared;
  }

  /** The module scope: `bindings` used to start as a bare `new Map()`. */
  static root(): Scope {
    return new Scope(new Map(), new Map(), new Set(), new Set());
  }

  /** A nested BLOCK scope -- a block, a loop body, a switch's clause list, a catch clause. It
   * inherits every visible binding, adds its own without touching the parent, and shares the
   * unit's slot space, because the emitter gives every HIR name one slot per function either way. */
  child(): Scope {
    return new Scope(new Map(this.types), new Map(this.hirNames), new Set(), this.unitDeclared);
  }

  /** A FUNCTION scope -- a nested function, a method, an accessor, the module body. Its frame (or
   * globals section) is a slot space of its own, so the unit is new even though the names are
   * inherited. */
  functionScope(): Scope {
    return new Scope(new Map(this.types), new Map(this.hirNames), new Set(), new Set());
  }

  has(name: string): boolean {
    return this.types.has(name);
  }

  get(name: string): HType | undefined {
    return this.types.get(name);
  }

  /** The HIR name a reference to `name` must use. The source name itself unless the binding was
   * renamed, which is why every reference site goes through here rather than reading `name.text`. */
  hirName(name: string): string {
    return this.hirNames.get(name) ?? name;
  }

  /** Declare a binding that must SHARE whatever already owns its name: a `var` (function-scoped,
   * and the spec's "already instantiated" case), a compiler temporary, a static. Never renames. */
  set(name: string, type: HType): void {
    this.types.set(name, type);
    this.hirNames.set(name, name);
  }

  /** Declare a NEW binding of this scope and return the HIR name to emit it under.
   *
   * A name this scope already declared keeps its home (the spec's last-one-wins for duplicate
   * function declarations, and `var` sharing). A name inherited from an enclosing scope is a
   * SHADOW, and that is the one case that renames: the fresh name is what gives the block's `x` a
   * slot of its own instead of overwriting the outer `x`. */
  declare(name: string, type: HType): string {
    // A re-declaration in the same scope keeps the binding it already made (last one wins). Every
    // other case is a second home for one name -- either a shadow of a visible binding, or a
    // second declaration of the same name somewhere else in this unit -- and both need a name of
    // their own or the two share a slot.
    const sameScope = this.declaredHere.has(name);
    const secondHome = !sameScope && (this.types.has(name) || this.unitDeclared.has(name));
    const hirName = secondHome ? shadowName(name) : this.hirName(name);
    this.declaredHere.add(name);
    this.unitDeclared.add(name);
    this.types.set(name, type);
    this.hirNames.set(name, hirName);
    return hirName;
  }
}
