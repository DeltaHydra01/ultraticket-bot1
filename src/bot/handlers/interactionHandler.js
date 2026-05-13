// src/bot/handlers/interactionHandler.js
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionFlagsBits
} = require('discord.js');
const { Tickets, Categories, Panels, GuildConfig, Blacklist, StaffStats } = require('../../database/db');
const { openTicket, closeTicket } = require('./ticketHandler');
const { createTranscript } = require('../utils/transcript');

async function handleButton(interaction) {
  const { customId, guild, user } = interaction;

  // ── OPEN TICKET FROM PANEL ──────────────────────────────────────────────────
  if (customId.startsWith('open_ticket_')) {
    const categoryId = parseInt(customId.replace('open_ticket_', ''));
    const category = Categories.getById(categoryId);
    if (!category) return interaction.reply({ content: '❌ Categoría no encontrada.', ephemeral: true });

    const config = GuildConfig.getOrCreate(guild.id);
    if (config.require_topic) {
      const modal = new ModalBuilder()
        .setCustomId(`ticket_subject_modal_${categoryId}`)
        .setTitle(`Abrir ticket: ${category.name}`);
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('subject')
            .setLabel('¿Sobre qué trata tu ticket?')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Describe brevemente tu problema...')
            .setRequired(true)
            .setMaxLength(200)
        )
      );
      return interaction.showModal(modal);
    }
    return openTicket(interaction, categoryId);
  }

  // ── CLOSE TICKET ────────────────────────────────────────────────────────────
  if (customId.startsWith('ticket_close_')) {
    const ticketId = parseInt(customId.replace('ticket_close_', ''));
    const ticket = Tickets.getById(ticketId);
    if (!ticket) return interaction.reply({ content: '❌ Ticket no encontrado.', ephemeral: true });

    const modal = new ModalBuilder()
      .setCustomId(`close_reason_modal_${ticketId}`)
      .setTitle('Cerrar Ticket');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Razón de cierre (opcional)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(500)
          .setPlaceholder('Describe el motivo del cierre...')
      )
    );
    return interaction.showModal(modal);
  }

  // ── CLAIM TICKET ────────────────────────────────────────────────────────────
  if (customId.startsWith('ticket_claim_')) {
    const ticketId = parseInt(customId.replace('ticket_claim_', ''));
    const ticket = Tickets.getById(ticketId);
    if (!ticket) return interaction.reply({ content: '❌ Ticket no encontrado.', ephemeral: true });

    if (ticket.claimed_by) {
      if (ticket.claimed_by === user.id) {
        Tickets.update(ticketId, { claimed_by: null });
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('✅ Has liberado el ticket.')],
          ephemeral: true
        });
      }
      return interaction.reply({
        content: `❌ Este ticket ya ha sido reclamado por <@${ticket.claimed_by}>.`,
        ephemeral: true
      });
    }

    Tickets.update(ticketId, { claimed_by: user.id });
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57F287)
        .setDescription(`🙋 **${user.tag}** ha reclamado este ticket.\nSolo él/ella responderá a esta solicitud.`)
      ]
    });
  }

  // ── PRIORITY ─────────────────────────────────────────────────────────────────
  if (customId.startsWith('ticket_priority_')) {
    const ticketId = parseInt(customId.replace('ticket_priority_', ''));
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`set_priority_${ticketId}`)
        .setPlaceholder('Selecciona la prioridad')
        .addOptions([
          { label: '🟢 Baja', value: 'low', description: 'Problema menor, sin urgencia' },
          { label: '🟡 Media', value: 'medium', description: 'Necesita atención normal' },
          { label: '🟠 Alta', value: 'high', description: 'Urgente, atender pronto' },
          { label: '🔴 Crítica', value: 'critical', description: 'Emergencia, atender inmediatamente' }
        ])
    );
    return interaction.reply({ content: 'Selecciona la nueva prioridad:', components: [row], ephemeral: true });
  }

  // ── TRANSCRIPT ───────────────────────────────────────────────────────────────
  if (customId.startsWith('ticket_transcript_')) {
    const ticketId = parseInt(customId.replace('ticket_transcript_', ''));
    const ticket = Tickets.getById(ticketId);
    if (!ticket) return interaction.reply({ content: '❌ Ticket no encontrado.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    const category = Categories.getById(ticket.category_id);
    const { filepath, filename, messageCount } = await createTranscript(ticket, category, guild);
    const { AttachmentBuilder } = require('discord.js');
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription(`📄 Transcripción generada (${messageCount} mensajes)`)],
      files: [new AttachmentBuilder(filepath, { name: filename })],
      ephemeral: true
    });
  }

  // ── ADD USER ─────────────────────────────────────────────────────────────────
  if (customId.startsWith('ticket_add_')) {
    const ticketId = parseInt(customId.replace('ticket_add_', ''));
    const modal = new ModalBuilder().setCustomId(`add_user_modal_${ticketId}`).setTitle('Añadir Usuario');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('user_id')
          .setLabel('ID del usuario a añadir')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('123456789012345678')
          .setRequired(true)
      )
    );
    return interaction.showModal(modal);
  }

  // ── REMOVE USER ──────────────────────────────────────────────────────────────
  if (customId.startsWith('ticket_remove_')) {
    const ticketId = parseInt(customId.replace('ticket_remove_', ''));
    const modal = new ModalBuilder().setCustomId(`remove_user_modal_${ticketId}`).setTitle('Quitar Usuario');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('user_id')
          .setLabel('ID del usuario a quitar')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('123456789012345678')
          .setRequired(true)
      )
    );
    return interaction.showModal(modal);
  }

  // ── RENAME TICKET ────────────────────────────────────────────────────────────
  if (customId.startsWith('ticket_rename_')) {
    const ticketId = parseInt(customId.replace('ticket_rename_', ''));
    const modal = new ModalBuilder().setCustomId(`rename_modal_${ticketId}`).setTitle('Renombrar Ticket');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('new_name')
          .setLabel('Nuevo nombre del canal')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('nuevo-nombre-ticket')
          .setRequired(true)
          .setMaxLength(100)
      )
    );
    return interaction.showModal(modal);
  }

  // ── RATING ────────────────────────────────────────────────────────────────────
  if (customId.startsWith('rate_')) {
    const parts = customId.split('_');
    const ticketId = parseInt(parts[1]);
    const rating = parseInt(parts[2]);
    const ticket = Tickets.getById(ticketId);

    if (!ticket || ticket.creator_id !== user.id) {
      return interaction.reply({ content: '❌ No puedes calificar este ticket.', ephemeral: true });
    }
    if (ticket.rating) {
      return interaction.reply({ content: '❌ Ya calificaste este ticket.', ephemeral: true });
    }

    const modal = new ModalBuilder().setCustomId(`feedback_modal_${ticketId}_${rating}`).setTitle('Calificar Soporte');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('feedback')
          .setLabel(`Tu calificación: ${'⭐'.repeat(rating)} (${rating}/5)`)
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setPlaceholder('¿Tienes algún comentario adicional? (opcional)')
          .setMaxLength(500)
      )
    );
    return interaction.showModal(modal);
  }
}

