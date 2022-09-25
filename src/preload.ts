import { contextBridge, ipcRenderer } from 'electron';

// expose IPC to renderer
contextBridge.exposeInMainWorld('api', {
    send: (channel: string, data: unknown) => {
        ipcRenderer.send(channel, data);
    },
    receive: (channel: string, func: (...args: unknown[]) => void) => {
        ipcRenderer.on(channel, (_, ...args) => func(...args));
    }
});
