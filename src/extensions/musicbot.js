import ytdl from 'ytdl-core';
import moment from 'moment';
import 'moment-duration-format';

import { spawn } from 'child_process';

import retext from 'retext';
import emoji from 'retext-emoji';
import { createExtension } from './extension.js';

const getEmoji = (t) => String(retext().use(emoji, { convert: 'encode' }).processSync(`:${t}:`));
const getSongString = (emoji, title, url, duration, user) => `:${emoji}: **${title}** [${moment.duration(Number(duration), 'seconds').format()}] \n :black_small_square: <${url}> \n :black_small_square: ${user}`;

const youtubeRegex = /(http:|https:)?\/\/(www\.)?(youtube.com|youtu.be)\/(watch)?(\?v=)?(\S+)?/;
const userflakeRegex = /<@!([^>])>/;

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
      message.channel.send(`:arrow_heading_down: **${channel.name}**`);
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
        const str = getSongString('asterisk', info.title, data.url, info.length_seconds, user);
        reaction.message.channel.send(str).then(msg => {
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
      if (err) {
        console.log(err);
        message.channel.send(`:octagonal_sign: Ta piosenka nie może zostać odtworzona z powodu polityki Youtube. \n :black_small_square: <${content}> \n :black_small_square: ${message.author}`);
        return resolve();
      }

      message.delete();
      const str = getSongString('asterisk', info.title, content, info.length_seconds, message.author);
      message.channel.send(str).then(msg => {
        this.db().insert({ cid: msg.channel.id, mid: msg.id, url: content, author: message.author.id }).then(doc => {});
        this.push('queue', { songUrl: content, msg, info, author: message.author });
        resolve();
      });
    });
  }).catch(err => {
    message.delete();
    message.channel.send(`:octagonal_sign: <${content}>`);
  });
}

function pauseSong(bot, message) {
  return new Promise((resolve, reject) => {
    if (this.has('currentData')) {
      const data = this.get('currentData');

      message.delete();
      const str = getSongString('pause_button', data.info.title, data.songUrl, data.info.length_seconds, data.author);
      data.msg.edit(str).then(msg => {
        this.get('currentSong').pause();
      });
    }
  });
}

