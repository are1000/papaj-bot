import config from './config.js';
import QinBot from './bot.js';

import { MusicExtension } from './extensions/musicbot.js';

const bot = new QinBot({
  token: config.discord.token,
});

bot.register(MusicExtension);

bot.run();
