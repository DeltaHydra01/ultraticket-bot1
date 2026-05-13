// src/database/db.js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const dbPath = process.env.DATABASE_PATH || './data/tickets.db';
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── GUILD CONFIG ──────────────────────────────────────────────────────────────
const GuildConfig = {
  get(guildId) {
    return db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId);
  },
  getOrCreate(guildId) {
    let config = this.get(guildId);
    if (!config) {
      db.prepare('INSERT OR IGNORE INTO guild_config (guild_id) VALUES (?)').run(guildId);
      config = this.get(guildId);
    }
    return config;
  },
  update(guildId, data) {
    const config = this.getOrCreate(guildId);
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(data), guildId];
    db.prepare(`UPDATE guild_config SET ${fields}, updated_at = strftime('%s','now') WHERE guild_id = ?`).run(...values);
    return this.get(guildId);
  },
  incrementCounter(guildId) {
    this.getOrCreate(guildId);
    db.prepare('UPDATE guild_config SET ticket_counter = ticket_counter + 1 WHERE guild_id = ?').run(guildId);
    return db.prepare('SELECT ticket_counter FROM guild_config WHERE guild_id = ?').get(guildId).ticket_counter;
  }
};

// ── CATEGORIES ────────────────────────────────────────────────────────────────
const Categories = {
  getAll(guildId) {
    return db.prepare('SELECT * FROM ticket_categories WHERE guild_id = ? ORDER BY position ASC').all(guildId);
  },
  getEnabled(guildId) {
    return db.prepare('SELECT * FROM ticket_categories WHERE guild_id = ? AND enabled = 1 ORDER BY position ASC').all(guildId);
  },
  getById(id) {
    return db.prepare('SELECT * FROM ticket_categories WHERE id = ?').get(id);
  },
  create(data) {
    const stmt = db.prepare(`
      INSERT INTO ticket_categories (guild_id, name, description, emoji, category_channel, support_roles, welcome_message, close_message, color, naming_scheme, position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.guild_id, data.name, data.description || null, data.emoji || '🎫',
      data.category_channel || null, JSON.stringify(data.support_roles || []),
      data.welcome_message || 'Gracias por abrir un ticket. Un miembro del staff te atenderá pronto.',
      data.close_message || 'Tu ticket ha sido cerrado.',
      data.color || '#5865F2', data.naming_scheme || 'ticket-{id}',
      data.position || 0
    );
    return this.getById(result.lastInsertRowid);
  },
  update(id, data) {
    if (data.support_roles) data.support_roles = JSON.stringify(data.support_roles);
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE ticket_categories SET ${fields} WHERE id = ?`).run(...Object.values(data), id);
    return this.getById(id);
  },
  delete(id) {
    db.prepare('DELETE FROM ticket_categories WHERE id = ?').run(id);
  }
};

// ── PANELS ────────────────────────────────────────────────────────────────────
const Panels = {
  getAll(guildId) {
    return db.prepare('SELECT * FROM panels WHERE guild_id = ?').all(guildId);
  },
  getById(id) {
    return db.prepare('SELECT * FROM panels WHERE id = ?').get(id);
  },
  create(data) {
    const stmt = db.prepare(`
      INSERT INTO panels (guild_id, channel_id, title, description, color, thumbnail, image, footer, button_style, categories, type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.guild_id, data.channel_id, data.title, data.description,
      data.color || '#5865F2', data.thumbnail || null, data.image || null,
      data.footer || null, data.button_style || 'PRIMARY',
      JSON.stringify(data.categories || []), data.type || 'button'
    );
    return this.getById(result.lastInsertRowid);
  },
  update(id, data) {
    if (data.categories) data.categories = JSON.stringify(data.categories);
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE panels SET ${fields} WHERE id = ?`).run(...Object.values(data), id);
    return this.getById(id);
  },
  delete(id) {
    db.prepare('DELETE FROM panels WHERE id = ?').run(id);
  }
};

