// src/bot/handlers/ticketHandler.js
const { getGuildConfig } = require('../../database/config');

const {
  ChannelType, PermissionFlagsBits, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const { GuildConfig, Categories, Tickets, Messages } = require('../../database/db');
const { createTranscript } = require('../utils/transcript');

const PRIORITY_COLORS = { low: 0x57F287, medium: 0xFEE75C, high: 0xFF9F43, critical: 0xED4245 };
const PRIORITY_EMOJIS = { low: '🟢', medium: '🟡', high: '🟠', critical: '🔴' };

async function openTicket(interaction, categoryId, subject = null) {
  const { guild, user } = interaction;
  const config = GuildConfig.getOrCreate(guild.id);
  const category = Categories.getById(categoryId);

  if (!category) return interaction.reply({ content: '❌ Categoría no encontrada.', ephemeral: true });

  // Check blacklist
  const { Blacklist } = require('../../database/db');
  const bl = Blacklist.isBlacklisted(guild.id, user.id);
  if (bl) {
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('🚫 Estás en la lista negra')
        .setDescription(`No puedes abrir tickets en este servidor.\n**Razón:** ${bl.reason || 'No especificada'}`)
      ], ephemeral: true
    });
  }

  // Check max tickets
  const openCount = Tickets.countOpen(guild.id, user.id);
  if (openCount >= config.max_tickets_per_user) {
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle('⚠️ Límite alcanzado')
        .setDescription(`Ya tienes **${openCount}** ticket(s) abierto(s). El máximo es **${config.max_tickets_per_user}**.\nCierra un ticket existente antes de abrir uno nuevo.`)
      ], ephemeral: true
    });
  }

  await interaction.deferReply({ ephemeral: true });

  // Create ticket in DB first to get number
  const ticket = Tickets.create({
    guild_id: guild.id,
    creator_id: user.id,
    category_id: category.id,
    subject: subject
  });

  // Generate channel name
  const channelName = category.naming_scheme
    .replace('{id}', String(ticket.ticket_number).padStart(4, '0'))
    .replace('{username}', user.username.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .replace('{category}', category.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''));

  // Build permissions
  const supportRoles = JSON.parse(category.support_roles || '[]');
  const permissionOverwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles
      ]
    }
  ];
  for (const roleId of supportRoles) {
    permissionOverwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ManageMessages
      ]
    });
  }

  // Create channel
  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category.category_channel || null,
    permissionOverwrites,
    topic: `Ticket de ${user.tag} | ID: ${ticket.id} | Categoría: ${category.name}`
  });

  Tickets.update(ticket.id, { channel_id: channel.id });

  // Build welcome embed
  const embed = new EmbedBuilder()
    .setColor(parseInt(category.color.replace('#', ''), 16) || 0x5865F2)
    .setTitle(`${category.emoji} ${category.name} - Ticket #${String(ticket.ticket_number).padStart(4, '0')}`)
    .setDescription(category.welcome_message)
    .addFields(
      { name: '👤 Usuario', value: `${user}`, inline: true },
      { name: '📁 Categoría', value: `${category.emoji} ${category.name}`, inline: true },
      { name: '⚡ Prioridad', value: `${PRIORITY_EMOJIS.medium} Media`, inline: true }
    )
    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
    .setTimestamp()
    .setFooter({ text: `ID del ticket: ${ticket.id}` });

  if (subject) embed.addFields({ name: '📌 Asunto', value: subject });

  // Action buttons
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket_close_${ticket.id}`).setLabel('Cerrar').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ticket_claim_${ticket.id}`).setLabel('Reclamar').setEmoji('🙋').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ticket_priority_${ticket.id}`).setLabel('Prioridad').setEmoji('⚡').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ticket_transcript_${ticket.id}`).setLabel('Transcripción').setEmoji('📄').setStyle(ButtonStyle.Secondary)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket_add_${ticket.id}`).setLabel('Añadir usuario').setEmoji('➕').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ticket_remove_${ticket.id}`).setLabel('Quitar usuario').setEmoji('➖').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ticket_rename_${ticket.id}`).setLabel('Renombrar').setEmoji('✏️').setStyle(ButtonStyle.Secondary)
  );

  await channel.send({
    content: config.ping_staff && supportRoles.length
      ? supportRoles.map(r => `<@&${r}>`).join(' ') + ` ${user}`
      : `${user}`,
    embeds: [embed],
    components: [row1, row2]
  });

  // DM user
  if (config.dm_on_open) {
    try {
      await user.send({
        embeds: [new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('✅ Ticket Abierto')
          .setDescription(`Tu ticket ha sido creado en **${guild.name}**`)
          .addFields(
            { name: '📁 Categoría', value: category.name, inline: true },
            { name: '🔢 Número', value: `#${String(ticket.ticket_number).padStart(4,'0')}`, inline: true }
          )
          .setTimestamp()
        ]
      });
    } catch {}
  }

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(0x57F287)
      .setDescription(`✅ Tu ticket ha sido creado: ${channel}`)
    ]
  });

  // Log
  if (config.log_channel) {
    const logChannel = guild.channels.cache.get(config.log_channel);
    if (logChannel) {
      logChannel.send({
        embeds: [new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('🎫 Ticket Abierto')
          .addFields(
            { name: 'Usuario', value: `${user.tag} (${user.id})`, inline: true },
            { name: 'Canal', value: `${channel}`, inline: true },
            { name: 'Categoría', value: category.name, inline: true },
            { name: 'Número', value: `#${String(ticket.ticket_number).padStart(4,'0')}`, inline: true }
          )
          .setTimestamp()
        ]
      }).catch(() => {});
    }
  }

  return ticket;
}

