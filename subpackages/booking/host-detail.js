// 尝试加载ImUserIdValidator模块
let ImUserIdValidator;
try {
  ImUserIdValidator = require('../../utils/imUserIdValidator');
  console.log('成功加载ImUserIdValidator模块');
} catch (error) {
  console.error('加载ImUserIdValidator模块失败:', error);
  // 提供备用方案
  ImUserIdValidator = {
    generateFormat1UserID: function(openid, roleType) {
      console.log('使用备用方案生成IM userID');
      const shortRoleType = {
        'owner': 'own',
        'host': 'hst',
        'guest': 'gst'
      }[roleType] || roleType;
      
      // 生成简单的userID: roleType_openid
      let userID = `${shortRoleType}_${openid}`;
      // 处理特殊字符
      userID = userID.replace(/[^a-zA-Z0-9_]/g, '_');
      // 限制长度
      if (userID.length > 30) {
        userID = userID.slice(0, 30);
      }
      return userID;
    }
  };
}

// 尝试加载im-profile-manager模块
let imProfileManager;
try {
  imProfileManager = require('../../utils/im-profile-manager');
  console.log('成功加载im-profile-manager模块');
} catch (error) {
  console.error('加载im-profile-manager模块失败:', error);
  // 提供备用方案
  imProfileManager = {
    updateMyProfile: function() {
      console.log('使用备用方案更新IM用户资料');
      return Promise.resolve();
    },
    getUserProfile: function() {
      console.log('使用备用方案获取IM用户资料');
      return Promise.resolve(null);
    }
  };
}

