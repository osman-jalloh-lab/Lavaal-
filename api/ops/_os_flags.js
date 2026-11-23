'use strict';

function businessPagesEnabled(env) {
  return Boolean(env && (env.OS_BUSINESS_PAGES === '1' || env.OS_BUSINESS_PAGES === 'true'));
}

module.exports = { businessPagesEnabled };
