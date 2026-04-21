const { app, BrowserWindow, Tray, Menu, nativeImage, dialog, ipcMain, shell } = require('electron');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { initDB, setAuthSession, createRoom, getRoomByCode, joinRoom, leaveRoom, getRoomMembers, getUserActiveRoom } = require('./core/db');
const { initAuth, signUp, signIn, signOut, getUser, getSession, onAuthStateChange } = require('./core/auth');
const { startServer, broadcast } = require('./core/server');
const { startWatcher } = require('./core/watcher');
const { startDjango, stopDjango } = require('./core/djangoHandler');

let mainWindow;

app.whenReady().then(async () => {
  // Initialize Supabase Auth
  const authReady = initAuth();
  if (!authReady) {
    dialog.showErrorBox(
      'MindForge — Auth Error',
      'Could not initialize Supabase Auth. Please check your SUPABASE_URL and SUPABASE_ANON_KEY in the .env file.'
    );
    app.quit();
    return;
  }

  // Initialize Supabase DB connection (starts with anon key; upgraded on login)
  const dbReady = initDB();
  if (!dbReady) {
    dialog.showErrorBox(
      'MindForge — Database Error',
      'Could not connect to Supabase. Please check your SUPABASE_URL and SUPABASE_ANON_KEY in the .env file.'
    );
    app.quit();
    return;
  }

  // When auth state changes, update the DB client with the user's session
  onAuthStateChange(async (event, session) => {
    if (session) {
      setAuthSession(session.access_token, session.refresh_token);
    }
    // Forward auth state change to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auth:stateChanged', {
        event,
        user: session?.user ? {
          id: session.user.id,
          email: session.user.email,
        } : null,
      });
    }
  });

  // ─── Register Auth IPC Handlers ───
  ipcMain.handle('auth:signUp', async (event, email, password) => {
    const result = await signUp(email, password);
    if (result.session) {
      setAuthSession(result.session.access_token, result.session.refresh_token);
    }
    return {
      user: result.user ? { id: result.user.id, email: result.user.email } : null,
      error: result.error,
    };
  });

  ipcMain.handle('auth:signIn', async (event, email, password) => {
    const result = await signIn(email, password);
    if (result.session) {
      setAuthSession(result.session.access_token, result.session.refresh_token);
    }
    return {
      user: result.user ? { id: result.user.id, email: result.user.email } : null,
      error: result.error,
    };
  });

  ipcMain.handle('auth:signOut', async () => {
    const result = await signOut();
    return result;
  });

  ipcMain.handle('auth:getUser', () => {
    const user = getUser();
    return user ? { id: user.id, email: user.email } : null;
  });

  ipcMain.handle('auth:getSession', async () => {
    const session = await getSession();
    return session ? {
      access_token: session.access_token,
      user: { id: session.user.id, email: session.user.email },
    } : null;
  });

  // Start Express + WebSocket server
  try {
    await startServer();
  } catch (err) {
    dialog.showErrorBox(
      'MindForge — Port Error',
      `Port 39871 is already in use. Please close the other app and restart.\n\n${err.message}`
    );
    app.quit();
    return;
  }

  // ─── Register Focus Room IPC Handlers ───
  ipcMain.handle('room:create', async (event, name, displayName) => {
    try {
      // Generate 6-char code
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = '';
      for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];

      const result = await createRoom(code, name);
      if (result.error) return { error: result.error };

      // Auto-join the creator
      await joinRoom(code, displayName || 'Host');
      return { ok: true, room: result.data, code };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('room:join', async (event, code, displayName) => {
    try {
      const room = await getRoomByCode(code.toUpperCase());
      if (!room) return { error: 'Room not found' };

      const result = await joinRoom(code.toUpperCase(), displayName || 'Member');
      if (result.error) return { error: result.error };
      return { ok: true, room, member: result.data };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('room:leave', async (event, code) => {
    try {
      const result = await leaveRoom(code);
      return result;
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('room:getMembers', async (event, code) => {
    try {
      const members = await getRoomMembers(code);
      const room = await getRoomByCode(code);
      return { room, members };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('room:getActive', async () => {
    try {
      const roomId = await getUserActiveRoom();
      if (!roomId) return { room: null };
      const room = await getRoomByCode(roomId);
      const members = await getRoomMembers(roomId);
      return { room, members };
    } catch (err) {
      return { error: err.message };
    }
  });

  // Start system watcher
  await startWatcher(broadcast);

  // Start Django backend
  try {
    await startDjango();
  } catch (err) {
    dialog.showErrorBox(
      'MindForge — Backend Error',
      `Could not start or connect to the Django server.\n\n${err.message}`
    );
    app.quit();
    return;
  }

  ipcMain.on('open-external', (event, url) => {
    shell.openExternal(url);
  });

  // Create main window
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    frame: false,
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Dev: load Vite dev server. Prod: load built files
  if (process.env.NODE_ENV === 'development') {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    let lanIp = 'localhost';
    outer: for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('192.168.137')) {
          lanIp = iface.address;
          break outer;
        }
      }
    }
    // Fallback if only hotspot exists
    if (lanIp === 'localhost') {
       for (const name of Object.keys(interfaces)) {
         for (const iface of interfaces[name]) {
           if (iface.family === 'IPv4' && !iface.internal) lanIp = iface.address;
         }
       }
    }
    
    const port = process.env.PORT || 5174;
    console.log(`[Electron] Loading UI from http://${lanIp}:${port}`);
    mainWindow.loadURL(`http://${lanIp}:${port}`);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
});

app.on('window-all-closed', () => {
  stopDjango();
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  stopDjango();
});

app.on('activate', () => {
  if (mainWindow === null) {
    // Re-create window on macOS dock click
  }
});
