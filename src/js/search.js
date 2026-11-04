
// The web address of the Google Books "search volumes" service.
const API_URL = 'https://www.googleapis.com/books/v1/volumes';

// The most books we ask the API to send back for one search.
const MAX_RESULTS = 20;

// If the API has not answered after 10,000 milliseconds (10 seconds), give up.
const TIMEOUT_MS = 10000;

// NOTE: API_KEY and MINUTES_PER_PAGE (1 page = 1.5 minutes) are defined in
// config.js, which is loaded before this file.

// The text shown in the results area before the user has searched.
const DEFAULT_PLACEHOLDER = 'Your search results will appear here. Try searching for a title or pick a genre.';


/* =====================================================================
   SECTION 2 - FINDING HTML ELEMENTS (DOM references)
   The "DOM" (Document Object Model) is the browser's live copy of the
   HTML page. document.getElementById('x') finds the element whose
   id="x" in index.html and gives us an object we can read or change.
   We find each element ONCE here and store it in a variable, so we do
   not have to search the page again every time we need it.
   ===================================================================== */

// --- Search form elements ---
const searchForm    = document.getElementById('searchForm');      // the whole <form>
const searchInput   = document.getElementById('searchInput');     // the text box
const searchType    = document.getElementById('searchType');      // "Search by" dropdown
const genreSelect   = document.getElementById('genreSelect');     // genre dropdown on the search form
const searchBtn     = document.getElementById('searchBtn');       // "Search books" button
const clearBtn      = document.getElementById('clearBtn');        // "Clear" button
const searchError   = document.getElementById('searchError');     // red message under the form (bad input)

// --- Results area elements ---
const statusMessage = document.getElementById('statusMessage');   // red message for API/network/no-result errors
const loadingEl     = document.getElementById('loadingIndicator');// the spinner
const resultsCount  = document.getElementById('resultsCount');    // "5 books found"
const bookResults   = document.getElementById('bookResults');     // the grid that holds the book cards

// --- Suggestion panel elements ---
const suggestForm      = document.getElementById('suggestForm');
const suggestGenre     = document.getElementById('suggestGenre');     // genre dropdown in the suggestion panel
const suggestError     = document.getElementById('suggestError');     // red message if no genre was chosen
const suggestionBox    = document.getElementById('suggestionBox');    // the box that shows the tip
const suggestionTitle  = document.getElementById('suggestionTitle');  // heading inside the box
const suggestionReason = document.getElementById('suggestionReason'); // paragraph inside the box
const suggestMood      = document.getElementById('suggestMood');      // mood dropdown
const suggestTime      = document.getElementById('suggestTime');      // daily reading time dropdown
const suggestAuthor    = document.getElementById('suggestAuthor');    // optional favourite author
const suggestBtn       = document.getElementById('suggestBtn');       // "Suggest a book" button
const suggestionMeta   = document.getElementById('suggestionMeta');   // "Author - 300 pages - Category"
const suggestionTip    = document.getElementById('suggestionTip');    // the genre reading tip
const saveSuggestionBtn = document.getElementById('saveSuggestionBtn'); // "Add to my reading list"
const recentSuggestions = document.getElementById('recentSuggestions'); // list of saved suggestions
const clearSuggestionsBtn = document.getElementById('clearSuggestionsBtn'); // clears that list

// These two variables CAN change (that is why they use "let", not "const").
let activeController = null; // lets us cancel a search that is still running (explained in Section 5)
let latestRequestId = 0;     // counts searches so we can ignore the answer of an old one (Section 8)



/* =====================================================================
   SECTION 3 - FUNCTION 1: SUGGESTION LOGIC (control statements)
   ---------------------------------------------------------------------*/
function suggestReadingActivity(genre) {
  switch (genre) {

    case 'fantasy':
      return { title: 'Fantasy', text: 'Read by lamplight at night and let your imagination build the world. Keep a notebook for names and places.' };

    case 'mystery_and_detective_stories':
      return { title: 'Mystery', text: 'Read in a quiet room to focus on the clues. Jot down your suspects as you go.' };

    case 'science_fiction':
      return { title: 'Science fiction', text: 'Read with a cup of tea and pause after each chapter to think about the ideas. Look up any real science that interests you.' };

    case 'romance':
      return { title: 'Romance', text: 'Curl up in a comfy chair with a warm drink and read a few chapters at a relaxed pace.' };

    case 'horror':
      return { title: 'Horror', text: 'Read in the evening with the lights low, but keep a lamp nearby. Stop before bed if the story gets too tense.' };

    case 'historical_fiction':
      return { title: 'Historical fiction', text: 'Keep a map or timeline beside you and look up the real events and places mentioned in the story.' };

    case 'biography':
      // The \' below is an "escaped" apostrophe. It lets us put ' inside text that is wrapped in ' quotes.
      return { title: 'Biography', text: 'Read one chapter a day and write down one lesson from the person\'s life.' };

    case 'history':
      return { title: 'History', text: 'Read in short sessions and note important dates and causes. Review your notes after each chapter.' };

    case 'self-help':
      return { title: 'Self-help', text: 'Read with a pen in hand. Underline key ideas and choose one to practise this week.' };

    case 'programming':
      return { title: 'Programming', text: 'Read at your desk with a code editor open and try every example yourself.' };

    default:
      // FALLBACK: no case matched (nothing chosen, or an unknown genre).
      // We return null, which means "no suggestion available".
      return null;
  }
}

