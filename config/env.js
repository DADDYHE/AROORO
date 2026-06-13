const CURRENT_ENV = 'production'

const DEFAULT_ENVIRONMENTS = {
  development: {
    name: '开发环境',
    envId: '',
    appId: '',
    qqMapKey: '',
    logLevel: 0,
    enableDebug: true,
    enableMock: false,
    apiBaseUrl: '',
  },
  staging: {
    name: '预发布环境',
    envId: '',
    appId: '',
    qqMapKey: '',
    logLevel: 2,
    enableDebug: false,
    enableMock: false,
    apiBaseUrl: '',
  },
  production: {
    name: '生产环境',
    envId: '',
    appId: '',
    qqMapKey: '',
    logLevel: 3,
    enableDebug: false,
    enableMock: false,
    apiBaseUrl: '',
  },
}

let secrets = {}
try {
  secrets = require('./env.secrets.js')
} catch {
  console.warn('[env.js] 未找到 env.secrets.js，使用默认空配置')
}

function getEnvConfig() {
  const config = { ...DEFAULT_ENVIRONMENTS[CURRENT_ENV] || DEFAULT_ENVIRONMENTS.development }
  const envSecrets = secrets[CURRENT_ENV] || {}

  config.envId = envSecrets.envId || config.envId
  config.appId = envSecrets.appId || config.appId
  config.qqMapKey = envSecrets.qqMapKey || config.qqMapKey
  config.customerServicePhone = envSecrets.customerServicePhone || config.customerServicePhone || ''

  if (!config.envId || !config.appId) {
    console.warn('[env.js] 环境配置不完整，请检查 config/env.secrets.js')
  }

  return config
}

module.exports = getEnvConfig()
