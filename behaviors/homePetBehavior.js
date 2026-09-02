/**
 * homePetBehavior.js - 首页宠物数据加载行为
 *
 * 用途：
 *   - 封装宠物数据加载逻辑
 *   - 从 home/index.js 中抽离，减少主文件职责
 *
 * 用法：
 *   const homePetBehavior = require('../../behaviors/homePetBehavior')
 *   Page({
 *     behaviors: [homePetBehavior],
 *     // ...
 *   })
 */

const { PetService } = require('../services/CloudFunctionService')

const homePetBehavior = Behavior({
  data: {
    myPets: [],
    displayPets: [],
    hasMorePets: false,
  },

  methods: {
    async _loadMyPets() {
      try {
        const result = await PetService.getPetList()

        if (!result || result.code !== 0) {
          throw new Error(result?.message || '获取宠物列表失败')
        }

        const data = result.data || {}
        this._applyMyPets(data.list || data.pets || [])
      } catch (error) {
        this._applyMyPets([])
      }
    },

    /** 应用宠物板块数据（首页 BFF getHomeFeed 分发与单独加载共用；空数组同时清理派生态） */
    _applyMyPets(pets) {
      const myPets = (Array.isArray(pets) ? pets : []).map(pet => ({
        _id: pet._id || pet.id,
        name: pet.name || '',
        breed: pet.breed || '',
        birthday: pet.birthday || '',
        avatarUrl: pet.avatarUrl || '/images/default-avatar.svg',
        genderClass: pet.gender === 'male' ? 'male' : pet.gender === 'female' ? 'female' : 'unknown',
        genderSymbol: pet.gender === 'male' ? '♂' : pet.gender === 'female' ? '♀' : '',
        type: pet.type || '',
      }))

      this.setData({ myPets, displayPets: myPets.slice(0, 2), hasMorePets: myPets.length > 2 })
    },
  },
})

module.exports = homePetBehavior
