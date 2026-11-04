

// The "name tag" under which our list is stored in localStorage.
const STORAGE_KEY = 'imybook_reading_list';

// The allowed statuses. Left side = value stored in the data,
// right side = nice label shown on screen.
const STATUS_LABELS = {
  'to-read': 'To Read',
  'reading': 'Currently Reading',
  'finished': 'Finished'
};

// Returns true only if "status" is one of the three allowed values above.
// (hasOwnProperty checks that the name is really a key of STATUS_LABELS.)
function isValidStatus(status) {
  return Object.prototype.hasOwnProperty.call(STATUS_LABELS, status);
}

// Tidies text: turns any value into a string, squeezes repeated spaces into
// one space and removes spaces at both ends. So "  Dune   Messiah " -> "Dune Messiah".
// (\s+ in the pattern means "one or more whitespace characters".)
function cleanText(value) {
  return String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim();
}

// Creates the text used to spot DUPLICATES: title + author in lower case.
// "Dune" by "Frank Herbert" and " dune " by "FRANK HERBERT" give the SAME key.
function makeBookKey(title, author) {
  return `${cleanText(title).toLowerCase()}|${cleanText(author).toLowerCase()}`;
}

// Builds the standard answer every BookStore method returns:
//   { ok: true/false, message: 'text to show the user', ...extra details }
// Object.assign copies the "extra" properties into the new object.
function makeResult(ok, message, extra) {
  return Object.assign({ ok, message }, extra);
}

// BookStore groups all our storage functions together in one object.
const BookStore = {

  /* -------------------------------------------------------------------
     READ  -  get the saved books out of Local Storage
     Always returns an array (an empty one if nothing is saved) and never
     crashes, even if the saved text is damaged.
     ------------------------------------------------------------------- */
  load() {
    try {
      // 1. Ask localStorage for the text stored under our key.
      //    If nothing was ever saved, getItem returns null.
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];

      // 2. Convert the JSON text back into a real JavaScript value.
      //    This line throws an error if the text is not valid JSON,
      //    which is why the whole thing sits inside try/catch.
      const parsed = JSON.parse(raw);

      // 3. Safety check: we expect an array. Anything else -> empty list.
      if (!Array.isArray(parsed)) return [];

      // 4. Keep only entries that have the fields we rely on.
      return parsed.filter(b => b && b.id && b.title && isValidStatus(b.status));

    } catch (error) {
      // Damaged data or storage turned off: log it and carry on with an empty list.
      console.error('Could not read Local Storage:', error);
      return [];
    }
  },

  /* -------------------------------------------------------------------
     SAVE helper - writes the WHOLE array back into Local Storage.
     Used by add, updateStatus and remove. Returns true if it worked.
     ------------------------------------------------------------------- */
  save(list) {
    try {
      // JSON.stringify converts the array into JSON text, and setItem stores
      // it under our key (replacing whatever was there before).
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch (error) {
      // setItem can fail if the storage is full or disabled.
      console.error('Could not write to Local Storage:', error);
      return false;
    }
  },

  /* -------------------------------------------------------------------
     CREATE  -  validate a new book, reject duplicates, then save it
     "book" is an object: { title, author, pageCount, status }
     ------------------------------------------------------------------- */
  add(book) {
    // Clean the text first so extra spaces never cause trouble.
    const title = cleanText(book.title);
    const author = cleanText(book.author);

    // ---- INPUT VALIDATION ----
    // Each failed check returns a "not ok" result with a message and the
    // name of the form field to highlight (field: 'title', etc.).
    if (!title) return makeResult(false, 'Please enter a book title.', { field: 'title' });
    if (title.length > 200) return makeResult(false, 'The title is too long (200 characters maximum).', { field: 'title' });
    if (!author) return makeResult(false, 'Please enter an author name.', { field: 'author' });
    if (author.length > 120) return makeResult(false, 'The author name is too long (120 characters maximum).', { field: 'author' });

    // Page count is OPTIONAL. If it is empty we store null ("no value").
    // If it is given, it must be a whole number from 1 to 5000.
    let pageCount = null;
    if (book.pageCount !== null && book.pageCount !== undefined && book.pageCount !== '') {
      pageCount = Number(book.pageCount); // convert text like "320" to the number 320
      if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 5000) {
        return makeResult(false, 'Page count must be a whole number from 1 to 5000.', { field: 'pages' });
      }
    }

    // If no status was given, use 'to-read'. Then check it is an allowed one.
    const status = book.status || 'to-read';
    if (!isValidStatus(status)) return makeResult(false, 'Please choose a valid reading status.', { field: 'status' });

    // ---- LOAD the current list (READ step) ----
    const list = BookStore.load();

    // ---- DUPLICATE CHECK ----
    // .some() asks: "does ANY book in the list have the same key?"
    const key = makeBookKey(title, author);
    if (list.some(b => makeBookKey(b.title, b.author) === key)) {
      return makeResult(false, `"${title}" by ${author} is already in your reading list.`, { field: 'title', duplicate: true });
    }

    // ---- BUILD the new book object ----
    const entry = {
      // A unique id: current time + random letters, both turned into base-36 text.
      // The id lets us find THIS book later to edit or delete it.
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      title,
      author,
      pageCount,
      status,
      addedAt: new Date().toISOString() // the date and time it was saved
    };

    // ---- SAVE: add to the array, then write the array back ----
    list.push(entry);
    if (!BookStore.save(list)) {
      return makeResult(false, 'Could not save your list. Local Storage may be full or turned off.');
    }
    return makeResult(true, `"${title}" was added to your reading list.`, { book: entry });
  },

  /* -------------------------------------------------------------------
     UPDATE  -  change the reading status of ONE book
     "id" says which book; "newStatus" is the new value.
     ------------------------------------------------------------------- */
  updateStatus(id, newStatus) {
    if (!isValidStatus(newStatus)) return makeResult(false, 'Please choose a valid reading status.');

    // Load the list, then find the one book whose id matches.
    const list = BookStore.load();
    const book = list.find(b => b.id === id);
    if (!book) return makeResult(false, 'That book could not be found. It may have been deleted already.');

    // Nothing to do if the status is already the one chosen.
    if (book.status === newStatus) {
      return makeResult(true, `No change made. "${book.title}" is already marked "${STATUS_LABELS[newStatus]}".`, { changed: false });
    }

    // Change the value on the book object. Because "book" points at the
    // object INSIDE "list", the list is changed too.
    book.status = newStatus;

    // Write the whole changed list back to Local Storage.
    if (!BookStore.save(list)) return makeResult(false, 'Could not save your change. Local Storage may be full or turned off.');
    return makeResult(true, `"${book.title}" is now marked "${STATUS_LABELS[newStatus]}".`, { changed: true });
  },

  /* -------------------------------------------------------------------
     DELETE  -  remove ONE book from the list
     ------------------------------------------------------------------- */
  remove(id) {
    const list = BookStore.load();
    const book = list.find(b => b.id === id); // keep it so we can name it in the message
    if (!book) return makeResult(false, 'That book could not be found. It may have been deleted already.');

    // .filter() builds a NEW array containing every book EXCEPT the deleted one.
    // (!== means "is not equal to".)
    const remaining = list.filter(b => b.id !== id);

    // Save the shorter list. The deleted book is now gone for good, even after reopening.
    if (!BookStore.save(remaining)) return makeResult(false, 'Could not delete the book. Local Storage may be full or turned off.');
    return makeResult(true, `"${book.title}" was removed from your reading list.`);
  }
};