/* =====================================================================
   SECTION 3B - BOOK SUGGESTION LOGIC (written by us with if / else)
   ---------------------------------------------------------------------
   Showing a ready-made answer from the API is NOT enough, so the API is
   only used to get CANDIDATE books. OUR code then decides which one fits.

   The user gives us: genre, mood, daily reading time, and (optionally) a
   favourite author. The steps are:
     1. Ask Google Books for books in that genre (and by that author).
     2. FILTER OUT books that do not suit the daily time (too long) or are
        already in the reading list.
     3. SCORE the remaining books with if / else rules for the mood.
     4. Pick one of the highest-scoring books.
     5. If nothing is left, show a "no suitable suggestion" message.
   ===================================================================== */

// Word patterns used by the mood rules. A "regular expression" like /fiction|fantasy/i
// means: "contains fiction OR fantasy, ignoring capital letters".
const LEARN_WORDS = /biograph|histor|science|self-help|business|computer|programming|education|psychology|philosophy|economics|technology|nature|health/i;
const STORY_WORDS = /fiction|fantasy|adventure|mystery|romance|thriller|horror|detective|crime/i;

// What the screen is showing right now, so "Add to my reading list" knows which book.
let currentSuggestion = null;
let latestSuggestId = 0; // counts suggestion requests (same idea as latestRequestId)

// RULE 1 (time): the more time per day, the longer the book we allow.
//   15 minutes -> up to 300 pages      30 minutes -> up to 500 pages
//   60 minutes or more -> any length   anything else -> 0 (nothing allowed)
function getMaxPages(minutesPerDay) {
  if (minutesPerDay === 15) {
    return 300;
  } else if (minutesPerDay === 30) {
    return 500;
  } else if (minutesPerDay >= 60) {
    return Infinity; // Infinity is bigger than every number, so no limit
  } else {
    return 0;
  }
}

// Uses the same reading speed as the calculation (1 page = 1.5 minutes).
// Example: 30 minutes a day = 20 pages a day. A 300-page book = 15 days.
function daysToFinish(pageCount, minutesPerDay) {
  const pagesPerDay = minutesPerDay / MINUTES_PER_PAGE;
  return Math.ceil(pageCount / pagesPerDay); // ceil rounds UP: 14.2 days -> 15 days
}

// RULE 2 (mood + author): gives a book points and collects the reasons.
// Returns { score, reasons } where reasons are short phrases we show the user.
function scoreBookForMood(book, mood, author) {
  let score = 0;
  const reasons = [];

  if (mood === 'relax') {
    // Relaxing: well-rated and not too long.
    if (book.rating !== null && book.rating >= 4) {
      score += 2;
      reasons.push(`it is well rated (${book.rating}/5)`);
    }
    if (book.pageCount <= 350) {
      score += 1;
      reasons.push('it is a lighter read');
    }
  } else if (mood === 'learn') {
    // Learning: informative categories, and a description helps us trust it.
    if (LEARN_WORDS.test(book.categories)) {
      score += 3;
      reasons.push('it is in an informative category');
    }
    if (book.description) {
      score += 1;
    }
  } else if (mood === 'escape') {
    // Escaping: story-based categories, and long enough to get lost in.
    if (STORY_WORDS.test(book.categories)) {
      score += 3;
      reasons.push('it is a story-driven book');
    }
    if (book.pageCount >= 250) {
      score += 1;
      reasons.push('it is long enough to get lost in');
    }
  }

  // Bonus if the book is by the author the user asked for.
  if (author && book.authors.toLowerCase().includes(author.toLowerCase())) {
    score += 2;
    reasons.push(`it is by ${book.authors}`);
  }

  return { score, reasons };
}

// Goes through every candidate book and returns the best choice, or null.
// "prefs" holds: mood, minutesPerDay, author and ownedKeys (books already saved).
function chooseBookForReader(books, prefs) {
  const maxPages = getMaxPages(prefs.minutesPerDay);
  let bestScore = -1;
  let best = []; // all books that share the highest score so far

  // A "for...of" loop visits each book in the list, one at a time.
  for (const book of books) {
    // Filter 1: we cannot judge the length without a page count.
    if (!book.pageCount) continue;                 // "continue" skips to the next book
    // Filter 2: too long for the time the reader has each day.
    if (book.pageCount > maxPages) continue;
    // Filter 3: do not suggest a book that is already in the reading list.
    if (prefs.ownedKeys.has(makeBookKey(book.title, book.authors))) continue;

    const result = scoreBookForMood(book, prefs.mood, prefs.author);

    if (result.score > bestScore) {
      bestScore = result.score;                    // a new highest score: start a new list
      best = [{ book, reasons: result.reasons }];
    } else if (result.score === bestScore) {
      best.push({ book, reasons: result.reasons }); // same score: keep it as an option too
    }
  }

  // Nothing passed the filters: tell the caller there is no suitable book.
  if (best.length === 0) return null;

  // Pick randomly among the best ones, so pressing the button again can give a different book.
  return best[Math.floor(Math.random() * best.length)];
}

