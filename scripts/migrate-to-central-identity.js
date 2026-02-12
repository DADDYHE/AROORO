#!/usr/bin/env node

/**
 * 批量迁移脚本：将所有页面迁移到 CentralIdentityManager
 *
 * 执行：
 * node scripts/migrate-to-central-identity.js
 */

const fs = require('fs')
const path = require('path')
const readline = require('readline')

// 要迁移的文件列表
const filesToMigrate = [
  'pages/booking/calendar.js',
  'pages/home/index.js',
  'pages/pet/detail.js',
  'subpackages/profile/edit/index.js',
  'subpackages/profile/settings/index.js',
]

// 替换规则
const replacements = [
  // 导入替换
  {
    pattern: /const IdentityManager = require\(['"`]\.\.\/utils\/identityManager['"`]\)/g,
    replacement: "const { centralIdentityManager } = require('../../utils/CentralIdentityManager')",
  },
  {
    pattern: /const RoleManager = require\(['"`]\.\.\/utils\/roleManager['"`]\)/g,
    replacement: "// const RoleManager = require('../../utils/roleManager') // 已迁移到 CentralIdentityManager",
  },
  // API 调用替换
  {
    pattern: /IdentityManager\.getCurrentIdentity\(\)/g,
    replacement: 'centralIdentityManager.getCurrentIdentity()',
  },
  {
    pattern: /IdentityManager\.getCurrentRole\(\)/g,
    replacement: 'centralIdentityManager.getCurrentRole()',
  },
  {
    pattern: /app\.globalData\.userRole/g,
    replacement: 'centralIdentityManager.getCurrentRole()',
  },
  // 注册回调替换
  {
    pattern: /RoleManager\.registerRoleChangeCallback\(/g,
    replacement: "// RoleManager.registerRoleChangeCallback( // 已迁移到 CentralIdentityManager 事件系统",
  },
]

/**
 * 迁移单个文件
 */
function migrateFile(filePath) {
  console.log(`\n迁移文件: ${filePath}`)

  const fullPath = path.join(__dirname, '..', filePath)

  if (!fs.existsSync(fullPath)) {
    console.log(`  ⚠️  文件不存在，跳过`)
    return false
  }

  // 读取文件内容
  let content = fs.readFileSync(fullPath, 'utf8')

  // 应用替换规则
  let modified = false
  replacements.forEach((rule) => {
    const matches = content.match(rule.pattern)
    if (matches && matches.length > 0) {
      console.log(`  ✓ 找到 ${matches.length} 处匹配: ${rule.pattern.toString().substring(0, 50)}...`)
      content = content.replace(rule.pattern, rule.replacement)
      modified = true
    }
  })

  if (!modified) {
    console.log(`  ℹ️  文件无需修改`)
    return false
  }

  // 备份原文件
  const backupPath = fullPath + '.old'
  fs.writeFileSync(backupPath, fs.readFileSync(fullPath))
  console.log(`  ✓ 已备份到: ${path.basename(backupPath)}`)

  // 写入新文件
  fs.writeFileSync(fullPath, content)
  console.log(`  ✓ 已迁移文件`)

  return true
}

/**
 * 主函数
 */
function main() {
  console.log('========================================')
  console.log('批量迁移到 CentralIdentityManager')
  console.log('========================================')

  let successCount = 0
  let modifiedCount = 0

  filesToMigrate.forEach((filePath) => {
    try {
      const modified = migrateFile(filePath)
      if (modified) {
        modifiedCount++
      }
      successCount++
    } catch (error) {
      console.error(`  ✗ 迁移失败: ${error.message}`)
    }
  })

  console.log('\n========================================')
  console.log('迁移完成')
  console.log('========================================')
  console.log(`总共: ${filesToMigrate.length} 个文件`)
  console.log(`成功: ${successCount} 个文件`)
  console.log(`修改: ${modifiedCount} 个文件`)
  console.log(`\n备份文件扩展名: .old`)
  console.log(`如需回滚，请恢复 .old 文件`)
}

// 运行主函数
main()
