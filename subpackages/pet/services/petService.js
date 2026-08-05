/**
 * 宠物服务层
 * 通过 CloudFunctionService 统一调用云函数
 * 返回数据格式：{ code: 0, message, data }
 */

const { PetService: PetCloudService } = require('../../../services/CloudFunctionService')

class PetServiceWrapper {
  async getPets(filters = {}) {
    const result = await PetCloudService.getPetList(filters)
    if (result && result.code === 0 && result.data) {
      const data = result.data
      return data.list || data.pets || []
    } else {
      throw new Error(result?.message || '获取宠物列表失败')
    }
  }

  async getPetDetail(petId) {
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
  }

  async createPet(petData) {
    const result = await PetCloudService.createPet(petData)
    if (result && result.code === 0) {
      return result.data
    } else {
      throw new Error(result?.message || '创建宠物档案失败')
    }
  }

  async updatePet(petId, updateData) {
    if (!petId) {
      throw new Error('宠物 ID 不能为空')
    }
    const result = await PetCloudService.updatePet(petId, updateData)
    if (result && result.code === 0) {
      return result.data
    } else {
      throw new Error(result?.message || '更新宠物信息失败')
    }
  }

  async deletePet(petId) {
    if (!petId) {
      throw new Error('宠物 ID 不能为空')
    }
    const result = await PetCloudService.deletePet(petId)
    if (result && result.code === 0) {
      return result.data
    } else {
      throw new Error(result?.message || '删除宠物档案失败')
    }
  }

  async verifyOwnership(petId) {
    try {
      const pet = await this.getPetDetail(petId)
      // P1 修复：公开详情接口不返回 ownerId（防 PII 泄露），
      //   归属判断改用服务端计算的 isOwner 标记（openid 与 ownerId 在服务端比较）
      return pet.isOwner === true
    } catch (error) {
      return false
    }
  }
}

const petService = new PetServiceWrapper()

module.exports = {
  PetServiceWrapper,
  petService,
}
