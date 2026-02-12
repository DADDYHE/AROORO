/**
 * 数据访问控制功能测试
 * 用于验证身份选择、权限控制和数据隔离机制
 */

const { dataAccessController } = require('./utils/dataAccessController')
const { permissionManager } = require('./utils/permissionManager')
const IdentityManager = require('./utils/identityManager')
const RoleManager = require('./utils/roleManager')

// 模拟数据
const mockData = {
  pets: [
    {
      _id: 'pet_001',
      ownerId: 'user_owner_001',
      name: '小黑',
      type: '狗狗',
      age: 2
    },
    {
      _id: 'pet_002',
      ownerId: 'user_owner_002',
      name: '小白',
      type: '猫咪',
      age: 1
    }
  ],
  orders: [
    {
      _id: 'order_001',
      ownerId: 'user_owner_001',
      hostId: 'user_host_001',
      status: 'pending',
      price: 128
    },
    {
      _id: 'order_002',
      ownerId: 'user_owner_002',
      hostId: 'user_host_002',
      status: 'completed',
      price: 100
    }
  ],
  messages: [
    {
      _id: 'msg_001',
      from: 'user_owner_001',
      to: 'user_host_001',
      content: '您好，想咨询寄养服务'
    },
    {
      _id: 'msg_002',
      from: 'user_host_001',
      to: 'user_owner_001',
      content: '您好，请问您需要什么服务？'
    }
  ],
  profiles: {
    owner: {
      _id: 'profile_owner_001',
      userId: 'user_owner_001',
      ownerName: '宠物主人A',
      avatarUrl: 'cloud://xxx/avatar1.png'
    },
    host: {
      _id: 'profile_host_001',
      userId: 'user_host_001',
      hostName: '寄养家庭A',
      address: '北京市朝阳区xxx',
      pricePerDay: 128
    }
  },
  hostData: [
    {
      _id: 'host_001',
      userId: 'user_host_001',
      hostName: '有爱家庭寄养',
      maxPets: '6-8只',
      status: 'pending'
    },
    {
      _id: 'host_002',
      userId: 'user_host_002',
      hostName: '温馨家庭寄养',
      maxPets: '3-5只',
      status: 'active'
    }
  ]
}

// 测试函数
function runTests() {
  console.log('=================================')
  console.log('开始数据访问控制功能测试')
  console.log('=================================\n')

  // 测试1：宠物主人角色的宠物访问权限
  testOwnerPetAccess()

  // 测试2：寄养家庭角色的订单访问权限
  testHostOrderAccess()

  // 测试3：消息访问权限验证
  testMessageAccess()

  // 测试4：数据过滤功能
  testDataFiltering()

  // 测试5：批量权限检查
  testBatchPermissionCheck()

  // 测试6：角色切换后的权限变化
  testRoleSwitchPermission()

  console.log('\n=================================')
  console.log('所有测试完成')
  console.log('=================================\n')
}

/**
 * 测试1：宠物主人角色的宠物访问权限
 */
function testOwnerPetAccess() {
  console.log('\n【测试1】宠物主人角色的宠物访问权限')
  console.log('-----------------------------------')

  const ownerId = 'user_owner_001'

  // 测试1.1：查看自己的宠物（应该允许）
  const myPet = mockData.pets[0]
  const viewMyPetResult = dataAccessController.checkAccess('pet', 'view', myPet)
  console.log('✓ 查看自己的宠物:', viewMyPetResult.allowed ? '允许' : '拒绝', viewMyPetResult.reason || '')

  // 测试1.2：查看别人的宠物（应该拒绝）
  const otherPet = mockData.pets[1]
  const viewOtherPetResult = dataAccessController.checkAccess('pet', 'view', otherPet)
  console.log('✗ 查看别人的宠物:', viewOtherPetResult.allowed ? '允许' : '拒绝', viewOtherPetResult.reason || '')

  // 测试1.3：添加宠物（应该允许）
  const addPetResult = dataAccessController.checkAccess('pet', 'create')
  console.log('✓ 添加宠物:', addPetResult.allowed ? '允许' : '拒绝', addPetResult.reason || '')

  // 测试1.4：编辑别人的宠物（应该拒绝）
  const editOtherPetResult = dataAccessController.checkAccess('pet', 'edit', otherPet)
  console.log('✗ 编辑别人的宠物:', editOtherPetResult.allowed ? '允许' : '拒绝', editOtherPetResult.reason || '')

  // 测试1.5：删除别人的宠物（应该拒绝）
  const deleteOtherPetResult = dataAccessController.checkAccess('pet', 'delete', otherPet)
  console.log('✗ 删除别人的宠物:', deleteOtherPetResult.allowed ? '允许' : '拒绝', deleteOtherPetResult.reason || '')
}

