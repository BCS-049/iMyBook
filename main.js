/* =====================================================================
   main.js  -  The Electron "main process"
   =====================================================================
   An Electron app has TWO kinds of code:
   - MAIN process (this file): runs with Node.js, creates windows and
     controls the app's life (start, close, quit).
   - RENDERER process (the HTML + JS files in src/): the web page shown
     inside the window. That is where search.js and reading-list.js run.
   ===================================================================== */

// "require" loads built-in modules.
//  app           = controls the application's life cycle
//  BrowserWindow = creates and manages a window
//  path          = builds file paths that work on Windows, macOS and Linux
const { app, BrowserWindow } = require('electron');
const path = require('path');

// Creates the app window and loads our first page into it.
function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 860,   // the window cannot be made smaller than this
    minHeight: 600,
    title: 'iMybook',
    backgroundColor: '#1d1510', // same as the CSS background, so there is no white flash on start
    autoHideMenuBar: true,      // hide the default File/Edit menu bar
    webPreferences: {
      contextIsolation: true,   // keeps the web page separate from Electron internals (safer)
      nodeIntegration: false    // the page cannot use Node.js; fetch() and localStorage still work
    }
  });

  // __dirname is the folder this file is in. path.join adds src/index.html.
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

// whenReady() waits until Electron has finished starting up, then runs our code.
app.whenReady().then(() => {
  createWindow();

  // macOS only: clicking the dock icon with no windows open should create a new one.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// When every window is closed, quit the app (except on macOS, where apps
// normally keep running until the user quits them).
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