// Builds the sentence that explains WHY this book was chosen.
function buildReasonText(choice, minutesPerDay) {
  const days = daysToFinish(choice.book.pageCount, minutesPerDay);
  const dayWord = days === 1 ? 'day' : 'days';
  const timePart = `at ${minutesPerDay} minutes a day you could finish it in about ${days} ${dayWord}`;

  if (choice.reasons.length === 0) {
    return `It matches your genre, and ${timePart}.`;
  }
  return `Why this book: ${choice.reasons.join(', ')}, and ${timePart}.`;
}

// Shows a chosen book in the suggestion box.
function showSuggestionResult(choice, reasonText, genre) {
  const book = choice.book;
  currentSuggestion = book;

  suggestionBox.hidden = false;
  suggestionTitle.textContent = book.title;
  suggestionMeta.textContent = `${book.authors} - ${book.pageCount} pages` + (book.categories ? ` - ${book.categories}` : '');
  suggestionReason.textContent = reasonText;

  // Also show the genre reading tip from Function 1 (null means no tip exists).
  const tip = suggestReadingActivity(genre);
  suggestionTip.hidden = !tip;
  suggestionTip.textContent = tip ? `Reading tip: ${tip.text}` : '';

  saveSuggestionBtn.hidden = false;
  saveSuggestionBtn.disabled = false;
  saveSuggestionBtn.textContent = 'Add to my reading list';
}

// FALLBACK: shows a message when no suitable book is available.
function showNoSuggestion(message) {
  currentSuggestion = null;
  suggestionBox.hidden = false;
  suggestionTitle.textContent = 'No suitable suggestion available';
  suggestionMeta.textContent = '';
  suggestionReason.textContent = message;
  suggestionTip.hidden = true;
  saveSuggestionBtn.hidden = true;
}

// READ (Local Storage): draws the "Recent suggestions" list from saved data.
function renderRecentSuggestions() {
  const saved = SuggestionStore.load();     // read from Local Storage
  recentSuggestions.replaceChildren();      // empty the list first
  clearSuggestionsBtn.hidden = saved.length === 0;

  if (saved.length === 0) {
    const li = document.createElement('li');
    li.className = 'recent-empty';
    li.textContent = 'No suggestions yet.';
    recentSuggestions.appendChild(li);
    return;
  }

  // Show the 5 newest. slice(0, 5) takes the first five items.
  saved.slice(0, 5).forEach(item => {
    const li = document.createElement('li');

    const title = document.createElement('span');
    title.className = 'recent-title';
    title.textContent = item.title;

    const detail = document.createElement('span');
    detail.className = 'recent-detail';
    const when = new Date(item.createdAt).toLocaleDateString();
    detail.textContent = `${item.author} - ${item.genre} - ${when}`;

    li.append(title, detail);
    recentSuggestions.appendChild(li);
  });
}


/* =====================================================================
   SECTION 4 - FUNCTION 2: READING TIME CALCULATION
   ---------------------------------------------------------------------
   Rule: 1 page takes 1.5 minutes.

   WORKED EXAMPLE with a 180-page book
     Step 1: total minutes = 180 x 1.5            = 270 minutes
     Step 2: hours         = floor(270 / 60)      = floor(4.5) = 4 hours
             (Math.floor rounds DOWN to a whole number)
     Step 3: minutes left  = 270 % 60             = 30 minutes
             (% is the "remainder" operator: what is left after dividing)
     Result: "Estimated Reading Time: 4 Hours and 30 Minutes"

   Returns a text label, or null if the page count cannot be used.
   ===================================================================== */
function calculateReadingTime(pageCount) {
  // BOUNDARY CHECK: stop early if the page count is missing or silly.
  //  - typeof ... !== 'number'  -> it is not a number at all (e.g. null or "200")
  //  - !Number.isFinite(...)    -> it is NaN or Infinity
  //  - pageCount <= 0           -> zero or negative pages make no sense
  if (typeof pageCount !== 'number' || !Number.isFinite(pageCount) || pageCount <= 0) {
    return null;
  }

  // Step 1: total minutes. Math.round gives a whole number (e.g. 1.5 -> 2).
  const totalMinutes = Math.round(pageCount * MINUTES_PER_PAGE);

  // Step 2: whole hours (rounded down).
  const hours = Math.floor(totalMinutes / 60);

  // Step 3: the minutes that remain after taking out the whole hours.
  const minutes = totalMinutes % 60;

  // Make the words grammatically correct: "1 Hour" but "2 Hours".
  // condition ? valueIfTrue : valueIfFalse   is called the "ternary operator".
  const hoursText = `${hours} ${hours === 1 ? 'Hour' : 'Hours'}`;
  const minutesText = `${minutes} ${minutes === 1 ? 'Minute' : 'Minutes'}`;

  // Decide how to join the parts so we never show "0 Hours".
  let result;
  if (hours > 0 && minutes > 0) {
    result = `${hoursText} and ${minutesText}`; // e.g. 4 Hours and 30 Minutes
  } else if (hours > 0) {
    result = hoursText;                         // exact hours, e.g. 3 Hours
  } else {
    result = minutesText;                       // less than one hour, e.g. 45 Minutes
  }

  return `Estimated Reading Time: ${result}`;
}


