

// A tiny shortcut: $('x') means document.getElementById('x').
// (The arrow function "id => ..." takes id and returns the element.)
const $ = id => document.getElementById(id);

/* ---------- Finding the HTML elements (DOM references) ---------- */
const bookForm     = $('bookForm');      // the "Add a book manually" form
const titleInput   = $('bookTitle');
const authorInput  = $('bookAuthor');
const pagesInput   = $('bookPages');
const statusInput  = $('bookStatus');
const formMessage  = $('formMessage');   // red message under the form
const filterText   = $('filterText');    // "Search my list" box
const filterStatus = $('filterStatus');  // "Show" dropdown
const tableWrap    = $('tableWrap');     // the box around the table (hidden when empty)
const tableBody    = $('readingList');   // the <tbody> where rows are placed
const emptyState   = $('emptyState');    // "Your list is empty" message
const listCount    = $('listCount');     // "2 of 5 books"

// Finish date calculator elements
const calcForm       = $('calcForm');
const calcBook       = $('calcBook');         // dropdown of saved books
const calcPagesRead  = $('calcPagesRead');
const calcPagesPerDay = $('calcPagesPerDay');
const calcMessage    = $('calcMessage');      // red message for bad input
const calcResult     = $('calcResult');       // box that shows the answer

// Connects a field NAME (sent back by BookStore) to the real input element,
// so we know which box to highlight in red when validation fails.
const fieldMap = { title: titleInput, author: authorInput, pages: pagesInput, status: statusInput };

// Remembers WHICH row is being edited right now (null = no row in edit mode).
// It uses "let" because the value changes while the app runs.
let editingId = null;


/* =====================================================================
   FORM MESSAGE HELPERS
   ===================================================================== */

// Hides the red message and removes the red borders from all fields.
function clearFormErrors() {
  formMessage.hidden = true;
  formMessage.textContent = '';
  // Object.values(fieldMap) is the list of the four input elements.
  Object.values(fieldMap).forEach(el => el.classList.remove('invalid'));
}

// Shows a red message under the form and highlights the problem field.
function showFormError(message, field) {
  formMessage.textContent = message;
  formMessage.hidden = false;
  const el = fieldMap[field];                          // find the matching input
  if (el) { el.classList.add('invalid'); el.focus(); } // red border + put the cursor there
}


/* =====================================================================
   CREATE  -  the manual "Save to Reading List" form
   ===================================================================== */
function handleAddBook(event) {
  event.preventDefault(); // stop the browser reloading the page on submit
  clearFormErrors();

  // Hand the typed values to BookStore.add(). It validates them, checks for
  // duplicates and saves to Local Storage, then returns { ok, message, ... }.
  const result = BookStore.add({
    title: titleInput.value,
    author: authorInput.value,
    pageCount: pagesInput.value,
    status: statusInput.value
  });

  if (!result.ok) {
    // FAILED: show the error under the form AND as a red pop-up.
    showFormError(result.message, result.field);
    showToast(result.message, 'error');
    return;
  }

  // SUCCEEDED: empty the form, show a green pop-up, redraw the table.
  bookForm.reset();
  showToast(result.message, 'success');
  renderList();
  titleInput.focus();
}


/* =====================================================================
   READ  -  build the table from what is saved in Local Storage
   ---------------------------------------------------------------------
   These small functions each build one piece of a table row using
   DOM manipulation: createElement -> set text/class -> append.
   ===================================================================== */

// Makes a table cell (<td>) containing plain text.
function createCell(text, className) {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

// Makes a button for the Actions column.
// dataset.action and dataset.id become data-action="..." and data-id="..."
// attributes in the HTML. We read them back later when the button is clicked.
function createActionButton(label, action, id, extraClass) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `btn btn-small ${extraClass || 'btn-ghost'}`;
  btn.textContent = label;
  btn.dataset.action = action; // e.g. "edit", "delete", "save", "cancel"
  btn.dataset.id = id;         // which book this button belongs to
  return btn;
}

// Makes the coloured status label (e.g. "Finished").
function createStatusBadge(status) {
  const badge = document.createElement('span');
  const cssName = status === 'to-read' ? 'want' : status; // match the CSS class names
  badge.className = `badge badge-${cssName}`;
  badge.textContent = STATUS_LABELS[status];              // nice label from storage.js
  return badge;
}

