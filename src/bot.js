import Discord from 'discord.js';

export default class QinBot {
  constructor(config) {
    if (!config.token) throw new Error('Discord token is required.');

    this._client = new Discord.Client();
    this._config = config;

    this._extensions = [];
  }

  register(extension) {
    this._extensions.push(extension);
  }

  run() {
    this._client.on('ready', () => {
      this._extensions.map(e => e.onLoad(this._client));
    });

    this._client.on('message', message => {
      this._extensions.map(e => e.onMessage(message, this._client));
    });

    this._client.on('messageReactionAdd', (reaction, user) => {
      this._extensions.map(e => e.onReaction(reaction, user, this._client));
    });

    this._client.login(this._config.token);
  }
}
