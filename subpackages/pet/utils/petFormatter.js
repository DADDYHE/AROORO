const { PET_AGE_GROUPS } = require('./petConstants')

module.exports = {
  formatAge(age) {
    if (age === undefined || age === null) return '未知'

    if (age < 1) {
      return `${Math.floor(age * 12)}个月`
    } else if (age < 2) {
      return '1 岁左右'
    } else {
      return `${age}岁`
    }
  },

  getAgeGroup(age) {
    if (age === undefined || age === null) return PET_AGE_GROUPS.ADULT

    if (age < 1) return PET_AGE_GROUPS.BABY
    if (age < 3) return PET_AGE_GROUPS.YOUNG
    if (age < 8) return PET_AGE_GROUPS.ADULT
    return PET_AGE_GROUPS.SENIOR
  },

  formatWeight(weight) {
    if (weight === undefined || weight === null) return '未知'
    return `${weight.toFixed(2)}kg`
  },

  formatPetType(type) {
    const typeMap = {
      dog: '狗狗',
      cat: '猫咪',
      exotic: '异宠',
    }
    return typeMap[type] || type || '未知'
  },

  formatGender(gender) {
    return gender === 'male' ? '弟弟' : gender === 'female' ? '妹妹' : '未知'
  },

  formatDate(date) {
    if (!date) return '未知'

    const d = new Date(date)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')

    return `${year}-${month}-${day}`
  },

  formatPetForDisplay(pet) {
    if (!pet) return {}

    return {
      ...pet,
      ageDisplay: this.formatAge(pet.age),
      ageGroup: this.getAgeGroup(pet.age),
      weightDisplay: this.formatWeight(pet.weight),
      petTypeDisplay: this.formatPetType(pet.type),
      genderDisplay: this.formatGender(pet.gender),
      createdAtDisplay: this.formatDate(pet.createdAt),
      updatedAtDisplay: this.formatDate(pet.updatedAt)
    }
  },

  formatPetBasic(pet) {
    if (!pet) return {}

    return {
      id: pet.id || pet._id,
      name: pet.name || '',
      type: pet.type || '',
      petTypeDisplay: this.formatPetType(pet.type),
      breed: pet.breed || '',
      gender: pet.gender || '',
      genderDisplay: this.formatGender(pet.gender),
      birthday: pet.birthday || '',
      weight: pet.weight != null ? pet.weight : '',
      weightDisplay: pet.weight != null ? this.formatWeight(pet.weight) : '',
      note: pet.note || '',
      avatarUrl: pet.avatarUrl || '/images/default-avatar.svg',
      createdAt: pet.createdAt,
      updatedAt: pet.updatedAt
    }
  },

  formatPetProfile(pet) {
    if (!pet) return {}

    return {
      ...this.formatPetBasic(pet),
    }
  },

  validatePetData(petData) {
    const errors = []

    if (!petData.name || petData.name.trim() === '') {
      errors.push('请输入宠物名称')
    } else if (petData.name.length > 20) {
      errors.push('宠物名称不能超过 20 个字符')
    }

    if (!petData.type) {
      errors.push('请选择宠物类型')
    }

    if (petData.weight !== undefined && petData.weight !== null && petData.weight !== '') {
      if (petData.weight <= 0 || petData.weight > 200) {
        errors.push('宠物体重必须在 0-200kg 之间')
      }
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }
}
