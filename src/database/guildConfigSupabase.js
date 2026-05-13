const supabase = require('./supabase');

async function setTranscriptChannel(guildId, channelId) {
  const { error } = await supabase
    .from('guild_config')
    .upsert({ guild_id: guildId, transcript_channel_id: channelId });

  if (error) console.error(error);
}

async function getTranscriptChannel(guildId) {
  const { data, error } = await supabase
    .from('guild_config')
    .select('transcript_channel_id')
    .eq('guild_id', guildId)
    .single();

  if (error) return null;
  return data?.transcript_channel_id;
}

module.exports = { setTranscriptChannel, getTranscriptChannel };