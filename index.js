const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalBlock } } = require('mineflayer-pathfinder');
const { status } = require('minecraft-server-util');
const { Vec3 } = require('vec3');
const express = require('express');
const config = require('./settings.json');

const app = express();
const host = config.server.ip;
const port = config.server.port;

app.get('/', (_, res) => res.send('Bot running'));
app.listen(8000, () => console.log('Web server started on port 8000'));

let bot = null;
let botJoining = false;
let reconnecting = false;
let quitting = false;
let realPlayerDetected = false;

function checkPlayers() {
  if (botJoining) return;

  status(host, port, { timeout: 5000, enableSRV: true }).then(response => {
    const online = response.players.online;
    console.log(`[${new Date().toLocaleTimeString()}] Players Online: ${online}`);

    if (online > 1) realPlayerDetected = true;

    if (bot && realPlayerDetected && online === 2) {
      console.log('[INFO] Real player joined. Quitting bot...');
      bot.quit();
      bot = null;
      return;
    }

    if (!bot && online === 0) {
      console.log('[INFO] No players online. Starting bot...');
      botJoining = true;
      realPlayerDetected = false;
      setTimeout(() => createBot(), 5000);
    }

  }).catch(err => {
    console.error('Status check error:', err.message);
  });
}

function createBot() {
  try {
    bot = mineflayer.createBot({
      username: "mhodev",
      password: config["bot-account"].password,
      auth: config["bot-account"].type || 'mojang',
      host,
      port,
      version: config.server.version
    });

    botJoining = false;
    reconnecting = false;
    quitting = false;

    bot.loadPlugin(pathfinder);

    bot.once('spawn', () => {
      console.log('\x1b[33m[Bot] Joined the server\x1b[0m');

      if (config.utils["anti-afk"].enabled && config.utils["anti-afk"].sneak)
        bot.setControlState('sneak', true);

      bot.setControlState('forward', true);
      bot.setControlState('jump', true);

      setInterval(() => {
        const yaw = Math.random() * Math.PI * 2;
        const pitch = (Math.random() - 0.5) * Math.PI;
        bot.look(yaw, pitch, true);
      }, 5000);

      setInterval(() => {
        bot.setQuickBarSlot(Math.floor(Math.random() * 9));
      }, 7000);

      if (config["movement-area"].enabled) {
        const area = config["movement-area"];
        const center = area.center;
        const range = area.range;
        const interval = area.interval * 1000;

        const mcData = require('minecraft-data')(bot.version);
        const defaultMove = new Movements(bot, mcData);
        bot.pathfinder.setMovements(defaultMove);

        const getSafeY = (x, z) => {
          for (let y = 256; y > 0; y--) {
            const block = bot.blockAt(new Vec3(x, y, z));
            if (block && block.boundingBox !== 'empty') return y + 1;
          }
          return center.y;
        };

        const moveRandom = () => {
          const x = center.x + Math.floor((Math.random() - 0.5) * range * 2);
          const z = center.z + Math.floor((Math.random() - 0.5) * range * 2);
          const y = getSafeY(x, z);
          bot.pathfinder.setGoal(new GoalBlock(x, y, z));
          setTimeout(moveRandom, interval);
        };

        moveRandom();
      }

      if (config.utils["chat-messages"].enabled) {
        const messages = config.utils["chat-messages"].messages;

        if (config.utils["chat-messages"].repeat) {
          const delay = config.utils["chat-messages"]["repeat-delay"] * 1000;
          let i = 0;

          setInterval(() => {
            bot.chat(messages[i]);
            i = (i + 1) % messages.length;
          }, delay);
        } else {
          messages.forEach(msg => bot.chat(msg));
        }
      }

      if (config.utils["chat-log"]) {
        bot.on('chat', (username, message) => {
          if (username !== bot.username)
            console.log(`[Chat][${username}] ${message}`);
        });
      }
    });

    bot.on('chat', (username, message) => {
      if (message === 'quit' && !reconnecting) {
        reconnecting = true;
        quitting = true;
        bot.quit();
      }
    });

    bot.on('end', () => {
      if (!realPlayerDetected && !quitting && config.utils["auto-reconnect"]) {
        setTimeout(() => {
          console.log('[Bot] Attempting reconnect...');
          createBot();
        }, config.utils["auto-reconnect-delay"] || 10000);
      }
    });

    bot.on('kicked', reason => {
      console.log(`[Bot] Kicked: ${reason}`);
    });

    bot.on('error', err => {
      console.error(`[Bot] Error: ${err.message}`);
    });

  } catch (err) {
    console.error(`[Bot Creation Error] ${err.message}`);
  }
}

setInterval(checkPlayers, 2000);
checkPlayers();
