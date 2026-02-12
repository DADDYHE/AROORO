/**
 * 身份管理器迁移脚本
 * 用于将现有页面迁移到集中式身份管理器
 */

const fs = require('fs')
const path = require('path')
const { accessInterceptor, PROHIBITED_PATTERNS } = require('../utils/identityAccessMiddleware')

// 迁移规则
const MIGRATION_RULES = [
  {
    pattern: /wx\.getStorageSync\s*\(\s*['"]userRole['"]\s*\)/g,
    replacement: 'centralIdentityManager.getCurrentRole()',
    description: '替换为 CentralIdentityManager.getCurrentRole()'
  },
  {
    pattern: /wx\.getStorageSync\s*\(\s*['"]userInfo['"]\s*\)/g,
    replacement: 'centralIdentityManager.getCurrentIdentity()',
    description: '替换为 CentralIdentityManager.getCurrentIdentity()'
  },
  {
    pattern: /wx\.getStorageSync\s*\(\s*['"]hostInfo['"]\s*\)/g,
    replacement: 'centralIdentityManager.getIdentity(ROLE_TYPES.HOST)',
    description: '替换为 CentralIdentityManager.getIdentity(ROLE_TYPES.HOST)'
  },
  {
    pattern: /wx\.getStorageSync\s*\(\s*['"]ownerInfo['"]\s*\)/g,
    replacement: 'centralIdentityManager.getIdentity(ROLE_TYPES.OWNER)',
    description: '替换为 CentralIdentityManager.getIdentity(ROLE_TYPES.OWNER)'
  },
  {
    pattern: /app\.globalData\.userRole\s*=\s*([^;]+)/g,
    replacement: 'centralIdentityManager.switchRole($1)',
    description: '替换为 CentralIdentityManager.switchRole()'
  },
  {
    pattern: /wx\.setStorageSync\s*\(\s*['"]userRole['"]\s*,\s*([^)]+)\)/g,
    replacement: 'centralIdentityManager.switchRole($1)',
    description: '替换为 CentralIdentityManager.switchRole()'
  },
  {
    pattern: /app\.globalData\.userInfo\s*=\s*([^;]+)/g,
    replacement: '/* 需要使用 centralIdentityManager.login() 方法 */',
    description: '提示使用 CentralIdentityManager.login()'
  },
  {
    pattern: /app\.globalData\.userRole\b/g,
    replacement: 'centralIdentityManager.getCurrentRole()',
    description: '替换为 CentralIdentityManager.getCurrentRole()'
  },
  {
    pattern: /app\.globalData\.userInfo\b/g,
    replacement: 'centralIdentityManager.getCurrentIdentity()',
    description: '替换为 CentralIdentityManager.getCurrentIdentity()'
  },
  {
    pattern: /app\.globalData\.hostInfo\b/g,
    replacement: 'centralIdentityManager.getIdentity(ROLE_TYPES.HOST)',
    description: '替换为 CentralIdentityManager.getIdentity(ROLE_TYPES.HOST)'
  },
  {
    pattern: /app\.globalData\.ownerInfo\b/g,
    replacement: 'centralIdentityManager.getIdentity(ROLE_TYPES.OWNER)',
    description: '替换为 CentralIdentityManager.getIdentity(ROLE_TYPES.OWNER)'
  }
]

/**
 * 扫描文件并检测违规访问
 * @param {string} filePath - 文件路径
 * @returns {object} 扫描结果
 */
function scanFile(filePath) {
  try {
    const code = fs.readFileSync(filePath, 'utf-8')
    const violations = accessInterceptor.checkViolations(code, filePath)

    return {
      filePath,
      violations,
      hasViolations: violations.length > 0
    }
  } catch (error) {
    console.error(`扫描文件失败: ${filePath}`, error)
    return {
      filePath,
      violations: [],
      hasViolations: false,
      error: error.message
    }
  }
}

/**
 * 扫描目录
 * @param {string} dirPath - 目录路径
 * @param {array} extensions - 要扫描的文件扩展名
 * @returns {array} 扫描结果列表
 */
function scanDirectory(dirPath, extensions = ['.js', '.wxml']) {
  const results = []

  function traverse(currentPath) {
    const items = fs.readdirSync(currentPath)

    items.forEach(item => {
      const itemPath = path.join(currentPath, item)
      const stat = fs.statSync(itemPath)

      if (stat.isDirectory()) {
        // 跳过 node_modules 等目录
        if (!['node_modules', '.git', 'miniprogram_npm'].includes(item)) {
          traverse(itemPath)
        }
      } else if (stat.isFile()) {
        const ext = path.extname(item)
        if (extensions.includes(ext)) {
          const result = scanFile(itemPath)
          if (result.hasViolations) {
            results.push(result)
          }
        }
      }
    })
  }

  traverse(dirPath)
  return results
}

/**
 * 迁移文件
 * @param {string} filePath - 文件路径
 * @param {boolean} dryRun - 是否只运行不修改
 * @returns {object} 迁移结果
 */
function migrateFile(filePath, dryRun = true) {
  try {
    const originalCode = fs.readFileSync(filePath, 'utf-8')
    let code = originalCode
    const migrations = []

    // 应用所有迁移规则
    MIGRATION_RULES.forEach(rule => {
      const matches = originalCode.match(rule.pattern)
      if (matches) {
        code = code.replace(rule.pattern, rule.replacement)
        migrations.push({
          rule: rule.description,
          matches: matches.length,
          samples: matches.slice(0, 3) // 只保存前3个示例
        })
      }
    })

    if (migrations.length > 0 && !dryRun) {
      // 创建备份
      const backupPath = `${filePath}.backup`
      fs.writeFileSync(backupPath, originalCode, 'utf-8')

      // 写入迁移后的代码
      fs.writeFileSync(filePath, code, 'utf-8')

      console.log(`✓ 已迁移文件: ${filePath}`)
      console.log(`  备份: ${backupPath}`)
    }

    return {
      filePath,
      hasChanges: migrations.length > 0,
      migrations
    }
  } catch (error) {
    console.error(`迁移文件失败: ${filePath}`, error)
    return {
      filePath,
      hasChanges: false,
      error: error.message
    }
  }
}

/**
 * 批量迁移目录
 * @param {string} dirPath - 目录路径
 * @param {boolean} dryRun - 是否只运行不修改
 * @returns {object} 迁移结果
 */
function migrateDirectory(dirPath, dryRun = true) {
  const results = {
    totalFiles: 0,
    migratedFiles: 0,
    skippedFiles: 0,
    errors: [],
    details: []
  }

  function traverse(currentPath) {
    const items = fs.readdirSync(currentPath)

    items.forEach(item => {
      const itemPath = path.join(currentPath, item)
      const stat = fs.statSync(itemPath)

      if (stat.isDirectory()) {
        if (!['node_modules', '.git', 'miniprogram_npm'].includes(item)) {
          traverse(itemPath)
        }
      } else if (stat.isFile() && path.extname(item) === '.js') {
        results.totalFiles++
        const result = migrateFile(itemPath, dryRun)

        if (result.error) {
          results.errors.push(result)
        } else if (result.hasChanges) {
          results.migratedFiles++
          results.details.push(result)
        } else {
          results.skippedFiles++
        }
      }
    })
  }

  traverse(dirPath)
  return results
}

/**
 * 生成迁移报告
 * @param {object} scanResults - 扫描结果
 * @param {object} migrationResults - 迁移结果
 */
function generateReport(scanResults, migrationResults) {
  console.log('\n========================================')
  console.log('身份管理器迁移报告')
  console.log('========================================\n')

  // 扫描结果
  console.log('📊 扫描结果')
  console.log('-' * 40)
  console.log(`违规文件数: ${scanResults.length}`)
  let totalViolations = 0
  scanResults.forEach(result => {
    totalViolations += result.violations.length
  })
  console.log(`总违规数: ${totalViolations}`)

  if (scanResults.length > 0) {
    console.log('\n📁 违规文件列表:')
    scanResults.slice(0, 10).forEach((result, index) => {
      console.log(`  ${index + 1}. ${result.filePath}`)
      console.log(`     违规数: ${result.violations.length}`)
    })
    if (scanResults.length > 10) {
      console.log(`  ... 还有 ${scanResults.length - 10} 个文件`)
    }
  }

  // 迁移结果
  if (migrationResults) {
    console.log('\n🔧 迁移结果')
    console.log('-' * 40)
    console.log(`总文件数: ${migrationResults.totalFiles}`)
    console.log(`已迁移文件数: ${migrationResults.migratedFiles}`)
    console.log(`跳过文件数: ${migrationResults.skippedFiles}`)
    console.log(`错误数: ${migrationResults.errors.length}`)

    if (migrationResults.errors.length > 0) {
      console.log('\n❌ 错误列表:')
      migrationResults.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error.filePath}`)
        console.log(`     ${error.error}`)
      })
    }
  }

  console.log('\n========================================\n')
}

// 命令行接口
if (require.main === module) {
  const args = process.argv.slice(2)
  const command = args[0]
  const targetPath = args[1] || './'

  switch (command) {
    case 'scan':
      console.log(`🔍 扫描目录: ${targetPath}`)
      const scanResults = scanDirectory(targetPath)
      generateReport(scanResults)
      break

    case 'migrate':
      const dryRun = args.includes('--dry-run')
      console.log(`🔄 迁移目录: ${targetPath} (${dryRun ? '模拟运行' : '实际执行'})`)
      const migrationResults = migrateDirectory(targetPath, dryRun)
      generateReport([], migrationResults)
      break

    case 'help':
      console.log(`
身份管理器迁移工具

使用方法:
  node migrate-identity-manager.js <command> [path] [options]

命令:
  scan [path]           扫描目录，检测违规访问
  migrate [path]        迁移目录中的文件
  help                   显示帮助信息

选项:
  --dry-run              模拟运行，不实际修改文件

示例:
  node migrate-identity-manager.js scan ./pages
  node migrate-identity-manager.js migrate ./pages
  node migrate-identity-manager.js migrate ./pages --dry-run
      `)
      break

    default:
      console.log('未知命令。使用 "help" 查看帮助信息')
      break
  }
}

module.exports = {
  scanFile,
  scanDirectory,
  migrateFile,
  migrateDirectory,
  generateReport,
  MIGRATION_RULES
}
