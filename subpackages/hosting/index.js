const app = getApp()

Page({
  /**
   * 页面的初始数据
   */
  data: {
    isAcceptingOrders: true, // 是否接受接单
    hostingProfile: null, // 寄养家庭信息，初始值为 null
    isEditingDescription: false, // 是否处于编辑家庭介绍的状态
    editDescription: '', // 编辑中的家庭介绍文本
    editAvatar: '', // 编辑中的头像
    charCount: 0, // 字符计数
    isSaving: false, // 是否正在保存
    userRole: 'owner',
    avatarUrlCache: {} // 头像URL缓存，避免重复请求
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    // 检查用户角色
    this.checkUserRole()
    
    // 从服务器获取接单状态
    this.getAcceptingOrdersStatus()
    
    // 从服务器获取寄养家庭基本信息
    this.getHostProfile()
  },
  
  /**
   * 检查用户角色
   */
  checkUserRole: function() {
    const loginStateManager = app.globalData.loginStateManager
    const userRole = loginStateManager ? loginStateManager.getCurrentRole() : 'owner'
    this.setData({
      userRole: userRole
    })
    
    // 如果不是寄养家庭角色，提示并返回
    if (userRole !== 'host') {
      wx.showToast({
        title: '只有寄养家庭才能访问此页面',
        icon: 'none',
        duration: 2000
      })
      
      // 延迟返回，让用户看到提示
      setTimeout(() => {
        wx.navigateBack({
          delta: 1
        })
      }, 1500)
    }
  },

  /**
   * 处理头像URL，确保临时URL过期时能自动重新生成
   */
  async handleAvatarUrls(hostProfile) {
    console.log('Hosting page handleAvatarUrls - 开始处理头像URL');
    console.log('Hosting page handleAvatarUrls - hostingProfile.avatarUrl:', hostProfile.avatarUrl);

    // 处理寄养家庭头像
    if (hostProfile && hostProfile.avatarUrl) {
      hostProfile.avatarUrl = await this.processAvatarUrl(hostProfile.avatarUrl);
    }

    // 处理照片列表
    if (hostProfile && hostProfile.photos) {
      for (let i = 0; i < hostProfile.photos.length; i++) {
        hostProfile.photos[i] = await this.processAvatarUrl(hostProfile.photos[i]);
      }
    }

    console.log('Hosting page handleAvatarUrls - 头像URL处理完成');
    return hostProfile;
  },

  /**
   * 处理单个头像URL
   */
  async processAvatarUrl(avatarUrl) {
    if (avatarUrl.startsWith('cloud://')) {
      // 检查缓存中是否已有对应的临时URL
      const avatarUrlCache = this.data.avatarUrlCache;
      if (avatarUrlCache[avatarUrl]) {
        console.log('Hosting page processAvatarUrl - 使用缓存的临时URL:', avatarUrlCache[avatarUrl]);
        return avatarUrlCache[avatarUrl];
      }
      
      // cloud:// fileID，生成临时URL并缓存
      const tempUrl = await this.getTempAvatarUrl(avatarUrl);
      console.log('Hosting page processAvatarUrl - cloud:// URL 转换为临时URL:', tempUrl);
      
      // 缓存临时URL，避免重复请求
      const newCache = { ...avatarUrlCache, [avatarUrl]: tempUrl };
      this.setData({ avatarUrlCache: newCache });
      console.log('Hosting page processAvatarUrl - 缓存临时URL，缓存大小:', Object.keys(newCache).length);
      
      return tempUrl;
    } else if (avatarUrl.includes('tcb.qcloud.la') && avatarUrl.includes('sign=')) {
      // 检查临时URL是否已过期（通过检查签名时间戳）
      const timestampMatch = avatarUrl.match(/&t=(\d+)/);
      if (timestampMatch) {
        const urlTimestamp = parseInt(timestampMatch[1]);
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const expirationTime = 3600; // 1小时过期
        
        if (currentTimestamp - urlTimestamp > expirationTime) {
          console.log('Hosting page processAvatarUrl - 临时URL已过期，需要重新生成:', avatarUrl);
          // 从临时URL中提取fileID（如果可能）
          // 这里简化处理，直接返回原始URL，实际项目中可能需要更复杂的逻辑
        }
      }
      return avatarUrl;
    } else {
      // 其他情况，直接使用原始URL
      return avatarUrl;
    }
  },

  /**
   * 获取临时头像URL
   */
  getTempAvatarUrl(cloudUrl) {
    console.log('Hosting page getTempAvatarUrl - 检测到云存储fileID，开始生成临时URL:', cloudUrl);

    return new Promise((resolve) => {
      wx.cloud.getTempFileURL({
        fileList: [cloudUrl],
        success: (res) => {
          console.log('Hosting page getTempAvatarUrl - 获取临时文件URL成功:', res);
          if (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
            const tempUrl = res.fileList[0].tempFileURL;
            console.log('Hosting page getTempAvatarUrl - 云存储fileID转换为临时URL成功:', tempUrl);
            resolve(tempUrl);
          } else {
            console.error('Hosting page getTempAvatarUrl - 获取临时文件URL失败，返回原始URL');
            resolve(cloudUrl);
          }
        },
        fail: (err) => {
          console.error('Hosting page getTempAvatarUrl - 获取临时文件URL失败:', err);
          resolve(cloudUrl);
        }
      });
    });
  },
  
  /**
   * 获取寄养家庭基本信息
   */
  getHostProfile: function () {
    wx.showLoading({
      title: '加载中...',
    })
    
    wx.cloud.callFunction({
      name: 'getHostProfile',
      success: async res => {
        console.log('获取寄养家庭基本信息成功', res)
        if (res.result.code === 0 && res.result.data) {
          // 处理返回的数据，确保格式符合页面需求
          const hostData = res.result.data
          console.log('云函数返回的hostData:', JSON.stringify(hostData, null, 2))

          // 云函数返回了展开的数据（包含原始 basicInfo 对象），所以 hostData.basicInfo 存在
          // 云函数已经处理了扁平化字段，所以应该优先使用扁平化字段
          let hostProfile = {
            name: '家庭介绍',
            description: hostData.description || '我们是一个热爱宠物的家庭，提供安全舒适的寄养环境。',
            status: this.data.isAcceptingOrders ? 'active' : 'paused',
            avatarUrl: hostData.avatarUrl || '',
            // 云函数已经在 processedData 中处理了扁平化字段，优先使用这些字段
            basicInfo: {
              hostName: hostData.hostName || hostData.basicInfo?.hostName || '未填写',
              realName: hostData.realName || hostData.basicInfo?.realName || '未填写',
              phone: hostData.phone || hostData.basicInfo?.phone || '未填写',
              idCard: hostData.idCard || hostData.basicInfo?.idCard || '未填写',
              address: hostData.address || hostData.basicInfo?.address || '未填写',
              housingType: hostData.housingType || hostData.basicInfo?.housingType || hostData.houseInfo?.type || '未填写',
              hasYard: hostData.hasYard?.toString() || hostData.basicInfo?.hasYard?.toString() || hostData.houseInfo?.hasYard?.toString() || '未填写',
              maxPets: hostData.maxPets?.toString() || hostData.basicInfo?.maxPets?.toString() || '未填写',
              hasOtherPets: hostData.hasOtherPets?.toString() || hostData.basicInfo?.hasOtherPets?.toString() || '未填写',
              nativePetInfo: hostData.nativePetInfo || hostData.basicInfo?.nativePetInfo || '未填写',
              petTypes: hostData.petTypes || hostData.basicInfo?.petTypes || hostData.petPreferences?.types || '未填写',
              pricePerDay: hostData.pricePerDay?.toString() || hostData.basicInfo?.pricePerDay?.toString() || hostData.pricing?.daily?.toString() || '未填写',
              emergencyContactName: hostData.emergencyContactName || hostData.basicInfo?.emergencyContactName || '未填写',
              emergencyContactPhone: hostData.emergencyContactPhone || hostData.basicInfo?.emergencyContactPhone || '未填写'
            },
            serviceInfo: {
              serviceTypes: hostData.serviceTypes || [],
              pricePerDay: hostData.pricePerDay || '',
              description: hostData.description || ''
            },

            photos: hostData.photos || [],
            videos: hostData.videos || [],
            createdAt: hostData.createdAt || '',
            updatedAt: hostData.updatedAt || '',
            isAcceptingOrders: hostData.isAcceptingOrders !== undefined ? hostData.isAcceptingOrders : true,
            isActive: hostData.isActive || 1,
            rating: hostData.rating || 5,
            reviewCount: hostData.reviewCount || 0,
            status: hostData.status || 'pending'
          }

          console.log('构建的hostProfile.basicInfo:', JSON.stringify(hostProfile.basicInfo, null, 2))
          console.log('云函数返回的原始basicInfo:', hostData.basicInfo)
          console.log('云函数返回的扁平字段:', {
            hostName: hostData.hostName,
            realName: hostData.realName,
            phone: hostData.phone,
            idCard: hostData.idCard,
            address: hostData.address,
            housingType: hostData.housingType,
            hasYard: hostData.hasYard,
            maxPets: hostData.maxPets,
            hasOtherPets: hostData.hasOtherPets,
            nativePetInfo: hostData.nativePetInfo,
            petTypes: hostData.petTypes,
            pricePerDay: hostData.pricePerDay,
            emergencyContactName: hostData.emergencyContactName,
            emergencyContactPhone: hostData.emergencyContactPhone
          })

          // 处理认证图片URL（身份证照片等）
          // 由于云函数已经处理了fileID到临时URL的转换，这里直接使用返回的URL
          // 如果URL过期，下次刷新页面时会获取新的临时URL
          const processCertImages = () => {
            // 不需要任何处理，直接返回已解析的Promise
            return Promise.resolve()
          }

          // 处理头像URL
          console.log('云函数返回的头像URL:', hostProfile.avatarUrl)

          // 重要：保存原始的 cloud:// fileID 到 globalData，而不是临时URL
          const originalAvatarUrl = hostData.avatarUrl || ''
          app.globalData.hostInfo = {
            ...hostData,
            avatarUrl: originalAvatarUrl
          }
          console.log('更新 globalData.hostInfo，avatarUrl:', originalAvatarUrl)

          // 处理头像URL，确保临时URL过期时能自动重新生成
          hostProfile = await this.handleAvatarUrls(hostProfile);

          processCertImages().then(() => {
            this.setData({
              hostingProfile: hostProfile
            })
            console.log('头像URL和认证图片已处理，已应用到页面')
          })
        } else {
          // 如果未找到寄养家庭信息，显示默认信息
          this.setData({
            hostingProfile: {
              name: '家庭介绍',
              description: '您尚未创建寄养家庭配置，请先完成注册。',
              status: this.data.isAcceptingOrders ? 'active' : 'paused',
              basicInfo: {
                hostName: '未填写',
                realName: '未填写',
                phone: '未填写',
                idCard: '未填写',
                address: '未填写',
                housingType: '未填写',
                hasYard: '未填写',
                maxPets: '未填写',
                hasOtherPets: '未填写',
                nativePetInfo: '未填写',
                petTypes: '未填写',
                pricePerDay: '未填写',
                emergencyContactName: '未填写',
                emergencyContactPhone: '未填写'
              },
              photos: [],
              videos: []
            }
          })
        }
      },
      fail: err => {
        console.error('获取寄养家庭基本信息失败', err)
        wx.showToast({
          title: '获取信息失败',
          icon: 'none'
        })
        // 显示默认信息
        this.setData({
          hostingProfile: {
            name: '家庭介绍',
            description: '您尚未创建寄养家庭配置，请先完成注册。',
            status: this.data.isAcceptingOrders ? 'active' : 'paused', // 确保与isAcceptingOrders一致
            basicInfo: {
              hostName: '未填写',
              realName: '未填写',
              phone: '未填写',
              idCard: '未填写',
              address: '未填写',
              housingType: '未填写',
              hasYard: '未填写',
              maxPets: '未填写',
              hasOtherPets: '未填写',
              nativePetInfo: '未填写',
              petTypes: '未填写',
              pricePerDay: '未填写',
              emergencyContactName: '未填写',
              emergencyContactPhone: '未填写'
            },
            photos: [],
            videos: []
          }
        })
      },
      complete: () => {
        wx.hideLoading()
      }
    })
  },
  
  /**
   * 获取接单状态
   */
  getAcceptingOrdersStatus: function () {
    wx.showLoading({
      title: '加载中...',
    })
    
    wx.cloud.callFunction({
      name: 'getHostProfile',
      success: res => {
        console.log('获取寄养家庭配置成功', res)
        console.log('云函数返回的结果:', JSON.stringify(res.result, null, 2))
        if (res.result.code === 0 && res.result.data) {
          const isAcceptingOrders = res.result.data.isAcceptingOrders !== undefined ? res.result.data.isAcceptingOrders : true
          this.setData({
            isAcceptingOrders: isAcceptingOrders
          })
          
          // 更新基本信息栏的状态标签
          if (this.data.hostingProfile) {
            const updatedProfile = {...this.data.hostingProfile}
            updatedProfile.status = isAcceptingOrders ? 'active' : 'paused'
            this.setData({
              hostingProfile: updatedProfile
            })
          }
        }
      },
      fail: err => {
        console.error('获取寄养家庭配置失败', err)
        wx.showToast({
          title: '获取失败',
          icon: 'none'
        })
      },
      complete: () => {
        wx.hideLoading()
      }
    })
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    // 页面显示时检查用户角色
    this.checkUserRole()
    
    // 页面显示时刷新数据
    this.getHostingServices()
    // 避免每次页面显示时都重新加载寄养家庭信息，只在页面第一次加载时获取
    // 如果需要在特定场景下刷新，可以通过其他方式触发
  },

  /**
   * 获取寄养服务列表
   */
  getHostingServices: function () {
    // 模拟从服务器获取数据
    // 实际项目中应该调用API接口
    wx.showLoading({
      title: '加载中...',
    })

    setTimeout(() => {
      wx.hideLoading()
    }, 1000)
  },

  /**
   * 切换编辑模式
   */
  toggleEditMode: function () {
    if (this.data.isEditingDescription) {
      // 如果已经在编辑模式，保存更改
      this.saveDescription();
    } else {
      // 进入编辑模式
      console.log('toggleEditMode - 进入编辑模式');
      this.setData({
        isEditingDescription: true,
        editDescription: this.data.hostingProfile.description,
        editAvatar: this.data.hostingProfile.avatarUrl,
        charCount: this.data.hostingProfile.description.length
      });
      console.log('toggleEditMode - 编辑模式状态设置为:', this.data.isEditingDescription);
    }
  },

  /**
   * 取消编辑
   */
  cancelEdit: function () {
    console.log('cancelEdit - 取消编辑');
    this.setData({
      isEditingDescription: false,
      editDescription: '',
      editAvatar: '',
      charCount: 0
    });
  },

  /**
   * 选择头像
   */
  chooseAvatar: function () {
    const that = this
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        console.log('选择头像成功:', res)
        const tempFilePath = res.tempFiles[0].tempFilePath
        
        // 立即更新本地预览
        that.setData({
          editAvatar: tempFilePath
        })
        
        console.log('头像预览更新成功:', tempFilePath)
        
        // 上传到云存储
        that.uploadAvatar(tempFilePath)
      },
      fail: function (err) {
        console.error('选择头像失败:', err)
        wx.showToast({
          title: '选择头像失败',
          icon: 'none'
        })
      }
    })
  },

  /**
   * 上传头像到云存储
   */
  uploadAvatar: function (tempFilePath) {
    const that = this
    wx.showLoading({
      title: '上传中...'
    })

    // 生成唯一文件名
    const fileName = `hostAvatars/${Date.now()}_${Math.floor(Math.random() * 1000)}.png`

    wx.cloud.uploadFile({
      cloudPath: fileName,
      filePath: tempFilePath,
      success: function (res) {
        console.log('头像上传成功:', res)
        const fileID = res.fileID

        // 保存 fileID 用于存储和全局变量
        that.setData({
          editAvatar: fileID
        })

        console.log('头像fileID:', fileID)

        wx.hideLoading()
        wx.showToast({
          title: '头像上传成功',
          icon: 'success'
        })
      },
      fail: function (err) {
        console.error('头像上传失败:', err)
        wx.hideLoading()
        wx.showToast({
          title: '头像上传失败',
          icon: 'none'
        })
      }
    })
  },

  /**
   * 处理输入框输入
   */
  onInput: function (e) {
    const value = e.detail.value
    this.setData({
      editDescription: value,
      charCount: value.length
    })
  },

  /**
   * 保存家庭介绍和头像
   */
  saveDescription: function () {
    const { editDescription, editAvatar } = this.data
    
    // 验证输入内容
    if (!editDescription.trim()) {
      wx.showToast({
        title: '请输入家庭介绍',
        icon: 'none'
      })
      return
    }

    // 显示保存中状态
    this.setData({
      isSaving: true
    })

    // 调用云函数更新家庭介绍和头像
    wx.cloud.callFunction({
      name: 'updateHostProfile',
      data: {
        updateType: 'description',
        description: editDescription,
        avatarUrl: editAvatar
      },
      success: res => {
        console.log('更新家庭介绍和头像成功:', res)
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        })
        // 更新页面数据
        const updatedProfile = { ...this.data.hostingProfile }
        updatedProfile.description = editDescription
        updatedProfile.avatarUrl = editAvatar
        this.setData({
          hostingProfile: updatedProfile,
          isSaving: false,
          isEditingDescription: false,
          editDescription: '',
          editAvatar: '',
          charCount: 0
        })

        // 更新全局变量中的hostInfo，确保保存的是 cloud:// fileID
        if (app.globalData.hostInfo) {
          app.globalData.hostInfo.description = editDescription
          app.globalData.hostInfo.avatarUrl = editAvatar
          console.log('更新 globalData.hostInfo，avatarUrl:', editAvatar)
        }
      },
      fail: err => {
        console.error('更新家庭介绍和头像失败:', err)
        wx.showToast({
          title: '保存失败',
          icon: 'none'
        })
        this.setData({
          isSaving: false
        })
      }
    })
  },

  /**
   * 编辑基本信息
   */
  editBasicInfo: function () {
    // 这里可以打开一个表单页面或弹窗来编辑基本信息
    wx.navigateTo({
      url: '/subpackages/hosting/edit-basic-info?data=' + encodeURIComponent(JSON.stringify(this.data.hostingProfile))
    })
  },

  /**
   * 编辑环境照片
   */
  editPhotos: function () {
    // 照片编辑功能已经通过 choosePhotos 函数实现
    this.choosePhotos()
  },

  /**
   * 编辑环境视频
   */
  editVideos: function () {
    // 视频编辑功能已经通过 chooseVideos 函数实现
    this.chooseVideos()
  },

  /**
   * 更新寄养家庭信息
   */
  updateHostProfile: function (data) {
    wx.showLoading({
      title: '更新中...',
    })

    wx.cloud.callFunction({
      name: 'updateHostProfile',
      data: data,
      success: res => {
        console.log('更新寄养家庭信息成功', res)
        if (res.result.code === 0) {
          wx.showToast({
            title: '更新成功',
            icon: 'success',
            duration: 1500
          })
        } else {
          wx.showToast({
            title: res.result.message || '更新失败',
            icon: 'none'
          })
        }
      },
      fail: err => {
        console.error('更新寄养家庭信息失败', err)
        wx.showToast({
          title: '更新失败',
          icon: 'none'
        })
      },
      complete: () => {
        wx.hideLoading()
      }
    })
  },

  /**
   * 头像加载失败处理
   */
  async onAvatarLoadError(e) {
    console.error('头像加载失败:', e)
    console.error('加载失败的图片URL:', e.detail.errMsg)
    
    if (this.data.hostingProfile) {
      const hostingProfile = this.data.hostingProfile
      
      // 尝试重新生成临时URL
      if (hostingProfile.avatarUrl) {
        try {
          console.log('尝试重新生成头像临时URL:', hostingProfile.avatarUrl);
          
          // 检查是否是云存储fileID
          if (hostingProfile.avatarUrl.startsWith('cloud://')) {
            // 直接生成新的临时URL
            const newTempUrl = await this.getTempAvatarUrl(hostingProfile.avatarUrl);
            console.log('重新生成的临时URL:', newTempUrl);
            
            // 更新头像URL
            const updatedProfile = {...hostingProfile};
            updatedProfile.avatarUrl = newTempUrl;
            
            this.setData({
              hostingProfile: updatedProfile
            });
            
            console.log('头像URL已重新生成并更新');
            return;
          } else if (hostingProfile.avatarUrl.includes('tcb.qcloud.la') && hostingProfile.avatarUrl.includes('sign=')) {
            // 临时URL过期，尝试从globalData中获取原始fileID
            if (app.globalData.hostInfo && app.globalData.hostInfo.avatarUrl && app.globalData.hostInfo.avatarUrl.startsWith('cloud://')) {
              const originalFileID = app.globalData.hostInfo.avatarUrl;
              console.log('从globalData获取原始fileID:', originalFileID);
              
              // 生成新的临时URL
              const newTempUrl = await this.getTempAvatarUrl(originalFileID);
              console.log('重新生成的临时URL:', newTempUrl);
              
              // 更新头像URL
              const updatedProfile = {...hostingProfile};
              updatedProfile.avatarUrl = newTempUrl;
              
              this.setData({
                hostingProfile: updatedProfile
              });
              
              console.log('头像URL已重新生成并更新');
              return;
            }
          }
        } catch (error) {
          console.error('重新生成头像URL失败:', error);
        }
      }
      
      // 如果重新生成失败，才显示默认头像
      const updatedProfile = {...hostingProfile};
      updatedProfile.avatarUrl = '/images/default-avatar.svg';
      
      this.setData({
        hostingProfile: updatedProfile
      });
      
      console.log('头像已更新为默认头像');
    } else {
      console.error('hostingProfile 为 null，无法更新默认头像');
    }
  },



  /**
   * 切换接单状态
   */
  toggleAcceptingOrders: function () {
    const isAcceptingOrders = !this.data.isAcceptingOrders
    
    wx.showLoading({
      title: '更新中...',
    })
    
    wx.cloud.callFunction({
      name: 'updateHostAcceptingOrders',
      data: {
        isAcceptingOrders: isAcceptingOrders
      },
      success: res => {
        console.log('更新接单状态成功', res)
        wx.hideLoading()
        if (res.result.code === 0) {
          this.setData({
            isAcceptingOrders: isAcceptingOrders
          })
          
          // 同时更新基本信息栏的状态标签
          if (this.data.hostingProfile) {
            const updatedProfile = {...this.data.hostingProfile}
            updatedProfile.status = isAcceptingOrders ? 'active' : 'paused'
            this.setData({
              hostingProfile: updatedProfile
            })
          }
          
          wx.showToast({
            title: isAcceptingOrders ? '已恢复接单' : '已暂停接单',
            icon: 'success',
            duration: 1500
          })
        } else {
          wx.showToast({
            title: res.result.message || '更新失败',
            icon: 'none'
          })
        }
      },
      fail: err => {
        console.error('更新接单状态失败', err)
        wx.hideLoading()
        wx.showToast({
          title: '更新失败',
          icon: 'none'
        })
      }
    })
  },



  /**
   * 切换服务状态
   */
  toggleStatus: function () {
    const profile = {...this.data.hostingProfile}
    profile.status = profile.status === 'active' ? 'paused' : 'active'
    
    this.setData({
      hostingProfile: profile
    })

    // 实际项目中应该调用API接口更新状态
    wx.showToast({
      title: profile.status === 'active' ? '服务已开启' : '服务已暂停',
      icon: 'success',
      duration: 1500
    })
  },

  /**
   * 选择照片
   */
  choosePhotos: function () {
    const that = this
    
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      camera: 'back',
      success: function (res) {
        const tempFiles = res.tempFiles
        that.uploadPhotos(tempFiles)
      },
      fail: function (err) {
        console.error('选择照片失败:', err)
        wx.showToast({
          title: '选择照片失败',
          icon: 'none'
        })
      }
    })
  },

  /**
   * 上传照片
   */
  uploadPhotos: function (tempFiles) {
    const that = this
    
    tempFiles.forEach((file, index) => {
      // 生成唯一文件名
      const fileName = `photos/${Date.now()}_${Math.floor(Math.random() * 10000)}.${file.tempFilePath.split('.').pop()}`
      
      wx.cloud.uploadFile({
        cloudPath: fileName,
        filePath: file.tempFilePath,
        success: function (res) {
          // 获取文件的临时下载链接
          wx.cloud.getTempFileURL({
            fileList: [res.fileID],
            success: function (fileRes) {
              const fileUrl = fileRes.fileList[0].tempFileURL
              
              // 上传成功，更新照片列表
              const profile = {...that.data.hostingProfile}
              profile.photos.push(fileUrl)
              
              that.setData({
                hostingProfile: profile
              })

              // 调用云函数更新数据库
              that.updateHostProfile({ photos: profile.photos })

              wx.showToast({
                title: index === tempFiles.length - 1 ? '照片上传成功' : '',
                icon: 'success'
              })
            },
            fail: function (err) {
              console.error('获取文件下载链接失败:', err)
              wx.showToast({
                title: '上传失败',
                icon: 'none'
              })
            }
          })
        },
        fail: function (err) {
          console.error('上传照片失败:', err)
          wx.showToast({
            title: '上传失败',
            icon: 'none'
          })
        }
      })
    })
  },

  /**
   * 选择视频
   */
  chooseVideos: function () {
    const that = this
    
    wx.chooseMedia({
      count: 3,
      mediaType: ['video'],
      sourceType: ['album', 'camera'],
      camera: 'back',
      maxDuration: 60,
      success: function (res) {
        const tempFiles = res.tempFiles
        that.uploadVideos(tempFiles)
      },
      fail: function (err) {
        console.error('选择视频失败:', err)
        wx.showToast({
          title: '选择视频失败',
          icon: 'none'
        })
      }
    })
  },

  /**
   * 上传视频
   */
  uploadVideos: function (tempFiles) {
    const that = this
    
    tempFiles.forEach((file, index) => {
      // 生成唯一文件名
      const fileName = `videos/${Date.now()}_${Math.floor(Math.random() * 10000)}.${file.tempFilePath.split('.').pop()}`
      
      wx.cloud.uploadFile({
        cloudPath: fileName,
        filePath: file.tempFilePath,
        success: function (res) {
          // 获取文件的临时下载链接
          wx.cloud.getTempFileURL({
            fileList: [res.fileID],
            success: function (fileRes) {
              const fileUrl = fileRes.fileList[0].tempFileURL
              
              // 上传成功，更新视频列表
              const profile = {...that.data.hostingProfile}
              profile.videos.push(fileUrl)
              
              that.setData({
                hostingProfile: profile
              })

              // 调用云函数更新数据库
              that.updateHostProfile({ videos: profile.videos })

              wx.showToast({
                title: index === tempFiles.length - 1 ? '视频上传成功' : '',
                icon: 'success'
              })
            },
            fail: function (err) {
              console.error('获取文件下载链接失败:', err)
              wx.showToast({
                title: '上传失败',
                icon: 'none'
              })
            }
          })
        },
        fail: function (err) {
          console.error('上传视频失败:', err)
          wx.showToast({
            title: '上传失败',
            icon: 'none'
          })
        }
      })
    })
  },

  /**
   * 删除照片
   */
  deletePhoto: function (e) {
    const index = e.currentTarget.dataset.index
    const that = this
    
    wx.showModal({
      title: '删除照片',
      content: '确定要删除这张照片吗？',
      success: function (res) {
        if (res.confirm) {
          const profile = {...that.data.hostingProfile}
          profile.photos.splice(index, 1)
          
          that.setData({
            hostingProfile: profile
          })
          
          // 调用云函数更新照片列表
          that.updateHostProfile({ photos: profile.photos })
        }
      }
    })
  },
  
  /**
   * 删除视频
   */
  deleteVideo: function (e) {
    const index = e.currentTarget.dataset.index
    const that = this
    
    wx.showModal({
      title: '删除视频',
      content: '确定要删除这个视频吗？',
      success: function (res) {
        if (res.confirm) {
          const profile = {...that.data.hostingProfile}
          profile.videos.splice(index, 1)
          
          that.setData({
            hostingProfile: profile
          })
          
          // 调用云函数更新视频列表
          that.updateHostProfile({ videos: profile.videos })
        }
      }
    })
  },
  
  /**
   * 预览图片
   */
  previewImage: function (e) {
    const url = e.currentTarget.dataset.url
    const photos = this.data.hostingProfile.photos
    
    wx.previewImage({
      urls: photos,
      current: url
    })
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {
    this.getHostingServices()
    wx.stopPullDownRefresh()
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {
    return {
      title: '我的寄养服务',
      path: '/subpackages/hosting/index'
    }
  }
})
