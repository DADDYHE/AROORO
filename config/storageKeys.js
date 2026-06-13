const STORAGE_KEYS = {
  AUTH: {
    USER_INFO: 'central:userInfo',
    IS_LOGOUT: 'central:isLogout',
    LOGIN_EXPIRY: 'central:loginExpiry',
  },
}

const FLAT_KEYS = {}
Object.values(STORAGE_KEYS).forEach(group => {
  Object.entries(group).forEach(([key, value]) => {
    FLAT_KEYS[key] = value
  })
})

module.exports = {
  STORAGE_KEYS,
  ...FLAT_KEYS,
}
