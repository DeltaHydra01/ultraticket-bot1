// src/bot/commands/index.js
const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  PermissionFlagsBits, AttachmentBuilder
} = require('discord.js');
const { GuildConfig, Categories, Panels, Tickets, Blacklist, StaffStats } = require('../../database/db');
const { createTranscript } = require('../utils/transcript');
const { openTicket, closeTicket } = require('../handlers/ticketHandler');

const commands = [
  // ── /panel ──────────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('panel')
      .setDescription('Envía un panel de tickets al canal')
      .addChannelOption(o => o.setName('canal').setDescription('Canal donde enviar el panel').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      const { guild } = interaction;
      const categories = Categories.getEnabled(guild.id);
      if (!categories.length) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ No hay categorías configuradas. Usa el dashboard web para crearlas.')],
          ephemeral: true
        });
      }

      const channel = interaction.options.getChannel('canal') || interaction.channel;
      await interaction.deferReply({ ephemeral: true });

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🎫 Sistema de Tickets')
        .setDescription('Selecciona una categoría para abrir tu ticket. Un miembro del staff te atenderá lo antes posible.')
        .addFields(categories.map(c => ({
          name: `${c.emoji} ${c.name}`,
          value: c.description || 'Haz clic para abrir un ticket',
          inline: true
        })))
        .setFooter({ text: guild.name, iconURL: guild.iconURL() })
        .setTimestamp();

      // Buttons (max 5 per row, max 25 total)
      const rows = [];
      let row = new ActionRowBuilder();
      categories.slice(0, 25).forEach((cat, i) => {
        if (i > 0 && i % 5 === 0) { rows.push(row); row = new ActionRowBuilder(); }
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`open_ticket_${cat.id}`)
            .setLabel(cat.name)
            .setEmoji(cat.emoji)
            .setStyle(ButtonStyle.Primary)
        );
      });
      rows.push(row);

      const msg = await channel.send({ embeds: [embed], components: rows });
      await interaction.editReply({ content: `✅ Panel enviado a ${channel}` });
    }
  },

  // ── /close ──────────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('close')
      .setDescription('Cierra el ticket actual')
      .addStringOption(o => o.setName('razon').setDescription('Razón del cierre').setRequired(false)),
    async execute(interaction) {
      const ticket = Tickets.getByChannel(interaction.channelId);
      if (!ticket) return interaction.reply({ content: '❌ Este canal no es un ticket.', ephemeral: true });
      const reason = interaction.options.getString('razon');
      return closeTicket(interaction, ticket.id, reason);
    }
  },

  // ── /add ────────────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('add')
      .setDescription('Añade un usuario al ticket actual')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a añadir').setRequired(true)),
    async execute(interaction) {
      const ticket = Tickets.getByChannel(interaction.channelId);
      if (!ticket) return interaction.reply({ content: '❌ Este canal no es un ticket.', ephemeral: true });

      const member = interaction.options.getMember('usuario');
      await interaction.channel.permissionOverwrites.edit(member, {
        ViewChannel: true, SendMessages: true, ReadMessageHistory: true
      });

      const participants = JSON.parse(ticket.participants || '[]');
      if (!participants.includes(member.id)) { participants.push(member.id); Tickets.update(ticket.id, { participants }); }

      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ **${member.user.tag}** ha sido añadido al ticket.`)]
      });
    }
  },

  // ── /remove ─────────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('remove')
      .setDescription('Quita un usuario del ticket actual')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario a quitar').setRequired(true)),
    async execute(interaction) {
      const ticket = Tickets.getByChannel(interaction.channelId);
      if (!ticket) return interaction.reply({ content: '❌ Este canal no es un ticket.', ephemeral: true });

      const member = interaction.options.getMember('usuario');
      if (member.id === ticket.creator_id) return interaction.reply({ content: '❌ No puedes quitar al creador del ticket.', ephemeral: true });

      await interaction.channel.permissionOverwrites.delete(member);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(`✅ **${member.user.tag}** ha sido quitado del ticket.`)]
      });
    }
  },

  // ── /rename ─────────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('rename')
      .setDescription('Renombra el canal del ticket actual')
      .addStringOption(o => o.setName('nombre').setDescription('Nuevo nombre del canal').setRequired(true)),
    async execute(interaction) {
      const ticket = Tickets.getByChannel(interaction.channelId);
      if (!ticket) return interaction.reply({ content: '❌ Este canal no es un ticket.', ephemeral: true });

      const newName = interaction.options.getString('nombre')
        .toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 100);
      await interaction.channel.setName(newName);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Canal renombrado a **${newName}**`)]
      });
    }
  },

  // ── /claim ──────────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('claim')
      .setDescription('Reclama este ticket como tu responsabilidad'),
    async execute(interaction) {
      const ticket = Tickets.getByChannel(interaction.channelId);
      if (!ticket) return interaction.reply({ content: '❌ Este canal no es un ticket.', ephemeral: true });

      if (ticket.claimed_by && ticket.claimed_by !== interaction.user.id) {
        return interaction.reply({ content: `❌ Ya reclamado por <@${ticket.claimed_by}>`, ephemeral: true });
      }

      if (ticket.claimed_by === interaction.user.id) {
        Tickets.update(ticket.id, { claimed_by: null });
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(0xFEE75C).setDescription('✅ Has liberado el ticket.')]
        });
      }

      Tickets.update(ticket.id, { claimed_by: interaction.user.id });
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x57F287)
          .setDescription(`🙋 **${interaction.user.tag}** ha reclamado este ticket.`)
        ]
      });
    }
  },

  // ── /transcript ─────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('transcript')
      .setDescription('Genera la transcripción del ticket actual'),
    async execute(interaction) {
      const ticket = Tickets.getByChannel(interaction.channelId);
      if (!ticket) return interaction.reply({ content: '❌ Este canal no es un ticket.', ephemeral: true });

      await interaction.deferReply({ ephemeral: true });
      const category = Categories.getById(ticket.category_id);
      const { filepath, filename, messageCount } = await createTranscript(ticket, category, interaction.guild);

      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription(`📄 Transcripción generada con ${messageCount} mensajes`)],
        files: [new AttachmentBuilder(filepath, { name: filename })],
        ephemeral: true
      });
    }
  },

  // ── /blacklist ──────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('blacklist')
      .setDescription('Gestiona la lista negra de tickets')
      .addSubcommand(s => s
        .setName('add')
        .setDescription('Añade un usuario a la lista negra')
        .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true))
        .addStringOption(o => o.setName('razon').setDescription('Razón').setRequired(false))
      )
      .addSubcommand(s => s
        .setName('remove')
        .setDescription('Quita un usuario de la lista negra')
        .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true))
      )
      .addSubcommand(s => s.setName('list').setDescription('Ver lista negra'))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      const { guild, user } = interaction;

      if (sub === 'add') {
        const target = interaction.options.getUser('usuario');
        const reason = interaction.options.getString('razon') || 'No especificada';
        Blacklist.add(guild.id, target.id, reason, user.id);
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(0xED4245)
            .setTitle('🚫 Usuario añadido a la lista negra')
            .addFields(
              { name: 'Usuario', value: `${target.tag} (${target.id})`, inline: true },
              { name: 'Razón', value: reason, inline: true }
            )
          ]
        });
      }

      if (sub === 'remove') {
        const target = interaction.options.getUser('usuario');
        Blacklist.remove(guild.id, target.id);
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ **${target.tag}** removido de la lista negra.`)]
        });
      }

      if (sub === 'list') {
        const list = Blacklist.getAll(guild.id);
        const embed = new EmbedBuilder().setColor(0xED4245).setTitle('🚫 Lista Negra').setTimestamp();
        if (!list.length) {
          embed.setDescription('No hay usuarios en la lista negra.');
        } else {
          embed.setDescription(list.slice(0, 20).map(e => `• <@${e.user_id}> — ${e.reason || 'Sin razón'}`).join('\n'));
        }
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }
  },

  // ── /stats ──────────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('stats')
      .setDescription('Muestra estadísticas del sistema de tickets')
      .addUserOption(o => o.setName('staff').setDescription('Ver estadísticas de un miembro del staff').setRequired(false)),
    async execute(interaction) {
      const { guild } = interaction;
      const targetUser = interaction.options.getUser('staff');

      if (targetUser) {
        const staffData = db.prepare('SELECT * FROM staff_stats WHERE guild_id = ? AND user_id = ?').get(guild.id, targetUser.id);
        if (!staffData) return interaction.reply({ content: '❌ Sin datos para este usuario.', ephemeral: true });
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`📊 Estadísticas de ${targetUser.tag}`)
            .setThumbnail(targetUser.displayAvatarURL())
            .addFields(
              { name: '🎫 Tickets cerrados', value: `${staffData.tickets_handled}`, inline: true },
              { name: '⭐ Calificación promedio', value: staffData.avg_rating ? `${staffData.avg_rating.toFixed(1)}/5.0` : 'Sin datos', inline: true }
            )
          ]
        });
      }

      const stats = Tickets.getStats(guild.id);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('📊 Estadísticas de Tickets')
          .setThumbnail(guild.iconURL())
          .addFields(
            { name: '📈 Total', value: `${stats.total}`, inline: true },
            { name: '🟢 Abiertos', value: `${stats.open}`, inline: true },
            { name: '🔒 Cerrados', value: `${stats.closed}`, inline: true },
            { name: '📅 Hoy', value: `${stats.today}`, inline: true },
            { name: '⭐ Calificación promedio', value: stats.avgRating ? `${parseFloat(stats.avgRating).toFixed(1)}/5.0` : 'Sin datos', inline: true }
          )
          .setTimestamp()
        ]
      });
    }
  },

  // ── /setup ──────────────────────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('setup')
      .setDescription('Configura los canales del bot')
      .addChannelOption(o => o.setName('logs').setDescription('Canal de logs').setRequired(false))
      .addChannelOption(o => o.setName('transcripciones').setDescription('Canal de transcripciones').setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
      const { guild } = interaction;
      const updates = {};
      const logsChannel = interaction.options.getChannel('logs');
      const transcriptChannel = interaction.options.getChannel('transcripciones');
      if (logsChannel) updates.log_channel = logsChannel.id;
      if (transcriptChannel) updates.transcript_channel = transcriptChannel.id;

      GuildConfig.update(guild.id, updates);

      const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('⚙️ Configuración actualizada')
          .setDescription(`Para configuración completa visita:\n🌐 **[Panel Web](${dashboardUrl})**`)
          .addFields(
            logsChannel ? { name: '📋 Canal de logs', value: `${logsChannel}`, inline: true } : [],
            transcriptChannel ? { name: '📄 Canal de transcripciones', value: `${transcriptChannel}`, inline: true } : []
          ).spliceFields(0, 0)
          .setTimestamp()
        ], ephemeral: true
      });
    }
  }
];

module.exports = commands;
