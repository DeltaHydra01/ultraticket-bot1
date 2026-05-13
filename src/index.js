// src/index.js — UltraTicket Bot
require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection, REST, Routes, Events } = require('discord.js');
const { Messages, Tickets } = require('./database/db');
const { handleButton, handleSelectMenu, handleModal } = require('./bot/handlers/interactionHandler');
const commands = require('./bot/commands/index');

// Initialize DB
require('./database/migrations');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.Message]
});

client.commands = new Collection();
for (const cmd of commands) client.commands.set(cmd.data.name, cmd);

// ── READY ──────────────────────────────────────────────────────────────────────
client.once(Events.ClientReady, async (c) => {
  console.log(`\n🎫 UltraTicket Bot iniciado como ${c.user.tag}`);
  console.log(`📊 Servidores: ${c.guilds.cache.size}`);
  console.log(`🌐 Dashboard: ${process.env.DASHBOARD_URL || 'http://localhost:3000'}\n`);
  c.user.setActivity('🎫 /panel | UltraTicket', { type: 3 });

  // Register slash commands globally
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
      body: commands.map(c => c.data.toJSON())
    });
    console.log('✅ Slash commands registrados');
  } catch (err) {
    console.error('❌ Error registrando commands:', err.message);
  }
});

// ── INTERACTIONS ───────────────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd) await cmd.execute(interaction);
    } else if (interaction.isButton()) {
      await handleButton(interaction);
    } else if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModal(interaction);
    }
  } catch (err) {
    console.error('Error en interaction:', err);
    const reply = { content: '❌ Ocurrió un error.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      interaction.followUp(reply).catch(() => {});
    } else {
      interaction.reply(reply).catch(() => {});
    }
  }
});

// ── MESSAGE LOGGING (for transcripts) ─────────────────────────────────────────
client.on(Events.MessageCreate, (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const ticket = Tickets.getByChannel(message.channelId);
  if (!ticket) return;

  Tickets.updateActivity(message.channelId);

  Messages.add({
    ticket_id: ticket.id,
    author_id: message.author.id,
    author_tag: message.author.tag,
    author_avatar: message.author.avatar,
    content: message.content,
    attachments: message.attachments.map(a => ({ name: a.name, url: a.url, size: a.size })),
    embeds: message.embeds.map(e => ({ title: e.title, description: e.description, color: e.color })),
    message_id: message.id
  });
});

// ── AUTO-CLOSE INACTIVE TICKETS ───────────────────────────────────────────────
setInterval(async () => {
  const { GuildConfig, db } = require('./database/db');
  const guilds = db.prepare("SELECT guild_id, auto_close_hours FROM guild_config WHERE auto_close_hours > 0").all();

  for (const guildConfig of guilds) {
    const hours = guildConfig.auto_close_hours;
    const threshold = Math.floor(Date.now() / 1000) - (hours * 3600);
    const staleTickets = db.prepare(`
      SELECT * FROM tickets WHERE guild_id = ? AND status = 'open' AND last_activity < ?
    `).all(guildConfig.guild_id, threshold);

    for (const ticket of staleTickets) {
      try {
        const guild = client.guilds.cache.get(guildConfig.guild_id);
        if (!guild) continue;
        const channel = guild.channels.cache.get(ticket.channel_id);
        if (channel) {
          const { EmbedBuilder } = require('discord.js');
          await channel.send({
            embeds: [new EmbedBuilder()
              .setColor(0xFEE75C)
              .setDescription(`⏰ Este ticket se cerrará automáticamente por inactividad en **5 minutos**.`)
            ]
          });
          setTimeout(async () => {
            try {
              const { closeTicket } = require('./bot/handlers/ticketHandler');
              // Simulate a close
              Tickets.close(ticket.id, 'Cerrado automáticamente por inactividad', client.user.id);
              await channel.delete().catch(() => {});
            } catch {}
          }, 5 * 60 * 1000);
        }
      } catch {}
    }
  }
}, 30 * 60 * 1000); // Check every 30 minutes

// ── START ──────────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('❌ No se pudo iniciar el bot:', err.message);
  process.exit(1);
});

// Start dashboard alongside bot
if (process.env.START_DASHBOARD !== 'false') {
  require('./dashboard/server');
}

module.exports = client;
