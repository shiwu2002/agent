// pages/voice-call/voice-call.js
Page({

  /**
   * 页面的初始数据
   */
  data: {
    callType: 'voice',
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
    isSpeaker: false,
    showControls: true,
    timer: null
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('语音通话页面参数:', options);
    
    const { type, targetUserId, isCaller } = options;
    
    this.setData({
      callType: type || 'voice',
      targetUserId: targetUserId || '',
      isCaller: isCaller === 'true' || isCaller === true
    });

    // 获取用户信息
    this.loadUserInfo();
    
    // 初始化通话
    this.initCall();
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    this.stopConnectionMonitoring();
    this.stopAudioRecording();
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
   * 初始化通话
   */
  initCall() {
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
    
    // 初始化音频录制和播放
    this.initAudioContext();
  },

  /**
   * 初始化音频上下文
   */
  initAudioContext() {
    // 创建音频上下文用于PCM数据处理
    this.audioContext = null;
    this.mediaStream = null;
    this.audioRecorder = null;
    this.connectionCheckTimer = null;
    this.lastHeartbeatTime = 0;
    
    try {
      // 初始化音频上下文
      this.audioContext = wx.createWebAudioContext ? wx.createWebAudioContext() : null;
      console.log('音频上下文初始化成功');
      
      // 开始音频录制
      this.startAudioRecording();
      
      // 启动连接状态监控
      this.startConnectionMonitoring();
    } catch (error) {
      console.error('音频上下文初始化失败:', error);
    }
  },

  /**
   * 启动连接状态监控
   */
  startConnectionMonitoring() {
    // 定期检查连接状态
    this.connectionCheckTimer = setInterval(() => {
      const app = getApp();
      if (!app.globalData.voiceWSManager || !app.globalData.voiceWSManager.isConnected) {
        console.warn('检测到语音WebSocket连接断开，尝试重连...');
        this.setData({ callStatus: 'reconnecting' });
        this.initVoiceWebSocket();
      }
      
      // 检查心跳超时（超过60秒无响应则认为连接异常）
      const now = Date.now();
      if (this.lastHeartbeatTime > 0 && (now - this.lastHeartbeatTime) > 60000) {
        console.warn('心跳超时，重新连接...');
        this.setData({ callStatus: 'reconnecting' });
        this.initVoiceWebSocket();
      }
    }, 5000); // 每5秒检查一次
  },

  /**
   * 停止连接状态监控
   */
  stopConnectionMonitoring() {
    if (this.connectionCheckTimer) {
      clearInterval(this.connectionCheckTimer);
      this.connectionCheckTimer = null;
    }
  },

  /**
   * 开始音频录制
   */
  startAudioRecording() {
    const app = getApp();
    
    // 获取麦克风权限
    wx.getRecorderManager().start({
      duration: 60000, // 最长60秒
      sampleRate: 16000, // 16kHz采样率，符合后端要求
      numberOfChannels: 1, // 单声道
      encodeBitRate: 128000, // 编码码率
      format: 'pcm', // PCM格式
      frameSize: 10 // 每帧10ms
    });
    
    console.log('开始PCM音频录制');
    
    // 监听录音数据
    const recorderManager = wx.getRecorderManager();
    
    recorderManager.onFrameRecorded((res) => {
      const { frameBuffer } = res;
      
      // 发送PCM音频数据到服务器
      if (app.globalData.voiceWSManager && app.globalData.voiceWSManager.isConnected) {
        // 发送二进制PCM数据
        app.globalData.voiceWSManager.send(frameBuffer);
        console.log('发送PCM音频数据帧，长度:', frameBuffer.byteLength);
      }
    });
    
    recorderManager.onStart(() => {
      console.log('PCM音频录制开始');
    });
    
    recorderManager.onError((error) => {
      console.error('PCM音频录制错误:', error);
      wx.showToast({
        title: '音频录制失败',
        icon: 'none'
      });
    });
  },

  /**
   * 停止音频录制
   */
  stopAudioRecording() {
    try {
      wx.getRecorderManager().stop();
      console.log('PCM音频录制停止');
    } catch (error) {
      console.error('停止音频录制失败:', error);
    }
  },

  /**
   * 播放接收到的PCM音频数据
   */
  playPCMAudio(pcmData) {
    if (!pcmData || pcmData.byteLength === 0) {
      console.error('无效的PCM音频数据');
      return;
    }
    
    try {
      // 创建音频缓冲区
      const audioBuffer = this.audioContext.createBuffer(1, pcmData.length / 2, 16000);
      const channelData = audioBuffer.getChannelData(0);
      
      // 将16位PCM数据转换为32位浮点
      const dataView = new DataView(pcmData);
      for (let i = 0; i < channelData.length; i++) {
        channelData[i] = dataView.getInt16(i * 2, true) / 0x7FFF;
      }
      
      // 创建音频源并播放
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      source.start();
      
      console.log('PCM音频播放成功，长度:', pcmData.byteLength);
    } catch (error) {
      console.error('PCM音频播放失败:', error);
    }
  },

  /**
   * 设置WebSocket监听器
   */
  setupWebSocketListeners() {
    const app = getApp();
    
    // 如果语音WebSocket未连接，先连接
    if (!app.globalData.voiceWSManager || !app.globalData.voiceWSManager.isConnected) {
      this.initVoiceWebSocket();
      return;
    }
    
    // 监听语音WebSocket消息
    if (app.globalData.voiceWSManager) {
      app.globalData.voiceWSManager.onMessage = this.handleVoiceMessage.bind(this);
      
      // 设置连接状态监听
      const originalOnOpen = app.globalData.voiceWSManager.onOpen;
      const originalOnClose = app.globalData.voiceWSManager.onClose;
      const originalOnError = app.globalData.voiceWSManager.onError;
      
      app.globalData.voiceWSManager.onOpen = () => {
        console.log('语音通话WebSocket连接已建立');
        this.setData({ callStatus: 'connected' });
        if (originalOnOpen) originalOnOpen();
      };
      
      app.globalData.voiceWSManager.onClose = () => {
        console.log('语音通话WebSocket连接已关闭');
        this.setData({ callStatus: 'disconnected' });
        if (originalOnClose) originalOnClose();
      };
      
      app.globalData.voiceWSManager.onError = (error) => {
        console.error('语音通话WebSocket错误:', error);
        this.setData({ callStatus: 'disconnected' });
        if (originalOnError) originalOnError(error);
      };
    }
  },

  /**
   * 初始化语音WebSocket连接
   */
  initVoiceWebSocket() {
    const app = getApp();
    const userId = app.globalData.openId || 'user123';
    
    const WebSocketManager = require('../../utils/websocket.js');
    
    const voiceWSManager = new WebSocketManager({
      url: `ws://localhost:8080/ws/voice?userId=${userId}`,
      onOpen: () => {
        console.log('语音通话页面WebSocket连接成功');
        this.setupWebSocketListeners();
        // 发送认证信息
        voiceWSManager.send({
          type: 'auth',
          userId: this.data.localUserInfo.id,
          targetUserId: this.data.targetUserId,
          service: 'voice'
        });
      },
      onMessage: this.handleVoiceMessage.bind(this),
      onClose: () => {
        console.log('语音通话页面WebSocket连接关闭');
      },
      onError: (error) => {
        console.error('语音通话页面WebSocket错误:', error);
        wx.showToast({
          title: '语音连接失败',
          icon: 'none'
        });
      },
      reconnectInterval: 3000,
      maxReconnectAttempts: 3
    });

    app.globalData.voiceWSManager = voiceWSManager;
    voiceWSManager.connect();
  },

  /**
   * 处理语音消息
   */
  handleVoiceMessage(message) {
    try {
      if (typeof message.data === 'string') {
        // 检查是否为错误消息
        if (message.data.startsWith('抱歉，处理您的请求时发生了错误') || 
            message.data.startsWith('处理失败:') || 
            message.data.startsWith('识别失败:') || 
            message.data.startsWith('AI处理失败:')) {
          console.error('语音通话服务器错误:', message.data);
          wx.showToast({
            title: '语音服务错误，请稍后重试',
            icon: 'none'
          });
          return;
        }
        
        const data = JSON.parse(message.data);
        
        switch (data.type) {
          case 'voice_call_end':
            this.handleCallEnd();
            break;
          case 'voice_call_connected':
            this.handleCallConnected();
            break;
          case 'voice_call_failed':
            this.handleCallFailed();
            break;
          case 'start_recording':
            // 开始录制PCM音频数据
            this.startAudioRecording();
            break;
          case 'stop_recording':
            // 停止录制PCM音频数据
            this.stopAudioRecording();
            break;
          case 'ping':
            // 心跳请求，发送pong响应
            console.log('收到心跳ping，发送pong响应');
            const app = getApp();
            if (app.globalData.voiceWSManager && app.globalData.voiceWSManager.isConnected) {
              app.globalData.voiceWSManager.send({
                type: 'pong',
                timestamp: Date.now(),
                originalTimestamp: data.timestamp
              });
            }
            break;
          case 'pong':
            // 心跳响应，记录延迟
            const latency = Date.now() - data.originalTimestamp;
            console.log('收到心跳pong，延迟:', latency, 'ms');
            this.lastHeartbeatTime = Date.now();
            break;
          default:
            console.log('未知语音通话消息类型:', data.type);
        }
      } else if (message.data instanceof ArrayBuffer) {
        // 处理接收到的PCM音频数据
        console.log('收到PCM音频数据，长度:', message.data.byteLength);
        this.playPCMAudio(message.data);
      } else if (message.data instanceof Blob) {
        // 处理Blob格式的音频数据
        console.log('收到Blob音频数据，大小:', message.data.size);
        // 转换为ArrayBuffer后播放
        const reader = new FileReader();
        reader.onload = (e) => {
          this.playPCMAudio(e.target.result);
        };
        reader.readAsArrayBuffer(message.data);
      }
    } catch (error) {
      console.error('解析语音通话消息失败:', error, '原始消息:', message.data);
    }
  },

  /**
   * 处理通话连接成功
   */
  handleCallConnected() {
    this.setData({ callStatus: 'connected' });
    wx.showToast({
      title: '通话已连接',
      icon: 'none'
    });
  },

  /**
   * 处理通话失败
   */
  handleCallFailed() {
    wx.showToast({
      title: '通话连接失败',
      icon: 'none'
    });
    this.endCall();
  },

  /**
   * 处理通话结束
   */
  handleCallEnd() {
    wx.showToast({
      title: '通话已结束',
      icon: 'none'
    });
    this.endCall();
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
    
    // 发送静音状态到对方
    const app = getApp();
    if (app.globalData.voiceWSManager && app.globalData.voiceWSManager.isConnected) {
      app.globalData.voiceWSManager.send({
        type: 'voice_mute_status',
        isMuted: isMuted,
        userId: this.data.localUserInfo.id,
        targetUserId: this.data.targetUserId
      });
    }
  },

  /**
   * 切换扬声器
   */
  toggleSpeaker() {
    const isSpeaker = !this.data.isSpeaker;
    this.setData({ isSpeaker });
    
    // 这里可以调用微信小程序的音频接口切换扬声器
    if (wx.setInnerAudioOption) {
      wx.setInnerAudioOption({
        speakerOn: isSpeaker
      });
    }
  },

  /**
   * 切换键盘（显示/隐藏控制按钮）
   */
  toggleKeyboard() {
    this.setData({
      showControls: !this.data.showControls
    });
  },

  /**
   * 挂断通话
   */
  hangUp() {
    wx.showModal({
      title: '结束通话',
      content: '确定要结束通话吗？',
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
    // 停止音频录制
    this.stopAudioRecording();
    
    // 发送通话结束消息
    const app = getApp();
    if (app.globalData.voiceWSManager && app.globalData.voiceWSManager.isConnected) {
      app.globalData.voiceWSManager.send({
        type: 'voice_call_end',
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
    this.stopAudioRecording();
  },

  /**
   * 页面卸载时
   */
  onUnload() {
    this.stopAudioRecording();
  },

  /**
   * 页面隐藏时
   */
  onHide() {
    this.stopCallTimer();
  }
})