// Builds ONE complete table row (<tr>) for one book.
function createRow(book, number) {
  const row = document.createElement('tr');
  row.appendChild(createCell(number));                          // 1, 2, 3 ...
  row.appendChild(createCell(book.title, 'cell-title'));
  row.appendChild(createCell(book.author));
  row.appendChild(createCell(book.pageCount ? book.pageCount : 'N/A')); // N/A if no page count

  const statusCell = document.createElement('td');
  const actionsCell = document.createElement('td');
  actionsCell.className = 'actions-cell';

  if (book.id === editingId) {
    // ---- EDIT MODE (this is the UPDATE screen) ----
    // Show a dropdown instead of the badge, plus Save and Cancel buttons.
    row.classList.add('row-editing');

    const select = document.createElement('select');
    select.className = 'inline-select';
    select.setAttribute('aria-label', `Reading status for ${book.title}`); // label for screen readers

    // Object.keys(STATUS_LABELS) gives ['to-read', 'reading', 'finished'].
    // We make one <option> for each and pre-select the book's current status.
    Object.keys(STATUS_LABELS).forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = STATUS_LABELS[value];
      option.selected = value === book.status;
      select.appendChild(option);
    });
    statusCell.appendChild(select);

    actionsCell.append(
      createActionButton('Save', 'save', book.id, 'btn-primary'),
      createActionButton('Cancel', 'cancel', book.id, 'btn-ghost')
    );
  } else {
    // ---- NORMAL MODE ----
    statusCell.appendChild(createStatusBadge(book.status));
    actionsCell.append(
      createActionButton('Edit', 'edit', book.id, 'btn-ghost'),
      createActionButton('Delete', 'delete', book.id, 'btn-danger')
    );
  }

  row.append(statusCell, actionsCell);
  return row;
}

// Fills the five summary numbers at the top of the page.
function updateStats(all) {
  // Counts how many books have a given status. .filter() keeps matching books
  // and .length is how many were kept.
  const count = status => all.filter(b => b.status === status).length;

  // Adds up the pages of every book that is NOT finished.
  // .reduce() walks through the list keeping a running total ("sum").
  const pagesLeft = all
    .filter(b => b.status !== 'finished' && b.pageCount)
    .reduce((sum, b) => sum + b.pageCount, 0); // 0 is the starting total

  $('statTotal').textContent = all.length;
  $('statWant').textContent = count('to-read');
  $('statReading').textContent = count('reading');
  $('statFinished').textContent = count('finished');
  $('statPages').textContent = pagesLeft.toLocaleString(); // 1500 -> "1,500"
}

// The main drawing function. Call it any time the data or filters change.
function renderList() {
  // 1. READ the saved books from Local Storage (via storage.js).
  const all = BookStore.load();
  updateStats(all);
  updateNavCount();
  fillCalcBooks(all); // keep the calculator's dropdown in step with the saved books

  // 2. Apply the "Search my list" text and the status dropdown.
  //    A book is shown only if it matches BOTH (the && means AND).
  const text = filterText.value.trim().toLowerCase();
  const status = filterStatus.value;
  const shown = all.filter(b =>
    (status === 'all' || b.status === status) &&
    (!text || b.title.toLowerCase().includes(text) || b.author.toLowerCase().includes(text))
  );

  // 3. Empty the table body so we can rebuild it from scratch.
  tableBody.replaceChildren();
  listCount.textContent = `${shown.length} of ${all.length} book${all.length === 1 ? '' : 's'}`;

  // 4. Nothing to show? Hide the table and explain why.
  if (shown.length === 0) {
    tableWrap.hidden = true;
    emptyState.hidden = false;
    emptyState.textContent = all.length === 0
      ? 'Your list is empty. Save a book from the search page or add one manually.'
      : 'No books match your search or filter. Try clearing them.';
    return;
  }

  // 5. Otherwise show the table and add one row per book.
  //    Loop = .forEach(): runs the function once for each book (index counts from 0).
  emptyState.hidden = true;
  tableWrap.hidden = false;
  const fragment = document.createDocumentFragment(); // invisible holding box
  shown.forEach((book, index) => fragment.appendChild(createRow(book, index + 1)));
  tableBody.appendChild(fragment);                    // add all rows to the page at once
}


