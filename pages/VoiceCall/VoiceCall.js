// pages/VoiceCall/VoiceCall.js
const VoiceWebSocketManager = require('../../utils/voiceWebsocket.js');

Page({
  /**
   * 页面的初始数据
   */
  data: {
    targetUser: {
      id: '',
      name: '对方',
      avatar: '/pages/images/用户头像.png'
    },
    callStatus: '正在连接...',
    connectionStatus: '连接中',
    callDuration: 0,
    isConnected: false,
    isRecording: false,
    isMuted: false,
    isSpeakerOn: true,
    voiceWsManager: null,
    callTimer: null,
    audioContext: null,
    recorderManager: null,
    audioBuffer: []
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('VoiceCall onLoad options:', options);
    
    // 获取通话参数
    if (options.targetUserId) {
      this.setData({
        'targetUser.id': options.targetUserId,
        'targetUser.name': options.targetUserName || '对方'
      });
    }
    
    // 初始化音频上下文
    this.initAudioContext();
    
    // 初始化录音管理器
    this.initRecorderManager();
    
    // 初始化WebSocket连接
    this.initVoiceWebSocket();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 页面显示时的操作
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
    // 页面隐藏时停止录音
    if (this.data.isRecording) {
      this.stopRecording();
    }
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    // 页面卸载时发送关闭确认消息
    if (this.data.voiceWsManager && this.data.voiceWsManager.isConnected()) {
      this.data.voiceWsManager.sendControlCommand('close_websocket');
    }
    
    // 清除心跳定时器
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    // 页面卸载时清理资源
    this.cleanup();
  },

  /**
   * 初始化音频上下文
   */
  initAudioContext() {
    try {
      const innerAudioContext = wx.createInnerAudioContext();
      innerAudioContext.obeyMuteSwitch = false; // 不遵循静音开关
      
      innerAudioContext.onPlay(() => {
        console.log('音频开始播放');
      });
      
      innerAudioContext.onStop(() => {
        console.log('音频停止播放');
      });
      
      innerAudioContext.onEnded(() => {
        console.log('音频播放结束');
      });
      
      innerAudioContext.onError((res) => {
        console.error('音频播放错误:', res.errMsg);
      });
      
      this.setData({
        audioContext: innerAudioContext
      });
    } catch (error) {
      console.error('初始化音频上下文失败:', error);
    }
  },

  /**
   * 初始化录音管理器
   */
  initRecorderManager() {
    try {
      const recorderManager = wx.getRecorderManager();
      
      recorderManager.onStart(() => {
        console.log('录音开始');
        this.setData({
          isRecording: true
        });
      });
      
      recorderManager.onStop((res) => {
        console.log('录音停止', res);
        this.setData({
          isRecording: false
        });
      });
      
      recorderManager.onFrameRecorded((res) => {
        // 实时获取录音分片数据
        const { frameBuffer } = res;
        console.log('录音分片数据长度:', frameBuffer.byteLength);
        
        // 如果没有静音，发送音频数据
        if (!this.data.isMuted && this.data.voiceWsManager && this.data.voiceWsManager.isConnected()) {
          this.data.voiceWsManager.sendAudioData(frameBuffer);
        }
      });
      
      recorderManager.onError((res) => {
        console.error('录音错误:', res);
        this.setData({
          isRecording: false
        });
        wx.showToast({
          title: '录音失败',
          icon: 'none'
        });
      });
      
      this.setData({
        recorderManager: recorderManager
      });
    } catch (error) {
      console.error('初始化录音管理器失败:', error);
    }
  },

  /**
   * 初始化语音WebSocket连接
   */
  initVoiceWebSocket() {
    try {
      // 获取全局认证信息
      const app = getApp();
      const globalData = app.globalData || {};
      const userId = globalData.userId || 'default_user';
      const aiSessionId = globalData.aiSessionId || 'default_session';
      
      // 构建WebSocket URL
      const url = `ws://localhost:8080/ws/voice?userId=${userId}&aiSessionId=${aiSessionId}`;
      
      const voiceWsManager = new VoiceWebSocketManager({
        url: url,
        onOpen: this.onVoiceWebSocketOpen.bind(this),
        onMessage: this.onVoiceWebSocketMessage.bind(this),
        onAudioData: this.onVoiceWebSocketAudioData.bind(this),
        onClose: this.onVoiceWebSocketClose.bind(this),
        onError: this.onVoiceWebSocketError.bind(this),
        reconnectInterval: 3000,
        maxReconnectAttempts: 5
      });
      
      this.setData({
        voiceWsManager: voiceWsManager
      });
      
      voiceWsManager.connect();
      
      // 发送连接确认消息，告诉后端启动对应的WebSocket服务
      setTimeout(() => {
        if (voiceWsManager.isConnected()) {
          voiceWsManager.sendControlCommand('open_websocket');
        }
      }, 100);

      // 启动心跳定时器
      this.startHeartbeat();
    } catch (error) {
      console.error('初始化语音WebSocket失败:', error);
      this.setData({
        callStatus: '连接失败',
        connectionStatus: '已断开'
      });
    }
  },

  /**
   * WebSocket连接成功
   */
  onVoiceWebSocketOpen() {
    console.log('语音WebSocket连接成功');
    this.setData({
      isConnected: true,
      callStatus: '通话中',
      connectionStatus: '已连接'
    });
    
    // 发送开始识别命令
    this.data.voiceWsManager.sendControlCommand('start_recognition');
    
    // 启动通话计时器
    this.startCallTimer();
    
    // 自动开始录音
    this.startRecording();
  },

  /**
   * 收到WebSocket文本消息
   */
  onVoiceWebSocketMessage(event) {
    console.log('收到语音WebSocket消息:', event.data);
    
    try {
      const data = JSON.parse(event.data);
      
      // 根据消息类型处理
      switch (data.type) {
        case 'PING':
          // 回复PONG
          this.data.voiceWsManager.sendPong();
          break;
        case 'PONG':
          // 心跳响应，无需特殊处理
          console.log('收到心跳响应');
          break;
        case 'CONTROL':
          this.handleControlMessage(data.content);
          break;
        case 'AUDIO':
          // 音频文本消息，作为控制消息处理
          this.handleControlMessage(data.content);
          break;
        case 'ERROR':
          // 错误消息处理
          this.handleErrorMessage(data.content);
          break;
        case 'TEXT':
          // 文本消息处理
          this.handleTextMessage(data.content);
          break;
        default:
          console.log('未知消息类型:', data.type);
      }
    } catch (e) {
      console.log('解析消息失败:', e);
    }
  },

  /**
   * 收到WebSocket音频数据
   */
  onVoiceWebSocketAudioData(data) {
    console.log('收到音频数据，长度:', data.byteLength);
    // 将音频数据添加到缓冲区
    this.appendToAudioBuffer(data);
  },

  /**
   * WebSocket连接关闭
   */
  onVoiceWebSocketClose() {
    console.log('语音WebSocket连接关闭');
    this.setData({
      isConnected: false,
      callStatus: '连接已断开',
      connectionStatus: '已断开'
    });
  },

  /**
   * WebSocket错误
   */
  onVoiceWebSocketError(error) {
    console.error('语音WebSocket错误:', error);
    this.setData({
      isConnected: false,
      callStatus: '连接错误',
      connectionStatus: '已断开'
    });
  },

  /**
   * 处理控制消息
   */
  handleControlMessage(content) {
    if (content === 'connected') {
      this.setData({
        callStatus: '通话中',
        connectionStatus: '已连接'
      });
    } else if (content.startsWith('partial:')) {
      const partialText = content.substring(8);
      this.setData({
        callStatus: `识别中: ${partialText}`
      });
    } else if (content.startsWith('final:')) {
      const finalText = content.substring(6);
      this.setData({
        callStatus: finalText || '通话中'
      });
    } else if (content.startsWith('error:')) {
      const error = content.substring(6);
      console.error('语音识别错误:', error);
      this.setData({
        callStatus: '识别错误'
      });
    } else {
      this.setData({
        callStatus: content
      });
    }
  },

  /**
   * 处理文本消息
   */
  handleTextMessage(content) {
    console.log('收到文本消息:', content);
    // 文本消息处理逻辑可以在这里添加
  },

  /**
   * 处理错误消息
   */
  handleErrorMessage(content) {
    console.error('WebSocket错误:', content);
    this.setData({
      callStatus: `错误: ${content}`,
      connectionStatus: '连接错误'
    });
    
    // 显示错误提示
    wx.showToast({
      title: '连接错误',
      icon: 'none'
    });
  },

  /**
   * 开始录音
   */
  startRecording() {
    if (!this.data.recorderManager) {
      console.warn('录音管理器未初始化');
      return;
    }
    
    if (!this.data.isConnected) {
      wx.showToast({
        title: '未连接到服务器',
        icon: 'none'
      });
      return;
    }
    
    try {
      // 开始录音
      this.data.recorderManager.start({
        duration: 60000, // 最长1分钟
        sampleRate: 16000, // 16kHz采样率
        numberOfChannels: 1, // 单声道
        encodeBitRate: 96000, // 比特率
        format: 'pcm', // PCM格式
        frameSize: 2048 // 帧大小
      });
      
      this.setData({
        isRecording: true
      });
    } catch (error) {
      console.error('开始录音失败:', error);
      wx.showToast({
        title: '录音启动失败',
        icon: 'none'
      });
    }
  },

  /**
   * 停止录音
   */
  stopRecording() {
    if (!this.data.recorderManager) {
      console.warn('录音管理器未初始化');
      return;
    }
    
    if (this.data.isRecording) {
      this.data.recorderManager.stop();
      this.setData({
        isRecording: false
      });
    }
  },

  /**
   * 切换静音状态
   */
  toggleMute() {
    const newMuted = !this.data.isMuted;
    this.setData({
      isMuted: newMuted
    });
    
    wx.showToast({
      title: newMuted ? '已静音' : '已取消静音',
      icon: 'none'
    });
  },

  /**
   * 切换免提状态
   */
  toggleSpeaker() {
    const newSpeakerOn = !this.data.isSpeakerOn;
    this.setData({
      isSpeakerOn: newSpeakerOn
    });
    
    // 在微信小程序中，免提设置可能需要通过系统API实现
    // 这里只是一个状态切换的示例
    wx.showToast({
      title: newSpeakerOn ? '免提已开启' : '免提已关闭',
      icon: 'none'
    });
  },

  /**
   * 挂断通话
   */
  hangupCall() {
    wx.showModal({
      title: '挂断通话',
      content: '确定要挂断通话吗？',
      success: (res) => {
        if (res.confirm) {
          this.cleanup();
          wx.navigateBack();
        }
      }
    });
  },

  /**
   * 启动通话计时器
   */
  startCallTimer() {
    if (this.data.callTimer) {
      clearInterval(this.data.callTimer);
    }
    
    const timer = setInterval(() => {
      this.setData({
        callDuration: this.data.callDuration + 1
      });
    }, 1000);
    
    this.setData({
      callTimer: timer
    });
  },

  /**
   * 启动心跳定时器
   */
  startHeartbeat() {
    // 清除现有的心跳定时器
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    
    // 每30秒发送一次PING心跳消息
    this.heartbeatTimer = setInterval(() => {
      if (this.data.voiceWsManager && this.data.voiceWsManager.isConnected()) {
        this.data.voiceWsManager.sendPing();
      }
    }, 30000);
  },

  /**
   * 将音频数据添加到缓冲区
   */
  appendToAudioBuffer(data) {
    // 初始化音频缓冲区
    if (!this.data.audioBuffer) {
      this.setData({
        audioBuffer: []
      });
    }
    
    // 将新的音频数据添加到缓冲区
    const newBuffer = [...this.data.audioBuffer, data];
    this.setData({
      audioBuffer: newBuffer
    });
    
    // 如果缓冲区中有足够的数据，开始播放
    if (newBuffer.length >= 5) { // 例如，积累5个数据块后开始播放
      this.playAudioFromBuffer();
    }
  },

  /**
   * 从缓冲区播放音频
   */
  playAudioFromBuffer() {
    if (!this.data.audioContext || this.data.audioBuffer.length === 0) {
      return;
    }
    
    // 合并缓冲区中的所有音频数据
    const mergedBuffer = this.mergeAudioBuffers();
    
    // 清空缓冲区
    this.setData({
      audioBuffer: []
    });
    
    // 在微信小程序中播放PCM音频数据需要特殊处理
    // 这里简化处理，实际应用中可能需要转换为WAV格式
    try {
      // 创建临时文件路径
      const fs = wx.getFileSystemManager();
      const tempFilePath = `${wx.env.USER_DATA_PATH}/temp_audio.pcm`;
      
      // 将音频数据写入临时文件
      fs.writeFile({
        filePath: tempFilePath,
        data: mergedBuffer,
        success: () => {
          console.log('音频数据已写入临时文件');
          // 播放音频文件
          this.playAudioFile(tempFilePath);
        },
        fail: (error) => {
          console.error('写入音频文件失败:', error);
        }
      });
    } catch (error) {
      console.error('播放音频失败:', error);
    }
  },

  /**
   * 合并音频缓冲区
   */
  mergeAudioBuffers() {
    // 合并所有音频数据块
    const totalLength = this.data.audioBuffer.reduce((acc, buffer) => acc + buffer.byteLength, 0);
    const mergedBuffer = new Uint8Array(totalLength);
    
    let offset = 0;
    for (const buffer of this.data.audioBuffer) {
      mergedBuffer.set(new Uint8Array(buffer), offset);
      offset += buffer.byteLength;
    }
    
    return mergedBuffer.buffer;
  },

  /**
   * 播放音频文件
   */
  playAudioFile(filePath) {
    if (!this.data.audioContext) {
      console.warn('音频上下文未初始化');
      return;
    }
    
    try {
      this.data.audioContext.src = filePath;
      this.data.audioContext.play();
    } catch (error) {
      console.error('播放音频文件失败:', error);
    }
  },

  /**
   * 切换静音状态
   */
  toggleMute() {
    const newMuted = !this.data.isMuted;
    this.setData({
      isMuted: newMuted
    });
    
    wx.showToast({
      title: newMuted ? '已静音' : '已取消静音',
      icon: 'none'
    });
  },

  /**
   * 切换免提状态
   */
  toggleSpeaker() {
    const newSpeakerOn = !this.data.isSpeakerOn;
    this.setData({
      isSpeakerOn: newSpeakerOn
    });
    
    // 在微信小程序中，免提设置可能需要通过系统API实现
    // 这里只是一个状态切换的示例
    wx.showToast({
      title: newSpeakerOn ? '免提已开启' : '免提已关闭',
      icon: 'none'
    });
  },

  /**
   * 挂断通话
   */
  hangupCall() {
    wx.showModal({
      title: '挂断通话',
      content: '确定要挂断通话吗？',
      success: (res) => {
        if (res.confirm) {
          this.cleanup();
          wx.navigateBack();
        }
      }
    });
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    // 页面卸载时发送关闭确认消息
    if (this.data.voiceWsManager && this.data.voiceWsManager.isConnected()) {
      this.data.voiceWsManager.sendControlCommand('close_websocket');
    }
    
    // 页面卸载时清理资源
    this.cleanup();
  },

  /**
   * 清理资源
   */
  cleanup() {
    // 停止录音
    if (this.data.isRecording) {
      this.stopRecording();
    }
    
    // 停止通话计时器
    if (this.data.callTimer) {
      clearInterval(this.data.callTimer);
      this.setData({
        callTimer: null
      });
    }
    
    // 清除心跳定时器
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    // 断开WebSocket连接
    if (this.data.voiceWsManager) {
      this.data.voiceWsManager.disconnect();
    }
    
    // 停止音频播放
    if (this.data.audioContext) {
      this.data.audioContext.stop();
    }
    
    // 清空音频缓冲区
    this.setData({
      audioBuffer: []
    });
  },

  /**
   * 格式化时间
   */
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
});