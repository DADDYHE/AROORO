// 使用本地默认头像，避免网络图片加载问题
const defaultImage = '';

Component({

  /**
   * 组件的属性列表
   */
  properties: {
    imageSrc: {
      type: String,
      value: '',
      observer(imageSrc) {
        // 如果图片URL是腾讯云COS且签名可能过期，先进行验证
        if (imageSrc && this.isExpiredCosUrl(imageSrc)) {
          // 对于可能过期的COS URL，直接使用默认头像
          this.setData({
            imageSrc: defaultImage,
          });
        } else {
          this.setData({
            imageSrc,
          });
        }
      },
    },
  },

  lifetimes: {
    attached() {
      if (!this.data.imageSrc) {
        this.setData({
          imageSrc: defaultImage,
        });
      }
    },
  },
  /**
   * 组件的初始数据
   */
  data: {
    imageSrc: '',
  },

  /**
   * 组件的方法列表
   */
  methods: {
    handleErrorImage() {
      // 图片加载失败时显示SVG头像
      this.setData({
        imageSrc: '',
      });
    },
    
    // 检测腾讯云COS URL是否过期
    isExpiredCosUrl(url) {
      if (!url || typeof url !== 'string') return false;
      
      // 检查是否是腾讯云COS URL
      if (url.includes('tcb.qcloud.la') || url.includes('cos.ap-')) {
        // 提取时间戳参数
        const timestampMatch = url.match(/[?&]t=(\d+)/);
        if (timestampMatch) {
          const timestamp = parseInt(timestampMatch[1]);
          const currentTime = Math.floor(Date.now() / 1000);
          
          // 如果签名时间戳超过1小时（3600秒），认为可能过期
          return (currentTime - timestamp) > 3600;
        }
        
        // 如果没有时间戳参数，也认为是潜在问题
        return true;
      }
      
      return false;
    }
  },
});