/* =====================================================================
   SuggestionStore  -  saves the book SUGGESTIONS in Local Storage
   ===================================================================== */
const SUGGESTION_KEY = 'imybook_suggestions';
const MAX_SUGGESTIONS = 10;

const SuggestionStore = {

  // READ: returns the saved suggestions (newest first). Never crashes.
  load() {
    try {
      const raw = localStorage.getItem(SUGGESTION_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(s => s && s.id && s.title);
    } catch (error) {
      console.error('Could not read saved suggestions:', error);
      return [];
    }
  },

  // CREATE: adds one suggestion to the FRONT of the list and saves it.
  add(suggestion) {
    try {
      const list = SuggestionStore.load();
      const entry = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        title: cleanText(suggestion.title),
        author: cleanText(suggestion.author),
        pageCount: suggestion.pageCount || null,
        genre: cleanText(suggestion.genre),
        mood: cleanText(suggestion.mood),
        minutesPerDay: suggestion.minutesPerDay,
        reason: cleanText(suggestion.reason),
        createdAt: new Date().toISOString()
      };
      list.unshift(entry);                                    // unshift = add at the START
      localStorage.setItem(SUGGESTION_KEY, JSON.stringify(list.slice(0, MAX_SUGGESTIONS))); // slice keeps only the newest 10
      return true;
    } catch (error) {
      console.error('Could not save the suggestion:', error);
      return false;
    }
  },

  // DELETE: removes ALL saved suggestions.
  clear() {
    try {
      localStorage.removeItem(SUGGESTION_KEY); // removeItem deletes the key completely
      return true;
    } catch (error) {
      console.error('Could not clear suggestions:', error);
      return false;
    }
  }
};


/* =====================================================================
   SHARED SCREEN HELPERS (DOM manipulation used by both pages)
   ===================================================================== */

// Shows a small pop-up message in the corner that fades after a few seconds.
// "type" is 'success' (green), 'error' (red) or 'info' (neutral).
function showToast(message, type) {
  const container = document.getElementById('toastContainer'); // the holder in the HTML
  if (!container) return; // if the page has no holder, do nothing

  const toast = document.createElement('div');          // make a new <div>
  toast.className = `toast toast-${type || 'info'}`;    // e.g. "toast toast-success"
  // role="alert" makes screen readers announce errors immediately.
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.textContent = message;
  container.appendChild(toast);                         // put it on the page

  // setTimeout runs a function AFTER a delay (4500 ms = 4.5 seconds).
  // Here it removes the toast so messages do not pile up.
  setTimeout(() => toast.remove(), 4500);
}

// Updates the number badge on the "My Reading List" link in the navigation bar.
// It READS the list from Local Storage and shows how many books it holds.
function updateNavCount() {
  const badge = document.getElementById('navListCount');
  if (badge) badge.textContent = BookStore.load().length;
}
