/**
 * 错误处理器
 * 负责统一错误处理，提供错误码和错误信息
 */

import { ERROR_CODES, ERROR_MESSAGES } from './constants';

class ErrorHandler {
  /**
   * 创建错误对象
   * @param {number} code - 错误码
   * @param {string} message - 错误信息
   * @param {any} data - 附加数据
   * @returns {Error} 错误对象
   */
  createError(code, message = null, data = null) {
    const error = new Error(message || ERROR_MESSAGES[code] || ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR]);
    error.code = code;
    error.data = data;
    return error;
  }

  /**
   * 处理登录失败错误
   * @param {string} message - 错误信息
   * @param {any} data - 附加数据
   * @returns {Error} 错误对象
   */
  handleLoginError(message, data = null) {
    return this.createError(ERROR_CODES.LOGIN_FAILED, message, data);
  }

  /**
   * 处理网络错误
   * @param {string} message - 错误信息
   * @param {any} data - 附加数据
   * @returns {Error} 错误对象
   */
  handleNetworkError(message, data = null) {
    return this.createError(ERROR_CODES.NETWORK_ERROR, message, data);
  }

  /**
   * 处理用户信息错误
   * @param {string} message - 错误信息
   * @param {any} data - 附加数据
   * @returns {Error} 错误对象
   */
  handleUserInfoError(message, data = null) {
    return this.createError(ERROR_CODES.USER_INFO_ERROR, message, data);
  }

  /**
   * 处理身份错误
   * @param {string} message - 错误信息
   * @param {any} data - 附加数据
   * @returns {Error} 错误对象
   */
  handleRoleError(message, data = null) {
    return this.createError(ERROR_CODES.ROLE_ERROR, message, data);
  }

  /**
   * 处理UserSig错误
   * @param {string} message - 错误信息
   * @param {any} data - 附加数据
   * @returns {Error} 错误对象
   */
  handleUserSigError(message, data = null) {
    return this.createError(ERROR_CODES.USER_SIG_ERROR, message, data);
  }

  /**
   * 处理存储错误
   * @param {string} message - 错误信息
   * @param {any} data - 附加数据
   * @returns {Error} 错误对象
   */
  handleStorageError(message, data = null) {
    return this.createError(ERROR_CODES.STORAGE_ERROR, message, data);
  }

  /**
   * 处理云函数错误
   * @param {string} message - 错误信息
   * @param {any} data - 附加数据
   * @returns {Error} 错误对象
   */
  handleCloudFunctionError(message, data = null) {
    return this.createError(ERROR_CODES.CLOUD_FUNCTION_ERROR, message, data);
  }

  /**
   * 处理未知错误
   * @param {string} message - 错误信息
   * @param {any} data - 附加数据
   * @returns {Error} 错误对象
   */
  handleUnknownError(message, data = null) {
    return this.createError(ERROR_CODES.UNKNOWN_ERROR, message, data);
  }

  /**
   * 解析错误
   * @param {Error} error - 原始错误
   * @returns {Object} 解析后的错误对象
   */
  parseError(error) {
    if (error.code && ERROR_MESSAGES[error.code]) {
      return {
        code: error.code,
        message: error.message || ERROR_MESSAGES[error.code],
        data: error.data
      };
    }

    // 处理网络错误
    if (error.message && (error.message.includes('网络') || error.message.includes('Network'))) {
      return {
        code: ERROR_CODES.NETWORK_ERROR,
        message: error.message || ERROR_MESSAGES[ERROR_CODES.NETWORK_ERROR],
        data: error
      };
    }

    // 处理云函数错误
    if (error.message && error.message.includes('云函数')) {
      return {
        code: ERROR_CODES.CLOUD_FUNCTION_ERROR,
        message: error.message || ERROR_MESSAGES[ERROR_CODES.CLOUD_FUNCTION_ERROR],
        data: error
      };
    }

    // 默认处理
    return {
      code: ERROR_CODES.UNKNOWN_ERROR,
      message: error.message || ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
      data: error
    };
  }

  /**
   * 显示错误提示
   * @param {Error} error - 错误对象
   * @param {Object} options - 提示选项
   */
  showError(error, options = {}) {
    const parsedError = this.parseError(error);
    const { title = '错误', duration = 2000 } = options;

    wx.showToast({
      title: parsedError.message,
      icon: 'none',
      duration,
      ...options
    });

    console.error('Error:', parsedError);
  }

  /**
   * 显示网络错误提示
   * @param {string} message - 错误信息
   * @param {Object} options - 提示选项
   */
  showNetworkError(message = '网络连接失败，请检查网络设置', options = {}) {
    this.showError(this.handleNetworkError(message), options);
  }

  /**
   * 显示登录错误提示
   * @param {string} message - 错误信息
   * @param {Object} options - 提示选项
   */
  showLoginError(message = '登录失败，请重试', options = {}) {
    this.showError(this.handleLoginError(message), options);
  }

  /**
   * 显示操作成功提示
   * @param {string} message - 提示信息
   * @param {Object} options - 提示选项
   */
  showSuccess(message = '操作成功', options = {}) {
    wx.showToast({
      title: message,
      icon: 'success',
      duration: 2000,
      ...options
    });
  }

  /**
   * 显示加载提示
   * @param {string} message - 提示信息
   * @param {Object} options - 提示选项
   */
  showLoading(message = '加载中...', options = {}) {
    wx.showLoading({
      title: message,
      ...options
    });
  }

  /**
   * 隐藏加载提示
   */
  hideLoading() {
    wx.hideLoading();
  }

  /**
   * 显示确认对话框
   * @param {string} title - 标题
   * @param {string} content - 内容
   * @param {Function} confirmCallback - 确认回调
   * @param {Function} cancelCallback - 取消回调
   * @param {Object} options - 对话框选项
   */
  showConfirm(title, content, confirmCallback, cancelCallback, options = {}) {
    wx.showModal({
      title,
      content,
      success: (res) => {
        if (res.confirm && confirmCallback) {
          confirmCallback();
        } else if (res.cancel && cancelCallback) {
          cancelCallback();
        }
      },
      ...options
    });
  }
}

// 导出单例
let errorHandlerInstance = null;

export function getErrorHandler() {
  if (!errorHandlerInstance) {
    errorHandlerInstance = new ErrorHandler();
  }
  return errorHandlerInstance;
}

export default ErrorHandler;
