// Locale-sensitive strings in js mode (Task 4.4), which only the ICU feature build answers: this fixture is
// named `intl_*` and the golden runner skips it unless STATOR_RUNTIME=intl. Every call passes an
// EXPLICIT locale -- the absent-locales form reads the host's default, and a golden test whose
// answer depends on the machine that runs it is not a golden test.

// Collation is a per-locale ORDER, not a code-point order. The spec pins only the sign.
console.log('a'.localeCompare('b', 'en'));
console.log('b'.localeCompare('a', 'en'));
console.log('a'.localeCompare('a', 'en'));

// The classic pair: 'ä' is an A with an accent in German and a letter after Z in Swedish.
console.log('ä'.localeCompare('z', 'de'));
console.log('ä'.localeCompare('z', 'sv'));

// Case and accent differences that a byte comparison would get backwards.
console.log('a'.localeCompare('A', 'en'));
console.log('résumé'.localeCompare('resume', 'fr'));
console.log('10'.localeCompare('9', 'en'));

// Tailored casing: Turkish keeps the dot, which the default mapping does not.
console.log('i'.toLocaleUpperCase('tr'));
console.log('i'.toLocaleUpperCase('en'));
console.log('I'.toLocaleLowerCase('tr'));
console.log('I'.toLocaleLowerCase('en'));

// Where the tailoring does NOT apply, the answer is the default mapping's -- including the
// one-to-many expansions.
console.log('straße'.toLocaleUpperCase('de'));
console.log('İSTANBUL'.toLocaleLowerCase('tr'));
console.log('ΟΔΟΣ'.toLocaleLowerCase('el'));

// The locale is a value, not a literal position.
const locale = 'lt';
const shouted = 'i';
console.log(shouted.toLocaleUpperCase(locale));

// A string built at runtime, so nothing here is constant-folded away.
const parts = ['gr', 'ün'];
const joined = parts.join('');
console.log(joined.toLocaleUpperCase('de'));
console.log(joined.localeCompare('grun', 'de'));
