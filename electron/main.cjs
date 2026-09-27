const { app, BrowserWindow, shell, screen } = require('electron');
const path = require('path');

function createWindow() {
  // 起動時にページ下の欄（送り先・フッター）まで見える高さで開く。画面が低いときは画面いっぱいまで
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const win = new BrowserWindow({
    width: 900,
    height: Math.min(1320, workArea.height - 40),
    useContentSize: true,
    center: true,
    title: '画像変幻コンバーター',
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    autoHideMenuBar: true
  });

  // 外部リンク（ストレージ・OFUSE・意見箱など）はアプリ内の窓でなく普段のブラウザで開く
  const openOutside = (url) => {
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
  };
  win.webContents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file:')) {
      event.preventDefault();
      openOutside(url);
    }
  });

  // タイトルバーはアプリ名だけにする（Web版の「ブラウザ完結…」の見出しを出さない）
  win.on('page-title-updated', (event) => event.preventDefault());

  win.loadFile(path.join(__dirname, '../dist/index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