/**
 * 测试2：寄养家庭角色的订单访问权限
 */
function testHostOrderAccess() {
  console.log('\n【测试2】寄养家庭角色的订单访问权限')
  console.log('-----------------------------------')

  const hostId = 'user_host_001'

  // 测试2.1：查看自己收到的订单（应该允许）
  const myOrder = mockData.orders[0]
  const viewMyOrderResult = dataAccessController.checkAccess('order', 'view', myOrder)
  console.log('✓ 查看自己收到的订单:', viewMyOrderResult.allowed ? '允许' : '拒绝', viewMyOrderResult.reason || '')

  // 测试2.2：查看别人的订单（应该拒绝）
  const otherOrder = mockData.orders[1]
  const viewOtherOrderResult = dataAccessController.checkAccess('order', 'view', otherOrder)
  console.log('✗ 查看别人的订单:', viewOtherOrderResult.allowed ? '允许' : '拒绝', viewOtherOrderResult.reason || '')

  // 测试2.3：接受订单（应该允许）
  const acceptOrderResult = dataAccessController.checkAccess('order', 'accept', myOrder)
  console.log('✓ 接受订单:', acceptOrderResult.allowed ? '允许' : '拒绝', acceptOrderResult.reason || '')

  // 测试2.4：拒绝订单（应该允许）
  const rejectOrderResult = dataAccessController.checkAccess('order', 'reject', myOrder)
  console.log('✓ 拒绝订单:', rejectOrderResult.allowed ? '允许' : '拒绝', rejectOrderResult.reason || '')

  // 测试2.5：完成订单（应该允许）
  const completeOrderResult = dataAccessController.checkAccess('order', 'complete', myOrder)
  console.log('✓ 完成订单:', completeOrderResult.allowed ? '允许' : '拒绝', completeOrderResult.reason || '')
}

/**
 * 测试3：消息访问权限验证
 */
function testMessageAccess() {
  console.log('\n【测试3】消息访问权限验证')
  console.log('-----------------------------------')

  const userId = 'user_owner_001'

  // 测试3.1：查看自己发送的消息（应该允许）
  const myMessage = mockData.messages[0]
  const viewMyMessageResult = dataAccessController.checkAccess('message', 'view', myMessage)
  console.log('✓ 查看自己发送的消息:', viewMyMessageResult.allowed ? '允许' : '拒绝', viewMyMessageResult.reason || '')

  // 测试3.2：查看自己收到的消息（应该允许）
  const receivedMessage = mockData.messages[1]
  const viewReceivedMessageResult = dataAccessController.checkAccess('message', 'view', receivedMessage)
  console.log('✓ 查看自己收到的消息:', viewReceivedMessageResult.allowed ? '允许' : '拒绝', viewReceivedMessageResult.reason || '')

  // 测试3.3：查看别人的消息（应该拒绝）
  const otherMessage = {
    _id: 'msg_003',
    from: 'user_owner_002',
    to: 'user_host_002',
    content: '别人的消息'
  }
  const viewOtherMessageResult = dataAccessController.checkAccess('message', 'view', otherMessage)
  console.log('✗ 查看别人的消息:', viewOtherMessageResult.allowed ? '允许' : '拒绝', viewOtherMessageResult.reason || '')
}

/**
 * 测试4：数据过滤功能
 */
function testDataFiltering() {
  console.log('\n【测试4】数据过滤功能')
  console.log('-----------------------------------')

  // 测试4.1：过滤宠物列表
  const filteredPets = dataAccessController.filterData('pet', 'list', mockData.pets)
  console.log('✓ 过滤前宠物数量:', mockData.pets.length)
  console.log('✓ 过滤后宠物数量:', filteredPets.length)
  console.log('  过滤结果:', filteredPets.map(p => ({ id: p._id, name: p.name })))

  // 测试4.2：过滤订单列表
  const filteredOrders = dataAccessController.filterData('order', 'list', mockData.orders)
  console.log('✓ 过滤前订单数量:', mockData.orders.length)
  console.log('✓ 过滤后订单数量:', filteredOrders.length)
  console.log('  过滤结果:', filteredOrders.map(o => ({ id: o._id, status: o.status })))

  // 测试4.3：过滤消息列表
  const filteredMessages = dataAccessController.filterData('message', 'list', mockData.messages)
  console.log('✓ 过滤前消息数量:', mockData.messages.length)
  console.log('✓ 过滤后消息数量:', filteredMessages.length)
  console.log('  过滤结果:', filteredMessages.map(m => ({ id: m._id, from: m.from, to: m.to })))
}

