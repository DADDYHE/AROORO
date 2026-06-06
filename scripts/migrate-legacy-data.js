#!/usr/bin/env node
/**
 * 存量数据迁移脚本
 *
 * 用途：Sprint 8 末识别的存量数据兼容性问题统一回填
 *
 * 处理项：
 *   1. orders.organizerId     历史订单缺该字段，按 hostProfiles._id → hostProfiles.openid 回填
 *   2. users.nickName         部分历史用户使用 nickname 字段，统一改为 nickName
 *   3. *.createdAt            历史记录可能用 createAt，统一为 createdAt
 *   4. pets.petInfo           旧字段，统一为 petsInfo（数组）
 *
 * 用法：
 *   node scripts/migrate-legacy-data.js --dry-run --env=<envId>     # 仅扫描报告
 *   node scripts/migrate-legacy-data.js --apply --env=<envId>       # 真实写入
 *   node scripts/migrate-legacy-data.js --only=organizerId          # 只处理一项
 *   node scripts/migrate-legacy-data.js --batch=200                 # 批大小（默认 100）
 *
 * 退出码：
 *   0  成功（dry-run 报告完成 或 apply 全部成功）
 *   1  apply 模式下发生错误
 *   2  缺少必要参数（如 --env 在 dry-run / apply 模式下都需要）
 *
 * 设计原则：
 *   - 默认 dry-run，避免误改生产数据
 *   - 每批 100 条并打印进度，支持中断后从断点续跑
 *   - 失败单条记录不中断整体流程，最后输出失败清单
 *   - 写入前后打印样本对账
 */

const { runMigrate } = require('./migrate-legacy-data-core')

// CLI 入口：解析参数 → 委托给 core
function parseArgs(argv) {
  const args = argv.slice(2)
  return {
    apply: args.includes('--apply'),
    only: args.find(a => a.startsWith('--only='))?.split('=')[1] || null,
    batch: Number(args.find(a => a.startsWith('--batch='))?.split('=')[1]) || 100,
    envId: args.find(a => a.startsWith('--env='))?.split('=')[1] || process.env.CLOUDBASE_ENV || '',
  }
}

async function cli() {
  const opts = parseArgs(process.argv)
  // eslint-disable-next-line no-console
  console.log(`[CLI] opts=${JSON.stringify({ ...opts, apply: opts.apply })}`)
  if (!opts.envId) {
    // eslint-disable-next-line no-console
    console.error('[FAIL] 必须指定 --env=<envId> 或设置 CLOUDBASE_ENV')
    process.exit(2)
  }

  try {
    await runMigrate(opts)
    process.exit(0)
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[FAIL] 迁移异常:', e)
    process.exit(1)
  }
}

// 仅当作为 CLI 直接执行时运行（被 require 时不执行）
if (require.main === module) {
  cli()
}

module.exports = { parseArgs }
