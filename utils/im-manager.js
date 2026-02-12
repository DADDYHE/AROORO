/**
 * 腾讯云IM服务管理工具（兼容层）
 * 
 * 注意：此模块已弃用，请使用 imSingleton.js 提供的单例
 * 为了向后兼容，此模块保留并转发所有调用到新的单例
 *
 * 参考文档：
 * - 腾讯云IM官方文档：https://cloud.tencent.com/document/product/269/1502
 */

// 导入新的IM单例
const { imSingleton, IMState } = require('./imSingleton')

/**
 * IM管理工具类（兼容层）
 * 所有方法都转发到imSingleton单例
 */
class IMManager {
  // 状态枚举（保持向后兼容）
  static STATES = IMState

  constructor() {
    // 转发到单例
    this._delegate = imSingleton
    this.state = this._delegate.getState()
    this.isReady = this._delegate.isReady()
    this.userInfo = this._delegate.getCurrentUser()
    this.tim = this._delegate.getSDK()

    // 监听单例的状态变更
    this._delegate.on('stateChange', this._handleStateChange.bind(this))

    console.log('[IMManager] 兼容层已初始化（已转发到imSingleton）')
  }

  /**
   * 处理状态变更
   * @private
   */
  _handleStateChange(event) {
    this.state = event.newState
    this.isReady = this._delegate.isReady()
    this.userInfo = this._delegate.getCurrentUser()
  }

  /**
   * 获取当前IM服务状态
   * @returns {string} 当前状态
   */
  getState() {
    return this._delegate.getState()
  }

  /**
   * 检查IM服务是否就绪
   * @returns {boolean} 是否就绪
   */
  isIMReady() {
    return this._delegate.isReady()
  }

  /**
   * 检查SDK是否就绪（不包含登录状态）
   * @returns {boolean} SDK是否就绪
   */
  isSDKReady() {
    return this._delegate.isSDKReady()
  }

  /**
   * 检查用户是否已登录
   * @returns {boolean} 是否已登录
   */
  isLoggedIn() {
    return this._delegate.isLoggedIn()
  }

  /**
   * 等待SDK就绪
   * @param {number} timeout 超时时间（毫秒）
   * @returns {Promise<boolean>} 是否就绪
   */
  async waitForReady(timeout = 5000) {
    return this._delegate.waitForReady(timeout)
  }

  /**
   * 初始化IM服务
   * @param {Object} options - 初始化选项
   * @returns {Promise<Object>} 初始化结果
   */
  init(options = {}) {
    // 单例已经初始化，直接返回成功
    return Promise.resolve({ success: true })
  }

  /**
   * 注册IM事件监听器
   * @param {string} eventName 事件名称
   * @param {Function} callback 回调函数
   */
  on(eventName, callback) {
    this._delegate.on(eventName, callback)
  }

  /**
   * 移除事件监听器
   * @param {string} eventName 事件名称
   * @param {Function} callback 回调函数
   */
  off(eventName, callback) {
    this._delegate.off(eventName, callback)
  }

  /**
   * 登录IM服务
   * @param {Object} userInfo - 用户信息
   * @returns {Promise<Object>} 登录结果
   */
  login(userInfo) {
    return this._delegate.login(userInfo)
  }

  /**
   * 登出IM服务
   * @returns {Promise<Object>} 登出结果
   */
  logout() {
    return this._delegate.logout()
  }

  /**
   * 更新用户资料
   * @param {Object} profile - 用户资料
   */
  updateUserProfile(profile) {
    return this._delegate.updateProfile(profile)
  }

  /**
   * 标准化用户ID
   * @param {string} userID - 原始用户ID
   * @returns {string} - 标准化后的用户ID
   */
  normalizeUserID(userID) {
    return this._delegate.normalizeUserID(userID)
  }

  /**
   * 发送文本消息
   * @param {string} conversationID - 会话ID
   * @param {string} content - 消息内容
   * @param {Object} ext - 消息扩展字段
   */
  sendTextMessage(conversationID, content, ext = {}) {
    // 提取接收者ID
    const to = conversationID.replace(/^(C2C|GROUP)_/, '')
    const normalizedTo = this._delegate.normalizeUserID(to)
    const conversationType = conversationID.startsWith('GROUP') ? 'GROUP' : 'C2C'

    // 获取IM SDK实例
    const tim = this._delegate.getSDK()
    
    // 创建文本消息实例
    const message = tim.createTextMessage({
      to: normalizedTo,
      conversationType,
      payload: { text: content },
      ext: ext
    })

    return this._delegate.sendMessage(message)
  }

