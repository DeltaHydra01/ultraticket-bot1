// src/dashboard/server.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { GuildConfig, Categories, Panels, Tickets, Blacklist, StaffStats } = require('../database/db');
const { createTranscript, transcriptsDir } = require('../bot/utils/transcript');

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3000;

// ── MIDDLEWARE ─────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, skip: (req) => req.isAuthenticated() });
app.use('/api', limiter);

app.use(session({
  secret: process.env.SESSION_SECRET || 'ultraticket-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// ── PASSPORT DISCORD OAUTH2 ────────────────────────────────────────────────────
passport.use(new DiscordStrategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: `${process.env.DASHBOARD_URL}/auth/discord/callback`,
  scope: ['identify', 'guilds']
}, (accessToken, refreshToken, profile, done) => {
  profile.accessToken = accessToken;
  return done(null, profile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

app.use(passport.initialize());
app.use(passport.session());

// ── AUTH MIDDLEWARE ────────────────────────────────────────────────────────────
function ensureAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/login');
}

async function ensureGuildAdmin(req, res, next) {
  const { guildId } = req.params;
  if (!guildId) return res.status(400).json({ error: 'Guild ID requerido' });

  try {
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${req.user.accessToken}` }
    });
    const guild = guildsRes.data.find(g => g.id === guildId);
    if (!guild) return res.status(403).json({ error: 'No eres miembro de este servidor' });
    const perms = BigInt(guild.permissions);
    if (!(perms & BigInt(0x20)) && !(perms & BigInt(0x8))) {
      return res.status(403).json({ error: 'No tienes permisos de administrador en este servidor' });
    }
    req.guild = guild;
    next();
  } catch {
    res.status(403).json({ error: 'Error verificando permisos' });
  }
}

// ── AUTH ROUTES ────────────────────────────────────────────────────────────────
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/login?error=1' }),
  (req, res) => res.redirect('/dashboard')
);
app.get('/auth/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

// ── PAGE ROUTES ────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));
app.get('/dashboard', ensureAuth, (req, res) => res.sendFile(path.join(__dirname, 'public/dashboard.html')));
app.get('/dashboard/:guildId', ensureAuth, (req, res) => res.sendFile(path.join(__dirname, 'public/guild.html')));
app.get('/dashboard/:guildId/tickets', ensureAuth, (req, res) => res.sendFile(path.join(__dirname, 'public/tickets.html')));
app.get('/transcripts/:filename', ensureAuth, (req, res) => {
  const file = path.join(transcriptsDir, req.params.filename);
  if (!fs.existsSync(file)) return res.status(404).send('Transcripción no encontrada');
  res.sendFile(file);
});

// ── API: USER ──────────────────────────────────────────────────────────────────
app.get('/api/user', ensureAuth, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username, avatar: req.user.avatar, discriminator: req.user.discriminator });
});

app.get('/api/guilds', ensureAuth, async (req, res) => {
  try {
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${req.user.accessToken}` }
    });
    const adminGuilds = guildsRes.data.filter(g => {
      const perms = BigInt(g.permissions);
      return (perms & BigInt(0x20)) || (perms & BigInt(0x8));
    }).map(g => ({
      id: g.id, name: g.name, icon: g.icon,
      iconURL: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null
    }));
    res.json(adminGuilds);
  } catch {
    res.status(500).json({ error: 'Error obteniendo servidores' });
  }
});

// ── API: GUILD CONFIG ──────────────────────────────────────────────────────────
app.get('/api/guilds/:guildId/config', ensureAuth, ensureGuildAdmin, (req, res) => {
  const config = GuildConfig.getOrCreate(req.params.guildId);
  res.json(config);
});

