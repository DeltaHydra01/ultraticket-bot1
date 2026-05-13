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
const { saveGuildConfig, getGuildConfig } = require('../database/config');

module.exports = (client) => {

const app = express();
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ─────────────────────────────────────────────────
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

// ── PASSPORT ───────────────────────────────────────────────────
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

// ── AUTH ───────────────────────────────────────────────────────
function ensureAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/login');
}

async function ensureGuildAdmin(req, res, next) {
  const { guildId } = req.params;

  try {
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${req.user.accessToken}` }
    });

    const guild = guildsRes.data.find(g => g.id === guildId);
    if (!guild) return res.status(403).json({ error: 'No eres miembro' });

    const perms = BigInt(guild.permissions);
    if (!(perms & BigInt(0x20)) && !(perms & BigInt(0x8))) {
      return res.status(403).json({ error: 'No admin' });
    }

    req.guild = guild;
    next();
  } catch {
    res.status(403).json({ error: 'Error permisos' });
  }
}

// ── AUTH ROUTES ────────────────────────────────────────────────
app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/login' }),
  (req, res) => res.redirect('/dashboard')
);

app.get('/auth/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

// ── PAGES ──────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));
app.get('/dashboard', ensureAuth, (req, res) => res.sendFile(path.join(__dirname, 'public/dashboard.html')));
app.get('/dashboard/:guildId', ensureAuth, (req, res) => res.sendFile(path.join(__dirname, 'public/guild.html')));

// ── API USER ───────────────────────────────────────────────────
app.get('/api/user', ensureAuth, (req, res) => {
  res.json(req.user);
});

app.get('/api/guilds', ensureAuth, async (req, res) => {
  const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', {
    headers: { Authorization: `Bearer ${req.user.accessToken}` }
  });

  const guilds = guildsRes.data.filter(g => {
    const perms = BigInt(g.permissions);
    return (perms & BigInt(0x20)) || (perms & BigInt(0x8));
  });

  res.json(guilds);
});

// ── 🔥 NUEVO: CANALES ──────────────────────────────────────────
app.get('/api/guilds/:guildId/channels', ensureAuth, ensureGuildAdmin, (req, res) => {
  const guild = client.guilds.cache.get(req.params.guildId);
  if (!guild) return res.status(404).json({ error: 'Guild no encontrado' });

  const channels = guild.channels.cache
    .filter(c => c.isTextBased())
    .map(c => ({ id: c.id, name: c.name }));

  res.json(channels);
});

// ── 🔥 NUEVO: GUARDAR CANAL ────────────────────────────────────
app.post('/api/guilds/:guildId/transcript-channel', ensureAuth, ensureGuildAdmin, async (req, res) => {
  const { channelId } = req.body;

  await saveGuildConfig(req.params.guildId, {
    transcript_channel_id: channelId
  });

  res.json({ success: true });
});

// ── 🔥 NUEVO: OBTENER CANAL ────────────────────────────────────
app.get('/api/guilds/:guildId/transcript-channel', ensureAuth, ensureGuildAdmin, async (req, res) => {
  const config = await getGuildConfig(req.params.guildId);
  res.json(config || {});
});

// ── START ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🌐 Dashboard en puerto ${PORT}`);
});

};