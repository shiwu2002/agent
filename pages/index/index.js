// index.js
const defaultAvatarUrl = 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'
const authService = require('../../utils/auth')

Page({
  data: {
    motto: 'Hello World',
    userInfo: {
      avatarUrl: defaultAvatarUrl,
      nickName: '',
    },
    hasUserInfo: false,
    canIUseGetUserProfile: wx.canIUse('getUserProfile'),
    canIUseNicknameComp: wx.canIUse('input.type.nickname'),
    // 登录相关状态
    loginStatus: '检查登录状态中...',
    authInfo: null,
    isLoggedIn: false
  },

  onLoad() {
    // 页面加载时检查登录状态
    this.checkLoginStatus()
    
    // 设置登录状态回调
    const app = getApp()
    app.setLoginSuccessCallback((userInfo) => {
      this.onLoginSuccess(userInfo)
    })
    app.setLoginFailCallback((error) => {
      this.onLoginFail(error)
    })
  },

  onShow() {
    // 页面显示时重新检查登录状态
    this.checkLoginStatus()
  },

  /**
   * 检查登录状态
   */
  checkLoginStatus() {
    const app = getApp()
    const isLoggedIn = app.isLoggedIn()
    const userInfo = app.getUserInfo()
    
    this.setData({
      isLoggedIn: isLoggedIn,
      authInfo: userInfo,
      loginStatus: isLoggedIn ? '已登录' : '未登录'
    })
    
    console.log('登录状态检查:', {
      isLoggedIn,
      userInfo
    })
  },

  /**
   * 登录成功回调
   */
  onLoginSuccess(userInfo) {
    console.log('页面接收到登录成功通知:', userInfo)
    this.setData({
      isLoggedIn: true,
      authInfo: userInfo,
      loginStatus: '登录成功'
    })
    console.log(getApp().globalData.token)
    console.log(getApp().globalData.openId)
    
    // 如果用户信息完整，自动跳转到mainMood页面
    if (this.data.hasUserInfo) {
      this.navigateToMainMood()
    }
    
    // wx.showToast({
    //   title: '登录成功',
    //   icon: 'success'
    // })
  },

  /**
   * 登录失败回调
   */
  onLoginFail(error) {
    console.log('页面接收到登录失败通知:', error)
    this.setData({
      isLoggedIn: false,
      authInfo: null,
      loginStatus: `登录失败: ${error}`
    })
    
    wx.showToast({
      title: '登录失败',
      icon: 'error'
    })
  },

  /**
   * 跳转到主界面
   */
  navigateToMainMood() {
    // 显示跳转提示
    wx.showToast({
      title: '欢迎使用！',
      icon: 'success',
      duration: 1200
    })
    
    // 延迟跳转，让用户看到提示
    setTimeout(() => {
      // 跳转到聊天页面，携带用户头像和昵称
      const userAvatar = this.data.userInfo.avatarUrl
      const userName = this.data.userInfo.nickName
      
      console.log('准备跳转，用户数据:', {
        userAvatar: userAvatar,
        userName: userName,
        userInfo: this.data.userInfo
      })
      
      if (!userAvatar || !userName) {
        console.error('用户数据不完整，无法跳转');
        wx.showToast({
          title: '请先完善个人信息',
          icon: 'error'
        })
        return;
      }
      
      // 将用户数据存储到全局，作为备用
      const app = getApp();
      if (app) {
        app.globalData = app.globalData || {};
        app.globalData.userInfo = {
          avatarUrl: userAvatar,
          nickName: userName
        };
      }
      
      const jumpUrl = `/pages/MainInterface/MainInterface?userAvatar=${encodeURIComponent(userAvatar)}&userName=${encodeURIComponent(userName)}`;
      console.log('跳转URL:', jumpUrl);
      
      wx.navigateTo({
        url: jumpUrl,
        success: () => {
          console.log('成功跳转到聊天页面')
        },
        fail: (error) => {
          console.error('跳转失败:', error)
          // 如果跳转失败，尝试跳转到个人详情页
          wx.switchTab({
            url: '/pages/myPersonalDetails/myPersonalDetails',
            success: () => {
              console.log('成功跳转到个人详情页面')
            },
            fail: (error) => {
              wx.showToast({
                title: '跳转失败',
                icon: 'error'
              })
            }
          })
        }
      })
    }, 800)
  },

  /**
   * 手动跳转到主页面方法（供按钮调用）
   */
  goToMainMood() {
    if (!this.data.isLoggedIn) {
      wx.showToast({
        title: '请先登录',
        icon: 'error'
      })
      return
    }
    
    if (!this.data.hasUserInfo) {
      wx.showToast({
        title: '请先完善个人信息',
        icon: 'error'
      })
      return
    }
    
    this.navigateToMainMood()
  },

  /**
   * 阻止用户返回到登录页（当已完成登录且填写信息时）
   */
  onBackPress() {
    if (this.data.isLoggedIn && this.data.hasUserInfo) {
      wx.showModal({
        title: '提示',
        content: '您已成功登录，请直接使用应用功能',
        showCancel: false,
        success: () => {
          // 自动跳转到主页面
          this.navigateToMainMood()
        }
      })
      return true // 阻止返回
    }
    return false // 允许返回
  },
  async retryLogin() {
    this.setData({
      loginStatus: '重新登录中...'
    })
    
    try {
      const app = getApp()
      await app.reLogin()
    } catch (error) {
      console.error('重新登录失败:', error)
      this.setData({
        loginStatus: '重新登录失败'
      })
    }
  },

  /**
   * 退出登录
   */
  logout() {
    authService.logout()
    this.setData({
      isLoggedIn: false,
      authInfo: null,
      loginStatus: '已退出登录'
    })
    
    wx.showToast({
      title: '已退出登录',
      icon: 'success'
    })
  },

  /**
   * 显示登录信息详情
   */
  showAuthDetails() {
    if (this.data.authInfo) {
      const details = [
        `OpenID: ${this.data.authInfo.openId || 'N/A'}`,
        `Token: ${this.data.authInfo.token ? this.data.authInfo.token.substring(0, 20) + '...' : 'N/A'}`,
        `登录时间: ${this.data.authInfo.loginTime ? new Date(this.data.authInfo.loginTime).toLocaleString() : 'N/A'}`
      ].join('\n')
      
      wx.showModal({
        title: '登录信息详情',
        content: details,
        showCancel: false
      })
    } else {
      wx.showModal({
        title: '提示',
        content: '当前未登录',
        showCancel: false
      })
    }
  },

  bindViewTap() {
    wx.navigateTo({
      url: '../logs/logs'
    })
  },
  onChooseAvatar(e) {
    console.log('onChooseAvatar 被调用:', e.detail);
    const { avatarUrl } = e.detail
    const { nickName } = this.data.userInfo
    const hasUserInfo = nickName && avatarUrl && avatarUrl !== defaultAvatarUrl
    
    console.log('头像选择结果:', {
      avatarUrl: avatarUrl,
      nickName: nickName,
      hasUserInfo: hasUserInfo,
      defaultAvatarUrl: defaultAvatarUrl
    });
    
    this.setData({
      "userInfo.avatarUrl": avatarUrl,
      hasUserInfo: hasUserInfo,
    })
    
    // 保存用户数据到本地存储
    try {
      wx.setStorageSync('userInfo', JSON.stringify(this.data.userInfo));
      console.log('用户头像已保存到本地存储');
    } catch (e) {
      console.log('保存用户数据失败:', e);
    }
    
    // 如果用户信息完整且已登录，延迟自动跳转到mainMood页面
    if (hasUserInfo && this.data.isLoggedIn) {
      wx.showToast({
        title: '信息完善完成',
        icon: 'success',
        duration: 1000
      })
      setTimeout(() => {
        this.navigateToMainMood()
      }, 1000)
    }
  },
  onInputChange(e) {
    console.log('onInputChange 被调用:', e.detail);
    const nickName = e.detail.value
    const { avatarUrl } = this.data.userInfo
    const hasUserInfo = nickName && avatarUrl && avatarUrl !== defaultAvatarUrl
    
    console.log('昵称输入结果:', {
      nickName: nickName,
      avatarUrl: avatarUrl,
      hasUserInfo: hasUserInfo
    });
    
    this.setData({
      "userInfo.nickName": nickName,
      hasUserInfo: hasUserInfo,
    })
    
    // 保存用户数据到本地存储
    try {
      wx.setStorageSync('userInfo', JSON.stringify(this.data.userInfo));
      console.log('用户昵称已保存到本地存储');
    } catch (e) {
      console.log('保存用户数据失败:', e);
    }
    
    // 如果用户信息完整且已登录，延迟自动跳转到mainMood页面
    if (hasUserInfo && this.data.isLoggedIn) {
      wx.showToast({
        title: '信息完善完成',
        icon: 'success',
        duration: 1000
      })
      setTimeout(() => {
        this.navigateToMainMood()
      }, 1000)
    }
  },
  getUserProfile(e) {
    // 推荐使用wx.getUserProfile获取用户信息，开发者每次通过该接口获取用户个人信息均需用户确认，开发者妥善保管用户快速填写的头像昵称，避免重复弹窗
    wx.getUserProfile({
      desc: '展示用户信息', // 声明获取用户个人信息后的用途，后续会展示在弹窗中，请谨慎填写
      success: (res) => {
        console.log(res)
        this.setData({
          userInfo: res.userInfo,
          hasUserInfo: true
        })
      }
    })
  },
})