/* =====================================================================
   SECTION 5 - TALKING TO THE API (fetch, async/await, JSON)
   ===================================================================== */

// ---------------------------------------------------------------------
// 5a. Build the search text ("query") that we send to Google Books.
// Google understands special words: intitle: , inauthor: , subject:
// Example: user types "dune", chooses Title + Science fiction
//          -> "intitle:dune subject:science fiction"
// ---------------------------------------------------------------------
function buildQuery(term, type, genre) {
  const parts = []; // an empty array (list) we will fill with pieces of the query

  if (term) {
    if (type === 'title') parts.push(`intitle:${term}`);        // search only in titles
    else if (type === 'author') parts.push(`inauthor:${term}`); // search only in author names
    else parts.push(term);                                      // "Anything": search everywhere
  }

  if (genre) {
    // The dropdown values use underscores (science_fiction). Google wants spaces.
    // .replace(/_/g, ' ') swaps EVERY underscore for a space (the g means "global").
    parts.push(`subject:${genre.replace(/_/g, ' ')}`);
  }

  // join(' ') glues the pieces together with one space between them.
  return parts.join(' ');
}

// ---------------------------------------------------------------------
// 5b. fetchBooks() sends the request and returns the list of books.
//
// KEY IDEAS
// - "async" before a function means it can WAIT for slow things (like the
//   internet) without freezing the screen. An async function always
//   returns a Promise (a "future result").
// - "await" pauses THIS function until the Promise finishes. The rest of
//   the app keeps working while we wait.
// - fetch(url) sends an HTTP request and gives back a "response" object.
// - If something goes wrong we "throw" an error. The function that called
//   us catches it (see handleSearch in Section 8).
// ---------------------------------------------------------------------
// "cancelPrevious" is true for normal searches (a new search replaces the old
// one). The suggestion feature passes false so it never cancels a search.
async function fetchBooks(query, cancelPrevious = true) {
  // AbortController is the built-in tool for cancelling a fetch().
  const controller = new AbortController();
  if (cancelPrevious) {
    if (activeController) activeController.abort(); // cancel the older search
    activeController = controller;                  // remember this one so Clear can cancel it
  }

  // Start a timer. If 10 seconds pass first, we cancel the request and
  // remember that it was a TIMEOUT (not a cancel by the user).
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);

  // Build the full web address. URLSearchParams safely adds ?q=...&maxResults=...
  // and converts special characters (like spaces) into a URL-safe form.
  const params = new URLSearchParams({
    q: query,                 // what to search for
    maxResults: MAX_RESULTS,  // how many books to return
    printType: 'books'        // books only (no magazines)
  });
  // If you pasted a key into config.js, send it. The API then counts the
  // request against YOUR quota instead of the shared anonymous one.
  if (API_KEY) params.set('key', API_KEY);
  const url = `${API_URL}?${params}`;

  try {
    // STEP 1: send the request and WAIT for the response.
    // "signal" connects the request to the AbortController so we can cancel it.
    const response = await fetch(url, { signal: controller.signal });

    // STEP 2: check the HTTP status. response.ok is true for codes 200-299.
    // Codes like 400, 429 or 500 mean the server reported a problem.
    if (!response.ok) {
      const error = new Error('HTTP_ERROR'); // we use the message as a label
      error.status = response.status;        // keep the number (e.g. 429) for later
      throw error;                           // jump out to the catch block
    }

    // STEP 3: PARSE THE JSON.
    // The server sends its answer as JSON TEXT. response.json() reads it and
    // converts it into a normal JavaScript object we can use with dots.
    // The answer looks roughly like this:
    //   {
    //     "totalItems": 2,
    //     "items": [
    //       { "id": "abc123",
    //         "volumeInfo": {
    //           "title": "Dune",
    //           "authors": ["Frank Herbert"],
    //           "pageCount": 412,
    //           "imageLinks": { "thumbnail": "http://books.google.com/..." }
    //         } },
    //       ...
    //     ]
    //   }
    // This also needs "await" because reading the body takes time too.
    const data = await response.json();

    // STEP 4: handle "no results". When nothing matches, Google leaves out
    // "items" completely, so data.items would be undefined.
    if (!data.items || data.items.length === 0) {
      throw new Error('NO_RESULTS');
    }

    // Success: give the array of books back to whoever called us.
    return data.items;

  } catch (error) {
    // If OUR timer cancelled the request, replace the generic "AbortError"
    // with a clear TIMEOUT error so we can show a helpful message.
    if (error.name === 'AbortError' && timedOut) {
      throw new Error('TIMEOUT');
    }
    throw error; // any other error: pass it on unchanged

  } finally {
    // "finally" ALWAYS runs - on success AND on error.
    // We switch the timer off so it does not fire later by mistake.
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------
// 5c. extractBookInfo() picks out ONLY the values we need from one item
// in the API's answer, and supplies a safe default when something is missing.
// ---------------------------------------------------------------------
function extractBookInfo(item) {
  // "item.volumeInfo || {}" means: use volumeInfo if it exists, otherwise an
  // empty object. This stops the program crashing on incomplete data.
  const info = item.volumeInfo || {};
  const images = info.imageLinks || {};

  // Use the thumbnail; if there is none, try the smaller picture; else ''.
  let cover = images.thumbnail || images.smallThumbnail || '';

  // The API often gives "http://" links, but this app's security rule (CSP in
  // the HTML) only allows "https://" images. So we change the start of the link.
  // The /^http:\/\//i  pattern means "http:// at the very start, any letter case".
  cover = cover.replace(/^http:\/\//i, 'https://');

  // EXTRA API FIELDS (these give us more than five pieces of information):
  //  publisher, year published, category, average rating and a description.
  // publishedDate looks like "2019-05-14" or just "2019". Take the first 4 digits.
  const yearMatch = String(info.publishedDate || '').match(/^\d{4}/);

  // Description text can contain HTML tags such as <b>. Remove them with a pattern,
  // squeeze extra spaces, then cut the text to 160 characters and add "..." if cut.
  let description = String(info.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (description.length > 160) description = description.slice(0, 157).trim() + '...';

  return {
    id: item.id,
    title: info.title || 'Untitled', // default if the title is missing

    publisher: info.publisher || '',                                   // e.g. "Penguin"
    year: yearMatch ? yearMatch[0] : '',                               // e.g. "2019"
    categories: Array.isArray(info.categories) ? info.categories.slice(0, 2).join(', ') : '', // first two categories
    rating: typeof info.averageRating === 'number' ? info.averageRating : null, // 0 to 5, or null
    description,

    // authors is an ARRAY like ["A", "B"]. .join(', ') makes the text "A, B".
    // Array.isArray(...) checks that it really is an array before we use it.
    authors: Array.isArray(info.authors) && info.authors.length ? info.authors.join(', ') : 'Unknown author',

    // Keep pageCount only if it is a whole number above zero, otherwise null.
    pageCount: Number.isInteger(info.pageCount) && info.pageCount > 0 ? info.pageCount : null,

    cover
  };
}


/* =====================================================================
   SECTION 6 - BUILDING THE PAGE (DOM MANIPULATION)
   ---------------------------------------------------------------------
   DOM manipulation = using JavaScript to create, change or remove
   HTML elements while the app is running. The pattern is always:
     1. document.createElement('tag')   -> make a new element
     2. element.textContent = '...'     -> put text inside it
     3. element.className = '...'       -> give it CSS classes
     4. parent.appendChild(element)     -> add it to the page
   We use textContent (NOT innerHTML) for data from the internet. That
   way, any "<script>" text in the data is shown as plain text and can
   never run. This is an important security habit.
   ===================================================================== */

// Makes the cover picture (or a "No cover" box if there is no picture).
function createCoverElement(book) {
  if (!book.cover) return createCoverPlaceholder();

  const img = document.createElement('img'); // create <img>
  img.className = 'book-cover';              // CSS class for styling
  img.src = book.cover;                      // where the picture comes from
  img.alt = `Cover of ${book.title}`;        // text for screen readers / broken images
  img.loading = 'lazy';                      // only load when it scrolls into view

  // EVENT LISTENER: if the picture fails to load (the "error" event),
  // replace it with the placeholder box.
  img.addEventListener('error', () => img.replaceWith(createCoverPlaceholder()));
  return img;
}

// A grey box with the words "No cover".
function createCoverPlaceholder() {
  const div = document.createElement('div');
  div.className = 'book-cover book-cover-placeholder';
  div.textContent = 'No cover';
  return div;
}

// ---------------------------------------------------------------------
// CREATE (Local Storage): runs when the user clicks "Save to Reading List".
// It hands the book to BookStore.add() (in storage.js), which validates it,
// checks for duplicates and writes it into localStorage.
// BookStore.add() returns a result object: { ok, message, duplicate? }
// ---------------------------------------------------------------------
function handleSaveBook(book, button) {
  const result = BookStore.add({
    title: book.title,
    author: book.authors,
    pageCount: book.pageCount, // null when the API has no page count
    status: 'to-read'          // new books start as "To Read"; change it on the Reading List page
  });

  if (result.ok) {
    // It worked: tell the user and lock the button so it cannot be clicked twice.
    showToast(result.message, 'success');
    button.textContent = 'Saved \u2713'; // \u2713 is a tick mark
    button.disabled = true;
  } else {
    // It failed (e.g. duplicate or storage problem): show a red message.
    showToast(result.message, 'error');
    if (result.duplicate) {
      button.textContent = 'Already saved';
      button.disabled = true;
    }
  }

  updateNavCount(); // refresh the number badge in the navigation bar
}

// Builds ONE complete book card from one book object.
function createBookCard(book) {
  // The outer <article> is the card itself.
  const card = document.createElement('article');
  card.className = 'book-card';

  // A <div> that holds all the text on the right of the cover.
  const info = document.createElement('div');
  info.className = 'book-info';

  // Title
  const title = document.createElement('h3');
  title.className = 'book-title';
  title.textContent = book.title;

  // Author(s)
  const author = document.createElement('p');
  author.className = 'book-author';
  author.textContent = book.authors;

  // Page count. If there is none we say so instead of showing "null".
  const pages = document.createElement('p');
  pages.className = 'book-meta';
  pages.textContent = book.pageCount ? `${book.pageCount} pages` : 'Page count not available';

  // Estimated reading time: this is where Function 2 (the calculation) is used.
  // "A || B" means: use A if it has a value, otherwise use B.
  const time = document.createElement('p');
  time.className = 'book-time';
  time.textContent = calculateReadingTime(book.pageCount) || 'Estimated Reading Time: Not available';

  // The "Save to Reading List" button.
  const actions = document.createElement('div');
  actions.className = 'book-actions';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button'; // "button" = does not submit a form
  saveBtn.className = 'btn btn-small btn-primary';
  saveBtn.textContent = 'Save to Reading List';

  // EVENT LISTENER: when this button is clicked, run handleSaveBook for THIS book.
  // The arrow function  () => ...  wraps the call so we can pass our own values.
  saveBtn.addEventListener('click', () => handleSaveBook(book, saveBtn));
  actions.appendChild(saveBtn);

  // append() can add several children at once, in the order given.
  // ----- Extra API information (publisher, year, category, rating, description) -----
  // Publisher and year are joined with " - ". filter(Boolean) removes empty ones.
  const publisher = document.createElement('p');
  publisher.className = 'book-meta';
  const pubText = [book.publisher, book.year].filter(Boolean).join(' - ');
  publisher.textContent = pubText || 'Publisher not available';

  const category = document.createElement('p');
  category.className = 'book-meta';
  category.textContent = book.categories ? `Category: ${book.categories}` : 'Category not available';

  const rating = document.createElement('p');
  rating.className = 'book-rating';
  rating.textContent = book.rating !== null ? `\u2605 ${book.rating} / 5 rating` : 'Not rated yet';

  const description = document.createElement('p');
  description.className = 'book-desc';
  description.textContent = book.description || 'No description available.';

  info.append(title, author, publisher, pages, category, rating, time, description, actions);
  card.append(createCoverElement(book), info);
  return card;
}

// Shows all the books: clears the old cards, then adds one card per book.
function displayBooks(items) {
  bookResults.replaceChildren(); // remove everything that was inside the results grid

  // A DocumentFragment is an invisible "holding box". We add all cards to it
  // first and put it on the page ONCE. That is faster than touching the page 20 times.
  const fragment = document.createDocumentFragment();

  // .map() makes a new list by converting each API item with extractBookInfo.
  // .forEach() then runs a function on every converted book.
  items.map(extractBookInfo).forEach(book => fragment.appendChild(createBookCard(book)));

  bookResults.appendChild(fragment);

  // Update the "20 books found" text. The ternary adds "s" unless exactly 1.
  resultsCount.textContent = `${items.length} book${items.length === 1 ? '' : 's'} found`;
}


/* =====================================================================
   SECTION 7 - SMALL HELPER FUNCTIONS FOR MESSAGES AND LOADING
   These change what the user sees. They are all DOM manipulation.
   ===================================================================== */

// Show a RED error message in the results area (API, network, no results).
function showStatusError(text) {
  statusMessage.textContent = text;
  statusMessage.className = 'message message-error'; // CSS classes that make it red
  statusMessage.hidden = false;                      // make it visible
}

function hideStatus() {
  statusMessage.hidden = true;
  statusMessage.textContent = '';
}

// Show a red message under the search form for bad INPUT (e.g. empty search).
// "field" is the input to highlight and focus (put the cursor in it).
function showValidationError(text, field) {
  searchError.textContent = text;
  searchError.hidden = false;
  if (field) { field.classList.add('invalid'); field.focus(); } // "invalid" = red border in CSS
}

function hideValidationError() {
  searchError.hidden = true;
  searchError.textContent = '';
  searchInput.classList.remove('invalid');
}

// Turns the "loading" state on or off: spinner visible + button disabled.
function setLoading(isLoading) {
  loadingEl.hidden = !isLoading;   // "!" means NOT: show the spinner while loading
  searchBtn.disabled = isLoading;  // stop the user clicking Search again while waiting
  searchBtn.textContent = isLoading ? 'Searching\u2026' : 'Search books';
}

// Replaces the results grid with a single grey message paragraph.
function showEmptyPlaceholder(text) {
  bookResults.replaceChildren();
  const p = document.createElement('p');
  p.className = 'empty-state';
  p.textContent = text;
  bookResults.appendChild(p);
}

// Turns ANY error into a friendly sentence for the user.
// The "label" messages were set by us inside fetchBooks().
function getErrorMessage(error) {
  if (error.message === 'NO_RESULTS') {
    return 'No books found. Check your spelling, try fewer words, or choose a different genre.';
  }
  if (error.message === 'TIMEOUT') {
    return 'The search took too long. Please check your connection and try again.';
  }
  if (error.message === 'HTTP_ERROR') {
    // The server answered, but with an error code. Explain the common ones.
    if (error.status === 429) return 'Too many searches in a short time. Please wait a moment and try again. If this keeps happening, add a free Google API key in config.js.';
    if (error.status === 400) return 'The search could not be understood. Try different search words.';
    if (error.status >= 500)  return 'Google Books is having problems right now. Please try again later.';
    return `The book service returned an error (code ${error.status}). Please try again.`;
  }
  // When the internet is down, fetch() fails with a TypeError and never gets a response.
  // (We check error.name, which is just the error's type written as text.)
  if (!navigator.onLine || error.name === 'TypeError') {
    return 'Cannot reach the book service. Please check your internet connection and try again.';
  }
  return 'Something went wrong while searching. Please try again.';
}


/* =====================================================================
   SECTION 8 - EVENT HANDLERS AND EVENT LISTENERS
   ---------------------------------------------------------------------
   An EVENT is something that happens: a click, a key press, a form being
   submitted. An EVENT LISTENER is a promise: "when THIS event happens on
   THAT element, run THIS function". The function is the EVENT HANDLER.
   The listeners are attached at the very bottom of this file.
   ===================================================================== */

// Runs when the user submits the search form (clicks Search or presses Enter).
async function handleSearch(event) {
  // Forms normally reload the page when submitted. preventDefault() stops that
  // so we can handle the search ourselves.
  event.preventDefault();
  hideValidationError();
  hideStatus();

  // .trim() removes spaces at the start and end of what the user typed.
  const term = searchInput.value.trim();
  const genre = genreSelect.value;

  // ---- INPUT VALIDATION: check the input BEFORE calling the API ----
  if (!term && !genre) {
    showValidationError('Enter a search word or choose a genre first.', searchInput);
    return; // "return" stops the function here
  }
  if (term && term.length < 2) {
    showValidationError('Please type at least 2 characters.', searchInput);
    return;
  }

  // Give this search a number. If the user starts another search (or clicks
  // Clear) while we wait, latestRequestId changes, and we know this answer is
  // out of date and must be ignored.
  const requestId = ++latestRequestId;

  setLoading(true);
  resultsCount.textContent = 'Searching\u2026';

  // try / catch / finally = "try this; if it fails, handle the error; always clean up".
  try {
    // "await" waits for the API. If fetchBooks throws, JavaScript jumps to catch.
    const items = await fetchBooks(buildQuery(term, searchType.value, genre));

    if (requestId !== latestRequestId) return; // a newer search replaced this one: ignore
    displayBooks(items);                       // show the cards

  } catch (error) {
    if (requestId !== latestRequestId) return; // out-of-date search: ignore its error too

    console.error('Search failed:', error);    // technical details for developers (F12 console)
    showEmptyPlaceholder('No results to show.');
    resultsCount.textContent = '0 books found';
    showStatusError(getErrorMessage(error));   // friendly RED message for the user

  } finally {
    // Only the newest search is allowed to switch the spinner off.
    if (requestId === latestRequestId) setLoading(false);
  }
}

// Runs when the user clicks "Clear": cancels any search and resets the page.
function handleClear() {
  latestRequestId++;                              // makes any running search "out of date"
  if (activeController) activeController.abort(); // cancel the network request
  searchForm.reset();                             // empty the form fields
  hideValidationError();
  hideStatus();
  setLoading(false);
  resultsCount.textContent = 'No search yet';
  showEmptyPlaceholder(DEFAULT_PLACEHOLDER);
  searchInput.focus();                            // put the cursor back in the text box
}

// Hides the suggestion error and removes the red borders.
function clearSuggestErrors() {
  suggestError.hidden = true;
  suggestError.textContent = '';
  [suggestGenre, suggestMood, suggestTime, suggestAuthor].forEach(el => el.classList.remove('invalid'));
}

function showSuggestError(text, field) {
  suggestError.textContent = text;
  suggestError.hidden = false;
  if (field) { field.classList.add('invalid'); field.focus(); }
}

// Runs when the user submits the suggestion form ("Suggest a book").
async function handleSuggest(event) {
  event.preventDefault();
  clearSuggestErrors();

  const genre = suggestGenre.value;
  const mood = suggestMood.value;
  const minutesPerDay = Number(suggestTime.value); // text "30" -> number 30
  const author = suggestAuthor.value.trim();

  // ---- INPUT VALIDATION: genre, mood and time are all required ----
  if (!genre) { showSuggestError('Please choose a genre.', suggestGenre); return; }
  if (!mood) { showSuggestError('Please choose a reading mood.', suggestMood); return; }
  if (!suggestTime.value) { showSuggestError('Please choose how much time you can read each day.', suggestTime); return; }
  if (author && author.length < 2) { showSuggestError('The author name needs at least 2 characters.', suggestAuthor); return; }

  // The visible text of the chosen options (e.g. "Science fiction"), saved with the suggestion.
  const genreLabel = suggestGenre.options[suggestGenre.selectedIndex].text;
  const moodLabel = suggestMood.options[suggestMood.selectedIndex].text;

  const requestId = ++latestSuggestId;
  suggestBtn.disabled = true;
  suggestBtn.textContent = 'Finding a book\u2026';
  suggestionBox.hidden = true;

  try {
    // 1. Ask the API for candidate books. Quotes around the author keep the full name together.
    let query = `subject:${genre.replace(/_/g, ' ')}`;
    if (author) query += ` inauthor:"${author}"`;
    const items = await fetchBooks(query, false); // false = do not cancel a running search
    if (requestId !== latestSuggestId) return;

    // 2. Convert each API item into our simple book object.
    const books = items.map(extractBookInfo);

    // 3. Make a Set of the books already saved, so we can skip them.
    const ownedKeys = new Set(BookStore.load().map(b => makeBookKey(b.title, b.author)));

    // 4. OUR if/else logic chooses the book.
    const prefs = { mood, minutesPerDay, author, ownedKeys };
    const choice = chooseBookForReader(books, prefs);

    if (!choice) {
      // FALLBACK message: the filters removed every candidate.
      showNoSuggestion('We could not find a book that fits that time and genre. Try more time per day, another mood or genre, or leave the author empty.');
      return;
    }

    // 5. Show it and SAVE the suggestion in Local Storage.
    const reasonText = buildReasonText(choice, minutesPerDay);
    showSuggestionResult(choice, reasonText, genre);
    SuggestionStore.add({
      title: choice.book.title,
      author: choice.book.authors,
      pageCount: choice.book.pageCount,
      genre: genreLabel,
      mood: moodLabel,
      minutesPerDay,
      reason: reasonText
    });
    renderRecentSuggestions();

  } catch (error) {
    if (requestId !== latestSuggestId) return;
    console.error('Suggestion failed:', error);
    if (error.message === 'NO_RESULTS') {
      showNoSuggestion('No books were found for that genre and author. Try a different author, or leave the author box empty.');
    } else {
      showSuggestError(getErrorMessage(error)); // red message for network / API problems
    }
  } finally {
    if (requestId === latestSuggestId) {
      suggestBtn.disabled = false;
      suggestBtn.textContent = 'Suggest a book';
    }
  }
}

// CREATE (reading list): saves the suggested book when the button is clicked.
function handleSaveSuggestion() {
  if (!currentSuggestion) return;

  const result = BookStore.add({
    title: currentSuggestion.title,
    author: currentSuggestion.authors,
    pageCount: currentSuggestion.pageCount,
    status: 'to-read'
  });

  showToast(result.message, result.ok ? 'success' : 'error');
  if (result.ok || result.duplicate) {
    saveSuggestionBtn.disabled = true;
    saveSuggestionBtn.textContent = result.ok ? 'Saved \u2713' : 'Already saved';
  }
  updateNavCount();
}

// DELETE (suggestions): removes the whole suggestion history.
function handleClearSuggestions() {
  const ok = SuggestionStore.clear();
  showToast(ok ? 'Suggestion history cleared.' : 'Could not clear the history.', ok ? 'success' : 'error');
  renderRecentSuggestions();
}

// ---------------------------------------------------------------------
// ATTACHING THE LISTENERS:  element.addEventListener('eventName', handler)
// ---------------------------------------------------------------------
searchForm.addEventListener('submit', handleSearch);     // search form submitted
suggestForm.addEventListener('submit', handleSuggest);   // suggestion form submitted
clearBtn.addEventListener('click', handleClear);         // Clear button clicked

// "input" fires on every keystroke: remove the red error as soon as the user starts fixing it.
searchInput.addEventListener('input', hideValidationError);

// "change" fires when the user picks a different dropdown option.
// When any suggestion field changes, remove the red error so it does not stay stuck.
[suggestGenre, suggestMood, suggestTime].forEach(el => el.addEventListener('change', clearSuggestErrors));
suggestAuthor.addEventListener('input', clearSuggestErrors);

saveSuggestionBtn.addEventListener('click', handleSaveSuggestion);      // add suggested book to list
clearSuggestionsBtn.addEventListener('click', handleClearSuggestions);  // clear suggestion history

// Runs once when the page opens: show the nav count and the saved suggestions.
updateNavCount();
renderRecentSuggestions();
