// pages/video-call/video-call.js
Page({

  /**
   * 页面的初始数据
   */
  data: {
    callType: 'video',
    targetUserId: '',
    isCaller: true,
    callStatus: 'connecting', // connecting, connected, disconnected
    callDuration: 0,
    callDurationText: '00:00',
    targetUserInfo: {
      name: '好友',
      avatar: '/pages/images/用户头像.png'
    },
    localUserInfo: {
      name: '我',
      avatar: '/pages/images/个人详情.png'
    },
    isMuted: false,
    isVideoEnabled: true,
    isFrontCamera: true,
    showControls: true,
    timer: null,
    localStreamUrl: '',
    remoteStreamUrl: '',
    pusherUrl: '',
    playerUrl: ''
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('视频通话页面参数:', options);
    
    const { type, targetUserId, isCaller } = options;
    
    this.setData({
      callType: type || 'video',
      targetUserId: targetUserId || '',
      isCaller: isCaller === 'true' || isCaller === true
    });

    // 获取用户信息
    this.loadUserInfo();
    
    // 初始化视频通话
    this.initVideoCall();
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    this.endCall();
  },

  /**
   * 加载用户信息
   */
  loadUserInfo() {
    const app = getApp();
    
    // 获取当前用户信息
    if (app.globalData.userInfo) {
      this.setData({
        'localUserInfo.name': app.globalData.userInfo.nickName,
        'localUserInfo.avatar': app.globalData.userInfo.avatarUrl
      });
    }

    // 从全局数据获取目标用户信息
    if (app.globalData.targetUserInfo) {
      this.setData({
        'targetUserInfo.name': app.globalData.targetUserInfo.name,
        'targetUserInfo.avatar': app.globalData.targetUserInfo.avatar
      });
    }
  },

  /**
   * 初始化视频通话
   */
  initVideoCall() {
    // 初始化WebRTC连接
    this.initWebRTC();
    
    if (this.data.isCaller) {
      // 主叫方
      this.setData({ callStatus: 'connecting' });
      this.startCallTimer();
    } else {
      // 被叫方
      this.setData({ callStatus: 'connected' });
      this.startCallTimer();
    }

    // 监听WebSocket消息
    this.setupWebSocketListeners();
  },

  /**
   * 初始化WebRTC
   */
  initWebRTC() {
    // 创建本地视频推流
    this.createLocalStream();
  },

  /**
   * 创建本地视频流
   */
  createLocalStream() {
    // 这里使用微信小程序的live-pusher组件
    // 在实际应用中，你需要配置正确的推流地址
    const pusherUrl = 'rtmp://your-rtmp-server.com/live/' + this.data.localUserInfo.id;
    
    this.setData({
      pusherUrl: pusherUrl
    });

    // 创建live-pusher上下文
    this.pusherContext = wx.createLivePusherContext('local-video');
  },

  /**
   * 设置WebSocket监听器
   */
  setupWebSocketListeners() {
    const app = getApp();
    
    // 如果视频WebSocket未连接，先连接
    if (!app.globalData.videoWSManager || !app.globalData.videoWSManager.isConnected()) {
      this.initVideoWebSocket();
      return;
    }
    
    // 监听视频WebSocket消息
    if (app.globalData.videoWSManager) {
      app.globalData.videoWSManager.onMessage = this.handleVideoMessage.bind(this);
    }
  },

  /**
   * 初始化视频WebSocket连接
   */
  initVideoWebSocket() {
    const app = getApp();
    const userId = app.globalData.openId || 'user123';
    
    const WebSocketManager = require('../../utils/websocket.js');
    
    const videoWSManager = new WebSocketManager({
      url: `ws://localhost:8080/ws/video?userId=${userId}`,
      onOpen: () => {
        console.log('视频通话页面WebSocket连接成功');
        this.setupWebSocketListeners();
        // 发送认证信息
        videoWSManager.send({
          type: 'auth',
          userId: this.data.localUserInfo.id,
          targetUserId: this.data.targetUserId,
          service: 'video'
        });
      },
      onMessage: this.handleVideoMessage.bind(this),
      onClose: () => {
        console.log('视频通话页面WebSocket连接关闭');
      },
      onError: (error) => {
        console.error('视频通话页面WebSocket错误:', error);
        wx.showToast({
          title: '视频连接失败',
          icon: 'none'
        });
      },
      reconnectInterval: 3000,
      maxReconnectAttempts: 3
    });

    app.globalData.videoWSManager = videoWSManager;
    videoWSManager.connect();
  },

  /**
   * 处理视频消息
   */
  handleVideoMessage(message) {
    try {
      if (typeof message.data === 'string') {
        // 检查是否为错误消息
        if (message.data.startsWith('抱歉，处理您的请求时发生了错误') || 
            message.data.startsWith('处理失败:') || 
            message.data.startsWith('识别失败:') || 
            message.data.startsWith('AI处理失败:')) {
          console.error('视频通话服务器错误:', message.data);
          wx.showToast({
            title: '视频服务错误，请稍后重试',
            icon: 'none'
          });
          return;
        }
        
        const data = JSON.parse(message.data);
        
        switch (data.type) {
          case 'video_call_end':
            this.handleCallEnd();
            break;
          case 'video_call_connected':
            this.handleCallConnected();
            break;
          case 'video_call_failed':
            this.handleCallFailed();
            break;
          case 'webrtc_offer':
            this.handleWebRTCOffer(data);
            break;
          case 'webrtc_answer':
            this.handleWebRTCAnswer(data);
            break;
          case 'webrtc_ice':
            this.handleWebRTCIce(data);
            break;
          default:
            console.log('未知视频通话消息类型:', data.type);
        }
      }
    } catch (error) {
      console.error('解析视频通话消息失败:', error, '原始消息:', message.data);
    }
  },

  /**
   * 处理通话连接成功
   */
  handleCallConnected() {
    this.setData({ callStatus: 'connected' });
    
    // 开始推流和播放
    this.startStreaming();
    
    wx.showToast({
      title: '视频通话已连接',
      icon: 'none'
    });
  },

  /**
   * 处理通话失败
   */
  handleCallFailed() {
    wx.showToast({
      title: '视频通话连接失败',
      icon: 'none'
    });
    this.endCall();
  },

  /**
   * 处理通话结束
   */
  handleCallEnd() {
    wx.showToast({
      title: '视频通话已结束',
      icon: 'none'
    });
    this.endCall();
  },

  /**
   * 开始推流和播放
   */
  startStreaming() {
    // 开始本地推流
    if (this.pusherContext) {
      this.pusherContext.start();
    }

    // 设置远程播放地址
    const playerUrl = 'rtmp://your-rtmp-server.com/live/' + this.data.targetUserId;
    this.setData({
      playerUrl: playerUrl
    });
  },

  /**
   * 处理WebRTC Offer
   */
  handleWebRTCOffer(data) {
    console.log('收到WebRTC Offer:', data);
    // 处理WebRTC连接建立
  },

  /**
   * 处理WebRTC Answer
   */
  handleWebRTCAnswer(data) {
    console.log('收到WebRTC Answer:', data);
    // 处理WebRTC连接建立
  },

  /**
   * 处理WebRTC ICE候选
   */
  handleWebRTCIce(data) {
    console.log('收到WebRTC ICE候选:', data);
    // 处理WebRTC连接建立
  },

  /**
   * 开始通话计时
   */
  startCallTimer() {
    this.stopCallTimer();
    
    this.data.timer = setInterval(() => {
      const duration = this.data.callDuration + 1;
      const minutes = Math.floor(duration / 60);
      const seconds = duration % 60;
      
      this.setData({
        callDuration: duration,
        callDurationText: `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      });
    }, 1000);
  },

  /**
   * 停止通话计时
   */
  stopCallTimer() {
    if (this.data.timer) {
      clearInterval(this.data.timer);
      this.data.timer = null;
    }
  },

  /**
   * 切换静音
   */
  toggleMute() {
    const isMuted = !this.data.isMuted;
    this.setData({ isMuted });
    
    // 控制本地音频
    if (this.pusherContext) {
      this.pusherContext.setMute({
        mute: isMuted
      });
    }
    
    // 发送静音状态到对方
    const app = getApp();
    if (app.globalData.videoWSManager && app.globalData.videoWSManager.isConnected()) {
      app.globalData.videoWSManager.send({
        type: 'video_mute_status',
        isMuted: isMuted,
        userId: this.data.localUserInfo.id,
        targetUserId: this.data.targetUserId
      });
    }
  },

  /**
   * 切换视频
   */
  toggleVideo() {
    const isVideoEnabled = !this.data.isVideoEnabled;
    this.setData({ isVideoEnabled });
    
    // 控制本地视频
    if (this.pusherContext) {
      this.pusherContext.setMute({
        videoMute: !isVideoEnabled
      });
    }
    
    // 发送视频状态到对方
    const app = getApp();
    if (app.globalData.videoWSManager && app.globalData.videoWSManager.isConnected()) {
      app.globalData.videoWSManager.send({
        type: 'video_status',
        isVideoEnabled: isVideoEnabled,
        userId: this.data.localUserInfo.id,
        targetUserId: this.data.targetUserId
      });
    }
  },

  /**
   * 切换摄像头
   */
  switchCamera() {
    const isFrontCamera = !this.data.isFrontCamera;
    this.setData({ isFrontCamera });
    
    // 切换摄像头
    if (this.pusherContext) {
      this.pusherContext.switchCamera();
    }
  },

  /**
   * 切换控制面板
   */
  toggleControls() {
    this.setData({
      showControls: !this.data.showControls
    });
  },

  /**
   * 本地视频状态变化
   */
  onPusherStateChange(e) {
    console.log('本地视频状态变化:', e);
    const { code, message } = e.detail;
    
    if (code === 1008) {
      // 推流失败
      wx.showToast({
        title: '视频推流失败: ' + message,
        icon: 'none'
      });
    }
  },

  /**
   * 远程视频状态变化
   */
  onPlayerStateChange(e) {
    console.log('远程视频状态变化:', e);
    const { code, message } = e.detail;
    
    if (code === 2008) {
      // 播放失败
      wx.showToast({
        title: '视频播放失败: ' + message,
        icon: 'none'
      });
    } else if (code === 2004) {
      // 开始播放
      this.setData({ callStatus: 'connected' });
    }
  },

  /**
   * 挂断通话
   */
  hangUp() {
    wx.showModal({
      title: '结束通话',
      content: '确定要结束视频通话吗？',
      success: (res) => {
        if (res.confirm) {
          this.endCall();
        }
      }
    });
  },

  /**
   * 结束通话
   */
  endCall() {
    // 停止推流和播放
    if (this.pusherContext) {
      this.pusherContext.stop();
    }

    // 发送通话结束消息
    const app = getApp();
    if (app.globalData.videoWSManager && app.globalData.videoWSManager.isConnected()) {
      app.globalData.videoWSManager.send({
        type: 'video_call_end',
        senderId: this.data.localUserInfo.id,
        targetUserId: this.data.targetUserId,
        timestamp: Date.now()
      });
    }

    this.stopCallTimer();
    
    // 返回上一页
    wx.navigateBack({
      delta: 1
    });
  },

  /**
   * 页面隐藏时
   */
  onHide() {
    this.stopCallTimer();
  }
})