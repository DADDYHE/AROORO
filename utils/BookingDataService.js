const BookingData = {
  _data: {
    selectedDates: null,
    selectedDatesTimestamp: null,
    selectedPets: [],
    selectedPetDetails: [],
    selectedHost: null,
    bookingRequirements: null,
    petServices: {},
  },

  get(key) {
    if (!key) return { ...this._data }
    const value = this._data[key]
    if (value && typeof value === 'object') {
      return Array.isArray(value) ? [...value] : { ...value }
    }
    return value
  },

  set(key, value) {
    this._data[key] = value
  },

  reset() {
    this._data = {
      selectedDates: null,
      selectedDatesTimestamp: null,
      selectedPets: [],
      selectedPetDetails: [],
      selectedHost: null,
      bookingRequirements: null,
      petServices: {},
    }
  },
}

module.exports = { BookingData }