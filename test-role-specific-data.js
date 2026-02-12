// 测试角色特定数据加载
const IdentityManager = require('./utils/identityManager.js')

// 模拟应用实例和全局数据
global.app = {
  globalData: {
    userRole: 'host', // 寄养家庭身份
    userInfo: {
      _id: 'owner_00329sc5ml4lkwcwf72rubru',
      openid: 'oNIhl17JEstp_WtKcSq-EUKa93qk',
      avatarUrl: 'cloud://cloud1-8gvqhsiga3011047.636c-cloud1-8gvqhsiga3011047-1393880579/user-avatars/1770016901653-3kq8rtusm.png',
      nickName: '院方🏥招代理',
      role: 'owner'
    },
    hostInfo: {
      _id: 'host_00329sc5ml4lkwcwf72rubru',
      openid: 'oNIhl17JEstp_WtKcSq-EUKa93qk',
      avatarUrl: 'cloud://cloud1-8gvqhsiga3011047.636c-cloud1-8gvqhsiga3011047-1393880579/hostAvatars/1770008057452_384.png',
      hostName: '有爱家庭寄养',
      phone: '13800138000',
      address: '北京市朝阳区'
    },
    ownerInfo: {
      _id: 'owner_00329sc5ml4lkwcwf72rubru',
      openid: 'oNIhl17JEstp_WtKcSq-EUKa93qk',
      avatarUrl: 'cloud://cloud1-8gvqhsiga3011047.636c-cloud1-8gvqhsiga3011047-1393880579/user-avatars/1770016901653-3kq8rtusm.png',
      nickName: '院方🏥招代理',
      phone: '13900139000',
      address: '上海市浦东新区'
    }
  }
}

// 模拟 wx 对象
global.wx = {
  getStorageSync: function(key) {
    const storage = {
      userInfo: global.app.globalData.userInfo,
      userRole: global.app.globalData.userRole,
      hostInfo: global.app.globalData.hostInfo,
      ownerInfo: global.app.globalData.ownerInfo
    }
    return storage[key]
  },
  setStorageSync: function(key, value) {
    console.log(`setStorageSync - ${key}:`, value)
  }
}

console.log('=== 测试角色特定数据加载 ===')

// 测试 1: 获取当前角色
console.log('\n测试 1: 获取当前角色')
const currentRole = IdentityManager.getCurrentRole()
console.log('当前角色:', currentRole)

// 测试 2: 获取角色特定用户信息
console.log('\n测试 2: 获取角色特定用户信息')
const roleSpecificInfo = IdentityManager.getRoleSpecificUserInfo()
console.log('角色特定信息:', roleSpecificInfo)

// 测试 3: 验证信息来源
console.log('\n测试 3: 验证信息来源')
console.log('是否来自寄养家庭资料:', 
  roleSpecificInfo.hostName === '有爱家庭寄养' && 
  roleSpecificInfo.avatarUrl.includes('hostAvatars') &&
  roleSpecificInfo.phone === '13800138000' &&
  roleSpecificInfo.address === '北京市朝阳区'
)

// 测试 4: 切换到宠物主人身份
console.log('\n测试 4: 切换到宠物主人身份')
global.app.globalData.userRole = 'owner'
const ownerRole = IdentityManager.getCurrentRole()
console.log('切换后角色:', ownerRole)

const ownerSpecificInfo = IdentityManager.getRoleSpecificUserInfo()
console.log('宠物主人特定信息:', ownerSpecificInfo)

console.log('\n=== 测试完成 ===')
