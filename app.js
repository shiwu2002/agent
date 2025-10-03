// app.js
const authService = require('./utils/auth')

App({
  onLaunch() {
    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 延迟执行登录流程，确保App实例完全初始化
    setTimeout(() => {
      this.performLogin()
    }, 100)
  },

  /**
   * 执行登录流程
   */
  async performLogin() {
    try {
      console.log('应用启动，开始登录...')
      
      // 检查是否已有有效登录信息
      if (authService.isTokenValid()) {
        console.log('发现有效登录信息，跳过登录')
        const userInfo = authService.getUserInfo()
        console.log('当前用户信息:', userInfo)
        
        // 触发登录成功回调
        if (this.loginSuccessCallback) {
          this.loginSuccessCallback(userInfo)
        }
        return
      }
      
      // 执行登录
      const result = await authService.login()
      
      if (result.success) {
        console.log('登录成功:', result.openId)
        
        // 可以在这里触发登录成功的回调
        if (this.loginSuccessCallback) {
          this.loginSuccessCallback(result)
        }
      } else {
        console.error('登录失败:', result.error)
        
        // 可以在这里处理登录失败的情况
        if (this.loginFailCallback) {
          this.loginFailCallback(result.error)
        }
      }
      
    } catch (error) {
      console.error('登录过程发生异常:', error)
      
      // 触发失败回调
      if (this.loginFailCallback) {
        this.loginFailCallback(error.message || '登录异常')
      }
    }
  },

  /**
   * 设置登录成功回调
   * @param {Function} callback 回调函数
   */
  setLoginSuccessCallback(callback) {
    this.loginSuccessCallback = callback
  },

  /**
   * 设置登录失败回调
   * @param {Function} callback 回调函数
   */
  setLoginFailCallback(callback) {
    this.loginFailCallback = callback
  },

  /**
   * 获取用户信息
   * @returns {Object|null} 用户信息
   */
  getUserInfo() {
    return authService.getUserInfo()
  },

  /**
   * 检查登录状态
   * @returns {boolean} 是否已登录
   */
  isLoggedIn() {
    return authService.isTokenValid()
  },

  /**
   * 重新登录
   */
  async reLogin() {
    console.log('开始重新登录...')
    authService.logout()
    await this.performLogin()
  },

  globalData: {
    userInfo: null,
    token: null,
    openId: null,
    URL: 'https://localhost:8080',
    wsManager: null,
    voiceWSManager: null,
    videoWSManager: null
  }
})
