// src/database/config.js
// Funciones para leer/escribir configuración en Supabase
// Reemplaza también a guildConfigSupabase.js (puedes borrar ese archivo)

const supabase = require('./supabase');

/**
 * Obtiene toda la config de un guild desde Supabase.
 * Retorna null si no existe o si hay error.
 */
async function getGuildConfig(guildId) {
  try {
    const { data, error } = await supabase
      .from('guild_config')
      .select('*')
      .eq('guild_id', guildId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found (no es error real)
      console.error('Supabase getGuildConfig error:', error.message);
    }
    return data || null;
  } catch (err) {
    console.error('Supabase conexión fallida:', err.message);
    return null;
  }
}

/**
 * Guarda (upsert) cualquier campo de configuración para un guild.
 * Ejemplo: saveGuildConfig('123', { transcript_channel_id: '456' })
 */
async function saveGuildConfig(guildId, data) {
  try {
    const { error } = await supabase
      .from('guild_config')
      .upsert({ guild_id: guildId, ...data }, { onConflict: 'guild_id' });

    if (error) console.error('Supabase saveGuildConfig error:', error.message);
    return !error;
  } catch (err) {
    console.error('Supabase conexión fallida:', err.message);
    return false;
  }
}

module.exports = { getGuildConfig, saveGuildConfig };
