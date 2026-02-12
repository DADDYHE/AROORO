# 消息页面UI设计方案

基于项目的巴黎世家风格，设计了以下4个消息页面UI方案，每个方案都保持了品牌特色和现代感。

## 方案1：简约现代风格

**设计特点：**
- 保持品牌标识和头部区域
- 会话列表采用简约的卡片式设计
- 使用适当的间距和排版
- 强调未读消息的视觉效果
- 保持整体风格一致

**实现代码：**

```wxml
<!--pages/messages/index.wxml-->
<view class="message-container">
  <!-- 头部区域 -->
  <view class="page-header">
    <view class="header-content">
      <!-- 品牌标识 -->
      <view class="brand-logo">Arooro</view>
    </view>
  </view>

  <!-- 未登录提示 -->
  <view wx:if="{{!isLoggedIn}}" class="login-prompt" bindtap="onPageTap">
    <image class="prompt-icon" src="{{avatarUrl || '/images/default-avatar.svg'}}" mode="aspectFit"></image>
    <text class="prompt-text">请先登录</text>
  </view>
  
  <!-- 已登录用户的会话列表 -->
  <view wx:else class="conversation-container">
    <!-- 使用TUIKit组件时的会话列表 -->
    <TUIConversation
      id="tui-conversation"
      bind:onConversationItemTap="onConversationItemTap"
      bind:onError="onError"
    />
  </view>
</view>
```

```wxss
/* 简约现代风格 */
.message-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #fafafa !important;
}

/* 头部区域 */
.page-header {
  padding: 60rpx 40rpx !important;
  background-color: #fafafa !important;
  position: relative;
  border-bottom: 1rpx solid #f0f0f0 !important;
  box-shadow: 0 2rpx 10rpx rgba(0, 0, 0, 0.03) !important;
  margin-bottom: 0 !important;
}

.header-content {
  max-width: 100%;
  display: flex;
  flex-direction: column;
}

/* 品牌标识 */
.brand-logo {
  font-size: 52rpx;
  font-weight: 900;
  letter-spacing: 14rpx;
  text-align: left;
  margin-bottom: 50rpx;
  color: #000000;
  text-transform: uppercase;
  font-family: 'Arial Black', 'Arial Bold', sans-serif;
  line-height: 1;
}

/* 登录提示样式 */
.login-prompt {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  height: calc(100vh - 200rpx) !important;
  background-color: #fafafa !important;
  padding: 40rpx !important;
}

.prompt-icon {
  width: 140rpx !important;
  height: 140rpx !important;
  margin-bottom: 40rpx !important;
  opacity: 0.5 !important;
  border-radius: 50% !important;
  border: 2rpx solid #e0e0e0 !important;
  background-color: #f0f0f0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  overflow: hidden !important;
}

.prompt-text {
  font-size: 32rpx !important;
  color: #999 !important;
  text-align: center !important;
  text-transform: uppercase !important;
  letter-spacing: 4rpx !important;
  font-weight: 500 !important;
}

/* 会话列表容器 */
.conversation-container {
  flex: 1;
  padding: 20rpx;
}

/* 会话项样式 */
.conversation-item {
  display: flex;
  align-items: center;
  padding: 30rpx;
  background-color: #ffffff;
  margin-bottom: 15rpx;
  border-radius: 24rpx;
  box-shadow: 0 4rpx 15rpx rgba(0, 0, 0, 0.04);
  transition: all 0.3s ease;
}

.conversation-item:active {
  transform: translateY(2rpx);
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.03);
}

/* 头像容器 */
.avatar-container {
  position: relative;
  margin-right: 20rpx;
}

/* 头像样式 */
.avatar {
  width: 100rpx;
  height: 100rpx;
  border-radius: 20rpx;
}

/* SVG头像样式 */
.svg-avatar {
  width: 100rpx;
  height: 100rpx;
  border-radius: 20rpx;
  color: #666;
  background-color: #f0f0f0;
  display: block;
}

/* 未读消息角标 */
.unread-badge {
  position: absolute;
  top: -10rpx;
  right: -10rpx;
  background-color: #FF6B00;
  color: #fff;
  font-size: 24rpx;
  min-width: 40rpx;
  height: 40rpx;
  line-height: 40rpx;
  text-align: center;
  border-radius: 20rpx;
  padding: 0 10rpx;
  font-weight: 500;
}

/* 会话信息 */
.conversation-info {
  flex: 1;
  min-width: 0;
}

/* 会话头部 */
.conversation-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10rpx;
}

/* 会话名称 */
.conversation-name {
  font-size: 32rpx;
  font-weight: 500;
  color: #333;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 会话时间 */
.conversation-time {
  font-size: 24rpx;
  color: #999;
  margin-left: 20rpx;
}

/* 最后一条消息 */
.conversation-last-message {
  font-size: 28rpx;
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 确保TUIConversation组件能占满整个容器 */
#tui-conversation {
  width: 100%;
  height: 100%;
}
```

