import ytdl from 'ytdl-core';
import moment from 'moment';
import 'moment-duration-format';

import retext from 'retext';
import emoji from 'retext-emoji';
import { createExtension } from './extension.js';

const getEmoji = (t) => String(retext().use(emoji, { convert: 'encode' }).processSync(`:${t}:`));

function joinVoiceChannel(content, bot, message) {
  const voiceChannels = message.channel.guild.channels
    .filter(c => c.type === 'voice');

  let channel;
  if (content === '') {
    channel = voiceChannels.first();
  } else {
    channel = voiceChannels.find('name', content);
  }

  if (channel) {
    this.log(`Trying to join channel ${channel.name}...`);

    return channel.join().then(connection => {
      message.channel.send(`:door: **${channel.name}**`);
      message.delete();
      this.log(`Joined channel ${channel.name}!`);
      this.set('voiceConnection', connection);
    }).catch(err => {
      console.log(err);
    });
  } else {
    this.log(`Channel ${content} was not found.`);
  }
}

function repeatSong(data, user, bot, reaction) {
  return new Promise((resolve, reject) => {
    ytdl.getInfo(data.url, (err, info) => {
      bot.fetchUser(data.author).then(author => {
        reaction.message.channel.send(`:heavy_plus_sign: **${info.title}** \n :link: <${data.url}> \n :point_right: ${user}`).then(msg => {
          reaction.remove(user).catch(err => console.log(err));
          this.db().insert({ cid: msg.channel.id, mid: msg.id, url: data.url, author: user.id });
          this.push('queue', { songUrl: data.url, msg, info, author: user });
          resolve();
        }).catch(err => console.log(err));
      });
    });
  });
}

function addSong(content, bot, message) {
  return new Promise((resolve, reject) => {
    ytdl.getInfo(content, (err, info) => {
      message.delete();
      message.channel.send(`:heavy_plus_sign: **${info.title}** \n :link: <${content}> \n :point_right: ${message.author}`).then(msg => {
        this.db().insert({ cid: msg.channel.id, mid: msg.id, url: content, author: message.author.id });
        this.push('queue', { songUrl: content, msg, info, author: message.author });
        resolve();
      });
    });
  }).catch(err => {
    message.delete();
    message.channel.send(`:x: <${content}>`);
  });
}

function pauseSong(bot, message) {
  return new Promise((resolve, reject) => {
    if (this.has('currentData')) {
      const data = this.get('currentData');

      message.delete();
      data.msg.edit(`:pause_button: **${data.info.title}** \n :link: <${data.songUrl}> \n :point_right: ${data.author}`).then(msg => {
        this.get('currentSong').pause();
      });
    }
  });
}

function skipSong(bot, message) {
  return new Promise((resolve, reject) => {
    if (this.has('currentData')) {
      const data = this.get('currentData');

      message.delete();
      data.msg.edit(`:fast_forward: **${data.info.title}** \n :link: <${data.songUrl}> \n :point_right: ${data.author}`).then(msg => {
        this.get('currentSong').end();
      });
    }
  });
}

function resumeSong(bot, message) {
  return new Promise((resolve, reject) => {
    if (this.has('currentData')) {
      const data = this.get('currentData');

      message.delete();
      data.msg.edit(`:arrow_forward: **${data.info.title}** \n :link: <${data.songUrl}> \n :point_right: ${data.author}`).then(msg => {
        this.get('currentSong').resume();
      });
    }
  });
}

function playSong(connection, bot, message) {
  return new Promise((resolve, reject) => {
    const { songUrl, info, msg, author } = this.shift('queue');

    const duration = moment.duration(Number(info.length_seconds), 'seconds').format();
    this.log(`Playing a song "${info.title} [${duration}]"`);

    msg.edit(`:arrow_forward: **${info.title}** \n :link: <${songUrl}> \n :point_right: ${author}`).then(msg => {
      const youtubeStream = ytdl(songUrl);
      const dispatcher = connection.playStream(youtubeStream, { volume: 0.5 });
      this.set('currentSong', dispatcher);
      this.set('currentData', { songUrl, info, msg, author });

      youtubeStream.on('error', err => {
        console.log(err);
      });

      dispatcher.on('error', err => {
        console.log(err);
        msg.edit(`:heavy_check_mark: **${info.title}** \n :link: <${songUrl}> \n :point_right: ${author}`).then(() => resolve());
      });

      dispatcher.once('end', () => {
        this.del('currentSong');
        this.del('currentData');

        msg.edit(`:heavy_check_mark: **${info.title}** \n :link: <${songUrl}> \n :point_right: ${author}`).then(() => {
          if (this.length('queue') > 0) {
            return playSong.call(this, connection, bot, message).then(resolve);
          } else {
            resolve();
          }
        });
      });
    }).catch(err => console.log(err));
  });
}

function handlePlay(content, bot, message) {
  const connection = this.get('voiceConnection');

  if (!connection) {
    joinVoiceChannel.call(this, '', bot, message).then(() => {
      handlePlay.call(this, content, bot, message);
    });
  } else {
    if (content) {
      addSong.call(this, content, bot, message).then(() => {
        if (!this.has('currentSong')) {
          playSong.call(this, connection, bot, message);
        }
      }).catch(err => console.log(err));
    }
  }
}


export const MusicExtension = createExtension(e => {
  e.name('MusicBot');
  e.db();

  e.set('queue', []);

  e.on('load', function(bot) {
    this.log('Ready to go!');
  });

  e.on('reaction', function(reaction, user, bot) {
    if (reaction.emoji.identifier === '%F0%9F%94%81') {
      this.db().find({ mid: reaction.message.id }).then(docs => {
        reaction.remove();
        if (docs.length > 0) {
          const data = docs[0];
          repeatSong.call(this, data, user, bot, reaction).then(() => {
            if (!this.has('currentSong')) {
              const connection = this.get('voiceConnection') || bot.voiceConnections.first();
              playSong.call(this, connection, bot, reaction.message);
            }
          }).catch(err => console.log(err));
        }
      });
    }
  });

  e.command('join', 'DJ', joinVoiceChannel);
  e.command('play', 'DJ', handlePlay);

  e.command('pause', 'DJ', function(content, bot, message) {
    pauseSong.call(this, bot, message).catch(err => console.log(err));
  });

  e.command('resume', 'DJ', function(content, bot, message) {
    resumeSong.call(this, bot, message).catch(err => console.log(err));
  });

  e.command('skip', 'DJ', function(content, bot, message) {
    skipSong.call(this, bot, message).catch(err => console.log(err));
  });

  e.command('help', 'DJ', function(content, bot, message) {
    message.delete();
    message.channel.send(`Komendy do muzyki: \n **!join <channel>** - dołącz bota do kanału (można przenosić manualnie) \n **!play <url>** - dodaj piosenkę do kolejki \n **!pause** i **!resume** - pauzuj i kontynuuj odtwarzanie \n **!skip** - przejdź do następnej piosenki w kolejce \n\n Dodaj reakcję :repeat: (repeat) do piosenki, a bot doda ją ponownie do kolejki!`);
  });

});
