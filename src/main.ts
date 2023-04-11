import { app, ipcMain, dialog } from 'electron';
import AspectRatioBrowserWindow from 'electron-aspect-ratio-browser-window';
import dotenv from 'dotenv';
import fetch from 'cross-fetch';

import * as path from 'path';

// load environment variables...
dotenv.config();
dotenv.config({ path: path.join(process.resourcesPath, '.env') });
const domain = process.env.DOMAIN;
const token = process.env.TOKEN;

// ...and make sure .env was loaded
if (!domain || !token) {
    dialog.showErrorBox(
        'Error',
        'Please set the DOMAIN and TOKEN environment variables.'
    );
    app.quit();
}

// OvenMediaEngine requires authentication for API requests
const authOptions = {
    method: 'GET',
    headers: {
        authorization: `Basic ${token}`
    }
};

// creates a main window
function createWindow() {
    const window = new AspectRatioBrowserWindow({
        backgroundColor: '#000000',
        webPreferences: {
            nodeIntegration: true,
            preload: path.join(__dirname, 'preload.js'),
            spellcheck: false
        },
        width: 1279,
        height: 720,
        frame: false,
        resizable: true
    });

    window.setAspectRatio(16 / 9);

    window.loadFile('index.html');
    return window;
}

// fetches available streams from OME
async function getStreams(
    titles: Record<string, string>
): Promise<{ url: string; title: string }[]> {
    const res = await fetch(
        `https://${domain}/v1/vhosts/default/apps/stream/streams`,
        authOptions
    );

    if (!res.ok) {
        return [];
    }

    const data = await res.json();
    const urls = data.response;

    const streamList = [];
    for (const url of urls) {
        streamList.push({
            url: `wss://${domain}:3334/stream/${url}`,
            title: titles[url] || url,
            name: url
        });
    }

    return streamList;
}

// fetches viewer count for chosen stream
async function getViewerCount(stream: string): Promise<number> {
    const res = await fetch(
        `https://${domain}/v1/stats/current/vhosts/default/apps/stream/streams/${stream}`,
        authOptions
    );

    if (!res.ok) {
        return 0;
    }

    const data = await res.json();
    return data.response.totalConnections || 0;
}

let titles: Record<string, string>;
let window: AspectRatioBrowserWindow;

// we're ready to go
app.whenReady().then(async () => {
    const res = await fetch(`https://${domain}/.well-known-streams`);

    if (!res.ok) {
        dialog.showErrorBox('Error', `Failed to fetch stream titles.`);
        app.quit();
    } else {
        titles = await res.json();

        const streams = await getStreams(titles);

        if (streams.length === 0) {
            dialog.showErrorBox('Error', `No streams are currently available.`);
            app.quit();
        } else {
            window = createWindow();

            window.webContents.on('did-finish-load', () => {
                window.webContents.send('init', {
                    data: JSON.stringify(streams)
                });
            });
        }
    }
});

// respond to requests for viewer count
ipcMain.on('getViewerCount', async (_event, stream) => {
    const viewerCount = await getViewerCount(stream);
    window.webContents.send('viewerCount', {
        data: JSON.stringify(viewerCount)
    });
});

// quit when the user presses 'q'
ipcMain.on('quit', () => {
    app.quit();
});