async function handleSelectMenu(interaction) {
  const { customId, values, guild } = interaction;

  // ── SET PRIORITY ─────────────────────────────────────────────────────────────
  if (customId.startsWith('set_priority_')) {
    const ticketId = parseInt(customId.replace('set_priority_', ''));
    const priority = values[0];
    Tickets.update(ticketId, { priority });

    const colors = { low: 0x57F287, medium: 0xFEE75C, high: 0xFF9F43, critical: 0xED4245 };
    const labels = { low: '🟢 Baja', medium: '🟡 Media', high: '🟠 Alta', critical: '🔴 Crítica' };

    await interaction.update({ content: `✅ Prioridad actualizada a **${labels[priority]}**`, components: [] });

    interaction.channel?.send({
      embeds: [new EmbedBuilder()
        .setColor(colors[priority])
        .setDescription(`⚡ La prioridad del ticket ha sido cambiada a **${labels[priority]}** por ${interaction.user}`)
      ]
    });
  }

  // ── OPEN TICKET FROM DROPDOWN ─────────────────────────────────────────────────
  if (customId.startsWith('panel_select_')) {
    const categoryId = parseInt(values[0].replace('cat_', ''));
    await interaction.update({ components: [] });
    return openTicket(interaction, categoryId);
  }
}

