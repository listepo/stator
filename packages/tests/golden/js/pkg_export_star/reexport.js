// `export * from` a package (plan.md §11d T12.3): the names come from the built bundle's own
// exports. The file's own `a` shadows the star's `a`, as ECMA-262 §16.2.1.6.3 says.
export * from 'star';
export const a = 'own';