/**
 * 测试5：批量权限检查
 */
function testBatchPermissionCheck() {
  console.log('\n【测试5】批量权限检查')
  console.log('-----------------------------------')

  const requests = [
    { dataType: 'pet', action: 'view', data: mockData.pets[0] },
    { dataType: 'pet', action: 'edit', data: mockData.pets[0] },
    { dataType: 'pet', action: 'delete', data: mockData.pets[1] },
    { dataType: 'order', action: 'view', data: mockData.orders[0] },
    { dataType: 'order', action: 'accept', data: mockData.orders[0] }
  ]

  const results = dataAccessController.checkAccessBatch(requests)
  console.log('✓ 批量检查结果:')
  results.forEach((result, index) => {
    console.log(`  ${index + 1}. ${requests[index].dataType}.${requests[index].action}: ${result.allowed ? '允许' : '拒绝'}`, result.reason || '')
  })
}

/**
 * 测试6：角色切换后的权限变化
 */
function testRoleSwitchPermission() {
  console.log('\n【测试6】角色切换后的权限变化')
  console.log('-----------------------------------')

  // 测试6.1：宠物主人角色的权限
  console.log('\n--- 宠物主人角色 ---')
  const ownerPetPermission = permissionManager.checkPermission('owner', 'pet', 'create')
  const ownerOrderPermission = permissionManager.checkPermission('owner', 'order', 'create')
  const hostManagePermission = permissionManager.checkPermission('owner', 'host', 'manage')

  console.log('✓ 宠物主人 - 创建宠物:', ownerPetPermission ? '有权限' : '无权限')
  console.log('✓ 宠物主人 - 创建订单:', ownerOrderPermission ? '有权限' : '无权限')
  console.log('✗ 宠物主人 - 管理寄养服务:', hostManagePermission ? '有权限' : '无权限')

  // 测试6.2：寄养家庭角色的权限
  console.log('\n--- 寄养家庭角色 ---')
  const hostPetPermission = permissionManager.checkPermission('host', 'pet', 'create')
  const hostOrderPermission = permissionManager.checkPermission('host', 'order', 'accept')
  const hostHostPermission = permissionManager.checkPermission('host', 'host', 'manage')

  console.log('✗ 寄养家庭 - 创建宠物:', hostPetPermission ? '有权限' : '无权限')
  console.log('✓ 寄养家庭 - 接受订单:', hostOrderPermission ? '有权限' : '无权限')
  console.log('✓ 寄养家庭 - 管理寄养服务:', hostHostPermission ? '有权限' : '无权限')
}

/**
 * 测试7：访问日志功能
 */
function testAccessLogging() {
  console.log('\n【测试7】访问日志功能')
  console.log('-----------------------------------')

  // 执行一些访问检查以生成日志
  dataAccessController.checkAccess('pet', 'view', mockData.pets[0])
  dataAccessController.checkAccess('pet', 'edit', mockData.pets[1])
  dataAccessController.checkAccess('order', 'view', mockData.orders[0])

  // 获取访问日志
  const accessLog = dataAccessController.getAccessLog(10)
  console.log('✓ 最近的访问记录:')
  accessLog.forEach((log, index) => {
    console.log(`  ${index + 1}. ${log.timestamp} - ${log.result}: ${log.dataType}.${log.action} (${log.role})`)
    if (log.reason) {
      console.log(`     原因: ${log.reason}`)
    }
  })

  // 清除访问日志
  dataAccessController.clearAccessLog()
  console.log('\n✓ 访问日志已清除')

  const logAfterClear = dataAccessController.getAccessLog()
  console.log('✓ 清除后的日志数量:', logAfterClear.length)
}

// 运行所有测试
runTests()

// 导出测试函数供外部调用
module.exports = {
  runTests,
  testOwnerPetAccess,
  testHostOrderAccess,
  testMessageAccess,
  testDataFiltering,
  testBatchPermissionCheck,
  testRoleSwitchPermission,
  testAccessLogging
}