  /**
   * 发送图片消息
   * @param {string} conversationID - 会话ID
   * @param {Object} image - 图片信息
   * @param {Object} ext - 消息扩展字段
   */
  sendImageMessage(conversationID, image, ext = {}) {
    // 提取接收者ID
    const to = conversationID.replace(/^(C2C|GROUP)_/, '')
    const normalizedTo = this._delegate.normalizeUserID(to)
    const conversationType = conversationID.startsWith('GROUP') ? 'GROUP' : 'C2C'

    // 获取IM SDK实例
    const tim = this._delegate.getSDK()
    
    // 创建图片消息实例
    const message = tim.createImageMessage({
      to: normalizedTo,
      conversationType,
      payload: { file: image },
      ext: ext
    })

    return this._delegate.sendMessage(message)
  }

  /**
   * 发送语音消息
   * @param {string} conversationID - 会话ID
   * @param {Object} voice - 语音信息
   * @param {Object} ext - 消息扩展字段
   */
  sendVoiceMessage(conversationID, voice, ext = {}) {
    // 提取接收者ID
    const to = conversationID.replace(/^(C2C|GROUP)_/, '')
    const normalizedTo = this._delegate.normalizeUserID(to)
    const conversationType = conversationID.startsWith('GROUP') ? 'GROUP' : 'C2C'

    // 获取IM SDK实例
    const tim = this._delegate.getSDK()
    
    // 创建语音消息实例
    const message = tim.createAudioMessage({
      to: normalizedTo,
      conversationType,
      payload: {
        file: voice,
        duration: voice.duration || 0
      },
      ext: ext
    })

    return this._delegate.sendMessage(message)
  }

  /**
   * 获取历史消息
   * @param {string} conversationID - 会话ID
   * @param {number} count - 获取消息数量
   * @param {string} nextReqMessageID - 分页标记
   */
  getHistoryMessages(conversationID, count = 20, nextReqMessageID = '') {
    return this._delegate.getHistoryMessages({
      conversationID,
      count,
      nextReqMessageID,
    })
  }

  /**
   * 获取会话列表
   */
  getConversationList() {
    return this._delegate.getConversationList()
  }

  /**
   * 标记消息已读
   * @param {string} conversationID - 会话ID
   */
  markAsRead(conversationID) {
    return this._delegate.markAsRead(conversationID)
  }

  /**
   * 撤回消息
   * @param {string} messageID - 消息ID
   */
  revokeMessage(messageID) {
    return this._delegate.revokeMessage(messageID)
  }

  /**
   * 创建群聊
   * @param {Array} userIDList - 成员列表
   * @param {Object} options - 群聊选项
   */
  createGroup(userIDList, options = {}) {
    const TencentCloudChat = require('@tencentcloud/chat')
    return this._delegate.createGroup({
      type: TencentCloudChat.TYPES.GRP_PUBLIC,
      name: options.name || '新群聊',
      memberList: userIDList.map(userID => ({ userID })),
      introduction: options.introduction || '',
      notification: options.notification || '',
      faceUrl: options.faceUrl || '',
      maxMemberNum: options.maxMemberNum || 200,
      applyJoinOption: TencentCloudChat.TYPES.APPLY_JOIN_OPEN,
    })
  }

  /**
   * 加入群聊
   * @param {string} groupID - 群聊ID
   */
  joinGroup(groupID) {
    return this._delegate.joinGroup(groupID)
  }

  /**
   * 退出群聊
   * @param {string} groupID - 群聊ID
   */
  quitGroup(groupID) {
    return this._delegate.quitGroup(groupID)
  }

  /**
   * 获取群成员列表
   * @param {string} groupID - 群聊ID
   */
  getGroupMemberList(groupID) {
    return this._delegate.getGroupMemberList({ groupID })
  }

  /**
   * 获取当前登录用户
   */
  getCurrentUser() {
    return this._delegate.getCurrentUser()
  }
}

// 导出IM管理实例
const imManager = new IMManager()
module.exports = imManager
