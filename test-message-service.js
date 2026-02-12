// test-message-service.js
// 测试MessageService的功能

const app = {
  globalData: {
    userInfo: {
      userID: 'test_user_123',
      _id: 'test_user_123',
      role: 'owner'
    },
    userRole: 'owner'
  }
}

global.getApp = () => app
global.wx = {
  cloud: {
    database: () => ({
      collection: () => ({
        add: async () => ({
          _id: 'test_message_123'
        }),
        doc: () => ({
          get: async () => ({
            exists: true,
            data: () => ({
              content: 'test message',
              senderId: 'test_user_123',
              receiverId: 'test_receiver_123',
              senderRole: 'owner',
              receiverRole: 'host',
              status: 'failed',
              retryCount: 0
            })
          }),
          update: async () => ({})
        }),
        where: () => ({
          get: async () => ({
            data: []
          }),
          update: async () => ({})
        }),
        orderBy: () => ({
          skip: () => ({
            limit: () => ({
              get: async () => ({
                data: []
              })
            })
          })
        })
      })
    })
  },
  setStorageSync: () => {},
  getStorageSync: () => {}
}

// 模拟im-manager
const imManager = {
  sendTextMessage: async () => ({
    id: 'test_im_message_123'
  }),
  on: () => {},
  setOnSDKReady: () => {}
}

// 模拟ImUserIdValidator
const ImUserIdValidator = {
  validateUserID: () => ({
    valid: true
  }),
  MAX_USER_ID_LENGTH: 32
}

// 模拟db.command
const dbCommand = {
  in: () => ({})
}

// 模拟db
const db = {
  collection: () => ({
    add: async () => ({
      _id: 'test_message_123'
    }),
    doc: () => ({
      get: async () => ({
        exists: true,
        data: () => ({
          content: 'test message',
          senderId: 'test_user_123',
          receiverId: 'test_receiver_123',
          senderRole: 'owner',
          receiverRole: 'host',
          status: 'failed',
          retryCount: 0
        })
      }),
      update: async () => ({})
    }),
    where: () => ({
      get: async () => ({
        data: []
      }),
      update: async () => ({})
    }),
    orderBy: () => ({
      skip: () => ({
        limit: () => ({
          get: async () => ({
            data: []
          })
        })
      })
    })
  }),
  command: dbCommand
}

// 模拟模块导出
global.require = function(path) {
  if (path === './im-manager') {
    return imManager
  } else if (path === './imUserIdValidator') {
    return ImUserIdValidator
  }
  return {}
}

// 模拟messageService.js中的模块导入
const fs = require('fs')
const path = require('path')

// 读取并修改messageService.js文件内容
const messageServicePath = path.join(__dirname, 'utils', 'messageService.js')
let messageServiceContent = fs.readFileSync(messageServicePath, 'utf8')

// 替换模块导入
messageServiceContent = messageServiceContent.replace(
  "const imManager = require('./im-manager')",
  "const imManager = {\n    sendTextMessage: async () => ({ id: 'test_im_message_123' }),\n    on: () => {},\n    setOnSDKReady: () => {}\n  }"
)

messageServiceContent = messageServiceContent.replace(
  "const ImUserIdValidator = require('./imUserIdValidator')",
  "const ImUserIdValidator = {\n    validateUserID: () => ({ valid: true }),\n    MAX_USER_ID_LENGTH: 32\n  }"
)

// 将ES模块语法转换为CommonJS语法
messageServiceContent = messageServiceContent.replace(
  "export default new MessageService()",
  "module.exports = new MessageService()"
)

// 临时写入修改后的内容
const tempPath = path.join(__dirname, 'utils', 'messageService.test.js')
fs.writeFileSync(tempPath, messageServiceContent)

// 测试MessageService
const MessageService = require('./utils/messageService.test')

async function testMessageService() {
  console.log('开始测试MessageService...')
  
  const messageService = MessageService
  
  // 测试1: 验证消息数据
  console.log('\n测试1: 验证消息数据')
  const validMessage = {
    content: 'Hello, world!',
    senderId: 'test_user_123',
    receiverId: 'test_receiver_123',
    senderRole: 'owner',
    receiverRole: 'host'
  }
  const validationResult = messageService.validateMessageData(validMessage)
  console.log('验证结果:', validationResult)
  
  // 测试2: 发送消息
  console.log('\n测试2: 发送消息')
  const sendResult = await messageService.sendMessage('Hello, world!', 'test_receiver_123', 'host')
  console.log('发送结果:', sendResult)
  
  // 测试3: 获取消息
  console.log('\n测试3: 获取消息')
  const getResult = await messageService.getMessages('test_receiver_123')
  console.log('获取结果:', getResult)
  
  // 测试4: 重试失败消息
  console.log('\n测试4: 重试失败消息')
  const retryResult = await messageService.retryFailedMessage('test_message_123')
  console.log('重试结果:', retryResult)
  
  // 测试5: 处理失败消息
  console.log('\n测试5: 处理失败消息')
  const processResult = await messageService.processFailedMessages()
  console.log('处理结果:', processResult)
  
  // 测试6: 获取监控指标
  console.log('\n测试6: 获取监控指标')
  const metrics = messageService.getMetrics()
  console.log('监控指标:', metrics)
  
  // 测试7: 测试日志功能
  console.log('\n测试7: 测试日志功能')
  messageService.log('info', '测试日志', { test: 'data' })
  
  console.log('\nMessageService测试完成!')
}

// 运行测试
testMessageService().catch(error => {
  console.error('测试失败:', error)
  process.exit(1)
})
