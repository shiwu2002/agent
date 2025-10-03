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
    timer: null,
    audioContext: null,
    innerAudioContext: null,
    currentAudioSource: null,
    isPlayingTTS: false,
    lastHeartbeatTime: 0
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
    
    // 获取录音管理器
    const recorderManager = wx.getRecorderManager();
    
    // 设置录音参数 - 使用PCM格式，16kHz采样率
    const recordingOptions = {
      duration: 60000, // 最长60秒
      sampleRate: 16000, // 16kHz采样率，符合后端要求
      numberOfChannels: 1, // 单声道
      encodeBitRate: 64000, // 编码码率，设置为64000（在24000-96000范围内）
      format: 'pcm', // PCM格式
      frameSize: 2 // 每帧2KB，约为125ms的音频数据
    };
    
    // 监听录音帧数据事件
    recorderManager.onFrameRecorded((res) => {
      const { frameBuffer } = res;
      
      // 验证音频数据有效性
      if (frameBuffer && frameBuffer.byteLength > 0) {
        // 检查是否为有效的PCM数据（至少包含一些非零数据）
        const dataView = new DataView(frameBuffer);
        let hasValidData = false;
        
        // 简单检查：查看前100个样本中是否有非零数据
        const sampleCount = Math.min(100, frameBuffer.byteLength / 2);
        for (let i = 0; i < sampleCount; i++) {
          const sample = dataView.getInt16(i * 2, true);
          if (sample !== 0) {
            hasValidData = true;
            break;
          }
        }
        
        if (hasValidData) {
          // 发送PCM音频数据到服务器
          this.safeSendMessage(frameBuffer);
        } else {
          console.warn('跳过无效音频帧：数据全为零');
        }
      }
    });
    
    // 监听录音开始事件
    recorderManager.onStart(() => {
      console.log('PCM音频录制开始');
      this.setData({ recordingStatus: 'recording' });
    });
    
    // 监听录音错误事件
    recorderManager.onError((error) => {
      console.error('PCM音频录制错误:', error);
      this.setData({ recordingStatus: 'idle' });
      wx.showToast({
        title: '音频录制失败',
        icon: 'none'
      });
    });
    
    // 监听录音停止事件
    recorderManager.onStop((res) => {
      console.log('PCM音频录制停止:', res);
      this.setData({ recordingStatus: 'idle' });
    });
    
    // 开始录音
    recorderManager.start(recordingOptions);
    console.log('开始PCM音频录制，参数:', recordingOptions);
  },

  /**
   * 停止录制PCM音频数据
   */
  stopAudioRecording() {
    console.log('停止录制PCM音频数据');
    
    // 停止录音
    const recorderManager = wx.getRecorderManager();
    recorderManager.stop();
    
    // 通知服务器用户停止说话，可以开始处理并生成AI回复
    const app = getApp();
    if (app.globalData.voiceWSManager && app.globalData.voiceWSManager.isConnected) {
      const endMessage = {
        type: 'user_speaking_end',
        senderId: this.data.localUserInfo.id,
        targetId: this.data.targetUserId,
        timestamp: Date.now()
      };
      
      this.safeSendMessage(endMessage);
    }
    
    this.setData({ recordingStatus: 'idle' });
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
    
    // 使用页面内部定义的WebSocketManager，避免模块加载问题
    const voiceWSManager = new WebSocketManager({
      url: `ws://localhost:8080/ws/voice?userId=${userId}`,
      onOpen: () => {
        console.log('语音通话页面WebSocket连接成功');
        this.setupWebSocketListeners();
        // 发送认证信息
        this.safeSendMessage({
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
   * 安全发送WebSocket消息（防止发送空对象或无效数据）
   */
  safeSendMessage(message) {
    const app = getApp();
    if (!app.globalData.voiceWSManager || !app.globalData.voiceWSManager.isConnected) {
      console.error('WebSocket未连接，无法发送消息');
      return false;
    }
    
    try {
      // 验证消息不为空
      if (!message) {
        console.warn('跳过发送空消息');
        return false;
      }
      
      // 验证消息类型
      if (typeof message === 'object') {
        if (!message.type) {
          console.warn('跳过发送无类型的消息:', message);
          return false;
        }
        
        // 验证特定消息类型的必需字段
        switch (message.type) {
          case 'auth':
            if (!message.userId || !message.targetUserId) {
              console.warn('跳过发送无效的认证消息:', message);
              return false;
            }
            break;
          case 'voice_call_end':
          case 'user_speaking_end':
          case 'voice_mute_status':
            if (!message.senderId || !message.targetUserId || !message.targetId) {
              // 检查是否有targetId或targetUserId
              if (!message.targetId && !message.targetUserId) {
                console.warn('跳过发送无效的消息（缺少目标ID）:', message);
                return false;
              }
            }
            break;
        }
        
        // 将对象转换为JSON字符串
        const messageStr = JSON.stringify(message);
        console.log('发送WebSocket消息:', messageStr);
        return app.globalData.voiceWSManager.send(messageStr);
      } else if (typeof message === 'string') {
        // 字符串消息直接发送
        console.log('发送WebSocket字符串消息:', message);
        return app.globalData.voiceWSManager.send(message);
      } else if (message instanceof ArrayBuffer) {
        // 二进制数据直接发送（PCM音频数据）
        console.log('发送WebSocket二进制消息，长度:', message.byteLength);
        return app.globalData.voiceWSManager.send(message);
      } else {
        console.warn('跳过发送未知类型的消息:', message);
        return false;
      }
    } catch (error) {
      console.error('发送消息异常:', error);
      return false;
    }
  },

  /**
   * 处理语音消息
   */
  handleVoiceMessage(message) {
    try {
      if (typeof message.data === 'string') {
        // 检查是否为心跳消息（纯文本格式）
        if (message.data === 'ping' || message.data === 'pong' || 
            message.data === 'AI: ping' || message.data === 'AI: pong') {
          console.log('收到心跳消息（纯文本）:', message.data);
          return;
        }
        
        // 检查是否为TTS文本消息（用户说话后的AI回复）
        if (message.data.startsWith('AI: ') && !message.data.startsWith('AI: ping') && !message.data.startsWith('AI: pong')) {
          console.log('收到AI文本回复:', message.data);
          // 显示AI正在回复的状态
          wx.showToast({
            title: 'AI思考中...',
            icon: 'none',
            duration: 2000
          });
          return;
        }
        
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
              const pongMessage = {
                type: 'pong',
                timestamp: Date.now(),
                originalTimestamp: data.timestamp
              };
              app.globalData.voiceWSManager.send(JSON.stringify(pongMessage));
            }
            break;
          case 'pong':
            // 心跳响应，记录延迟
            const latency = Date.now() - data.originalTimestamp;
            console.log('收到心跳pong，延迟:', latency, 'ms');
            this.lastHeartbeatTime = Date.now();
            break;
          case 'tts_audio':
            // TTS生成的语音数据
            console.log('收到TTS语音数据');
            this.handleTTSVoiceData(data);
            break;
          case 'ai_response':
            // AI回复的语音数据（兼容格式）
            console.log('收到AI回复语音数据');
            this.handleTTSVoiceData(data);
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
   * 处理TTS语音数据
   */
  handleTTSVoiceData(data) {
    try {
      console.log('处理TTS语音数据:', data);
      
      // 停止当前正在播放的音频
      if (this.data.isPlayingTTS) {
        this.stopAudioPlayback();
      }
      
      // 设置正在播放状态
      this.setData({ isPlayingTTS: true });
      
      if (data.audioData) {
        // 如果audioData是Base64格式的音频数据
        const audioData = data.audioData;
        console.log('收到Base64音频数据，长度:', audioData.length);
        
        // 将Base64转换为ArrayBuffer
        const arrayBuffer = wx.base64ToArrayBuffer(audioData);
        
        // 直接播放音频
        this.playPCMAudio(arrayBuffer);
        
      } else if (data.audioUrl) {
        // 如果提供的是音频URL
        console.log('收到音频URL:', data.audioUrl);
        
        // 下载音频文件然后播放
        this.downloadAndPlayAudio(data.audioUrl);
        
      } else if (data.text) {
        // 如果收到的是文本，可以在这里调用TTS（如果需要）
        console.log('收到文本内容，需要TTS转换:', data.text);
        
        // 显示正在播放的提示
        wx.showToast({
          title: 'AI回复中...',
          icon: 'none',
          duration: 2000
        });
        
        // 重置播放状态
        this.setData({ isPlayingTTS: false });
        
      } else {
        console.warn('TTS语音数据格式未知:', data);
        // 重置播放状态
        this.setData({ isPlayingTTS: false });
      }
      
    } catch (error) {
      console.error('处理TTS语音数据失败:', error);
      wx.showToast({
        title: '语音播放失败',
        icon: 'none'
      });
      // 重置播放状态
      this.setData({ isPlayingTTS: false });
    }
  },

  /**
   * 下载并播放音频
   */
  downloadAndPlayAudio(audioUrl) {
    wx.downloadFile({
      url: audioUrl,
      success: (res) => {
        if (res.statusCode === 200) {
          console.log('音频下载成功:', res.tempFilePath);
          
          // 创建音频播放器
          const audioPlayer = wx.createInnerAudioContext();
          
          audioPlayer.src = res.tempFilePath;
          audioPlayer.obeyMuteSwitch = false;
          
          audioPlayer.onPlay(() => {
            console.log('开始播放TTS音频');
          });
          
          audioPlayer.onEnded(() => {
          console.log('TTS音频播放结束');
          audioPlayer.destroy();
          // 重置播放状态
          this.setData({ isPlayingTTS: false });
        });
        
        audioPlayer.onError((err) => {
          console.error('TTS音频播放失败:', err);
          audioPlayer.destroy();
          // 重置播放状态
          this.setData({ isPlayingTTS: false });
        });
          
          // 设置音量并播放
          audioPlayer.volume = this.data.isSpeaker ? 1.0 : 0.8;
          audioPlayer.play();
          
        } else {
          console.error('音频下载失败，状态码:', res.statusCode);
          wx.showToast({
            title: '音频下载失败',
            icon: 'none'
          });
        }
      },
      fail: (error) => {
        console.error('音频下载失败:', error);
        wx.showToast({
          title: '音频下载失败',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 停止当前音频播放
   */
  stopAudioPlayback() {
    try {
      // 停止Web Audio播放
      if (this.currentAudioSource) {
        try {
          this.currentAudioSource.stop();
        } catch (e) {
          // 忽略停止错误
        }
        this.currentAudioSource = null;
      }
      
      // 停止InnerAudioContext播放
      if (this.innerAudioContext) {
        this.innerAudioContext.stop();
      }
      
      console.log('音频播放已停止');
    } catch (error) {
      console.error('停止音频播放失败:', error);
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
   * 播放PCM音频数据
   */
  playPCMAudio(arrayBuffer) {
    try {
      console.log('开始播放PCM音频数据，长度:', arrayBuffer.byteLength);
      
      // 创建音频上下文
      if (!this.audioContext) {
        this.audioContext = wx.createWebAudioContext();
      }
      
      const audioContext = this.audioContext;
      
      // 解码音频数据
      audioContext.decodeAudioData(arrayBuffer.slice(0), (audioBuffer) => {
        console.log('音频解码成功，时长:', audioBuffer.duration, '秒');
        
        // 创建音频源
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        
        // 连接到输出
        source.connect(audioContext.destination);
        
        // 设置音量
        const gainNode = audioContext.createGain();
        gainNode.gain.value = this.data.isSpeaker ? 1.0 : 0.8;
        
        // 重新连接：源 -> 音量 -> 输出
        source.disconnect();
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // 播放音频
        source.start(0);
        
        // 监听播放结束
        source.onended = () => {
          console.log('PCM音频播放结束');
          // 重置播放状态
          this.setData({ isPlayingTTS: false });
          // 清除当前播放源
          this.currentAudioSource = null;
        };
        
        // 保存当前播放源，便于后续控制
        this.currentAudioSource = source;
        
      }, (error) => {
        console.error('音频解码失败:', error);
        // 如果解码失败，尝试使用InnerAudioContext播放
        this.playAudioWithInnerAudioContext(arrayBuffer);
      });
      
    } catch (error) {
      console.error('播放PCM音频失败:', error);
      // 如果Web Audio API失败，尝试使用InnerAudioContext
      this.playAudioWithInnerAudioContext(arrayBuffer);
    }
  },

  /**
   * 使用InnerAudioContext播放音频（备用方案）
   */
  playAudioWithInnerAudioContext(arrayBuffer) {
    try {
      console.log('使用InnerAudioContext播放音频');
      
      // 将ArrayBuffer转换为Base64
      const base64 = wx.arrayBufferToBase64(arrayBuffer);
      
      // 创建音频播放器
      if (!this.innerAudioContext) {
        this.innerAudioContext = wx.createInnerAudioContext();
        
        // 设置音频参数
        this.innerAudioContext.obeyMuteSwitch = false; // 不跟随系统静音
        this.innerAudioContext.autoplay = false;
        
        // 监听事件
        this.innerAudioContext.onPlay(() => {
          console.log('InnerAudioContext开始播放');
        });
        
        this.innerAudioContext.onEnded(() => {
          console.log('InnerAudioContext播放结束');
          // 重置播放状态
          this.setData({ isPlayingTTS: false });
        });
        
        this.innerAudioContext.onError((err) => {
          console.error('InnerAudioContext播放错误:', err);
          // 重置播放状态
          this.setData({ isPlayingTTS: false });
        });
      }
      
      // 设置音频源（需要转换为data URL）
      const dataUrl = 'data:audio/wav;base64,' + base64;
      this.innerAudioContext.src = dataUrl;
      
      // 设置音量
      this.innerAudioContext.volume = this.data.isSpeaker ? 1.0 : 0.8;
      
      // 播放
      this.innerAudioContext.play();
      
    } catch (error) {
      console.error('InnerAudioContext播放音频失败:', error);
      wx.showToast({
        title: '音频播放失败',
        icon: 'none'
      });
    }
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
      const muteMessage = {
        type: 'voice_mute_status',
        isMuted: isMuted,
        senderId: this.data.localUserInfo.id,
        targetUserId: this.data.targetUserId
      };
      
      this.safeSendMessage(muteMessage);
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
    
    // 停止音频播放
    this.stopAudioPlayback();
    
    // 发送通话结束消息
    const app = getApp();
    if (app.globalData.voiceWSManager && app.globalData.voiceWSManager.isConnected) {
      const endCallMessage = {
        type: 'voice_call_end',
        senderId: this.data.localUserInfo.id,
        targetUserId: this.data.targetUserId,
        timestamp: Date.now()
      };
      
      this.safeSendMessage(endCallMessage);
    }

    this.stopCallTimer();
    
    // 清理音频上下文
    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (e) {
        // 忽略关闭错误
      }
      this.audioContext = null;
    }
    
    if (this.innerAudioContext) {
      this.innerAudioContext.destroy();
      this.innerAudioContext = null;
    }
    
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
    this.stopAudioPlayback();
    
    // 清理音频上下文
    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (e) {
        // 忽略关闭错误
      }
      this.audioContext = null;
    }
    
    if (this.innerAudioContext) {
      this.innerAudioContext.destroy();
      this.innerAudioContext = null;
    }
  },

  /**
   * 页面隐藏时
   */
  onHide() {
    this.stopCallTimer();
    this.stopAudioPlayback();
  }
})