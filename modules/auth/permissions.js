// ============================================================================
// permissions.js — ACL helpers
// ============================================================================
(function (global) {
  'use strict';
  const ACL = {
    owner: ['pos','menu_edit','reports_all','inventory','users','settings','sync_config','backup'],
    staff: ['pos','reports_today'],
  };
  const Permissions = {
    can(role, action) {
      const list = ACL[role] || [];
      return list.includes(action) || list.includes('all');
    },
  };
  global.Permissions = Permissions;
})(window);
