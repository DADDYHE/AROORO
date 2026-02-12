/**
 * 数据访问控制使用示例
 * 展示如何在各个页面中使用数据访问控制器
 */

const { dataAccessController } = require('../../utils/dataAccessController')
const IdentityManager = require('../../utils/identityManager')

// 示例 1: 宠物列表页面（pages/pets/index.js）
Page({
  onLoad() {
    this.loadPets()
  },

  /**
   * 加载宠物列表
   */
  async loadPets() {
    try {
      // 获取所有宠物数据
      const allPets = await this.fetchAllPetsFromCloud()

      // 使用数据访问控制器过滤数据
      const accessiblePets = dataAccessController.filterData('pet', 'list', allPets)

      console.log('过滤后的宠物列表:', accessiblePets)

      // 更新页面数据
      this.setData({
        pets: accessiblePets,
        totalCount: accessiblePets.length
      })
    } catch (error) {
      console.error('加载宠物列表失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    }
  },

  /**
   * 添加宠物
   */
  async addPet(petData) {
    // 检查是否有权限添加宠物
    const accessResult = dataAccessController.checkAccess('pet', 'create')
    if (!accessResult.allowed) {
      wx.showToast({
        title: accessResult.reason || '无权操作',
        icon: 'none'
      })
      return
    }

    try {
      // 调用云函数添加宠物
      await wx.cloud.callFunction({
        name: 'addPet',
        data: {
          ...petData,
          role: IdentityManager.getCurrentRole(),
          userId: IdentityManager.getCurrentUserInfo()._id
        }
      })

      // 重新加载宠物列表
      this.loadPets()

      wx.showToast({
        title: '添加成功',
        icon: 'success'
      })
    } catch (error) {
      console.error('添加宠物失败:', error)
      wx.showToast({
        title: '添加失败',
        icon: 'none'
      })
    }
  },

  /**
   * 编辑宠物
   */
  async editPet(petId, updates) {
    // 获取宠物数据
    const pet = this.data.pets.find(p => p._id === petId)
    if (!pet) {
      wx.showToast({
        title: '宠物不存在',
        icon: 'none'
      })
      return
    }

    // 检查是否有权限编辑该宠物
    const accessResult = dataAccessController.checkAccess('pet', 'edit', pet)
    if (!accessResult.allowed) {
      wx.showToast({
        title: accessResult.reason || '无权操作',
        icon: 'none'
      })
      return
    }

    try {
      // 调用云函数更新宠物
      await wx.cloud.callFunction({
        name: 'updatePet',
        data: {
          petId,
          updates,
          role: IdentityManager.getCurrentRole(),
          userId: IdentityManager.getCurrentUserInfo()._id
        }
      })

      // 重新加载宠物列表
      this.loadPets()

      wx.showToast({
        title: '更新成功',
        icon: 'success'
      })
    } catch (error) {
      console.error('更新宠物失败:', error)
      wx.showToast({
        title: '更新失败',
        icon: 'none'
      })
    }
  },

  /**
   * 删除宠物
   */
  async deletePet(petId) {
    // 获取宠物数据
    const pet = this.data.pets.find(p => p._id === petId)
    if (!pet) {
      return
    }

    // 检查是否有权限删除该宠物
    const accessResult = dataAccessController.checkAccess('pet', 'delete', pet)
    if (!accessResult.allowed) {
      wx.showToast({
        title: accessResult.reason || '无权操作',
        icon: 'none'
      })
      return
    }

    // 二次确认
    wx.showModal({
      title: '确认删除',
      content: '确定要删除该宠物吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            await wx.cloud.callFunction({
              name: 'deletePet',
              data: {
                petId,
                role: IdentityManager.getCurrentRole(),
                userId: IdentityManager.getCurrentUserInfo()._id
              }
            })

            // 重新加载宠物列表
            this.loadPets()

            wx.showToast({
              title: '删除成功',
              icon: 'success'
            })
          } catch (error) {
            console.error('删除宠物失败:', error)
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            })
          }
        }
      }
    })
  }
})

