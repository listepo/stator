// Strings are UTF-16 internally and UTF-8 on stdout; a fixture with only ASCII would not notice
// if the conversion were dropped.
console.log('hello');
console.log('héllo wörld');
console.log('日本語');
console.log('tab\there');
console.log('quote"and\\backslash');
console.log('');
