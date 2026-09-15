/** Historical production stdio catalog. Test-only migration baseline. */
export const prodReadNames = [
  'fcm_audit_log_list', 'fcm_bans_list', 'fcm_camp_search', 'fcm_channels_list',
  'fcm_commands_list', 'fcm_community_stats', 'fcm_health_get', 'fcm_messages_list',
  'fcm_messages_search', 'fcm_moderation_settings', 'fcm_name_blacklist_list',
  'fcm_parties_list', 'fcm_releases_list', 'fcm_reports_list', 'fcm_users_get',
  'fcm_users_list', 'fcm_users_search', 'fcm_version_get', 'fcm_wiki_search',
  'fcm_ws_count', 'fcm_ws_snapshot',
] as const;

export const prodMutationNames = [
  'fcm_bans_create', 'fcm_bans_reverse', 'fcm_channels_archive', 'fcm_channels_create',
  'fcm_channels_update', 'fcm_commands_create', 'fcm_commands_delete',
  'fcm_commands_update', 'fcm_kicks_create', 'fcm_messages_delete',
  'fcm_messages_send', 'fcm_mutes_create', 'fcm_mutes_delete',
  'fcm_name_blacklist_add', 'fcm_name_blacklist_remove', 'fcm_releases_create',
  'fcm_reports_resolve',
] as const;