function skipSong(content, bot, message) {
  return new Promise((resolve, reject) => {
    if (this.has('currentData')) {
      const data = this.get('currentData');

      message.delete();
      const str = getSongString('pause_button', data.info.title, data.songUrl, data.info.length_seconds, data.author);
      data.msg.edit(str).then(msg => {
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
      const str = getSongString('arrow_forward', data.info.title, data.songUrl, data.info.length_seconds, data.author);
      data.msg.edit(str).then(msg => {
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

    const str = getSongString('arrow_forward', info.title, songUrl, info.length_seconds, author);
    msg.edit(str).then(msg => {
      let youtubeStream;
      try {
        youtubeStream = ytdl(songUrl);
      } catch(e) {
        console.log(123, e);
      }
      const dispatcher = connection.playStream(youtubeStream, { volume: 0.5 });
      this.set('currentSong', dispatcher);
      this.set('currentData', { songUrl, info, msg, author });

      youtubeStream.on('error', err => {
        console.log(err);
        message.channel.send(`:x: Wystąpił nieoczekiwany błąd. Ups! \n :link: ${songUrl}`);
        this.del('currentSong');
        this.del('currentData');
        return resolve();
      });

      dispatcher.on('error', err => {
        console.log(err);
        msg.edit(`:heavy_check_mark: **${info.title}** \n :link: <${songUrl}> \n :point_right: ${author}`).then(() => resolve());
      });

      dispatcher.once('end', () => {
        this.del('currentSong');
        this.del('currentData');

        const str = getSongString('record_button', info.title, songUrl, info.length_seconds, author);
        msg.edit(str).then(() => {
          if (this.length('queue') > 0) {
            return playSong.call(this, connection, bot, message).then(resolve);
          } else {
            resolve();
          }
        });
      });
    }).catch(err => console.log(5552, err));
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

function saySentence(content, bot, message) {
  const p = spawn(`C:\\Program Files (x86)\\eSpeak\\command_line\\espeak.exe`, [ '-vpl', '-g2', '-w', './out.wav', `"${content}"` ]);
  p.on('close', code => {
    message.delete();
    if (this.has('currentSong')) {
      const song = this.get('currentSong');
      song.pause();
      const connection = this.get('voiceConnection');
      const dispatcher = connection.playFile('./out.wav');

      dispatcher.on('end', () => {
        song.resume();
      });
    } else {
      const connection = this.get('voiceConnection');
      const dispatcher = connection.playFile('./out.wav');
    }
  });
}

function shuffleArray(array) {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
    return array;
}

const playlistTypes = [ , '%F0%9F%92%9B', '%F0%9F%92%9A', '%F0%9F%92%99', '%F0%9F%92%9C' ];

export const MusicExtension = createExtension(e => {
  e.name('MusicBot-' + process.env.name);
  e.db();

  e.set('queue', []);

  e.on('load', function(bot) {
    this.log('Ready to go!');
  });

  e.on('reaction', function(reaction, user, bot) {
    if (reaction.message.author.id === bot.user.id) {
      if (reaction.emoji.identifier === '%E2%9D%A4') {
        this.db().find({ mid: reaction.message.id }).then(docs => {
          const doc = docs[0];
          ytdl.getInfo(doc.url, (err, info) => {
            this.db().insert({
              type: 'fav',
              uid: user.id,
              url: doc.url,
              title: info.title,
              aAt: Date.now()
            }).then(doc => {
              user.send(`Hi! I have added song **${info.title}** to your favourites!`);
            });
          });
        });
      } else if (reaction.emoji.identifier === '%F0%9F%94%81') {
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
    }


    // if (reaction.emoji.identifier === '%F0%9F%94%81') {
    //   this.db().find({ mid: reaction.message.id }).then(docs => {
    //     reaction.remove();
    //     if (docs.length > 0) {
    //       const data = docs[0];
    //       repeatSong.call(this, data, user, bot, reaction).then(() => {
    //         if (!this.has('currentSong')) {
    //           const connection = this.get('voiceConnection') || bot.voiceConnections.first();
    //           playSong.call(this, connection, bot, reaction.message);
    //         }
    //       }).catch(err => console.log(err));
    //     }
    //   });
    // }
  });

  e.command('join', 'DJ', joinVoiceChannel);

  e.on('rawMessage', function(bot, message) {
    if (message.channel.name === 'bot' && !message.member.roles.exists('name', 'Bot Wielofunkcyjny')) {
      message.delete();
    }
  });

  e.on('message', function(bot, message) {
    if (youtubeRegex.test(message.content)) {
      const url = youtubeRegex.exec(message.content)[0];
      const data = message.content.split(' ');

      const uid = data[0];
      if (`<@!${bot.user.id}>` === uid) {
        handlePlay.call(this, url, bot, message);
      }
    }
  });

  e.command('teams', 'DJ', function(content, bot, message) {
    const players = content.split(' ');
    const shuffled = shuffleArray(players.slice(0));

    const team1 = shuffled.splice(0, shuffled.length / 2);
    const team2 = shuffled;
    message.channel.send(`Drużyna 1: ${team1.join(', ')}\nDrużyna 2: ${team2.join(', ')}`);
  });

  e.command('notify', 'DJ', function(content, bot, message) {
    message.channel.send(`:information_source: ${content}`);
  });

  e.command('pause', 'DJ', function(content, bot, message) {
    pauseSong.call(this, bot, message).catch(err => console.log(err));
  });

  e.command('say', 'DJ', function(content, bot, message) {
    saySentence.call(this, content, bot, message);
  });

  e.command('resume', 'DJ', function(content, bot, message) {
    resumeSong.call(this, bot, message).catch(err => console.log(err));
  });

  e.command('skip', 'DJ', function(content, bot, message) {
    skipSong.call(this, content, bot, message).catch(err => console.log(err));
  });

  e.command('help', 'DJ', function(content, bot, message) {
    message.delete();
    message.channel.send(`Komendy do muzyki: \n **!join <channel>** - dołącz bota do kanału (można przenosić manualnie) \n **!play <url>** - dodaj piosenkę do kolejki \n **!pause** i **!resume** - pauzuj i kontynuuj odtwarzanie \n **!skip** - przejdź do następnej piosenki w kolejce \n\n Dodaj reakcję :repeat: (repeat) do piosenki, a bot doda ją ponownie do kolejki!`);
  });

});