## 方案2：品牌特色风格

**设计特点：**
- 突出品牌标识和设计元素
- 使用品牌特色的色彩和字体
- 会话列表添加品牌特色的视觉元素
- 保持高级感和一致性

**实现代码：**

```wxml
<!--pages/messages/index.wxml-->
<view class="message-container">
  <!-- 头部区域 -->
  <view class="page-header">
    <view class="header-content">
      <!-- 品牌标识 -->
      <view class="brand-logo">Arooro</view>
      <!-- 消息标题 -->
      <view class="page-title">Messages</view>
    </view>
  </view>

  <!-- 未登录提示 -->
  <view wx:if="{{!isLoggedIn}}" class="login-prompt" bindtap="onPageTap">
    <image class="prompt-icon" src="{{avatarUrl || '/images/default-avatar.svg'}}" mode="aspectFit"></image>
    <text class="prompt-text">请先登录</text>
  </view>
  
  <!-- 已登录用户的会话列表 -->
  <view wx:else class="conversation-container">
    <!-- 使用TUIKit组件时的会话列表 -->
    <TUIConversation
      id="tui-conversation"
      bind:onConversationItemTap="onConversationItemTap"
      bind:onError="onError"
    />
  </view>
</view>
```

```wxss
/* 品牌特色风格 */
.message-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #fafafa !important;
}

/* 头部区域 */
.page-header {
  padding: 60rpx 40rpx !important;
  background-color: #fafafa !important;
  position: relative;
  border-bottom: 1rpx solid #f0f0f0 !important;
  box-shadow: 0 2rpx 10rpx rgba(0, 0, 0, 0.03) !important;
  margin-bottom: 0 !important;
}

.header-content {
  max-width: 100%;
  display: flex;
  flex-direction: column;
}

/* 品牌标识 */
.brand-logo {
  font-size: 52rpx;
  font-weight: 900;
  letter-spacing: 14rpx;
  text-align: left;
  margin-bottom: 20rpx;
  color: #000000;
  text-transform: uppercase;
  font-family: 'Arial Black', 'Arial Bold', sans-serif;
  line-height: 1;
}

/* 页面标题 */
.page-title {
  font-size: 36rpx;
  font-weight: 900;
  letter-spacing: 8rpx;
  text-align: left;
  color: #000000;
  text-transform: uppercase;
  font-family: 'Arial Black', 'Arial Bold', sans-serif;
  line-height: 1;
  margin-bottom: 30rpx;
}

/* 登录提示样式 */
.login-prompt {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  height: calc(100vh - 200rpx) !important;
  background-color: #fafafa !important;
  padding: 40rpx !important;
}

.prompt-icon {
  width: 160rpx !important;
  height: 160rpx !important;
  margin-bottom: 50rpx !important;
  opacity: 0.5 !important;
  border-radius: 50% !important;
  border: 3rpx solid #FF6B00 !important;
  background-color: #f0f0f0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  overflow: hidden !important;
}

.prompt-text {
  font-size: 36rpx !important;
  color: #000000 !important;
  text-align: center !important;
  text-transform: uppercase !important;
  letter-spacing: 6rpx !important;
  font-weight: 900 !important;
  font-family: 'Arial Black', 'Arial Bold', sans-serif;
}

/* 会话列表容器 */
.conversation-container {
  flex: 1;
  padding: 20rpx;
}

/* 会话项样式 */
.conversation-item {
  display: flex;
  align-items: center;
  padding: 40rpx;
  background-color: #ffffff;
  margin-bottom: 20rpx;
  border-radius: 24rpx;
  box-shadow: 0 6rpx 20rpx rgba(0, 0, 0, 0.06);
  transition: all 0.4s ease;
  border-left: 8rpx solid transparent;
}

.conversation-item:active {
  transform: translateY(3rpx);
  box-shadow: 0 3rpx 10rpx rgba(0, 0, 0, 0.04);
}

/* 有未读消息的会话项 */
.conversation-item.unread {
  border-left: 8rpx solid #FF6B00;
  background-color: #fff9f5;
}

/* 头像容器 */
.avatar-container {
  position: relative;
  margin-right: 30rpx;
}

/* 头像样式 */
.avatar {
  width: 120rpx;
  height: 120rpx;
  border-radius: 24rpx;
  border: 2rpx solid #f0f0f0;
}

/* SVG头像样式 */
.svg-avatar {
  width: 120rpx;
  height: 120rpx;
  border-radius: 24rpx;
  color: #666;
  background-color: #f0f0f0;
  display: block;
  border: 2rpx solid #f0f0f0;
}

/* 未读消息角标 */
.unread-badge {
  position: absolute;
  top: -10rpx;
  right: -10rpx;
  background-color: #FF6B00;
  color: #fff;
  font-size: 28rpx;
  min-width: 50rpx;
  height: 50rpx;
  line-height: 50rpx;
  text-align: center;
  border-radius: 25rpx;
  padding: 0 15rpx;
  font-weight: 900;
  font-family: 'Arial Black', 'Arial Bold', sans-serif;
  text-transform: uppercase;
}

/* 会话信息 */
.conversation-info {
  flex: 1;
  min-width: 0;
}

/* 会话头部 */
.conversation-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15rpx;
}

/* 会话名称 */
.conversation-name {
  font-size: 36rpx;
  font-weight: 900;
  color: #000000;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-transform: uppercase;
  letter-spacing: 2rpx;
  font-family: 'Arial Black', 'Arial Bold', sans-serif;
}

/* 会话时间 */
.conversation-time {
  font-size: 24rpx;
  color: #999;
  margin-left: 20rpx;
  text-transform: uppercase;
  letter-spacing: 1rpx;
}

/* 最后一条消息 */
.conversation-last-message {
  font-size: 28rpx;
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: 1rpx;
}

/* 确保TUIConversation组件能占满整个容器 */
#tui-conversation {
  width: 100%;
  height: 100%;
}
```

