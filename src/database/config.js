const supabase = require('./supabase');

async function saveGuildConfig(guildId, data) {
  await supabase
    .from('guild_config')
    .upsert({
      guild_id: guildId,
      ...data
    });
}

async function getGuildConfig(guildId) {
  const { data } = await supabase
    .from('guild_config')
    .select('*')
    .eq('guild_id', guildId)
    .single();

  return data;
}

module.exports = { saveGuildConfig, getGuildConfig };