/* =====================================================================
   UPDATE and DELETE  -  one listener handles EVERY row button
   ---------------------------------------------------------------------
   EVENT DELEGATION: the rows are rebuilt all the time, so adding a click
   listener to every button would be messy. Instead we put ONE listener on
   the table body. A click on any button "bubbles up" to it, and
   event.target tells us exactly what was clicked.
   ===================================================================== */
function handleTableClick(event) {
  // closest() looks at the clicked element and its parents for a button that
  // has a data-action attribute. If the click was somewhere else, ignore it.
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const id = button.dataset.id;          // which book
  const action = button.dataset.action;  // what to do

  // ---- EDIT: switch this row into edit mode ----
  if (action === 'edit') {
    editingId = id;
    renderList(); // redraw: this row now shows a dropdown
    const select = tableBody.querySelector('.inline-select');
    if (select) select.focus();
    return;
  }

  // ---- CANCEL: leave edit mode without saving ----
  if (action === 'cancel') {
    editingId = null;
    renderList();
    return;
  }

  // ---- SAVE (UPDATE in Local Storage) ----
  if (action === 'save') {
    // Find the dropdown inside the same row as the clicked Save button.
    const select = button.closest('tr').querySelector('.inline-select');

    // BookStore.updateStatus: load list -> change status -> save list.
    const result = BookStore.updateStatus(id, select.value);

    // Pick the message colour: red if it failed, green if the status changed, neutral if nothing changed.
    showToast(result.message, !result.ok ? 'error' : (result.changed ? 'success' : 'info'));
    editingId = null;
    renderList();
    return;
  }

  // ---- DELETE ----
  if (action === 'delete') {
    // Find the book so we can name it in the question.
    const book = BookStore.load().find(b => b.id === id);
    const name = book ? book.title : 'this book';

    // window.confirm opens a Yes/No box. If the user chooses Cancel we stop.
    if (!window.confirm(`Delete "${name}" from your reading list?`)) return;

    // BookStore.remove: load list -> filter the book out -> save list.
    const result = BookStore.remove(id);
    showToast(result.message, result.ok ? 'success' : 'error');
    if (editingId === id) editingId = null;
    renderList();
  }
}


/* =====================================================================
   CALCULATION - Finish Date Calculator (uses USER INPUT + saved book data)
   ---------------------------------------------------------------------
   Inputs : total pages (from the saved book), pages already read,
            and pages the user reads per day (typed by the user).
   Steps  : pagesLeft     = totalPages - pagesRead
            daysNeeded    = ceil(pagesLeft / pagesPerDay)   (round UP)
            finishDate    = today + (daysNeeded - 1) days   (today is day 1)
            minutesPerDay = pagesPerDay x 1.5               (reading speed)
   WORKED EXAMPLE: 300-page book, 60 pages read, 20 pages a day
            pagesLeft = 240  ->  daysNeeded = ceil(240 / 20) = 12 days
   ===================================================================== */
function calculateFinishPlan(totalPages, pagesRead, pagesPerDay) {
  // ---- BOUNDARY / VALIDATION CHECKS (each returns an error message) ----
  if (!Number.isInteger(totalPages) || totalPages < 1) {
    return { error: 'This book has no page count, so the finish date cannot be calculated.' };
  }
  if (!Number.isInteger(pagesRead) || pagesRead < 0) {
    return { error: 'Pages already read must be a whole number, 0 or more.' };
  }
  if (pagesRead > totalPages) {
    return { error: `Pages already read cannot be more than the book's ${totalPages} pages.` };
  }
  if (!Number.isInteger(pagesPerDay) || pagesPerDay < 1 || pagesPerDay > 1000) {
    return { error: 'Pages per day must be a whole number from 1 to 1000.' };
  }

  const pagesLeft = totalPages - pagesRead;

  // Boundary case: nothing left to read.
  if (pagesLeft === 0) {
    return { finished: true, pagesLeft: 0 };
  }

  const daysNeeded = Math.ceil(pagesLeft / pagesPerDay);

  // new Date() is today. setDate() moves it forward by a number of days.
  const finishDate = new Date();
  finishDate.setDate(finishDate.getDate() + daysNeeded - 1);

  // On the last day you may read fewer pages than usual, so use the smaller number.
  const minutesPerDay = Math.round(Math.min(pagesPerDay, pagesLeft) * MINUTES_PER_PAGE);
  const totalMinutesLeft = Math.round(pagesLeft * MINUTES_PER_PAGE);

  return { pagesLeft, daysNeeded, finishDate, minutesPerDay, totalMinutesLeft };
}

