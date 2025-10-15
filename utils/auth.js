// utils/auth.js
// 微信小程序登录认证服务模块
// 创建并导出authService实例
class AuthService {
  constructor() {
    this.config = {
      apiUrl: 'http://192.168.1.3:8080/wx/login',
      timeout: 5000,
      maxRetries: 3,
      retryDelay: 1000
    }
  }

  async login() {
    try {
      console.log('开始登录...')
      
      const code = await this.getWxLoginCode()
      console.log('获取code:', code)
      
      const token = await this.exchangeCodeForToken(code)
      console.log('获取token:', token)
      
      // 检查token是否存在
      if (!token) {
        throw new Error('获取token失败')
      }
      
      const openId = this.parseToken(token)
      console.log('解析openId:', openId)

      // 从token中解析aiSessionId（假设它在payload中）
      const aiSessionId = this.extractAiSessionIdFromToken(token)
      console.log('解析aiSessionId:', aiSessionId)
      
      this.storeUserInfo(token, openId, aiSessionId)
      
      return {
        success: true,
        token,
        openId,
        message: '登录成功',
        aiSessionId
      }
    } catch (error) {
      console.error('登录失败:', error)
      return {
        success: false,
        error: error.message,
        message: '登录失败'
      }
    }
  }

  getWxLoginCode() {
    return new Promise((resolve, reject) => {
      if (!wx || typeof wx.login !== 'function') {
        reject(new Error('当前环境不支持微信登录API'));
        return;
      }
      wx.login({
        success: (res) => {
          if (res.code) {
            resolve(res.code)
          } else {
            reject(new Error('获取code失败'))
          }
        },
        fail: (error) => {
          reject(new Error(`登录失败: ${error.errMsg}`))
        }
      })
    })
  }

  async exchangeCodeForToken(code) {
    let retries = 0
    while (retries < this.config.maxRetries) {
      try {
        return await this.makeLoginRequest(code)
      } catch (error) {
        retries++
        if (retries >= this.config.maxRetries) {
          throw error
        }
        await this.sleep(this.config.retryDelay * retries)
      }
    }
  }

  makeLoginRequest(code) {
    return new Promise((resolve, reject) => {
      const formData = `code=${encodeURIComponent(code)}`
      
      wx.request({
        url: this.config.apiUrl,
        method: 'POST',
        timeout: this.config.timeout,
        header: {
          'content-type': 'application/x-www-form-urlencoded'
        },
        data: formData,
        success: (res) => {
          if (res.statusCode === 200 && res.data && res.data.code === 200 && res.data.data && res.data.data.token) {
            resolve(res.data.data.token)
          } else {
            const errMsg = (res.data && res.data.msg) ? res.data.msg : '服务器错误';
            reject(new Error(errMsg));
          }
        },
        fail: (error) => {
          reject(new Error(`网络错误: ${error.errMsg}`))
        }
      })
    })
  }

  parseToken(token) {
    // 检查token是否存在
    if (!token) {
      throw new Error('Token不存在')
    }
    
    try {
      const parts = token.split('.')
      if (parts.length !== 3) {
        throw new Error('Token格式错误')
      }

      let payload = parts[1]
      while (payload.length % 4) {
        payload += '='
      }
      
      const decodedPayload = wx.base64ToArrayBuffer(payload)
      const jsonString = this.arrayBufferToString(decodedPayload)
      const userInfo = JSON.parse(jsonString)
      
      if (!userInfo.openId) {
        throw new Error('缺少openId')
      }
      
      return userInfo.openId
    } catch (error) {
      throw new Error(`Token解析失败: ${error.message}`)
    }
  }

  extractAiSessionIdFromToken(token) {
    // 检查token是否存在
    if (!token) {
      return null
    }
    
    try {
      const parts = token.split('.')
      if (parts.length !== 3) {
        return null
      }

      let payload = parts[1]
      while (payload.length % 4) {
        payload += '='
      }
      
      const decodedPayload = wx.base64ToArrayBuffer(payload)
      const jsonString = this.arrayBufferToString(decodedPayload)
      const userInfo = JSON.parse(jsonString)
      
      return userInfo.aiSessionId || null
    } catch (error) {
      console.warn('解析aiSessionId失败:', error)
      return null
    }
  }

  arrayBufferToString(buffer) {
    const uint8Array = new Uint8Array(buffer)
    let result = ''
    for (let i = 0; i < uint8Array.length; i++) {
      result += String.fromCharCode(uint8Array[i])
    }
    return result
  }

  storeUserInfo(token, openId, aiSessionId) {
    const app = getApp(); 
    try {
    // 增加app存在性判断
    if (!app) {
      console.warn('未找到App实例，无法存储用户信息');
      return;
    }
    app.globalData = app.globalData || {}; // 确保globalData存在
    app.globalData.token = token;
      if (app && app.globalData) {
        app.globalData.token = token
        app.globalData.openId = openId
        app.globalData.aiSessionId = aiSessionId || null
        console.log('保存成功')
      }
    } catch (error) {
      console.warn('保存失败:', error)
    }
  }

  getUserInfo() {
    const app = getApp();
    try {
      if (app && app.globalData && app.globalData.token && app.globalData.openId) {
        return {
          token: app.globalData.token,
          openId: app.globalData.openId,
          aiSessionId: app.globalData.aiSessionId || null
        }
      }
    } catch (error) {
      console.warn('获取失败:', error)
    }
    return null
  }

  isTokenValid() {
    const userInfo = this.getUserInfo()
    if (!userInfo || !userInfo.token) {
      return false
    }
    try {
      this.parseToken(userInfo.token)
      return true
    } catch (error) {
      return false
    }
  }

  logout() {
    try {
      if (app && app.globalData) {
        app.globalData.token = null
        app.globalData.openId = null
        app.globalData.aiSessionId = null
        console.log('退出成功')
      }
    } catch (error) {
      console.warn('退出失败:', error)
    }
  }

  getErrorMessage(error) {
    return '登录失败，请重试'
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

const authService = new AuthService()
module.exports = authService