// 示例 2: 订单列表页面（pages/orders/index.js）
Page({
  onLoad() {
    this.loadOrders()
  },

  /**
   * 加载订单列表
   */
  async loadOrders() {
    try {
      // 获取所有订单数据
      const allOrders = await this.fetchAllOrdersFromCloud()

      // 使用数据访问控制器过滤数据
      const accessibleOrders = dataAccessController.filterData('order', 'list', allOrders)

      console.log('过滤后的订单列表:', accessibleOrders)

      // 更新页面数据
      this.setData({
        orders: accessibleOrders,
        totalCount: accessibleOrders.length
      })
    } catch (error) {
      console.error('加载订单列表失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    }
  },

  /**
   * 创建订单（宠物主人）
   */
  async createOrder(orderData) {
    // 检查是否有权限创建订单
    const accessResult = dataAccessController.checkAccess('order', 'create')
    if (!accessResult.allowed) {
      wx.showToast({
        title: accessResult.reason || '无权操作',
        icon: 'none'
      })
      return
    }

    try {
      // 调用云函数创建订单
      await wx.cloud.callFunction({
        name: 'createOrder',
        data: {
          ...orderData,
          role: IdentityManager.getCurrentRole(),
          userId: IdentityManager.getCurrentUserInfo()._id
        }
      })

      wx.showToast({
        title: '订单创建成功',
        icon: 'success'
      })

      // 跳转到订单详情页
      wx.navigateTo({
        url: '/pages/order/detail/index'
      })
    } catch (error) {
      console.error('创建订单失败:', error)
      wx.showToast({
        title: '创建失败',
        icon: 'none'
      })
    }
  },

  /**
   * 接受订单（寄养家庭）
   */
  async acceptOrder(orderId) {
    // 获取订单数据
    const order = this.data.orders.find(o => o._id === orderId)
    if (!order) {
      wx.showToast({
        title: '订单不存在',
        icon: 'none'
      })
      return
    }

    // 检查是否有权限接受该订单
    const accessResult = dataAccessController.checkAccess('order', 'accept', order)
    if (!accessResult.allowed) {
      wx.showToast({
        title: accessResult.reason || '无权操作',
        icon: 'none'
      })
      return
    }

    try {
      await wx.cloud.callFunction({
        name: 'acceptOrder',
        data: {
          orderId,
          role: IdentityManager.getCurrentRole(),
          userId: IdentityManager.getCurrentUserInfo()._id
        }
      })

      // 重新加载订单列表
      this.loadOrders()

      wx.showToast({
        title: '订单已接受',
        icon: 'success'
      })
    } catch (error) {
      console.error('接受订单失败:', error)
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      })
    }
  },

  /**
   * 取消订单（宠物主人）
   */
  async cancelOrder(orderId) {
    const order = this.data.orders.find(o => o._id === orderId)
    if (!order) {
      return
    }

    // 检查是否有权限取消该订单
    const accessResult = dataAccessController.checkAccess('order', 'cancel', order)
    if (!accessResult.allowed) {
      wx.showToast({
        title: accessResult.reason || '无权操作',
        icon: 'none'
      })
      return
    }

    wx.showModal({
      title: '确认取消',
      content: '确定要取消该订单吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            await wx.cloud.callFunction({
              name: 'cancelOrder',
              data: {
                orderId,
                role: IdentityManager.getCurrentRole(),
                userId: IdentityManager.getCurrentUserInfo()._id
              }
            })

            this.loadOrders()

            wx.showToast({
              title: '订单已取消',
              icon: 'success'
            })
          } catch (error) {
            console.error('取消订单失败:', error)
            wx.showToast({
              title: '操作失败',
              icon: 'none'
            })
          }
        }
      }
    })
  }
})

