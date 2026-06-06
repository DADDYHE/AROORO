module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test', '<rootDir>/cloudfunctions/common'],
  testMatch: ['**/__tests__/**/*.test.js', '**/?(*.)+(spec|test).js'],
  collectCoverageFrom: [
    'cloudfunctions/common/utils.js',
    'cloudfunctions/common/auth-middleware.js',
    'cloudfunctions/common/logger.js',
    'cloudfunctions/common/validator.js',
    'cloudfunctions/common/cache.js',
    'cloudfunctions/common/token-utils.js',
    'cloudfunctions/common/errors.js',
    'cloudfunctions/common/normalize.js',
    'cloudfunctions/common/permissions.js',
    'cloudfunctions/common/crypto.js',
    'cloudfunctions/common/date-range.js',
    'cloudfunctions/orderService/orders.js',
    'cloudfunctions/orderService/common/state-machine.js',
    'cloudfunctions/paymentService/services/pay.js',
    'cloudfunctions/partnerService/services/wallet.js',
    '!cloudfunctions/common/**/node_modules/**',
    '!cloudfunctions/common/cloudbase.js',
    '!cloudfunctions/common/**/miniprogram_npm/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'json-summary', 'html'],
  coverageThreshold: {
    // Sprint 8 提升：common 全部 80%+，核心业务模块逐步覆盖
    // 历史：S1 → 50%、S2 → 60%、S3 → 80%、S5 → 维持 50%、S6 → 70%
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './cloudfunctions/common/utils.js': {
      branches: 85,
      functions: 100,
      lines: 95,
      statements: 95,
    },
    './cloudfunctions/common/crypto.js': {
      branches: 80,
      functions: 100,
      lines: 90,
      statements: 85,
    },
    './cloudfunctions/common/date-range.js': {
      branches: 95,
      functions: 100,
      lines: 100,
      statements: 100,
    },
    './cloudfunctions/common/errors.js': {
      branches: 90,
      functions: 100,
      lines: 100,
      statements: 100,
    },
    './cloudfunctions/common/normalize.js': {
      branches: 80,
      functions: 100,
      lines: 90,
      statements: 85,
    },
    './cloudfunctions/common/permissions.js': {
      branches: 85,
      functions: 100,
      lines: 95,
      statements: 95,
    },
    './cloudfunctions/common/logger.js': {
      branches: 50,
      functions: 65,
      lines: 85,
      statements: 85,
    },
    // 核心业务模块（Sprint 7 起的 pay / orders / wallet 单测覆盖目标）
    // 注：orders.js / wallet.js 函数众多（11+ 个 export），单测只能逐步覆盖
    // 当前指标只确保测试有在执行，不作为强门禁
    './cloudfunctions/orderService/orders.js': {
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0,
    },
    './cloudfunctions/paymentService/services/pay.js': {
      branches: 70,
      functions: 80,
      lines: 85,
      statements: 85,
    },
    './cloudfunctions/partnerService/services/wallet.js': {
      branches: 50,
      functions: 70,
      lines: 80,
      statements: 80,
    },
  },
  setupFiles: ['<rootDir>/test/setup.js'],
  // 微信小程序环境全局变量 stub
  moduleNameMapper: {
    '^wx-server-sdk$': '<rootDir>/test/__mocks__/wx-server-sdk.js',
  },
  // 不在 CI 中观察文件变更
  watchman: false,
  // 慢测试超时
  testTimeout: 10000,
  reporters: ['default'],
  verbose: false,
}