app.put('/api/guilds/:guildId/config', ensureAuth, ensureGuildAdmin, (req, res) => {
  const allowed = ['log_channel', 'transcript_channel', 'max_tickets_per_user', 'auto_close_hours',
    'dm_on_open', 'dm_on_close', 'ping_staff', 'require_topic'];
  const data = {};
  for (const key of allowed) if (req.body[key] !== undefined) data[key] = req.body[key];
  const config = GuildConfig.update(req.params.guildId, data);
  res.json(config);
});

// ── API: CATEGORIES ────────────────────────────────────────────────────────────
app.get('/api/guilds/:guildId/categories', ensureAuth, ensureGuildAdmin, (req, res) => {
  const cats = Categories.getAll(req.params.guildId);
  res.json(cats.map(c => ({ ...c, support_roles: JSON.parse(c.support_roles || '[]') })));
});

app.post('/api/guilds/:guildId/categories', ensureAuth, ensureGuildAdmin, (req, res) => {
  const cat = Categories.create({ ...req.body, guild_id: req.params.guildId });
  res.json({ ...cat, support_roles: JSON.parse(cat.support_roles || '[]') });
});

app.put('/api/guilds/:guildId/categories/:id', ensureAuth, ensureGuildAdmin, (req, res) => {
  const cat = Categories.update(req.params.id, req.body);
  res.json({ ...cat, support_roles: JSON.parse(cat.support_roles || '[]') });
});

app.delete('/api/guilds/:guildId/categories/:id', ensureAuth, ensureGuildAdmin, (req, res) => {
  Categories.delete(req.params.id);
  res.json({ success: true });
});

// ── API: TICKETS ───────────────────────────────────────────────────────────────
app.get('/api/guilds/:guildId/tickets', ensureAuth, ensureGuildAdmin, (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const filters = { limit: parseInt(limit) };
  if (status) filters.status = status;
  const tickets = Tickets.getAll(req.params.guildId, filters);
  const stats = Tickets.getStats(req.params.guildId);
  res.json({ tickets, stats });
});

app.get('/api/guilds/:guildId/tickets/:id', ensureAuth, ensureGuildAdmin, (req, res) => {
  const ticket = Tickets.getById(req.params.id);
  if (!ticket || ticket.guild_id !== req.params.guildId) return res.status(404).json({ error: 'No encontrado' });
  const category = Categories.getById(ticket.category_id);
  res.json({ ticket, category });
});

app.get('/api/guilds/:guildId/tickets/:id/transcript', ensureAuth, ensureGuildAdmin, async (req, res) => {
  const ticket = Tickets.getById(req.params.id);
  if (!ticket || ticket.guild_id !== req.params.guildId) return res.status(404).json({ error: 'No encontrado' });
  const category = Categories.getById(ticket.category_id);
  const { filepath, filename } = await createTranscript(ticket, category, { name: req.guild?.name, id: req.params.guildId });
  res.download(filepath, filename);
});

// ── API: STATS ─────────────────────────────────────────────────────────────────
app.get('/api/guilds/:guildId/stats', ensureAuth, ensureGuildAdmin, (req, res) => {
  const stats = Tickets.getStats(req.params.guildId);
  const topStaff = StaffStats.getTop(req.params.guildId, 5);
  res.json({ stats, topStaff });
});

// ── API: BLACKLIST ─────────────────────────────────────────────────────────────
app.get('/api/guilds/:guildId/blacklist', ensureAuth, ensureGuildAdmin, (req, res) => {
  res.json(Blacklist.getAll(req.params.guildId));
});

app.post('/api/guilds/:guildId/blacklist', ensureAuth, ensureGuildAdmin, (req, res) => {
  const { user_id, reason } = req.body;
  Blacklist.add(req.params.guildId, user_id, reason, req.user.id);
  res.json({ success: true });
});

app.delete('/api/guilds/:guildId/blacklist/:userId', ensureAuth, ensureGuildAdmin, (req, res) => {
  Blacklist.remove(req.params.guildId, req.params.userId);
  res.json({ success: true });
});

// ── START ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🌐 Dashboard iniciado en http://localhost:${PORT}`);
});

module.exports = app;