## 方案3：功能增强风格

**设计特点：**
- 添加更多功能按钮和操作选项
- 增强会话列表的信息展示
- 添加分类和筛选功能
- 保持整体风格的同时增强功能性

**实现代码：**

```wxml
<!--pages/messages/index.wxml-->
<view class="message-container">
  <!-- 头部区域 -->
  <view class="page-header">
    <view class="header-content">
      <!-- 品牌标识 -->
      <view class="brand-logo">Arooro</view>
    </view>
  </view>

  <!-- 功能栏 -->
  <view wx:if="{{isLoggedIn}}" class="function-bar">
    <view class="function-tabs">
      <view class="tab-item {{activeTab === 'all' ? 'active' : ''}}" bindtap="switchTab" data-tab="all">全部</view>
      <view class="tab-item {{activeTab === 'unread' ? 'active' : ''}}" bindtap="switchTab" data-tab="unread">未读</view>
      <view class="tab-item {{activeTab === 'group' ? 'active' : ''}}" bindtap="switchTab" data-tab="group">群组</view>
    </view>
    <view class="function-buttons">
      <view class="function-btn" bindtap="createNewChat">
        <van-icon name="plus" size="32rpx" />
      </view>
      <view class="function-btn" bindtap="showSettings">
        <van-icon name="settings" size="32rpx" />
      </view>
    </view>
  </view>

  <!-- 未登录提示 -->
  <view wx:if="{{!isLoggedIn}}" class="login-prompt" bindtap="onPageTap">
    <image class="prompt-icon" src="{{avatarUrl || '/images/default-avatar.svg'}}" mode="aspectFit"></image>
    <text class="prompt-text">请先登录</text>
  </view>
  
  <!-- 已登录用户的会话列表 -->
  <view wx:else class="conversation-container">
    <!-- 使用TUIKit组件时的会话列表 -->
    <TUIConversation
      id="tui-conversation"
      bind:onConversationItemTap="onConversationItemTap"
      bind:onError="onError"
    />
  </view>
</view>
```

