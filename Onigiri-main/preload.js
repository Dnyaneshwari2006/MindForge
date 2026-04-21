const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mindforge', {
  // Window controls for frameless window
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // Platform info
  platform: process.platform,

  // ─── Auth API ───
  auth: {
    signUp: (email, password) => ipcRenderer.invoke('auth:signUp', email, password),
    signIn: (email, password) => ipcRenderer.invoke('auth:signIn', email, password),
    signOut: () => ipcRenderer.invoke('auth:signOut'),
    getUser: () => ipcRenderer.invoke('auth:getUser'),
    getSession: () => ipcRenderer.invoke('auth:getSession'),
    onAuthStateChange: (callback) => {
      ipcRenderer.on('auth:stateChanged', (event, data) => callback(data));
    },
  },

  // ─── Focus Room API ───
  room: {
    create: (name, displayName) => ipcRenderer.invoke('room:create', name, displayName),
    join: (code, displayName) => ipcRenderer.invoke('room:join', code, displayName),
    leave: (code) => ipcRenderer.invoke('room:leave', code),
    getMembers: (code) => ipcRenderer.invoke('room:getMembers', code),
    getActive: () => ipcRenderer.invoke('room:getActive'),
  },

  // IPC helpers
  send: (channel, data) => {
    const validChannels = ['window-minimize', 'window-maximize', 'window-close'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  on: (channel, callback) => {
    const validChannels = ['score-update', 'intervention'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },
  openExternal: (url) => ipcRenderer.send('open-external', url),
});
