/**
 * 宠物服务层
 * 通过 CloudFunctionService 统一调用云函数
 * 返回数据格式：{ code: 0, message, data }
 */

const { PetService: PetCloudService } = require('../../../services/CloudFunctionService')

class PetServiceWrapper {
  async getPets(filters = {}) {
    try {
      const result = await PetCloudService.getPetList(filters)
      if (result && result.code === 0 && result.data) {
        const data = result.data
        return data.list || data.pets || []
      } else {
        throw new Error(result?.message || '获取宠物列表失败')
      }
    } catch (error) {
      throw error
    }
  }

  async getPetDetail(petId) {
    try {
      if (!petId) {
        throw new Error('宠物 ID 不能为空')
      }
      const result = await PetCloudService.getPetDetail(petId)
      if (result && result.code === 0) {
        const data = result.data || {}
        return data.pet || data
      } else {
        throw new Error(result?.message || '获取宠物详情失败')
      }
    } catch (error) {
      throw error
    }
  }

  async createPet(petData) {
    try {
      const result = await PetCloudService.createPet(petData)
      if (result && result.code === 0) {
        return result.data
      } else {
        throw new Error(result?.message || '创建宠物档案失败')
      }
    } catch (error) {
      throw error
    }
  }

  async updatePet(petId, updateData) {
    try {
      if (!petId) {
        throw new Error('宠物 ID 不能为空')
      }
      const result = await PetCloudService.updatePet(petId, updateData)
      if (result && result.code === 0) {
        return result.data
      } else {
        throw new Error(result?.message || '更新宠物信息失败')
      }
    } catch (error) {
      throw error
    }
  }

  async deletePet(petId) {
    try {
      if (!petId) {
        throw new Error('宠物 ID 不能为空')
      }
      const result = await PetCloudService.deletePet(petId)
      if (result && result.code === 0) {
        return result.data
      } else {
        throw new Error(result?.message || '删除宠物档案失败')
      }
    } catch (error) {
      throw error
    }
  }

  async verifyOwnership(petId) {
    try {
      const pet = await this.getPetDetail(petId)
      const { authService } = require('../../../services/AuthService')
      const identity = authService.getCurrentIdentity()
      return pet.ownerId === identity?.openid
    } catch (error) {
      return false
    }
  }
}

const petService = new PetServiceWrapper()

module.exports = {
  PetServiceWrapper,
  petService
}
