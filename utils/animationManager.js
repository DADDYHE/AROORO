/**
 * 动画管理器
 * 用于处理身份切换时的动画效果，提升用户体验
 * 
 * 参考文档：
 * - 微信小程序官方文档：https://developers.weixin.qq.com/miniprogram/dev/api/ui/animation/wx.createAnimation.html
 */

class AnimationManager {
  constructor() {
    this.logger = console;
    this.animations = {};
    this.defaultDuration = 300;
    this.defaultTimingFunction = 'ease';
  }

  /**
   * 创建动画实例
   * @param {string} id - 动画ID
   * @param {object} [options] - 动画选项
   * @param {number} [options.duration] - 动画持续时间（毫秒）
   * @param {string} [options.timingFunction] - 动画 timing 函数
   * @param {number} [options.delay] - 动画延迟时间（毫秒）
   * @returns {object} 动画实例
   */
  createAnimation(id, options = {}) {
    const animation = wx.createAnimation({
      duration: options.duration || this.defaultDuration,
      timingFunction: options.timingFunction || this.defaultTimingFunction,
      delay: options.delay || 0,
      transformOrigin: options.transformOrigin || '50% 50% 0'
    });

    this.animations[id] = animation;
    this.logger.debug(`创建动画实例：${id}`, options);
    return animation;
  }

  /**
   * 获取动画实例
   * @param {string} id - 动画ID
   * @returns {object|null} 动画实例或null
   */
  getAnimation(id) {
    return this.animations[id] || null;
  }

  /**
   * 销毁动画实例
   * @param {string} id - 动画ID
   */
  destroyAnimation(id) {
    if (this.animations[id]) {
      delete this.animations[id];
      this.logger.debug(`销毁动画实例：${id}`);
    }
  }

  /**
   * 销毁所有动画实例
   */
  destroyAllAnimations() {
    this.animations = {};
    this.logger.debug('销毁所有动画实例');
  }

  /**
   * 创建身份切换入场动画
   * @param {string} id - 动画ID
   * @param {string} direction - 动画方向 ('left' | 'right' | 'up' | 'down')
   * @param {object} [options] - 动画选项
   * @returns {object} 动画实例
   */
  createIdentityEnterAnimation(id, direction = 'left', options = {}) {
    const animation = this.createAnimation(id, options);

    switch (direction) {
      case 'left':
        animation.translateX('100%').opacity(0).step();
        animation.translateX(0).opacity(1).step({ duration: options.duration || this.defaultDuration });
        break;
      case 'right':
        animation.translateX('-100%').opacity(0).step();
        animation.translateX(0).opacity(1).step({ duration: options.duration || this.defaultDuration });
        break;
      case 'up':
        animation.translateY('100%').opacity(0).step();
        animation.translateY(0).opacity(1).step({ duration: options.duration || this.defaultDuration });
        break;
      case 'down':
        animation.translateY('-100%').opacity(0).step();
        animation.translateY(0).opacity(1).step({ duration: options.duration || this.defaultDuration });
        break;
      default:
        animation.scale(0.8).opacity(0).step();
        animation.scale(1).opacity(1).step({ duration: options.duration || this.defaultDuration });
        break;
    }

    return animation;
  }

  /**
   * 创建身份切换出场动画
   * @param {string} id - 动画ID
   * @param {string} direction - 动画方向 ('left' | 'right' | 'up' | 'down')
   * @param {object} [options] - 动画选项
   * @returns {object} 动画实例
   */
  createIdentityLeaveAnimation(id, direction = 'left', options = {}) {
    const animation = this.createAnimation(id, options);

    switch (direction) {
      case 'left':
        animation.translateX(0).opacity(1).step();
        animation.translateX('-100%').opacity(0).step({ duration: options.duration || this.defaultDuration });
        break;
      case 'right':
        animation.translateX(0).opacity(1).step();
        animation.translateX('100%').opacity(0).step({ duration: options.duration || this.defaultDuration });
        break;
      case 'up':
        animation.translateY(0).opacity(1).step();
        animation.translateY('-100%').opacity(0).step({ duration: options.duration || this.defaultDuration });
        break;
      case 'down':
        animation.translateY(0).opacity(1).step();
        animation.translateY('100%').opacity(0).step({ duration: options.duration || this.defaultDuration });
        break;
      default:
        animation.scale(1).opacity(1).step();
        animation.scale(0.8).opacity(0).step({ duration: options.duration || this.defaultDuration });
        break;
    }

    return animation;
  }

  /**
   * 创建淡入淡出动画
   * @param {string} id - 动画ID
   * @param {object} [options] - 动画选项
   * @returns {object} 动画实例
   */
  createFadeAnimation(id, options = {}) {
    const animation = this.createAnimation(id, options);
    animation.opacity(0).step();
    animation.opacity(1).step({ duration: options.duration || this.defaultDuration });
    return animation;
  }