```wxss
/* 功能增强风格 */
.message-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #fafafa !important;
}

/* 头部区域 */
.page-header {
  padding: 60rpx 40rpx !important;
  background-color: #fafafa !important;
  position: relative;
  border-bottom: 1rpx solid #f0f0f0 !important;
  box-shadow: 0 2rpx 10rpx rgba(0, 0, 0, 0.03) !important;
  margin-bottom: 0 !important;
}

.header-content {
  max-width: 100%;
  display: flex;
  flex-direction: column;
}

/* 品牌标识 */
.brand-logo {
  font-size: 52rpx;
  font-weight: 900;
  letter-spacing: 14rpx;
  text-align: left;
  margin-bottom: 50rpx;
  color: #000000;
  text-transform: uppercase;
  font-family: 'Arial Black', 'Arial Bold', sans-serif;
  line-height: 1;
}

/* 功能栏 */
.function-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx 40rpx;
  background-color: #ffffff;
  border-bottom: 1rpx solid #f0f0f0;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.03);
}

/* 功能标签 */
.function-tabs {
  display: flex;
  gap: 40rpx;
}

.tab-item {
  font-size: 28rpx;
  color: #666;
  font-weight: 500;
  padding: 10rpx 20rpx;
  border-radius: 20rpx;
  transition: all 0.3s ease;
  text-transform: uppercase;
  letter-spacing: 2rpx;
}

.tab-item.active {
  color: #FF6B00;
  background-color: #fff9f5;
  font-weight: 700;
}

/* 功能按钮 */
.function-buttons {
  display: flex;
  gap: 20rpx;
}

.function-btn {
  width: 60rpx;
  height: 60rpx;
  border-radius: 30rpx;
  background-color: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

.function-btn:active {
  background-color: #e0e0e0;
  transform: scale(0.95);
}

/* 登录提示样式 */
.login-prompt {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  height: calc(100vh - 200rpx) !important;
  background-color: #fafafa !important;
  padding: 40rpx !important;
}

.prompt-icon {
  width: 140rpx !important;
  height: 140rpx !important;
  margin-bottom: 40rpx !important;
  opacity: 0.5 !important;
  border-radius: 50% !important;
  border: 2rpx solid #e0e0e0 !important;
  background-color: #f0f0f0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  overflow: hidden !important;
}

.prompt-text {
  font-size: 32rpx !important;
  color: #999 !important;
  text-align: center !important;
  text-transform: uppercase !important;
  letter-spacing: 4rpx !important;
  font-weight: 500 !important;
}

/* 会话列表容器 */
.conversation-container {
  flex: 1;
  padding: 20rpx;
}

/* 会话项样式 */
.conversation-item {
  display: flex;
  align-items: center;
  padding: 30rpx;
  background-color: #ffffff;
  margin-bottom: 15rpx;
  border-radius: 24rpx;
  box-shadow: 0 4rpx 15rpx rgba(0, 0, 0, 0.04);
  transition: all 0.3s ease;
}

.conversation-item:active {
  transform: translateY(2rpx);
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.03);
}

/* 头像容器 */
.avatar-container {
  position: relative;
  margin-right: 20rpx;
}

/* 头像样式 */
.avatar {
  width: 100rpx;
  height: 100rpx;
  border-radius: 20rpx;
}

/* SVG头像样式 */
.svg-avatar {
  width: 100rpx;
  height: 100rpx;
  border-radius: 20rpx;
  color: #666;
  background-color: #f0f0f0;
  display: block;
}

/* 未读消息角标 */
.unread-badge {
  position: absolute;
  top: -10rpx;
  right: -10rpx;
  background-color: #FF6B00;
  color: #fff;
  font-size: 24rpx;
  min-width: 40rpx;
  height: 40rpx;
  line-height: 40rpx;
  text-align: center;
  border-radius: 20rpx;
  padding: 0 10rpx;
  font-weight: 500;
}

/* 会话信息 */
.conversation-info {
  flex: 1;
  min-width: 0;
}

/* 会话头部 */
.conversation-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10rpx;
}

/* 会话名称 */
.conversation-name {
  font-size: 32rpx;
  font-weight: 500;
  color: #333;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 会话时间 */
.conversation-time {
  font-size: 24rpx;
  color: #999;
  margin-left: 20rpx;
}

/* 最后一条消息 */
.conversation-last-message {
  font-size: 28rpx;
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 确保TUIConversation组件能占满整个容器 */
#tui-conversation {
  width: 100%;
  height: 100%;
}
```

