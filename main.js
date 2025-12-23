const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,

    // ✅ chống “flash trắng”
    show: false,
    backgroundColor: "#FFFFFF",

    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: false,
    },
  });

  const indexPath = path.join(__dirname, "www", "index.html");

  // ✅ nếu load xong mới show => hết chớp
  win.once("ready-to-show", () => win.show());

  // ✅ log nếu load fail
  win.webContents.on("did-fail-load", (e, code, desc, url) => {
    console.log("did-fail-load:", code, desc, url);
  });

  if (fs.existsSync(indexPath)) {
    win.loadFile(indexPath);
  } else {
    win.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(`
          <h2>❌ Không tìm thấy UI offline</h2>
          <p>Thiếu file: <b>${indexPath}</b></p>
        `)
    );
  }

  // ❌ TẮT auto mở devtools để khỏi “chớp” + rối màn hình
  // win.webContents.openDevTools({ mode: "detach" });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