  /**
   * 创建缩放动画
   * @param {string} id - 动画ID
   * @param {object} [options] - 动画选项
   * @returns {object} 动画实例
   */
  createScaleAnimation(id, options = {}) {
    const animation = this.createAnimation(id, options);
    animation.scale(0.8).opacity(0).step();
    animation.scale(1).opacity(1).step({ duration: options.duration || this.defaultDuration });
    return animation;
  }

  /**
   * 创建旋转动画
   * @param {string} id - 动画ID
   * @param {object} [options] - 动画选项
   * @returns {object} 动画实例
   */
  createRotateAnimation(id, options = {}) {
    const animation = this.createAnimation(id, options);
    animation.rotate(-180).scale(0.8).opacity(0).step();
    animation.rotate(0).scale(1).opacity(1).step({ duration: options.duration || this.defaultDuration });
    return animation;
  }

  /**
   * 创建身份切换动画序列
   * @param {string} enterId - 入场动画ID
   * @param {string} leaveId - 出场动画ID
   * @param {string} direction - 动画方向 ('left' | 'right' | 'up' | 'down')
   * @param {object} [options] - 动画选项
   * @returns {object} 动画实例对象
   */
  createIdentitySwitchAnimation(enterId, leaveId, direction = 'left', options = {}) {
    const enterAnimation = this.createIdentityEnterAnimation(enterId, direction, options);
    const leaveAnimation = this.createIdentityLeaveAnimation(leaveId, direction, options);

    return {
      enter: enterAnimation,
      leave: leaveAnimation
    };
  }

  /**
   * 获取动画数据
   * @param {object} animation - 动画实例
   * @returns {object} 动画数据
   */
  getAnimationData(animation) {
    if (!animation) {
      this.logger.error('获取动画数据失败：动画实例无效');
      return {};
    }

    return animation.export();
  }

  /**
   * 执行动画
   * @param {string} id - 动画ID
   * @param {function} callback - 动画完成后的回调函数
   */
  runAnimation(id, callback) {
    const animation = this.getAnimation(id);
    if (!animation) {
      this.logger.error(`执行动画失败：动画实例 ${id} 不存在`);
      if (callback) {
        callback();
      }
      return;
    }

    // 动画执行完成后调用回调
    setTimeout(() => {
      if (callback) {
        callback();
      }
      this.destroyAnimation(id);
    }, animation.options?.duration || this.defaultDuration);
  }

  /**
   * 执行身份切换动画
   * @param {string} enterId - 入场动画ID
   * @param {string} leaveId - 出场动画ID
   * @param {function} callback - 动画完成后的回调函数
   */
  runIdentitySwitchAnimation(enterId, leaveId, callback) {
    const enterAnimation = this.getAnimation(enterId);
    const leaveAnimation = this.getAnimation(leaveId);

    if (!enterAnimation || !leaveAnimation) {
      this.logger.error('执行身份切换动画失败：动画实例不存在');
      if (callback) {
        callback();
      }
      return;
    }

    // 动画执行完成后调用回调
    const duration = Math.max(
      enterAnimation.options?.duration || this.defaultDuration,
      leaveAnimation.options?.duration || this.defaultDuration
    );

    setTimeout(() => {
      if (callback) {
        callback();
      }
      this.destroyAnimation(enterId);
      this.destroyAnimation(leaveId);
    }, duration);
  }

  /**
   * 创建自定义动画
   * @param {string} id - 动画ID
   * @param {function} animationCallback - 动画配置回调函数
   * @param {object} [options] - 动画选项
   * @returns {object} 动画实例
   */
  createCustomAnimation(id, animationCallback, options = {}) {
    const animation = this.createAnimation(id, options);
    
    if (typeof animationCallback === 'function') {
      animationCallback(animation);
    }

    return animation;
  }

  /**
   * 获取动画状态
   * @returns {object} 动画状态
   */
  getAnimationState() {
    return {
      animations: Object.keys(this.animations),
      count: Object.keys(this.animations).length,
      defaultDuration: this.defaultDuration,
      defaultTimingFunction: this.defaultTimingFunction
    };
  }

  /**
   * 设置默认动画参数
   * @param {object} options - 默认动画参数
   * @param {number} [options.duration] - 动画持续时间（毫秒）
   * @param {string} [options.timingFunction] - 动画 timing 函数
   */
  setDefaultOptions(options = {}) {
    if (options.duration !== undefined) {
      this.defaultDuration = options.duration;
    }
    if (options.timingFunction) {
      this.defaultTimingFunction = options.timingFunction;
    }
    this.logger.debug('设置默认动画参数：', options);
  }
}

// 导出单例实例
const animationManager = new AnimationManager();

module.exports = {
  AnimationManager,
  animationManager
};