// ── TICKETS ───────────────────────────────────────────────────────────────────
const Tickets = {
  getById(id) {
    return db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  },
  getByChannel(channelId) {
    return db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channelId);
  },
  getByUser(guildId, userId) {
    return db.prepare("SELECT * FROM tickets WHERE guild_id = ? AND creator_id = ? AND status = 'open'").all(guildId, userId);
  },
  getAll(guildId, filters = {}) {
    let query = 'SELECT * FROM tickets WHERE guild_id = ?';
    const params = [guildId];
    if (filters.status) { query += ' AND status = ?'; params.push(filters.status); }
    if (filters.creator_id) { query += ' AND creator_id = ?'; params.push(filters.creator_id); }
    if (filters.category_id) { query += ' AND category_id = ?'; params.push(filters.category_id); }
    query += ' ORDER BY created_at DESC';
    if (filters.limit) { query += ' LIMIT ?'; params.push(filters.limit); }
    return db.prepare(query).all(...params);
  },
  create(data) {
    const ticketNumber = GuildConfig.incrementCounter(data.guild_id);
    const stmt = db.prepare(`
      INSERT INTO tickets (ticket_number, guild_id, creator_id, category_id, priority, subject, participants)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      ticketNumber, data.guild_id, data.creator_id,
      data.category_id || null, data.priority || 'medium',
      data.subject || null, JSON.stringify([data.creator_id])
    );
    return this.getById(result.lastInsertRowid);
  },
  update(id, data) {
    if (data.participants) data.participants = JSON.stringify(data.participants);
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE tickets SET ${fields} WHERE id = ?`).run(...Object.values(data), id);
    return this.getById(id);
  },
  close(id, reason, closedBy) {
    db.prepare(`UPDATE tickets SET status = 'closed', close_reason = ?, closed_at = strftime('%s','now'), assigned_to = ? WHERE id = ?`)
      .run(reason || 'Cerrado por staff', closedBy, id);
  },
  delete(id) {
    db.prepare('DELETE FROM ticket_messages WHERE ticket_id = ?').run(id);
    db.prepare('DELETE FROM tickets WHERE id = ?').run(id);
  },
  countOpen(guildId, userId) {
    return db.prepare("SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND creator_id = ? AND status = 'open'").get(guildId, userId).count;
  },
  updateActivity(channelId) {
    db.prepare("UPDATE tickets SET last_activity = strftime('%s','now') WHERE channel_id = ?").run(channelId);
  },
  getStats(guildId) {
    return {
      total: db.prepare('SELECT COUNT(*) as c FROM tickets WHERE guild_id = ?').get(guildId).c,
      open: db.prepare("SELECT COUNT(*) as c FROM tickets WHERE guild_id = ? AND status = 'open'").get(guildId).c,
      closed: db.prepare("SELECT COUNT(*) as c FROM tickets WHERE guild_id = ? AND status = 'closed'").get(guildId).c,
      today: db.prepare("SELECT COUNT(*) as c FROM tickets WHERE guild_id = ? AND created_at >= strftime('%s','now','-1 day')").get(guildId).c,
      avgRating: db.prepare('SELECT AVG(rating) as avg FROM tickets WHERE guild_id = ? AND rating IS NOT NULL').get(guildId).avg || 0,
      byCategory: db.prepare(`
        SELECT tc.name, COUNT(t.id) as count
        FROM tickets t
        LEFT JOIN ticket_categories tc ON t.category_id = tc.id
        WHERE t.guild_id = ?
        GROUP BY t.category_id
      `).all(guildId)
    };
  }
};

// ── MESSAGES ──────────────────────────────────────────────────────────────────
const Messages = {
  add(data) {
    return db.prepare(`
      INSERT INTO ticket_messages (ticket_id, author_id, author_tag, author_avatar, content, attachments, embeds, message_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.ticket_id, data.author_id, data.author_tag, data.author_avatar || null,
      data.content || '', JSON.stringify(data.attachments || []),
      JSON.stringify(data.embeds || []), data.message_id || null
    );
  },
  getByTicket(ticketId) {
    return db.prepare('SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC').all(ticketId);
  }
};

// ── BLACKLIST ─────────────────────────────────────────────────────────────────
const Blacklist = {
  add(guildId, userId, reason, addedBy, expiresAt = null) {
    db.prepare(`
      INSERT OR REPLACE INTO blacklist (guild_id, user_id, reason, added_by, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(guildId, userId, reason, addedBy, expiresAt);
  },
  remove(guildId, userId) {
    db.prepare('DELETE FROM blacklist WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  },
  isBlacklisted(guildId, userId) {
    const entry = db.prepare('SELECT * FROM blacklist WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
    if (!entry) return false;
    if (entry.expires_at && entry.expires_at < Date.now() / 1000) {
      this.remove(guildId, userId);
      return false;
    }
    return entry;
  },
  getAll(guildId) {
    return db.prepare('SELECT * FROM blacklist WHERE guild_id = ?').all(guildId);
  }
};

// ── STAFF STATS ───────────────────────────────────────────────────────────────
const StaffStats = {
  increment(guildId, userId) {
    db.prepare(`
      INSERT INTO staff_stats (guild_id, user_id, tickets_handled) VALUES (?, ?, 1)
      ON CONFLICT(guild_id, user_id) DO UPDATE SET tickets_handled = tickets_handled + 1, updated_at = strftime('%s','now')
    `).run(guildId, userId);
  },
  addRating(guildId, userId, rating) {
    const stats = db.prepare('SELECT * FROM staff_stats WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
    if (stats) {
      const newTotal = stats.total_ratings + 1;
      const newAvg = ((stats.avg_rating * stats.total_ratings) + rating) / newTotal;
      db.prepare('UPDATE staff_stats SET avg_rating = ?, total_ratings = ? WHERE guild_id = ? AND user_id = ?').run(newAvg, newTotal, guildId, userId);
    }
  },
  getTop(guildId, limit = 10) {
    return db.prepare('SELECT * FROM staff_stats WHERE guild_id = ? ORDER BY tickets_handled DESC LIMIT ?').all(guildId, limit);
  }
};

module.exports = { db, GuildConfig, Categories, Panels, Tickets, Messages, Blacklist, StaffStats };
