import config from './config.js';
import cluster from 'cluster';
import QinBot from './bot.js';

import { MusicExtension } from './extensions/musicbot.js';

if (cluster.isMaster) {
  Object.keys(config.discord.tokens).forEach(name => {
    const token = config.discord.tokens[name];

    const worker = cluster.fork({ token, name });
    worker.data = { token, name };
    console.log(`[Master] Spawned worker '${name}' with pid ${worker.process.pid}.`);
  });

  cluster.on('exit', (worker, code, signal) => {
    console.log(`[Master] Worker with pid ${worker.process.pid} died.`);
    cluster.fork(worker.data);
  });
} else {
  const bot = new QinBot({
    token: process.env.token,
    name: process.env.name,
  });

  bot.register(MusicExtension);

  bot.run();
}
