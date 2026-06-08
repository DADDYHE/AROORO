// 生成宠物身份卡片
class PetCardGenerator {
  // 生成宠物身份卡片
  static generate(canvas, petData) {
    return new Promise((resolve, reject) => {
      try {
        // 获取 Canvas 2D 上下文
        const ctx = canvas.getContext('2d')

        // 设置画布尺寸
        const windowInfo = wx.getWindowInfo()
        const dpr = windowInfo.pixelRatio
        const width = 300 * dpr
        const height = 400 * dpr
        canvas.width = width
        canvas.height = height
        ctx.scale(dpr, dpr)

        // 绘制卡片背景
        this.drawBackground(ctx)

        // 绘制宠物头像
        this.drawPetAvatar(ctx, petData.avatarUrl, () => {
          // 绘制宠物信息
          this.drawPetInfo(ctx, petData)

          // 绘制二维码
          this.drawQRCode(ctx)

          // 绘制装饰元素
          this.drawDecorations(ctx)

          // 导出图片
          this.exportImage(canvas, resolve, reject)
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  // 绘制卡片背景
  static drawBackground(ctx) {
    // 卡片尺寸
    const width = 300
    const height = 400

    // 绘制渐变背景
    const gradient = ctx.createLinearGradient(0, 0, 0, height)
    gradient.addColorStop(0, '#f0f5ff')
    gradient.addColorStop(1, '#ffffff')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)

    // 绘制圆角边框
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(10, 10, 10, 1.5 * Math.PI, 0)
    ctx.arc(width - 10, 10, 10, Math.PI, 1.5 * Math.PI)
    ctx.arc(width - 10, height - 10, 10, 0.5 * Math.PI, Math.PI)
    ctx.arc(10, height - 10, 10, 0, 0.5 * Math.PI)
    ctx.closePath()
    ctx.stroke()
  }

  // 绘制宠物头像
  static drawPetAvatar(ctx, avatarUrl, callback) {
    const avatarUrlSize = 80
    const avatarUrlX = 110
    const avatarUrlY = 40

    // 绘制头像边框
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(avatarUrlX + avatarUrlSize / 2, avatarUrlY + avatarUrlSize / 2, avatarUrlSize / 2 + 5, 0, 2 * Math.PI)
    ctx.fill()

    // 绘制头像
    if (avatarUrl) {
      wx.getImageInfo({
        src: avatarUrl,
        success: res => {
          ctx.save()
          ctx.beginPath()
          ctx.arc(avatarUrlX + avatarUrlSize / 2, avatarUrlY + avatarUrlSize / 2, avatarUrlSize / 2, 0, 2 * Math.PI)
          ctx.clip()
          ctx.drawImage(res.path, avatarUrlX, avatarUrlY, avatarUrlSize, avatarUrlSize)
          ctx.restore()
          callback()
        },
        fail: error => {
          console.error('[APP] 加载头像失败:', error)
          this.drawDefaultAvatar(ctx, avatarUrlX, avatarUrlY, avatarUrlSize)
          callback()
        },
      })
    } else {
      this.drawDefaultAvatar(ctx, avatarUrlX, avatarUrlY, avatarUrlSize)
      callback()
    }
  }

  // 绘制默认头像
  static drawDefaultAvatar(ctx, x, y, size) {
    ctx.fillStyle = '#e5e7eb'
    ctx.beginPath()
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, 2 * Math.PI)
    ctx.fill()

    ctx.fillStyle = '#9ca3af'
    ctx.font = '24px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('宠', x + size / 2, y + size / 2)
  }

  // 绘制宠物信息
  static drawPetInfo(ctx, petData) {
    const startY = 150
    const lineHeight = 25

    // 宠物昵称
    ctx.fillStyle = '#1f2937'
    ctx.font = '28px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(petData.name, 150, startY)

    // 宠物类型
    ctx.fillStyle = '#6b7280'
    ctx.font = '16px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(petData.type === 'dog' ? '狗狗' : petData.type === 'cat' ? '猫咪' : petData.type === 'exotic' ? '异宠' : '宠物', 150, startY + lineHeight)

    // 分割线
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(50, startY + lineHeight + 20)
    ctx.lineTo(250, startY + lineHeight + 20)
    ctx.stroke()

    // 详细信息
    const infoY = startY + lineHeight + 40
    ctx.fillStyle = '#374151'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'left'

    ctx.fillText(`生日: ${petData.birthday || '未填写'}`, 50, infoY)
    ctx.fillText(`体重: ${petData.weight}kg`, 50, infoY + lineHeight)
    ctx.fillText(`品种: ${petData.breed}`, 50, infoY + lineHeight * 2)
    ctx.fillText(`生日: ${petData.birthday || '未填写'}`, 50, infoY + lineHeight * 3)
    ctx.fillText(`备注: ${petData.note || '未填写'}`, 50, infoY + lineHeight * 4)
  }

  // 绘制二维码
  static drawQRCode(ctx) {
    const qrSize = 80
    const qrX = 210
    const qrY = 300

    // 绘制二维码背景
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 10)

    // 绘制默认二维码
    ctx.fillStyle = '#e5e7eb'
    ctx.fillRect(qrX, qrY, qrSize, qrSize)

    ctx.fillStyle = '#9ca3af'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('二维码', qrX + qrSize / 2, qrY + qrSize / 2)
  }

  // 绘制装饰元素
  static drawDecorations(ctx) {
    // 绘制宠物图标
    const iconX = 50
    const iconY = 320
    const iconSize = 40

    ctx.fillStyle = '#1989fa'
    ctx.beginPath()
    ctx.arc(iconX + iconSize / 2, iconY + iconSize / 2, iconSize / 2, 0, 2 * Math.PI)
    ctx.fill()

    ctx.fillStyle = '#ffffff'
    ctx.font = '20px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('宠', iconX + iconSize / 2, iconY + iconSize / 2)
  }

  // 导出图片
  static exportImage(canvas, resolve, reject) {
    wx.canvasToTempFilePath({
      canvas,
      width: canvas.width,
      height: canvas.height,
      destWidth: canvas.width * 2,
      destHeight: canvas.height * 2,
      fileType: 'jpg',
      quality: 1,
      success: res => {
        resolve(res.tempFilePath)
      },
      fail: error => {
        console.error('[APP] 图片导出失败:', error)
        reject(error)
      },
    })
  }
}

module.exports = PetCardGenerator
