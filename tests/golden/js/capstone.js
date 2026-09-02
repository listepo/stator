// Capstone (plan.md §8 step 7): untyped object-graph code, not a builtin tour.
// Exercises js-mode any, var-hoist, growing empty objects, computed index, Unknown call, ==.

var nextId = 1;
let books = [];
let byId = {};

function emptyBook() {
  var book = {};
  book.id = 0;
  book.title = "";
  book.author = "";
  book.year = 0;
  book.tags = [];
  book.copies = 0;
  book.borrowed = 0;
  return book;
}

function addBook(title, author, year, copies) {
  var book = emptyBook();
  book.id = nextId;
  nextId = nextId + 1;
  book.title = title;
  book.author = author;
  book.year = year;
  book.copies = copies;
  book.borrowed = 0;
  books[books.length] = book;
  byId[book.id] = book;
  return book;
}

function getBook(id) {
  return byId[id];
}

function tagBook(id, tag) {
  var book = getBook(id);
  if (book == null) {
    return false;
  }
  var i = 0;
  while (i < book.tags.length) {
    if (book.tags[i] == tag) {
      return true;
    }
    i = i + 1;
  }
  book.tags[book.tags.length] = tag;
  return true;
}

function available(book) {
  return book.copies - book.borrowed;
}

function borrow(id) {
  var book = getBook(id);
  if (book == null) {
    return false;
  }
  if (available(book) < 1) {
    return false;
  }
  book.borrowed = book.borrowed + 1;
  return true;
}

function giveBack(id) {
  var book = getBook(id);
  if (book == null) {
    return false;
  }
  if (book.borrowed < 1) {
    return false;
  }
  book.borrowed = book.borrowed - 1;
  return true;
}

function matches(book, query) {
  if (query.title != null && book.title != query.title) {
    return false;
  }
  if (query.author != null && book.author != query.author) {
    return false;
  }
  if (query.year != null && book.year != query.year) {
    return false;
  }
  if (query.tag != null) {
    var found = false;
    var i = 0;
    while (i < book.tags.length) {
      if (book.tags[i] == query.tag) {
        found = true;
      }
      i = i + 1;
    }
    if (!found) {
      return false;
    }
  }
  return true;
}

function search(query) {
  let out = [];
  var i = 0;
  while (i < books.length) {
    var book = books[i];
    if (matches(book, query)) {
      out[out.length] = book;
    }
    i = i + 1;
  }
  return out;
}

function countAvailable() {
  var n = 0;
  var i = 0;
  while (i < books.length) {
    n = n + available(books[i]);
    i = i + 1;
  }
  return n;
}

function summarize(book) {
  return book.id + ": " + book.title + " (" + book.author + ", " + book.year + ")";
}

function printHits(query) {
  let hits = search(query);
  var i = 0;
  console.log("hits " + hits.length);
  while (i < hits.length) {
    console.log(summarize(hits[i]));
    i = i + 1;
  }
}

var dune = addBook("Dune", "Herbert", 1965, 3);
addBook("Dune Messiah", "Herbert", 1969, 2);
addBook("Neuromancer", "Gibson", 1984, 1);
addBook("Snow Crash", "Stephenson", 1992, 2);
addBook("The Left Hand of Darkness", "Le Guin", 1969, 1);

tagBook(dune.id, "sf");
tagBook(dune.id, "desert");
tagBook(2, "sf");
tagBook(3, "cyberpunk");
tagBook(4, "cyberpunk");
tagBook(5, "sf");

console.log(getBook(1).title);
console.log(books.length);
console.log(countAvailable());

console.log(borrow(1));
console.log(borrow(1));
console.log(borrow(1));
console.log(borrow(1));
console.log(giveBack(1));
console.log(available(getBook(1)));

var q = {};
q.author = "Herbert";
printHits(q);

var q2 = {};
q2.tag = "cyberpunk";
printHits(q2);

var q3 = {};
q3.year = 1969;
printHits(q3);

function apply(fn, value) {
  return fn(value);
}
function titleOf(book) {
  return book.title;
}
console.log(apply(titleOf, getBook(3)));

function missing(id) {
  return getBook(id) == null;
}
console.log(missing(99));
console.log(missing("1") == false);

var ghost = {};
ghost["kind"] = "unlisted";
console.log(ghost.kind);
console.log(ghost["kind"] == "unlisted");