Page({
  /**
   * 页面的初始数据
   */
  data: {
    currentMediaType: 'photos', // 当前显示的媒体类型：photos、videos、album
    currentTab: 0, // 当前显示的标签页，0为照片，1为视频
    photosScrollLeft: 0, // 照片滚动位置
    videosScrollLeft: 0, // 视频滚动位置
    host: {},
    startX: 0, // 触摸开始时的X坐标
    startY: 0, // 触摸开始时的Y坐标
    currentIndex: 0, // 当前显示的照片索引
    isScrolling: false, // 是否正在滑动
    isFavorited: false, // 是否已收藏
    services: [
      { icon: '🏠', text: '提供舒适的寄养环境' },
      { icon: '🥣', text: '定时喂食和喝水' },
      { icon: '🚶', text: '每日遛弯和陪伴' },
      { icon: '📸', text: '每日照片和视频反馈' },
      { icon: '💊', text: '按时喂药服务' },
      { icon: '🛀', text: '洗澡和美容服务' }
    ],
    facilities: [
      { icon: '🏡', text: '独立房间' },
      { icon: '🏃', text: '户外花园' },
      { icon: '🌲', text: '宠物乐园' },
      { icon: '🔒', text: '安全围栏' },
      { icon: '📺', text: '监控摄像头' },
      { icon: '🚽', text: '宠物厕所' }
    ],
    reviews: [
      {
        name: '小明',
        avatarUrl: 'https://picsum.photos/200/200?random=4',
        date: '2023-10-15',
        content: '张阿姨非常细心，对狗狗照顾得很好。每天都会发照片和视频，让我很放心。狗狗回来的时候明显胖了一圈，说明吃得很好。下次还会选择张阿姨家寄养。',
        images: ['https://picsum.photos/600/400?random=16', 'https://picsum.photos/600/400?random=17']
      },
      {
        name: '小红',
        avatarUrl: 'https://picsum.photos/200/200?random=5',
        date: '2023-10-10',
        content: '李叔叔家有很大的院子，适合我的大型犬。他对狗狗很有经验，训练有素，狗狗回来后变得更听话了。价格也很合理，非常满意。',
        images: ['https://picsum.photos/600/400?random=18']
      },
      {
        name: '小李',
        avatarUrl: 'https://picsum.photos/200/200?random=6',
        date: '2023-09-28',
        content: '王女士家的环境非常干净，我家猫咪在这里住得很舒适。她很有耐心，对猫咪的需求非常敏感。下次出差还会选择这里。',
        images: ['https://picsum.photos/600/400?random=19', 'https://picsum.photos/600/400?random=20']
      }
    ]
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    // 从 URL 参数中获取寄养家庭 ID
    console.log('Options:', options)
    const hostId = options.id
    
    // 获取寄养家庭详情
    this.getHostDetail(hostId)
    // 检查收藏状态
    this.checkFavoriteStatus(hostId).then(isFavorited => {
      console.log('收藏状态检查结果:', isFavorited, 'hostId:', hostId)
      this.setData({
        isFavorited: isFavorited
      })
    }).catch(err => {
      console.error('检查收藏状态失败:', err)
      // 确保即使失败也设置为 false
      this.setData({
        isFavorited: false
      })
    })
  },

  /**
   * 获取寄养家庭详情
   */
  getHostDetail(hostId) {
    wx.showLoading({
      title: '加载中...'
    })

    // 先获取所有寄养家庭列表，然后根据ID找到对应的寄养家庭
    wx.cloud.callFunction({
      name: 'getHostList',
      success: res => {
        console.log('获取寄养家庭列表成功', res)
        if (res.result.code === 0 && res.result.data.length > 0) {
          // 根据ID找到对应的寄养家庭，同时检查_id和id字段
          const hostData = res.result.data.find(host => 
            String(host._id) === String(hostId) || String(host.id) === String(hostId)
          )
          
          // 从完整地址中提取城市和区县信息
      function extractCityAndDistrict(address) {
        if (!address) return '成都市';
        
        // 常见的地址格式："成都市武侯区某某街道"或"成都市锦江区某某路"
        // 提取前两级行政区划
        const addressParts = address.split(/[市县区]/).filter(part => part);
        if (addressParts.length >= 2) {
          return `${addressParts[0]}市${addressParts[1]}区`;
        } else if (addressParts.length >= 1) {
          return `${addressParts[0]}市`;
        } else {
          return '成都市';
        }
      }
          
      if (hostData) {
        // 处理获取到的数据，确保数据结构符合页面需求
        const host = {
          id: hostData._id || hostData.id,
          openid: hostData.openid, // 添加 openid 字段,用于 IM 消息发送
          name: hostData.hostName || '匿名寄养家庭',
          avatarUrl: hostData.avatarUrl || '',
          rating: hostData.rating || 4.8,
          reviews: hostData.reviewCount || 0,
          price: hostData.pricePerDay || 80,
          location: extractCityAndDistrict(hostData.address),
          tags: ['有经验', '爱干净', '可上门'], // 暂时使用默认标签
          description: hostData.description || '这家寄养家庭非常细心，对宠物照顾得很好。',
          photos: [
            'https://picsum.photos/600/400?random=' + hostId,
            'https://picsum.photos/600/400?random=' + (hostId + 1)
          ],
          videos: [
            'https://v-cdn.zjol.com.cn/280443.mp4'
          ],
          isAcceptingOrders: hostData.isAcceptingOrders !== undefined ? hostData.isAcceptingOrders : true,
          hostName: hostData.hostName || '匿名寄养家庭'
        }
            
            console.log('Host data:', host)
            console.log('Photos length:', host.photos?.length)
            console.log('Videos length:', host.videos?.length)
            
            // 计算照片滑动的snap-points
            const photosSnapPoints = []
            if (host.photos && host.photos.length > 0) {
              for (let i = 0; i < host.photos.length; i++) {
                photosSnapPoints.push(i * 750) // 每张照片宽度为750rpx
              }
            }
            
            this.setData({
              host: host,
              photosSnapPoints: photosSnapPoints
            })
            
            // 检查数据是否正确设置
            setTimeout(() => {
              console.log('Current host:', this.data.host)
            }, 100)
          } else {
            wx.showToast({
              title: '未找到该寄养家庭',
              icon: 'none'
            })
          }
        } else {
          wx.showToast({
            title: res.result.message || '获取失败',
            icon: 'none'
          })
        }
      },
      fail: err => {
        console.error('获取寄养家庭列表失败', err)
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
   * 切换标签页
   */
  switchTab(e) {
    const index = parseInt(e.currentTarget.dataset.index)
    console.log('Switching to tab from', this.data.currentTab, 'to', index)
    
    // 停止当前正在播放的视频
    if (this.data.currentTab === 1) {
      this.data.host.videos.forEach((_, i) => {
        const videoContext = wx.createVideoContext('video' + i, this)
        if (videoContext) {
          videoContext.pause()
        }
      })
    }
    
    // 直接更新数据，确保 active 类正确应用
    this.setData({
      currentTab: index
    })
    
    console.log('After setData, currentTab is', index)
  },

  /**
   * 切换媒体类型
   */
  switchMediaType(e) {
    const mediaType = e.currentTarget.dataset.type
    
    // 停止当前正在播放的视频
    if (this.data.currentMediaType === 'videos') {
      this.data.host.videos.forEach((_, i) => {
        const videoContext = wx.createVideoContext('video' + i, this)
        if (videoContext) {
          videoContext.pause()
        }
      })
    }
    
    // 处理相册跳转
    if (mediaType === 'album') {
      this.openAlbum()
      return
    }
    
    // 切换到其他媒体类型
    this.setData({
      currentMediaType: mediaType,
      currentIndex: 0
    })
  },
  
  /**
   * 打开照片页面
   */
  goToPhotosPage() {
    console.log('打开照片页面')
    wx.navigateTo({
      url: `/subpackages/other/album/index?host=${encodeURIComponent(JSON.stringify(this.data.host))}&tab=album`
    })
  },
  
  /**
   * 打开视频页面
   */
  goToVideosPage() {
    console.log('打开视频页面')
    wx.navigateTo({
      url: `/subpackages/other/album/index?host=${encodeURIComponent(JSON.stringify(this.data.host))}&tab=video`
    })
  },
  
  /**
   * 打开相册页面
   */
  openAlbum() {
    console.log('打开相册页面')
    wx.navigateTo({
      url: `/subpackages/other/album/index?host=${encodeURIComponent(JSON.stringify(this.data.host))}`
    })
  },
  
  /**
   * 轮播图切换事件
   */
  onSwiperChange(e) {
    // 防止连续滑动
    if (this.data.isScrolling) {
      return
    }
    
    this.setData({
      isScrolling: true,
      currentIndex: e.detail.current
    })
    
    // 设置滑动锁定定时器
    setTimeout(() => {
      this.setData({
        isScrolling: false
      })
    }, 300) // 与轮播图切换动画时间一致
  },

  /**
   * 查看更多照片
   */
  viewMorePhotos() {
    console.log('查看更多照片')
    wx.showToast({
      title: '照片详情功能开发中',
      icon: 'none'
    })
  },
  
  /**
   * 查看更多视频
   */
  viewMoreVideos() {
    console.log('查看更多视频')
    wx.showToast({
      title: '视频详情功能开发中',
      icon: 'none'
    })
  },
  
  /**
   * 播放视频
   */
  playVideo(e) {
    const index = e.currentTarget.dataset.index
    const videoUrl = this.data.host.videos[index]
    console.log('Playing video:', videoUrl)
    
    // 这里可以添加视频播放逻辑，例如跳转到全屏播放页面
    wx.showToast({
      title: '视频播放功能开发中',
      icon: 'none'
    })
  },

  /**
   * 回退
   */
  goBack() {
    wx.navigateBack()
  },



  /**
   * 联系家庭 - 跳转到聊天页面与寄养家庭聊天
   */
  contactFamily: async function() {
    const host = this.data.host
    if (!host || !host.openid) {
      wx.showToast({
        title: '获取寄养家庭信息失败',
        icon: 'error'
      })
      return
    }

    // 使用ImUserIdValidator生成寄养家庭的IM userID，确保与其他地方使用的ID生成逻辑一致
    let hostIMUserID = '';
    try {
      const openid = host.openid;
      const roleType = 'host';
      
      // 使用ImUserIdValidator生成格式1的userID
      hostIMUserID = ImUserIdValidator.generateFormat1UserID(openid, roleType);
      console.log('跳转到聊天页面，host openid:', host.openid, '生成格式1 host IM userID:', hostIMUserID);
    } catch (error) {
      console.error('生成格式1 userID 失败，使用备用方案:', error);
      hostIMUserID = `host_${host.openid}`;
      console.log('跳转到聊天页面，host openid:', host.openid, '使用备用 host IM userID:', hostIMUserID);
    }

    // 方案3：在跳转前更新IM用户资料
    try {
      console.log('[HostDetail] 开始更新IM用户资料...');

      // 获取当前登录用户信息
      const app = getApp();
      const currentUser = app.globalData?.userInfo;

      if (!currentUser) {
        console.warn('[HostDetail] 未获取到当前用户信息，跳过资料更新');
      } else {
        // 更新当前用户的IM资料（头像、昵称）
        await imProfileManager.updateMyProfile({
          nick: currentUser.nickName || currentUser.ownerName || currentUser.hostName || '用户',
          avatar: currentUser.avatarUrl || ''
        });

        console.log('[HostDetail] 当前用户IM资料更新完成');
      }

      // 尝试获取目标用户的IM资料
      if (wx.$TUIKit && wx.$TUIKit.isReady && wx.$TUIKit.isReady()) {
        try {
          const userProfile = await imProfileManager.getUserProfile(hostIMUserID);
          
          if (userProfile) {
            console.log('[HostDetail] 目标用户IM资料已存在:', userProfile);
          } else {
            console.log('[HostDetail] 目标用户IM资料不存在，使用本地头像');
            // 如果目标用户资料不存在，我们无法直接更新（需要对方登录时更新）
            // 此时使用本地传递的头像作为降级方案
          }
        } catch (error) {
          console.warn('[HostDetail] 获取目标用户IM资料失败:', error);
        }
      }

      console.log('[HostDetail] IM用户资料更新完成');
    } catch (error) {
      console.error('[HostDetail] 更新IM用户资料失败:', error);
      // 即使更新失败，也允许跳转到聊天页面
      // 聊天页面会使用本地传递的头像作为降级方案
    }

    // 跳转到聊天页面
    // 注意：recipientAvatar参数保留作为降级方案
    wx.navigateTo({
      url: `/subpackages/other/messages/chat/chat?recipientId=${hostIMUserID}&recipientName=${encodeURIComponent(host.hostName || '寄养家庭')}`,
      success: function(res) {
        console.log('跳转到聊天页面成功', res)
      },
      fail: function(err) {
        console.error('跳转到聊天页面失败', err)
        wx.showToast({
          title: '跳转失败，请稍后重试',
          icon: 'error'
        })
      }
    })
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {
    // 加载更多数据
  },

  /**
   * 视频播放事件处理
   */
  onVideoPlay(e) {
    console.log('Video play event')
  },

  /**
   * 视频暂停事件处理
   */
  onVideoPause(e) {
    console.log('Video pause event')
  },

  /**
   * 收藏/取消收藏
   */
  async toggleFavorite() {
    const hostId = this.data.host.id
    const isFavorited = this.data.isFavorited

    try {
      if (isFavorited) {
        // 取消收藏
        await this.removeFavorite(hostId)
      } else {
        // 添加收藏
        await this.addFavorite(hostId)
      }

      // 更新收藏状态
      this.setData({
        isFavorited: !isFavorited
      })
      console.log('收藏状态已更新为:', !isFavorited)
    } catch (error) {
      console.error('处理收藏操作失败:', error)
      wx.showToast({
        title: '操作失败，请重试',
        icon: 'none'
      })
    }
  },

  /**
   * 添加收藏
   */
  async addFavorite(hostId) {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'addFavorite',
        data: { hostProfileId: hostId },
        success: res => {
          console.log('添加收藏成功:', res.result)
          if (res.result.code === 0) {
            wx.showToast({
              title: '收藏成功',
              icon: 'success'
            })
            resolve(res.result)
          } else {
            wx.showToast({
              title: res.result.message,
              icon: 'none'
            })
            reject(new Error(res.result.message))
          }
        },
        fail: err => {
          console.error('添加收藏失败:', err)
          wx.showToast({
            title: '添加收藏失败',
            icon: 'none'
          })
          reject(err)
        }
      })
    })
  },

  /**
   * 取消收藏
   */
  async removeFavorite(hostId) {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'removeFavorite',
        data: { hostProfileId: hostId },
        success: res => {
          console.log('取消收藏成功:', res.result)
          if (res.result.code === 0) {
            wx.showToast({
              title: '取消收藏成功',
              icon: 'success'
            })
            resolve(res.result)
          } else {
            wx.showToast({
              title: res.result.message,
              icon: 'none'
            })
            reject(new Error(res.result.message))
          }
        },
        fail: err => {
          console.error('取消收藏失败:', err)
          wx.showToast({
            title: '取消收藏失败',
            icon: 'none'
          })
          reject(err)
        }
      })
    })
  },

  /**
   * 检查是否已收藏
   */
  async checkFavoriteStatus(hostId) {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'getFavorites',
        success: res => {
          console.log('获取收藏列表成功:', res.result)
          if (res.result.code === 0 && res.result.data) {
            console.log('收藏列表数据:', res.result.data)
            console.log('检查的hostId:', hostId)
            
            // 遍历收藏列表，检查是否包含当前寄养家庭
            const isFavorited = res.result.data.some(favorite => {
              const favoriteHostId = favorite.hostProfileId || favorite.id
              console.log('比较:', String(favoriteHostId), '===', String(hostId), '=', String(favoriteHostId) === String(hostId))
              return String(favoriteHostId) === String(hostId)
            })
            console.log('最终收藏状态:', isFavorited)
            resolve(isFavorited)
          } else {
            console.log('收藏列表为空或格式错误')
            resolve(false)
          }
        },
        fail: err => {
          console.error('获取收藏列表失败:', err)
          resolve(false) // 失败时返回 false
        }
      })
    })
  }
})
