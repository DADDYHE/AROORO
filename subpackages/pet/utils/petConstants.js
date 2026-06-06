module.exports = {
  PET_TYPES: {
    DOG: 'dog',
    CAT: 'cat',
    EXOTIC: 'exotic',
  },

  PET_GENDER: {
    MALE: 'male',
    FEMALE: 'female',
    UNKNOWN: 'unknown',
  },

  PET_AGE_GROUPS: {
    BABY: 'baby',
    YOUNG: 'young',
    ADULT: 'adult',
    SENIOR: 'senior'
  },

  MAX_PET_IMAGES: 9,

  MAX_NAME_LENGTH: 20,

  MAX_DESCRIPTION_LENGTH: 500,

  CACHE_KEYS: {
    PET_LIST: 'pet_list_cache',
    PET_DETAIL: 'pet_detail_cache_',
    PET_FORM: 'pet_form_cache'
  },

  CACHE_TIME: {
    SHORT: 5 * 60 * 1000,
    MEDIUM: 30 * 60 * 1000,
    LONG: 24 * 60 * 60 * 1000
  }
}