## 方案4：沉浸式风格

**设计特点：**
- 简化头部区域，突出会话内容
- 使用沉浸式布局
- 增强交互效果和动画
- 提供更专注的消息体验

**实现代码：**

```wxml
<!--pages/messages/index.wxml-->
<view class="message-container">
  <!-- 简化头部区域 -->
  <view class="minimal-header">
    <view class="header-content">
      <view class="page-title">Messages</view>
    </view>
  </view>

  <!-- 未登录提示 -->
  <view wx:if="{{!isLoggedIn}}" class="login-prompt immersive" bindtap="onPageTap">
    <image class="prompt-icon" src="{{avatarUrl || '/images/default-avatar.svg'}}" mode="aspectFit"></image>
    <text class="prompt-text">请先登录</text>
  </view>
  
  <!-- 已登录用户的会话列表 -->
  <view wx:else class="conversation-container immersive">
    <!-- 使用TUIKit组件时的会话列表 -->
    <TUIConversation
      id="tui-conversation"
      bind:onConversationItemTap="onConversationItemTap"
      bind:onError="onError"
    />
  </view>
</view>
```

```wxss
/* 沉浸式风格 */
.message-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #fafafa !important;
}

/* 简化头部区域 */
.minimal-header {
  padding: 30rpx 40rpx;
  background-color: transparent;
  position: relative;
  z-index: 1;
}

.header-content {
  max-width: 100%;
  display: flex;
  flex-direction: column;
}

/* 页面标题 */
.page-title {
  font-size: 48rpx;
  font-weight: 900;
  color: #000000;
  text-align: left;
  text-transform: uppercase;
  letter-spacing: 8rpx;
  font-family: 'Arial Black', 'Arial Bold', sans-serif;
  line-height: 1;
}

/* 登录提示样式 */
.login-prompt {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  height: calc(100vh - 100rpx) !important;
  background-color: #fafafa !important;
  padding: 40rpx !important;
  transition: all 0.5s ease;
}

.login-prompt.immersive {
  height: calc(100vh - 80rpx) !important;
}

.prompt-icon {
  width: 200rpx !important;
  height: 200rpx !important;
  margin-bottom: 60rpx !important;
  opacity: 0.5 !important;
  border-radius: 50% !important;
  border: 4rpx solid #e0e0e0 !important;
  background-color: #f0f0f0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  overflow: hidden !important;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(1);
  }
}

.prompt-text {
  font-size: 40rpx !important;
  color: #000000 !important;
  text-align: center !important;
  text-transform: uppercase !important;
  letter-spacing: 8rpx !important;
  font-weight: 900 !important;
  font-family: 'Arial Black', 'Arial Bold', sans-serif;
  opacity: 0.7;
}

/* 会话列表容器 */
.conversation-container {
  flex: 1;
  padding: 0;
  transition: all 0.5s ease;
}

.conversation-container.immersive {
  padding: 0;
}

/* 会话项样式 */
.conversation-item {
  display: flex;
  align-items: center;
  padding: 40rpx;
  background-color: transparent;
  margin-bottom: 0;
  border-bottom: 1rpx solid rgba(0, 0, 0, 0.05);
  transition: all 0.4s ease;
  position: relative;
  overflow: hidden;
}

.conversation-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 100%;
  background-color: rgba(255, 107, 0, 0.05);
  transition: width 0.3s ease;
}

.conversation-item:active::before {
  width: 100%;
}

.conversation-item:active {
  background-color: rgba(0, 0, 0, 0.02);
  transform: translateX(10rpx);
}

/* 头像容器 */
.avatar-container {
  position: relative;
  margin-right: 30rpx;
}

/* 头像样式 */
.avatar {
  width: 120rpx;
  height: 120rpx;
  border-radius: 24rpx;
  transition: all 0.3s ease;
}

.conversation-item:active .avatar {
  transform: scale(1.05);
}

/* SVG头像样式 */
.svg-avatar {
  width: 120rpx;
  height: 120rpx;
  border-radius: 24rpx;
  color: #666;
  background-color: #f0f0f0;
  display: block;
  transition: all 0.3s ease;
}

.conversation-item:active .svg-avatar {
  transform: scale(1.05);
}

/* 未读消息角标 */
.unread-badge {
  position: absolute;
  top: -10rpx;
  right: -10rpx;
  background-color: #FF6B00;
  color: #fff;
  font-size: 28rpx;
  min-width: 50rpx;
  height: 50rpx;
  line-height: 50rpx;
  text-align: center;
  border-radius: 25rpx;
  padding: 0 15rpx;
  font-weight: 900;
  font-family: 'Arial Black', 'Arial Bold', sans-serif;
  text-transform: uppercase;
  animation: bounce 2s infinite;
}

@keyframes bounce {
  0%, 20%, 50%, 80%, 100% {
    transform: translateY(0);
  }
  40% {
    transform: translateY(-5rpx);
  }
  60% {
    transform: translateY(-3rpx);
  }
}

/* 会话信息 */
.conversation-info {
  flex: 1;
  min-width: 0;
  transition: all 0.3s ease;
}

/* 会话头部 */
.conversation-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15rpx;
}

/* 会话名称 */
.conversation-name {
  font-size: 36rpx;
  font-weight: 700;
  color: #000000;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: 1rpx;
}

/* 会话时间 */
.conversation-time {
  font-size: 24rpx;
  color: #999;
  margin-left: 20rpx;
  opacity: 0.7;
}

/* 最后一条消息 */
.conversation-last-message {
  font-size: 28rpx;
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.8;
  letter-spacing: 0.5rpx;
}

/* 确保TUIConversation组件能占满整个容器 */
#tui-conversation {
  width: 100%;
  height: 100%;
}

/* 底部导航栏样式 */
.tab-bar {
  background-color: rgba(250, 250, 250, 0.95);
  backdrop-filter: blur(10rpx);
  border-top: 1rpx solid rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease;
}
```

