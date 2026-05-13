// src/database/migrations.js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const dbPath = process.env.DATABASE_PATH || './data/tickets.db';
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);

function migrate() {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Configuración por guild
  db.exec(`
    CREATE TABLE IF NOT EXISTS guild_config (
      guild_id TEXT PRIMARY KEY,
      prefix TEXT DEFAULT '!',
      log_channel TEXT,
      transcript_channel TEXT,
      ticket_counter INTEGER DEFAULT 0,
      max_tickets_per_user INTEGER DEFAULT 3,
      auto_close_hours INTEGER DEFAULT 0,
      dm_on_open INTEGER DEFAULT 1,
      dm_on_close INTEGER DEFAULT 1,
      ping_staff INTEGER DEFAULT 1,
      require_topic INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      updated_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS ticket_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      emoji TEXT DEFAULT '🎫',
      category_channel TEXT,
      support_roles TEXT DEFAULT '[]',
      welcome_message TEXT DEFAULT 'Gracias por abrir un ticket. Un miembro del staff te atenderá pronto.',
      close_message TEXT DEFAULT 'Tu ticket ha sido cerrado. ¡Que tengas un buen día!',
      color TEXT DEFAULT '#5865F2',
      naming_scheme TEXT DEFAULT 'ticket-{id}',
      position INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS panels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT,
      title TEXT DEFAULT '🎫 Sistema de Tickets',
      description TEXT DEFAULT 'Haz clic en el botón para abrir un ticket.',
      color TEXT DEFAULT '#5865F2',
      thumbnail TEXT,
      image TEXT,
      footer TEXT,
      button_style TEXT DEFAULT 'PRIMARY',
      categories TEXT DEFAULT '[]',
      type TEXT DEFAULT 'button',
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_number INTEGER NOT NULL,
      guild_id TEXT NOT NULL,
      channel_id TEXT UNIQUE,
      creator_id TEXT NOT NULL,
      category_id INTEGER,
      assigned_to TEXT,
      status TEXT DEFAULT 'open',
      priority TEXT DEFAULT 'medium',
      subject TEXT,
      close_reason TEXT,
      claimed_by TEXT,
      participants TEXT DEFAULT '[]',
      rating INTEGER,
      feedback TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      closed_at INTEGER,
      last_activity INTEGER DEFAULT (strftime('%s','now')),
      FOREIGN KEY (category_id) REFERENCES ticket_categories(id)
    );

    CREATE TABLE IF NOT EXISTS ticket_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      author_id TEXT NOT NULL,
      author_tag TEXT NOT NULL,
      author_avatar TEXT,
      content TEXT,
      attachments TEXT DEFAULT '[]',
      embeds TEXT DEFAULT '[]',
      message_id TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      FOREIGN KEY (ticket_id) REFERENCES tickets(id)
    );

    CREATE TABLE IF NOT EXISTS blacklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      reason TEXT,
      added_by TEXT,
      expires_at INTEGER,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      UNIQUE(guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS staff_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      tickets_handled INTEGER DEFAULT 0,
      avg_response_time INTEGER DEFAULT 0,
      avg_rating REAL DEFAULT 0,
      total_ratings INTEGER DEFAULT 0,
      updated_at INTEGER DEFAULT (strftime('%s','now')),
      UNIQUE(guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expired INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tickets_guild ON tickets(guild_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_creator ON tickets(creator_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
    CREATE INDEX IF NOT EXISTS idx_messages_ticket ON ticket_messages(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_blacklist_guild ON blacklist(guild_id);
  `);

  console.log('✅ Base de datos inicializada correctamente');
}

migrate();
module.exports = db;
