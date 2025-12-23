const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });

  const indexPath = path.join(__dirname, 'www', 'index.html');

  if (fs.existsSync(indexPath)) {
    win.loadFile(indexPath);
  } else {
    win.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(`
          <h2>❌ Không tìm thấy UI offline</h2>
          <p>Thiếu file: ${indexPath}</p>
        `)
    );
  }
}

app.whenReady().then(createWindow);