## 各方案特点和适用场景对比

| 方案 | 特点 | 适用场景 |
|------|------|----------|
| 简约现代风格 | 保持品牌标识，简约卡片设计，适当间距排版，强调未读消息 | 追求简洁、现代的用户体验，适合大多数用户 |
| 品牌特色风格 | 突出品牌标识和设计元素，使用品牌特色色彩和字体，添加标题 | 强调品牌形象，适合品牌推广和营销场景 |
| 功能增强风格 | 添加功能栏、分类标签、快捷操作按钮，增强会话信息展示 | 需要更多功能操作，适合重度消息用户 |
| 沉浸式风格 | 简化头部，沉浸式布局，增强动画效果，专注消息内容 | 追求简洁、专注的用户体验，适合喜欢沉浸式界面的用户 |

## 推荐选择

**推荐方案：品牌特色风格**

理由：
- 保持了项目的巴黎世家风格特色
- 突出了品牌标识和设计元素
- 提供了清晰的视觉层次和结构
- 适合项目的高端定位和品牌形象
- 兼顾了美观性和功能性

**备选方案：简约现代风格**

理由：
- 保持了简约现代的设计理念
- 实现简单，加载速度快
- 适合追求简洁体验的用户
- 与项目整体风格保持一致

可以根据具体的产品定位和用户需求选择合适的方案。