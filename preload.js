'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pet', {
  onUsage: (cb) => ipcRenderer.on('usage', (_e, data) => cb(data)),
  onPlan: (cb) => ipcRenderer.on('plan', (_e, r) => cb(r)),
  onWalk: (cb) => ipcRenderer.on('walk', (_e, dir) => cb(dir)),
  onPlace: (cb) => ipcRenderer.on('place', (_e, side) => cb(side)),
  onJetStart: (cb) => ipcRenderer.on('jet-start', (_e, dir) => cb(dir)),
  onJetEnd: (cb) => ipcRenderer.on('jet-end', () => cb()),
  onBikeStart: (cb) => ipcRenderer.on('bike-start', (_e, dir) => cb(dir)),
  onBikeEnd: (cb) => ipcRenderer.on('bike-end', () => cb()),
  onRunStart: (cb) => ipcRenderer.on('run-start', (_e, dir) => cb(dir)),
  onRunEnd: (cb) => ipcRenderer.on('run-end', () => cb()),
  onGame: (cb) => ipcRenderer.on('game', (_e, g) => cb(g)),
  buy: (id) => ipcRenderer.send('buy', id),
  played: () => ipcRenderer.send('played'),
  onSettings: (cb) => ipcRenderer.on('settings', (_e, s) => cb(s)),
  onPet: (cb) => ipcRenderer.on('pet', (_e, p) => cb(p)),
  onEat: (cb) => ipcRenderer.on('eat', () => cb()),
  feed: () => ipcRenderer.send('feed'),
  setPaused: (v) => ipcRenderer.send('set-paused', v),
  requestUsage: () => ipcRenderer.send('request-usage'),
  setInteractive: (v) => ipcRenderer.send('set-interactive', v),
  dragStart: () => ipcRenderer.send('drag-start'),
  dragEnd: () => ipcRenderer.send('drag-end'),
  onTap: (cb) => ipcRenderer.on('tap', () => cb()),
  menu: () => ipcRenderer.send('context-menu'),
  onDebugOpen: (cb) => ipcRenderer.on('debug-open', () => cb()),
});
