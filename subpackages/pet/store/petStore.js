/**
 * 宠物状态管理
 * 管理宠物列表、当前宠物等状态
 */

const { petService } = require('../services/petService')
const petConstants = require('../utils/petConstants')
const petFormatter = require('../utils/petFormatter')

class PetStore {
  constructor() {
    // 状态
    this.state = {
      // 宠物列表
      petList: [],
      // 当前宠物
      currentPet: null,
      // 加载状态
      isLoading: false,
      // 错误信息
      error: null,
      // 最后更新时间
      lastUpdateTime: null,
      // 筛选条件
      filters: {
        type: null,
        ageGroup: null,
        gender: null
      }
    }

    // 事件监听器
    this.listeners = new Map()
  }

  /**
   * 获取宠物列表
   * @param {boolean} forceRefresh - 是否强制刷新
   * @returns {Promise<Array>}
   */
  async fetchPetList(forceRefresh = false) {
    // 检查缓存是否有效
    if (!forceRefresh && this._isCacheValid() && 
        this.state.petList && 
        this.state.petList.length > 0) {
      return this.state.petList
    }

    this.setState({ isLoading: true, error: null })

    try {
      const pets = await petService.getPets(this.state.filters)
      
      // 确保 pets 是数组，处理各种异常情况
      let petList = []
      if (Array.isArray(pets)) {
        petList = pets
      } else if (pets && typeof pets === 'object') {
        // 可能是 { data: [...] } 或其他结构
        petList = pets.data || []
      }
      
      // 格式化宠物数据，确保每个宠物都有正确的 id 字段
      const formattedPetList = petList.map(pet => petFormatter.formatPetBasic(pet))
      
      this.setState({
        petList: formattedPetList,
        lastUpdateTime: Date.now(),
        isLoading: false
      })
      return formattedPetList
    } catch (error) {
      this.setState({
        error: error.message,
        isLoading: false,
        petList: []
      })
      console.error('[PetStore] 获取宠物列表失败:', error)
      throw error
    }
  }

  /**
   * 获取宠物详情
   * @param {string} petId - 宠物 ID
   * @param {boolean} forceRefresh - 是否强制刷新
   * @returns {Promise<Object>}
   */
  async fetchPetDetail(petId, forceRefresh = false) {
    
    // 检查是否已经是当前宠物且缓存有效，并且没有强制刷新
    if (!forceRefresh && 
        this.state.currentPet && 
        this.state.currentPet._id === petId && 
        this._isCacheValid(5 * 60 * 1000)) {
      return this.state.currentPet
    }

    this.setState({ isLoading: true, error: null })

    try {
      const pet = await petService.getPetDetail(petId)
      this.setState({
        currentPet: pet,
        lastUpdateTime: Date.now(),
        isLoading: false
      })
      return pet
    } catch (error) {
      this.setState({
        error: error.message,
        isLoading: false
      })
      console.error('[PetStore] 获取宠物详情失败:', error)
      throw error
    }
  }

  /**
   * 设置当前宠物
   * @param {Object} pet - 宠物数据
   */
  setCurrentPet(pet) {
    this.setState({ currentPet: pet })
  }

  /**
   * 获取当前宠物
   * @returns {Object|null}
   */
  getCurrentPet() {
    return this.state.currentPet
  }

  /**
   * 获取宠物列表
   * @returns {Array}
   */
  getPetList() {
    return this.state.petList
  }

  /**
   * 添加宠物到列表
   * @param {Object} pet - 宠物数据
   */
  addPet(pet) {
    const newList = [pet, ...this.state.petList]
    this.setState({ petList: newList })
  }

  /**
   * 更新列表中的宠物
   * @param {string} petId - 宠物 ID
   * @param {Object} updateData - 更新数据
   */
  updatePetInList(petId, updateData) {
    
    // 检查 updateData 是否是完整的宠物对象（有 _id）
    const isFullPetData = updateData._id
    
    const newList = this.state.petList.map(pet => {
      if (pet._id === petId) {
        if (isFullPetData) {
          // 如果是完整数据，直接替换
          return updateData
        } else {
          // 否则合并更新
          return { ...pet, ...updateData }
        }
      }
      return pet
    })
    
    // 创建新的状态对象
    const newState = {
      petList: newList,
      lastUpdateTime: Date.now()
    }
    
    // 如果更新的是当前宠物，同步更新
    if (this.state.currentPet && this.state.currentPet._id === petId) {
      if (isFullPetData) {
        // 如果是完整数据，直接替换
        newState.currentPet = updateData
      } else {
        // 否则合并更新
        newState.currentPet = { ...this.state.currentPet, ...updateData }
      }
    }
    
    this.setState(newState)
  }

  /**
   * 从列表中移除宠物
   * @param {string} petId - 宠物 ID
   */
  removePet(petId) {
    const newList = this.state.petList.filter(pet => pet._id !== petId)
    this.setState({ petList: newList })
    
    // 如果移除的是当前宠物，清空当前宠物
    if (this.state.currentPet && this.state.currentPet._id === petId) {
      this.setState({ currentPet: null })
    }
    
  }

  /**
   * 设置筛选条件
   * @param {Object} filters - 筛选条件
   */
  setFilters(filters) {
    this.setState({
      filters: { ...this.state.filters, ...filters }
    })
  }

  /**
   * 清空筛选条件
   */
  clearFilters() {
    this.setState({
      filters: {
        type: null,
        ageGroup: null,
        gender: null
      }
    })
  }

  /**
   * 清空错误
   */
  clearError() {
    this.setState({ error: null })
  }

  /**
   * 注册状态变化监听器
   * @param {string} key - 监听键
   * @param {Function} listener - 监听函数
   */
  subscribe(key, listener) {
    this.listeners.set(key, listener)
  }

  /**
   * 取消订阅
   * @param {string} key - 监听键
   */
  unsubscribe(key) {
    this.listeners.delete(key)
  }

  /**
   * 更新状态并通知监听器
   * @private
   * @param {Object} newState - 新状态
   */
  setState(newState) {
    const oldState = { ...this.state }
    this.state = { ...this.state, ...newState }
    
    // 通知监听器
    this.listeners.forEach((listener, key) => {
      try {
        listener(newState, oldState)
      } catch (error) {
        console.error('[PetStore] 监听器执行失败:', key, error)
      }
    })
  }

  /**
   * 检查缓存是否有效
   * @private
   * @param {number} cacheTime - 缓存时间（毫秒）
   * @returns {boolean}
   */
  _isCacheValid(cacheTime = petConstants.CACHE_TIME.SHORT) {
    if (!this.state.lastUpdateTime) {
      return false
    }
    
    const now = Date.now()
    return (now - this.state.lastUpdateTime) < cacheTime
  }

  /**
   * 获取状态快照
   * @returns {Object}
   */
  getState() {
    return { ...this.state }
  }

  /**
   * 重置 Store
   */
  reset() {
    this.state = {
      petList: [],
      currentPet: null,
      isLoading: false,
      error: null,
      lastUpdateTime: null,
      filters: {
        type: null,
        ageGroup: null,
        gender: null
      }
    }
  }
}

// 创建单例
const petStore = new PetStore()

// 导出
module.exports = {
  PetStore,
  petStore
}
