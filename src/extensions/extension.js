import EventEmitter from 'events';
import Collection from 'marsdb';
import LevelStorageManager from 'marsdb-levelup';

LevelStorageManager.defaultStorageLocation('./data/db');
Collection.defaultStorageManager(LevelStorageManager);

class Extension extends EventEmitter {
  constructor() {
    super();

    this._name = '';
    this._logging = true;
    this._data = {};
    this._commands = [];
  }

  db() {
    if (this._name === '') {
      throw new Error('You must name your extension to use database!');
    }

    if (this._db) {
      return this._db;
    } else {
      this._db = new Collection(this._name);
      return this._db;
    }

  }

  log(message) {
    if (this._logging) {
      console.log(`[${this._name}] ${message}`);
    }
  }

  name(str) {
    this._name = str;
  }

  get(key) {
    return this._data[key];
  }

  set(key, value) {
    this._data[key] = value;
    return this;
  }

  has(key) {
    return key in this._data;
  }

  del(key) {
    delete this._data[key];
  }

  push(key, value) {
    if (this._data[key] && this._data[key].push) {
      this._data[key].push(value);
    }
  }

  shift(key) {
    if (this._data[key] && this._data[key].shift) {
      return this._data[key].shift();
    }
  }

  length(key) {
    if (this._data[key] && this._data[key].length) {
      return this._data[key].length;
    }
  }

  command(name, permissionString, action) {
    const cmd = {
      name,
      permissionString,
      action,
    };

    this._commands.push(cmd);
  }

  checkPermission(message, permStr) {
    if (!message.member) return false;
    else {
      if (permStr === '*') {
          return true;
      } else {
        if (message.member.roles.exists('name', permStr)) {
          return true;
        } else {
          return false;
        }
      }
    }
  }

  onReaction(reaction, user, bot) {
    this.emit('reaction', reaction, user, bot);
  }

  onLoad(bot) {
    this.emit('load', bot);
  }

  onMessage(message, bot) {
    this.emit('rawMessage', bot, message);

    const data = message.content.split(' ');
    if (data.length >= 2) {
      const id = data[0];
      const cmdName = data[1].slice(1);
      const cmdContent = data.slice(2).join(' ');

      if (`<@!${bot.user.id}>` === id) {
        this.emit('message', bot, message);

        this._commands
          .filter(cmd => cmd.name === cmdName)
          .filter(cmd => this.checkPermission(message, cmd.permissionString))
          .map(cmd => cmd.action.call(this, cmdContent, bot, message));
      }
    }
  }
}

export const createExtension = creatorFn => {
  const e = new Extension();

  creatorFn(e);

  return e;
};
