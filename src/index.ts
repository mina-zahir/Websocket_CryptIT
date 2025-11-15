import express from 'express';
import path from 'path';
import { resilientEventListener, ResilientEventListenerArgs } from './resilientEventListener';
import { usdtAbi } from './usdtAbi';
import { Contract, LogDescription } from 'ethers';
import WebSocket from 'isomorphic-ws';

function safeStringify(obj: any): string {
  return JSON.stringify(obj, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  );
}

const app = express();
const PORT = 3001;

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

// to store events in memory for simplicity
// in production, consider using a database
// to store events persistently instead of in memory
// to avoid data loss on server restart
// and to handle larger volumes of events more efficiently
const events: string[] = [];

export const resArgs: ResilientEventListenerArgs = {
  rpcUrl: 'wss://mainnet.infura.io/ws/v3/e27ea5440e3845e089af65626af436e9',
  contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  abi: usdtAbi,
  eventName: "Transfer",
  log: (level, msg) => console.log(`[${level.toUpperCase()}] ${msg}`),
  callback: (event: any) => {
    if (event) {
      // const evStr = `Event ${event.name}: ${JSON.stringify(event.args)}`;
      const evStr = `Event ${event.name}: ${safeStringify(event.args)}`;
      events.push(evStr);
      console.log(evStr);
    }
  },
  keepAliveCheckInterval: 0,
  expectedPongBack: 0
}

const listener = resilientEventListener(resArgs);

// create an API endpoint to access stored array as a json string
app.get('/events', (req, res) => {
  res.json(events);
});
