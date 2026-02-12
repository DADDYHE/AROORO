Page({
  /**
   * 页面的初始数据
   */
  data: {
    formData: {
      // 基本信息
      hostName: '',
      realName: '',
      phone: '',
      idCard: '',
      address: '',
      
      // 寄养环境
      housingType: '',
      hasYard: '',
      maxPets: '',
      hasOtherPets: '',
      nativePetInfo: '',
      petTypes: '',
      
      // 服务信息
      serviceTypes: [],
      pricePerDay: '',
      description: '',
      
      // 资质认证
      idCardFront: '',
      idCardBack: '',
      healthCertificate: '',
      emergencyContactName: '',
      emergencyContactPhone: ''
    },
    
    // 验证错误信息
    errors: {
      hostName: '',
      realName: '',
      phone: '',
      idCard: '',
      address: '',
      pricePerDay: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      housingType: '',
      hasYard: '',
      maxPets: '',
      hasOtherPets: '',
      petTypes: '',
      nativePetInfo: ''
    },
    
    // 选择器选项
    housingTypes: [
      { name: '公寓', value: 'apartment' },
      { name: '住宅', value: 'residential' },
      { name: '独栋', value: 'detached' },
      { name: '商业', value: 'commercial' }
    ],
    petTypeOptions: [
      { name: '狗狗', value: 'dog' },
      { name: '猫咪', value: 'cat' },
      { name: '其他', value: 'other' }
    ],
    serviceTypeOptions: [
      { name: '日间寄养', value: 'day' },
      { name: '夜间寄养', value: 'night' },
      { name: '全天寄养', value: 'allDay' },
      { name: '上门喂养', value: 'homeVisit' },
      { name: '遛狗服务', value: 'walk' }
    ],
    
    // 弹窗控制
    showHousingTypeSheet: false,
    showHasYardSheet: false,
    showMaxPetsSheet: false,
    showHasOtherPetsSheet: false,
    showPetTypeSheet: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    // 获取传递过来的数据
    if (options.data) {
      try {
        const data = JSON.parse(decodeURIComponent(options.data));
        console.log('解析到的数据:', data);
        
        // 构建完整的表单数据，处理嵌套结构和字段匹配
        const formData = {
          // 基本信息
          hostName: data.basicInfo?.hostName || data.hostName || data.name || '',
          realName: data.basicInfo?.realName || data.realName || '',
          phone: data.basicInfo?.phone || data.phone || '',
          idCard: data.basicInfo?.idCard || data.idCard || '',
          address: data.basicInfo?.address || data.address || '',
          
          // 寄养环境
          housingType: data.basicInfo?.housingType || data.housingType || '',
          hasYard: data.basicInfo?.hasYard || data.hasYard || '',
          maxPets: data.basicInfo?.maxPets || data.maxPets || '',
          hasOtherPets: data.basicInfo?.hasOtherPets || data.hasOtherPets || '',
          nativePetInfo: data.basicInfo?.nativePetInfo || data.nativePetInfo || '',
          petTypes: data.basicInfo?.petTypes || data.petTypes || '',
          
          // 服务信息
          serviceTypes: data.serviceInfo?.serviceTypes || data.serviceTypes || [],
          pricePerDay: data.serviceInfo?.pricePerDay || data.basicInfo?.pricePerDay || data.pricePerDay || '',
          description: data.serviceInfo?.description || data.description || '',
          
          // 资质认证
          idCardFront: data.certificationInfo?.idCardFront || data.idCardFront || '',
          idCardBack: data.certificationInfo?.idCardBack || data.idCardBack || '',
          healthCertificate: data.certificationInfo?.healthCertificate || data.healthCertificate || '',
          emergencyContactName: data.certificationInfo?.emergencyContactName || data.basicInfo?.emergencyContactName || data.emergencyContactName || '',
          emergencyContactPhone: data.certificationInfo?.emergencyContactPhone || data.basicInfo?.emergencyContactPhone || data.emergencyContactPhone || ''
        };
        
        this.setData({
          formData: formData
        });
        
        console.log('设置后的表单数据:', this.data.formData);
      } catch (error) {
        console.error('解析数据失败:', error);
        wx.showToast({
          title: '数据解析失败',
          icon: 'none'
        });
      }
    }
  },


  validateField: function (field, value) {
    let error = '';
    
    switch (field) {
      case 'phone':
      case 'emergencyContactPhone':
        const phoneReg = /^1[3-9]\d{9}$/;
        if (value && !phoneReg.test(value)) {
          error = '请输入正确的手机号码';
        }
        break;
        
      case 'idCard':
        const idCardReg = /^[1-9]\d{5}(18|19|20)\d{2}((0[1-9])|(1[0-2]))(([0-2][1-9])|10|20|30|31)\d{3}[0-9Xx]$/;
        if (value && !idCardReg.test(value)) {
          error = '请输入正确的身份证号码';
        }
        break;
        
      case 'hostName':
      case 'realName':
      case 'address':
      case 'pricePerDay':
      case 'emergencyContactName':
        if (!value) {
          error = '请填写此字段';
        }
        break;
        
      case 'housingType':
      case 'hasYard':
      case 'maxPets':
      case 'petTypes':
      case 'hasOtherPets':
        if (!value) {
          error = '请选择此字段';
        }
        break;
        
      case 'nativePetInfo':
        const { hasOtherPets } = this.data.formData;
        if (hasOtherPets === '有' && !value) {
          error = '请填写原住民品种和数量';
        }
        break;
    }
    
    return error;
  },
  
  /**
   * 输入处理
   */
  handleInput: function (e) {
    const { field } = e.currentTarget.dataset;
    const { value } = e.detail;
    
    // 更新表单数据
    this.setData({
      [`formData.${field}`]: value
    });
    
    // 实时验证
    const error = this.validateField(field, value);
    this.setData({
      [`errors.${field}`]: error
    });
  },

  /**
   * 选择住房类型
   */
  selectHousingType() {
    this.setData({ showHousingTypeSheet: true });
  },

  onSelectHousingType(event) {
    const formData = { ...this.data.formData };
    const selectedValue = event.currentTarget.dataset.value;
    // 找到对应的中文名称
    const selectedItem = this.data.housingTypes.find(item => item.value === selectedValue);
    formData.housingType = selectedItem.name;
    this.setData({ 
      formData,
      showHousingTypeSheet: false
    });
    
    // 验证字段
    const error = this.validateField('housingType', formData.housingType);
    this.setData({
      'errors.housingType': error
    });
  },

  onCloseHousingTypeSheet() {
    this.setData({ showHousingTypeSheet: false });
  },

  /**
   * 选择是否有庭院
   */
  selectHasYard() {
    this.setData({ showHasYardSheet: true });
  },

  onSelectHasYard(event) {
    const formData = { ...this.data.formData };
    formData.hasYard = event.currentTarget.dataset.value;
    this.setData({ 
      formData,
      showHasYardSheet: false
    });
    
    // 验证字段
    const error = this.validateField('hasYard', formData.hasYard);
    this.setData({
      'errors.hasYard': error
    });
  },

  onCloseHasYardSheet() {
    this.setData({ showHasYardSheet: false });
  },

  /**
   * 选择最大可寄养宠物数量
   */
  selectMaxPets() {
    this.setData({ showMaxPetsSheet: true });
  },

  onSelectMaxPets(event) {
    const formData = { ...this.data.formData };
    formData.maxPets = event.currentTarget.dataset.value;
    this.setData({ 
      formData,
      showMaxPetsSheet: false
    });
    
    // 验证字段
    const error = this.validateField('maxPets', formData.maxPets);
    this.setData({
      'errors.maxPets': error
    });
  },

  onCloseMaxPetsSheet() {
    this.setData({ showMaxPetsSheet: false });
  },

  /**
   * 选择是否有其他宠物
   */
  selectHasOtherPets() {
    this.setData({ showHasOtherPetsSheet: true });
  },

  onSelectHasOtherPets(event) {
    const formData = { ...this.data.formData };
    formData.hasOtherPets = event.currentTarget.dataset.value;
    // 如果选择"否"，清空原住民信息
    if (formData.hasOtherPets === '无') {
      formData.nativePetInfo = '';
    }
    this.setData({ 
      formData,
      showHasOtherPetsSheet: false
    });
    
    // 验证字段
    const error = this.validateField('hasOtherPets', formData.hasOtherPets);
    this.setData({
      'errors.hasOtherPets': error
    });
    
    // 验证原住民信息（如果选择了"有"）
    const nativePetError = this.validateField('nativePetInfo', formData.nativePetInfo);
    this.setData({
      'errors.nativePetInfo': nativePetError
    });
  },

  onCloseHasOtherPetsSheet() {
    this.setData({ showHasOtherPetsSheet: false });
  },

  /**
   * 选择可寄养宠物类型
   */
  selectPetType() {
    this.setData({ showPetTypeSheet: true });
  },

  onSelectPetType(event) {
    const formData = { ...this.data.formData };
    formData.petTypes = event.currentTarget.dataset.value;
    this.setData({ 
      formData,
      showPetTypeSheet: false
    });
    
    // 验证字段
    const error = this.validateField('petTypes', formData.petTypes);
    this.setData({
      'errors.petTypes': error
    });
  },

  onClosePetTypeSheet() {
    this.setData({ showPetTypeSheet: false });
  },

  /**
   * 选择服务类型
   */
  selectServiceType(e) {
    const value = e.currentTarget.dataset.value;
    const serviceTypes = [...this.data.formData.serviceTypes];
    
    if (serviceTypes.includes(value)) {
      // 如果已选中，则取消选中
      const index = serviceTypes.indexOf(value);
      serviceTypes.splice(index, 1);
    } else {
      // 如果未选中，则添加到选中列表
      serviceTypes.push(value);
    }

    const formData = { ...this.data.formData };
    formData.serviceTypes = serviceTypes;
    this.setData({ formData });
  },

  /**
   * 保存基本信息
   */
  saveBasicInfo: function () {
    const { formData } = this.data;
    let hasError = false;
    const errors = { ...this.data.errors };
    
    // 验证所有字段
    Object.keys(errors).forEach(field => {
      const error = this.validateField(field, formData[field]);
      errors[field] = error;
      if (error) {
        hasError = true;
      }
    });
    
    // 更新错误信息
    this.setData({ errors });
    
    // 如果有错误，显示提示并返回
    if (hasError) {
      wx.showToast({
        title: '请检查表单填写是否正确',
        icon: 'none'
      });
      return;
    }

    // 构建数据结构（与数据库存储结构一致的扁平结构）
    const updateData = {
      // 基本信息
      hostName: formData.hostName,
      realName: formData.realName,
      phone: formData.phone,
      idCard: formData.idCard,
      address: formData.address,
      pricePerDay: formData.pricePerDay,
      emergencyContactName: formData.emergencyContactName,
      emergencyContactPhone: formData.emergencyContactPhone,
      
      // 寄养环境
      housingType: formData.housingType,
      hasYard: formData.hasYard,
      maxPets: formData.maxPets,
      hasOtherPets: formData.hasOtherPets,
      nativePetInfo: formData.nativePetInfo,
      petTypes: formData.petTypes,
      
      // 资质认证
      idCardFront: formData.idCardFront,
      idCardBack: formData.idCardBack,
      healthCertificate: formData.healthCertificate
    };

    // 调用云函数更新基本信息
    wx.cloud.callFunction({
      name: 'updateHostProfile',
      data: {
        ...updateData,
        updateType: 'basicInfo'
      },
      success: res => {
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        });
        // 保存成功后返回上一页
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      },
      fail: err => {
        console.error('更新基本信息失败:', err);
        wx.showToast({
          title: '保存失败',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 取消编辑
   */
  cancel: function () {
    wx.navigateBack();
  }
});
