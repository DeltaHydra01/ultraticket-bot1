// src/bot/utils/transcript.js
const fs = require('fs');
const path = require('path');
const { Messages } = require('../../database/db');
require('dotenv').config();

const transcriptsDir = process.env.TRANSCRIPTS_PATH || './data/transcripts';
if (!fs.existsSync(transcriptsDir)) fs.mkdirSync(transcriptsDir, { recursive: true });

function generateTranscriptHTML(ticket, category, messages, guild) {
  const formatTime = (ts) => new Date(ts * 1000).toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  const priorityColors = { low: '#57F287', medium: '#FEE75C', high: '#FF9F43', critical: '#ED4245' };
  const statusColors = { open: '#57F287', closed: '#ED4245', pending: '#FEE75C' };

  const messagesHTML = messages.map(msg => {
    const attachments = JSON.parse(msg.attachments || '[]');
    const embeds = JSON.parse(msg.embeds || '[]');
    const avatar = msg.author_avatar
      ? `https://cdn.discordapp.com/avatars/${msg.author_id}/${msg.author_avatar}.png?size=40`
      : `https://cdn.discordapp.com/embed/avatars/${parseInt(msg.author_id) % 5}.png`;

    const attachmentsHTML = attachments.map(att => {
      if (/\.(png|jpg|jpeg|gif|webp)$/i.test(att.name)) {
        return `<div class="attachment"><img src="${att.url}" alt="${att.name}" style="max-width:400px;max-height:300px;border-radius:4px;margin-top:8px;"></div>`;
      }
      return `<div class="attachment"><a href="${att.url}" target="_blank" style="color:#00b0f4">📎 ${att.name}</a></div>`;
    }).join('');

    const embedsHTML = embeds.map(embed => `
      <div style="border-left:4px solid ${embed.color || '#5865F2'};background:#2f3136;padding:12px;border-radius:4px;margin-top:8px;max-width:520px;">
        ${embed.title ? `<div style="font-weight:600;color:#fff;margin-bottom:4px;">${embed.title}</div>` : ''}
        ${embed.description ? `<div style="color:#dcddde;font-size:14px;">${embed.description}</div>` : ''}
      </div>
    `).join('');

    return `
      <div class="message" data-author="${msg.author_id}">
        <img src="${avatar}" class="avatar" alt="${msg.author_tag}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
        <div class="msg-content">
          <div class="msg-header">
            <span class="username">${msg.author_tag}</span>
            <span class="timestamp">${formatTime(msg.created_at)}</span>
          </div>
          ${msg.content ? `<div class="msg-text">${escapeHtml(msg.content).replace(/\n/g, '<br>')}</div>` : ''}
          ${attachmentsHTML}
          ${embedsHTML}
        </div>
      </div>
    `;
  }).join('');

  const participants = JSON.parse(ticket.participants || '[]');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ticket #${ticket.ticket_number} - ${guild?.name || 'Servidor'}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#36393f; color:#dcddde; font-family:'Whitney','Helvetica Neue',Arial,sans-serif; font-size:15px; }
  .header { background:#202225; padding:24px 32px; border-bottom:1px solid #40444b; }
  .header-top { display:flex; align-items:center; gap:16px; margin-bottom:16px; }
  .server-icon { width:48px; height:48px; border-radius:12px; background:#5865F2; display:flex; align-items:center; justify-content:center; font-size:20px; }
  .server-name { font-size:20px; font-weight:700; color:#fff; }
  .ticket-title { color:#b9bbbe; font-size:14px; margin-top:2px; }
  .info-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; margin-top:16px; }
  .info-card { background:#2f3136; border-radius:8px; padding:12px 16px; }
  .info-label { font-size:11px; text-transform:uppercase; color:#72767d; font-weight:600; letter-spacing:.5px; margin-bottom:4px; }
  .info-value { font-size:14px; font-weight:600; color:#fff; }
  .badge { display:inline-block; padding:2px 8px; border-radius:12px; font-size:12px; font-weight:600; }
  .messages { padding:16px 32px; max-width:900px; margin:0 auto; }
  .day-separator { text-align:center; margin:24px 0; color:#72767d; font-size:12px; font-weight:600; display:flex; align-items:center; gap:12px; }
  .day-separator::before, .day-separator::after { content:''; flex:1; height:1px; background:#40444b; }
  .message { display:flex; gap:16px; padding:4px 0; margin-bottom:4px; }
  .message:hover { background:rgba(4,4,5,.07); border-radius:4px; padding:4px 8px; margin:0 -8px 4px; }
  .avatar { width:40px; height:40px; border-radius:50%; flex-shrink:0; margin-top:2px; }
  .msg-content { flex:1; min-width:0; }
  .msg-header { display:flex; align-items:baseline; gap:8px; margin-bottom:4px; }
  .username { font-weight:600; color:#fff; font-size:15px; }
  .timestamp { font-size:11px; color:#72767d; }
  .msg-text { color:#dcddde; line-height:1.5; word-break:break-word; }
  .attachment { margin-top:4px; }
  .footer { text-align:center; padding:24px; color:#72767d; font-size:12px; border-top:1px solid #40444b; margin-top:32px; }
  @media (max-width:600px) { .header, .messages { padding:16px; } .info-grid { grid-template-columns:1fr 1fr; } }
</style>
</head>
<body>
<div class="header">
  <div class="header-top">
    <div class="server-icon">🎫</div>
    <div>
      <div class="server-name">${guild?.name || 'Servidor'}</div>
      <div class="ticket-title">Transcripción del Ticket #${String(ticket.ticket_number).padStart(4,'0')}</div>
    </div>
  </div>
  <div class="info-grid">
    <div class="info-card">
      <div class="info-label">🔢 Número</div>
      <div class="info-value">#${String(ticket.ticket_number).padStart(4,'0')}</div>
    </div>
    <div class="info-card">
      <div class="info-label">📁 Categoría</div>
      <div class="info-value">${category?.emoji || '🎫'} ${category?.name || 'General'}</div>
    </div>
    <div class="info-card">
      <div class="info-label">👤 Creador</div>
      <div class="info-value" id="creator">ID: ${ticket.creator_id}</div>
    </div>
    <div class="info-card">
      <div class="info-label">🚦 Estado</div>
      <div class="info-value"><span class="badge" style="background:${statusColors[ticket.status] || '#72767d'}20;color:${statusColors[ticket.status] || '#72767d'}">${ticket.status.toUpperCase()}</span></div>
    </div>
    <div class="info-card">
      <div class="info-label">⚡ Prioridad</div>
      <div class="info-value"><span class="badge" style="background:${priorityColors[ticket.priority]}20;color:${priorityColors[ticket.priority]}">${ticket.priority.toUpperCase()}</span></div>
    </div>
    <div class="info-card">
      <div class="info-label">📅 Abierto</div>
      <div class="info-value">${formatTime(ticket.created_at)}</div>
    </div>
    ${ticket.closed_at ? `
    <div class="info-card">
      <div class="info-label">🔒 Cerrado</div>
      <div class="info-value">${formatTime(ticket.closed_at)}</div>
    </div>` : ''}
    <div class="info-card">
      <div class="info-label">💬 Mensajes</div>
      <div class="info-value">${messages.length}</div>
    </div>
    ${ticket.rating ? `
    <div class="info-card">
      <div class="info-label">⭐ Calificación</div>
      <div class="info-value">${'⭐'.repeat(ticket.rating)} (${ticket.rating}/5)</div>
    </div>` : ''}
  </div>
  ${ticket.subject ? `<div style="margin-top:12px;background:#2f3136;border-radius:8px;padding:12px 16px;"><div class="info-label">📌 Asunto</div><div style="color:#fff;margin-top:4px;">${escapeHtmlStatic(ticket.subject)}</div></div>` : ''}
  ${ticket.close_reason ? `<div style="margin-top:8px;background:#2f3136;border-radius:8px;padding:12px 16px;"><div class="info-label">🔒 Razón de cierre</div><div style="color:#fff;margin-top:4px;">${escapeHtmlStatic(ticket.close_reason)}</div></div>` : ''}
  ${ticket.feedback ? `<div style="margin-top:8px;background:#2f3136;border-radius:8px;padding:12px 16px;"><div class="info-label">💬 Feedback del usuario</div><div style="color:#fff;margin-top:4px;">${escapeHtmlStatic(ticket.feedback)}</div></div>` : ''}
</div>

<div class="messages">
  ${messagesHTML || '<div style="text-align:center;padding:48px;color:#72767d;">No hay mensajes registrados</div>'}
</div>

<div class="footer">
  <div>Generado por <strong>UltraTicket Bot</strong> • ${new Date().toLocaleString('es-ES')}</div>
  <div style="margin-top:4px">Participantes: ${participants.length} usuarios</div>
</div>
</body>
</html>`;
}

function escapeHtml(text) {
  return (text || '').toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeHtmlStatic(text) {
  return (text || '').toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function createTranscript(ticket, category, guild) {
  const messages = Messages.getByTicket(ticket.id);
  const html = generateTranscriptHTML(ticket, category, messages, guild);
  const filename = `ticket-${ticket.guild_id}-${ticket.ticket_number}-${Date.now()}.html`;
  const filepath = path.join(transcriptsDir, filename);
  fs.writeFileSync(filepath, html, 'utf8');
  return { filepath, filename, messageCount: messages.length };
}

module.exports = { createTranscript, transcriptsDir };