// 示例 3: 消息列表页面（pages/messages/index.js）
Page({
  onLoad() {
    this.loadMessages()
  },

  /**
   * 加载消息列表
   */
  async loadMessages() {
    try {
      // 获取所有消息数据
      const allMessages = await this.fetchAllMessagesFromCloud()

      // 使用数据访问控制器过滤数据
      const accessibleMessages = dataAccessController.filterData('message', 'list', allMessages)

      console.log('过滤后的消息列表:', accessibleMessages)

      // 更新页面数据
      this.setData({
        messages: accessibleMessages,
        totalCount: accessibleMessages.length
      })
    } catch (error) {
      console.error('加载消息列表失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    }
  },

  /**
   * 发送消息
   */
  async sendMessage(messageData) {
    // 检查是否有权限发送消息
    const accessResult = dataAccessController.checkAccess('message', 'send')
    if (!accessResult.allowed) {
      wx.showToast({
        title: accessResult.reason || '无权操作',
        icon: 'none'
      })
      return
    }

    try {
      const userInfo = IdentityManager.getCurrentUserInfo()

      await wx.cloud.callFunction({
        name: 'sendMessage',
        data: {
          ...messageData,
          from: userInfo._id,
          role: IdentityManager.getCurrentRole()
        }
      })

      // 重新加载消息列表
      this.loadMessages()

      wx.showToast({
        title: '发送成功',
        icon: 'success'
      })
    } catch (error) {
      console.error('发送消息失败:', error)
      wx.showToast({
        title: '发送失败',
        icon: 'none'
      })
    }
  },

  /**
   * 查看消息详情
   */
  async viewMessage(messageId) {
    const message = this.data.messages.find(m => m._id === messageId)
    if (!message) {
      wx.showToast({
        title: '消息不存在',
        icon: 'none'
      })
      return
    }

    // 检查是否有权限查看该消息
    const accessResult = dataAccessController.checkAccess('message', 'view', message)
    if (!accessResult.allowed) {
      wx.showToast({
        title: accessResult.reason || '无权查看',
        icon: 'none'
      })
      return
    }

    // 跳转到消息详情页
    wx.navigateTo({
      url: `/pages/message/detail/index?id=${messageId}`
    })
  }
})

// 示例 4: 寄养家庭管理页面（pages/host/manage/index.js）
Page({
  onLoad() {
    this.loadHostProfile()
  },

  /**
   * 加载寄养家庭信息
   */
  async loadHostProfile() {
    // 检查当前角色是否为寄养家庭
    const currentRole = IdentityManager.getCurrentRole()
    if (currentRole !== 'host') {
      wx.showToast({
        title: '当前不是寄养家庭身份',
        icon: 'none'
      })
      return
    }

    try {
      // 获取寄养家庭数据
      const hostData = await this.fetchHostDataFromCloud()

      // 检查是否有权限管理寄养服务
      const accessResult = dataAccessController.checkAccess('host', 'manage', hostData)
      if (!accessResult.allowed) {
        wx.showToast({
          title: accessResult.reason || '无权管理',
          icon: 'none'
        })
        return
      }

      // 更新页面数据
      this.setData({
        hostInfo: hostData
      })
    } catch (error) {
      console.error('加载寄养家庭信息失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    }
  },

  /**
   * 更新寄养服务
   */
  async updateHostService(updates) {
    const hostData = this.data.hostInfo
    if (!hostData) {
      wx.showToast({
        title: '寄养家庭信息不存在',
        icon: 'none'
      })
      return
    }

    // 检查是否有权限管理寄养服务
    const accessResult = dataAccessController.checkAccess('host', 'manage', hostData)
    if (!accessResult.allowed) {
      wx.showToast({
        title: accessResult.reason || '无权操作',
        icon: 'none'
      })
      return
    }

    try {
      await wx.cloud.callFunction({
        name: 'updateHostService',
        data: {
          updates,
          role: IdentityManager.getCurrentRole(),
          userId: IdentityManager.getCurrentUserInfo()._id
        }
      })

      wx.showToast({
        title: '更新成功',
        icon: 'success'
      })
    } catch (error) {
      console.error('更新寄养服务失败:', error)
      wx.showToast({
        title: '更新失败',
        icon: 'none'
      })
    }
  }
})