async function closeTicket(interaction, ticketId, reason = null) {
  const ticket = Tickets.getById(ticketId);
  if (!ticket) return interaction.reply({ content: '❌ Ticket no encontrado.', ephemeral: true });
  if (ticket.status === 'closed') return interaction.reply({ content: '❌ Este ticket ya está cerrado.', ephemeral: true });

  const { guild, user } = interaction;
  const config = GuildConfig.getOrCreate(guild.id);
  const category = Categories.getById(ticket.category_id);

  await interaction.deferReply();

  // Create transcript
  const { filepath, filename, messageCount } = await createTranscript(ticket, category, guild);
  const { AttachmentBuilder } = require('discord.js');
  const attachment = new AttachmentBuilder(filepath, { name: filename });

  // Close ticket in DB
  Tickets.close(ticket.id, reason || 'Cerrado sin razón especificada', user.id);

  const embed = new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('🔒 Ticket Cerrado')
    .addFields(
      { name: '👤 Cerrado por', value: `${user}`, inline: true },
      { name: '💬 Mensajes', value: `${messageCount}`, inline: true },
      { name: '⏱️ Duración', value: formatDuration(ticket.created_at), inline: true }
    )
    .setTimestamp();

  if (reason) embed.addFields({ name: '📝 Razón', value: reason });

  // Send to transcript channel
// Obtener config desde Supabase
const cloudConfig = await getGuildConfig(guild.id);

// Elegir canal (prioridad: Supabase → SQLite)
const transcriptChannelId =
  cloudConfig?.transcript_channel_id || config.transcript_channel;

if (transcriptChannelId) {
  const tchan = guild.channels.cache.get(transcriptChannelId);

  if (tchan) {
    tchan.send({
      embeds: [new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`📄 Transcripción - Ticket #${String(ticket.ticket_number).padStart(4,'0')}`)
        .addFields(
          { name: '👤 Usuario', value: `<@${ticket.creator_id}>`, inline: true },
          { name: '🔒 Cerrado por', value: `${user}`, inline: true },
          { name: '📁 Categoría', value: category?.name || 'N/A', inline: true },
          { name: '💬 Mensajes', value: `${messageCount}`, inline: true }
        )
        .setTimestamp()
      ],
      files: [attachment]
    }).catch(() => {});
  }
}

if (cloudConfig?.transcript_channel_id) {
  const tchan = guild.channels.cache.get(cloudConfig.transcript_channel_id);
    const tchan = guild.channels.cache.get(config.transcript_channel);
    if (tchan) {
      tchan.send({
        embeds: [new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`📄 Transcripción - Ticket #${String(ticket.ticket_number).padStart(4,'0')}`)
          .addFields(
            { name: '👤 Usuario', value: `<@${ticket.creator_id}>`, inline: true },
            { name: '🔒 Cerrado por', value: `${user}`, inline: true },
            { name: '📁 Categoría', value: category?.name || 'N/A', inline: true },
            { name: '💬 Mensajes', value: `${messageCount}`, inline: true }
          )
          .setTimestamp()
        ],
        files: [attachment]
      }).catch(() => {});
    }
  }

  // DM creator with transcript
  if (config.dm_on_close) {
    try {
      const creator = await guild.members.fetch(ticket.creator_id);
      if (creator) {
        const attachment2 = new AttachmentBuilder(filepath, { name: filename });
        await creator.send({
          embeds: [new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('🔒 Tu ticket ha sido cerrado')
            .setDescription(category?.close_message || 'Tu ticket ha sido cerrado.')
            .addFields(
              { name: '🖥️ Servidor', value: guild.name, inline: true },
              { name: '🔢 Ticket', value: `#${String(ticket.ticket_number).padStart(4,'0')}`, inline: true }
            )
            .setTimestamp()
          ],
          files: [attachment2],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`rate_${ticket.id}_1`).setLabel('1').setEmoji('⭐').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`rate_${ticket.id}_2`).setLabel('2').setEmoji('⭐').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`rate_${ticket.id}_3`).setLabel('3').setEmoji('⭐').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`rate_${ticket.id}_4`).setLabel('4').setEmoji('⭐').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`rate_${ticket.id}_5`).setLabel('5').setEmoji('⭐').setStyle(ButtonStyle.Primary)
            )
          ]
        });
      }
    } catch {}
  }

  await interaction.editReply({ embeds: [embed] });

  // Log
  if (config.log_channel) {
    const logChannel = guild.channels.cache.get(config.log_channel);
    if (logChannel) {
      const attachment3 = new AttachmentBuilder(filepath, { name: filename });
      logChannel.send({
        embeds: [new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('🔒 Ticket Cerrado')
          .addFields(
            { name: 'Ticket', value: `#${String(ticket.ticket_number).padStart(4,'0')}`, inline: true },
            { name: 'Cerrado por', value: `${user.tag}`, inline: true },
            { name: 'Categoría', value: category?.name || 'N/A', inline: true }
          )
          .setTimestamp()
        ],
        files: [attachment3]
      }).catch(() => {});
    }
  }

  // Delete channel after 5 seconds
  const channel = guild.channels.cache.get(ticket.channel_id);
  if (channel) {
    setTimeout(() => channel.delete().catch(() => {}), 5000);
  }

  const { StaffStats } = require('../../database/db');
  StaffStats.increment(guild.id, user.id);
}

function formatDuration(createdAt) {
  const diff = Math.floor(Date.now() / 1000) - createdAt;
  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  if (hours === 0) return `${minutes} minutos`;
  if (hours < 24) return `${hours}h ${minutes}m`;
  return `${Math.floor(hours/24)}d ${hours%24}h`;
}

module.exports = { openTicket, closeTicket };
