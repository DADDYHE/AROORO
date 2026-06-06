/**
 * test/post-commit-correctness.test.js —— 已废弃
 *
 * 原因：原文件引用了不存在的 `../utils/CentralIdentityManager` 模块，无法运行。
 *
 * 替代方案：参见 `test/common-utils.test.js`，已切换到对真实存在的 cloudfunctions/common 模块
 *          进行单元测试，覆盖 utils.js 的核心 API（错误码、响应壳、ID 生成分页、批处理等）。
 *
 * 本文件保留为占位，便于审计工具（如 audit.yml）识别「旧测试已迁移」。
 */

describe('已废弃测试（迁移至 test/common-utils.test.js）', () => {
  test.skip('占位：原 CentralIdentityManager 集成测试已迁移', () => {
    // no-op
  })
})