async function handleModal(interaction) {
  const { customId, guild, user } = interaction;

  // ── TICKET SUBJECT MODAL ─────────────────────────────────────────────────────
  if (customId.startsWith('ticket_subject_modal_')) {
    const categoryId = parseInt(customId.replace('ticket_subject_modal_', ''));
    const subject = interaction.fields.getTextInputValue('subject');
    return openTicket(interaction, categoryId, subject);
  }

  // ── CLOSE REASON MODAL ────────────────────────────────────────────────────────
  if (customId.startsWith('close_reason_modal_')) {
    const ticketId = parseInt(customId.replace('close_reason_modal_', ''));
    const reason = interaction.fields.getTextInputValue('reason');
    return closeTicket(interaction, ticketId, reason);
  }

  // ── ADD USER MODAL ────────────────────────────────────────────────────────────
  if (customId.startsWith('add_user_modal_')) {
    const ticketId = parseInt(customId.replace('add_user_modal_', ''));
    const userId = interaction.fields.getTextInputValue('user_id').trim();
    const ticket = Tickets.getById(ticketId);
    if (!ticket) return interaction.reply({ content: '❌ Ticket no encontrado.', ephemeral: true });

    try {
      const member = await guild.members.fetch(userId);
      await interaction.channel.permissionOverwrites.edit(member, {
        ViewChannel: true, SendMessages: true, ReadMessageHistory: true
      });

      const participants = JSON.parse(ticket.participants || '[]');
      if (!participants.includes(userId)) {
        participants.push(userId);
        Tickets.update(ticketId, { participants });
      }

      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x57F287)
          .setDescription(`✅ **${member.user.tag}** ha sido añadido al ticket.`)
        ]
      });
    } catch {
      return interaction.reply({ content: '❌ No se encontró al usuario.', ephemeral: true });
    }
  }

  // ── REMOVE USER MODAL ─────────────────────────────────────────────────────────
  if (customId.startsWith('remove_user_modal_')) {
    const ticketId = parseInt(customId.replace('remove_user_modal_', ''));
    const userId = interaction.fields.getTextInputValue('user_id').trim();
    const ticket = Tickets.getById(ticketId);
    if (!ticket) return interaction.reply({ content: '❌ Ticket no encontrado.', ephemeral: true });
    if (userId === ticket.creator_id) return interaction.reply({ content: '❌ No puedes quitar al creador del ticket.', ephemeral: true });

    try {
      const member = await guild.members.fetch(userId);
      await interaction.channel.permissionOverwrites.delete(member);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xED4245)
          .setDescription(`✅ **${member.user.tag}** ha sido quitado del ticket.`)
        ]
      });
    } catch {
      return interaction.reply({ content: '❌ No se encontró al usuario.', ephemeral: true });
    }
  }

  // ── RENAME MODAL ──────────────────────────────────────────────────────────────
  if (customId.startsWith('rename_modal_')) {
    const ticketId = parseInt(customId.replace('rename_modal_', ''));
    const newName = interaction.fields.getTextInputValue('new_name')
      .toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 100);

    try {
      await interaction.channel.setName(newName);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x57F287)
          .setDescription(`✅ Canal renombrado a **${newName}**`)
        ]
      });
    } catch {
      return interaction.reply({ content: '❌ No se pudo renombrar el canal.', ephemeral: true });
    }
  }

  // ── FEEDBACK MODAL ────────────────────────────────────────────────────────────
  if (customId.startsWith('feedback_modal_')) {
    const parts = customId.split('_');
    const ticketId = parseInt(parts[2]);
    const rating = parseInt(parts[3]);
    const feedback = interaction.fields.getTextInputValue('feedback');

    const ticket = Tickets.getById(ticketId);
    Tickets.update(ticketId, { rating, feedback });

    if (ticket.claimed_by) {
      StaffStats.addRating(ticket.guild_id, ticket.claimed_by, rating);
    }

    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('⭐ ¡Gracias por tu calificación!')
        .setDescription(`Calificaste con **${'⭐'.repeat(rating)}** (${rating}/5).\n${feedback ? `> ${feedback}` : ''}`)
      ], ephemeral: true
    });
  }
}

module.exports = { handleButton, handleSelectMenu, handleModal };
