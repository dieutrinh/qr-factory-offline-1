const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  const indexPath = path.join(__dirname, 'www', 'index.html');
  preload: path.join(__dirname,'preload.js')

  if (fs.existsSync(indexPath)) {
    win.loadFile(indexPath);
  } else {
    // Nếu thiếu file => hiển thị lỗi ngay trên màn hình (không còn trắng)
    win.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(`
          <h2>❌ Không tìm thấy UI offline</h2>
          <p><b>Thiếu file:</b> ${indexPath}</p>
          <p>Nguyên nhân: electron-builder chưa đóng gói thư mục <b>www/</b> vào EXE.</p>
        `)
    );
  }

  // Mở DevTools để thấy lỗi JS/CSS nếu có
  win.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