// Turns minutes into text like "5 hours 48 minutes".
function formatMinutes(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hoursText = `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const minutesText = `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  if (hours > 0 && minutes > 0) return `${hoursText} ${minutesText}`;
  if (hours > 0) return hoursText;
  return minutesText;
}

// Fills the calculator's dropdown with saved books that have a page count and are not finished.
function fillCalcBooks(all) {
  const previous = calcBook.value; // remember what was selected
  calcBook.replaceChildren();

  const first = document.createElement('option');
  first.value = '';
  first.textContent = 'Choose a saved book';
  calcBook.appendChild(first);

  all.filter(b => b.pageCount && b.status !== 'finished').forEach(book => {
    const option = document.createElement('option');
    option.value = book.id;
    option.textContent = `${book.title} (${book.pageCount} pages)`;
    calcBook.appendChild(option);
  });

  // Put the old selection back if that book still exists.
  if (previous && all.some(b => b.id === previous)) calcBook.value = previous;
}

// Adds one "Label: value" line to the result box.
function addResultLine(label, value) {
  const p = document.createElement('p');
  const strong = document.createElement('strong');
  strong.textContent = `${label}: `;
  p.append(strong, document.createTextNode(value));
  calcResult.appendChild(p);
}

// Runs when the user submits the calculator form.
function handleCalculate(event) {
  event.preventDefault();
  calcMessage.hidden = true;
  calcResult.hidden = true;
  calcResult.replaceChildren();

  // Find the chosen book in Local Storage.
  const book = BookStore.load().find(b => b.id === calcBook.value);
  if (!book) {
    calcMessage.textContent = 'Please choose a saved book first.';
    calcMessage.hidden = false;
    return;
  }

  // Empty "pages read" counts as 0. Number('abc') is NaN, which the checks reject.
  const pagesRead = calcPagesRead.value === '' ? 0 : Number(calcPagesRead.value);
  const pagesPerDay = Number(calcPagesPerDay.value);

  const plan = calculateFinishPlan(book.pageCount, pagesRead, pagesPerDay);

  if (plan.error) {
    calcMessage.textContent = plan.error;
    calcMessage.hidden = false;
    showToast(plan.error, 'error');
    return;
  }

  if (plan.finished) {
    addResultLine('Result', 'You have already read every page of this book.');
    calcResult.hidden = false;
    return;
  }

  // Show every result with a clear label and unit.
  const dateText = plan.finishDate.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  addResultLine('Book', book.title);
  addResultLine('Pages left', `${plan.pagesLeft} pages`);
  addResultLine('Days to finish', `${plan.daysNeeded} ${plan.daysNeeded === 1 ? 'day' : 'days'}`);
  addResultLine('Expected finish date', `${dateText} (if you start today)`);
  addResultLine('Reading time per day', `about ${plan.minutesPerDay} minutes (at ${MINUTES_PER_PAGE} minutes per page)`);
  addResultLine('Total reading time left', formatMinutes(plan.totalMinutesLeft));
  calcResult.hidden = false;
  showToast('Finish date calculated.', 'success');
}


/* =====================================================================
   EVENT LISTENERS - connect user actions to the functions above
   ===================================================================== */
bookForm.addEventListener('submit', handleAddBook);     // manual form submitted
tableBody.addEventListener('click', handleTableClick);  // any click inside the table (delegation)
filterText.addEventListener('input', renderList);       // every keystroke in the search box -> redraw
filterStatus.addEventListener('change', renderList);    // dropdown changed -> redraw
calcForm.addEventListener('submit', handleCalculate);   // calculator form submitted

// While the user types in the form, remove the red error so it does not stay stuck.
[titleInput, authorInput, pagesInput, statusInput].forEach(el => el.addEventListener('input', clearFormErrors));

// Runs once when the page opens: draw the saved books straight away.
// This is why books are still there after closing and reopening the app.
renderList();
