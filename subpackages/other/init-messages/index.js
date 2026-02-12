const app = getApp()

Page({
  data: {
    isLoading: false,
    message: ''
  },

  onLoad() {
    console.log('初始化消息集合页面加载')
  },

  // 初始化消息集合
  async initMessagesCollection() {
    this.setData({
      isLoading: true,
      message: '正在初始化消息集合...'
    })

    try {
      // 1. 创建消息集合并设置索引
      const db = wx.cloud.database()

      // 2. 测试集合是否存在
      console.log('测试消息集合是否存在...')
      
      // 3. 尝试创建索引
      console.log('开始创建索引...')

      // 为 senderId 创建索引
      await db.collection('messages').createIndex({
        senderId: 1
      })
      console.log('senderId 索引创建成功')

      // 为 receiverId 创建索引
      await db.collection('messages').createIndex({
        receiverId: 1
      })
      console.log('receiverId 索引创建成功')

      // 为 conversationType 创建索引
      await db.collection('messages').createIndex({
        conversationType: 1
      })
      console.log('conversationType 索引创建成功')

      // 为复合查询创建索引（senderId + conversationType）
      await db.collection('messages').createIndex({
        senderId: 1,
        conversationType: 1
      })
      console.log('senderId + conversationType 复合索引创建成功')

      // 为复合查询创建索引（receiverId + conversationType）
      await db.collection('messages').createIndex({
        receiverId: 1,
        conversationType: 1
      })
      console.log('receiverId + conversationType 复合索引创建成功')

      // 4. 测试消息插入
      const testMessage = {
        content: '测试消息',
        senderId: 'test_sender',
        receiverId: 'test_receiver',
        senderRole: 'owner',
        conversationType: 'owner2host',
        timestamp: Date.now(),
        status: 'sent'
      }

      const result = await db.collection('messages').add({
        data: testMessage
      })

      console.log('测试消息插入成功:', result)

      this.setData({
        message: '消息集合初始化成功！',
        isLoading: false
      })

      wx.showToast({
        title: '初始化成功',
        icon: 'success'
      })
    } catch (error) {
      console.error('初始化失败:', error)
      this.setData({
        message: `初始化失败: ${error.message}`,
        isLoading: false
      })

      wx.showToast({
        title: '初始化失败',
        icon: 'none'
      })
    }
  },

  // 返回首页
  goBack() {
    wx.navigateBack()
  }
})