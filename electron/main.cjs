const { app, BrowserWindow } = require("electron");
const path = require("path");

async function createWindow() {
  // DB nằm trong userData để ghi được khi packaged
  process.env.DB_FILE = path.join(app.getPath("userData"), "data.sqlite");

  // chạy server trên port random (0)
  const { startServer } = await import(path.join(__dirname, "..", "server.js"));
  const { port } = await startServer(0);

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true
    }
  });

  await win.loadURL(`http://127.0.0.1:${port}/`);
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
