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
    lastHeartbeatTime: 0,
    recordingStatus: 'idle', // idle, recording, processing
    aiReplyText: '', // AI回复文本
    isRemoteSpeaking: false, // 对方是否正在说话
    isProcessingAI: false, // 是否正在处理AI
    audioSequence: 0, // 音频帧序列号
    recorderManager: null // 录音管理器实例
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
   * 计算音频级别（用于语音活动检测）
   */
  calculateAudioLevel(pcmData) {
    if (!pcmData || pcmData.byteLength === 0) return 0;
    
    try {
      const dataView = new DataView(pcmData);
      const sampleCount = pcmData.byteLength / 2;
      let sum = 0;
      
      // 计算RMS（均方根）值
      for (let i = 0; i < sampleCount; i++) {
        const sample = dataView.getInt16(i * 2, true) / 32768.0; // 归一化到-1到1
        sum += sample * sample;
      }
      
      const rms = Math.sqrt(sum / sampleCount);
      return rms;
    } catch (error) {
      console.error('计算音频级别失败:', error);
      return 0;
    }
  },

  /**
   * 检查音频权限
   */
  checkAudioPermissions() {
    return new Promise((resolve, reject) => {
      // 检查是否支持录音
      if (!wx.getRecorderManager) {
        reject(new Error('当前环境不支持录音功能'));
        return;
      }
      
      // 检查授权状态
      wx.getSetting({
        success: (res) => {
          console.log('当前授权状态:', res.authSetting);
          
          // 检查录音权限
          if (!res.authSetting['scope.record']) {
            console.log('需要请求录音权限');
            // 请求录音权限
            wx.authorize({
              scope: 'scope.record',
              success: () => {
                console.log('录音权限授权成功');
                resolve();
              },
              fail: (error) => {
                console.error('录音权限授权失败:', error);
                // 引导用户去设置页面开启权限
                wx.showModal({
                  title: '需要麦克风权限',
                  content: '语音通话需要麦克风权限，请在设置中开启',
                  showCancel: true,
                  confirmText: '去设置',
                  success: (modalRes) => {
                    if (modalRes.confirm) {
                      wx.openSetting({
                        success: (settingRes) => {
                          if (settingRes.authSetting['scope.record']) {
                            console.log('用户在设置中开启了录音权限');
                            resolve();
                          } else {
                            reject(new Error('用户拒绝录音权限'));
                          }
                        },
                        fail: reject
                      });
                    } else {
                      reject(new Error('用户拒绝前往设置'));
                    }
                  }
                });
              }
            });
          } else {
            console.log('已有录音权限');
            resolve();
          }
        },
        fail: reject
      });
    });
  },

  /**
   * 计算音频级别（用于语音活动检测）
   */
  calculateAudioLevel(pcmData) {
    if (!pcmData || pcmData.byteLength === 0) return 0;
    
    try {
      const dataView = new DataView(pcmData);
      const sampleCount = pcmData.byteLength / 2;
      let sum = 0;
      
      // 计算RMS（均方根）值
      for (let i = 0; i < sampleCount; i++) {
        const sample = dataView.getInt16(i * 2, true) / 32768.0; // 归一化到-1到1
        sum += sample * sample;
      }
      
      const rms = Math.sqrt(sum / sampleCount);
      return rms;
    } catch (error) {
      console.error('计算音频级别失败:', error);
      return 0;
    }
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
    
    // 检查权限并初始化音频
    this.checkAudioPermissions().then(() => {
      // 初始化音频录制和播放
      this.initAudioContext();
    }).catch((error) => {
      console.error('音频权限检查失败:', error);
      wx.showToast({
        title: '需要麦克风权限才能进行语音通话',
        icon: 'none',
        duration: 3000
      });
    });
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
   * 开始音频录制 - 确保16位PCM、16000Hz、单声道格式
   */
  startAudioRecording() {
    const app = getApp();
    
    // 如果已经在录音，先停止
    if (this.data.recordingStatus === 'recording') {
      console.log('已经在录音中，先停止当前录音');
      this.stopAudioRecording();
      return;
    }
    
    // 获取录音管理器（只获取一次，避免重复创建）
    if (!this.data.recorderManager) {
      this.setData({ recorderManager: wx.getRecorderManager() });
    }
    const recorderManager = this.data.recorderManager;
    
    // 设置录音参数 - 严格按照16位PCM、16000Hz、单声道格式
    const recordingOptions = {
      duration: 60000, // 最长60秒
      sampleRate: 16000, // 16kHz采样率，符合语音识别标准
      numberOfChannels: 1, // 单声道
      encodeBitRate: 128000, // 提高编码码率确保质量，128kbps
      format: 'pcm', // PCM格式，16位量化
      frameSize: 2 // 每帧2KB，约为125ms的音频数据
    };
    
    console.log('开始16位PCM音频录制，参数:', recordingOptions);
    console.log('音频格式确认: 16位PCM, 16000Hz, 单声道, 帧大小:', recordingOptions.frameSize, 'KB');
    
    // 监听录音帧数据事件（只设置一次，避免重复绑定）
    if (!this._frameListenerSet) {
      this._frameListenerSet = true;
      
      recorderManager.onFrameRecorded((res) => {
        const { frameBuffer } = res;
        
        // 验证音频数据有效性 - 确保是16位PCM数据
        if (frameBuffer && frameBuffer.byteLength > 0) {
          // 验证数据格式：16位PCM数据应该是偶数个字节
          if (frameBuffer.byteLength % 2 !== 0) {
            console.warn('音频数据长度异常，不是16位PCM格式:', frameBuffer.byteLength);
            return;
          }
          
          // 计算音频级别进行语音活动检测（VAD）
          const audioLevel = this.calculateAudioLevel(frameBuffer);
          
          // 更新序列号
          this.setData({ audioSequence: (this.data.audioSequence + 1) % 1000000 });
          
          // 详细的音频数据调试信息
          const sampleCount = frameBuffer.byteLength / 2; // 16位 = 2字节/样本
          const durationMs = (sampleCount / 16000) * 1000; // 16000Hz采样率
          
          console.log(`音频帧#${this.data.audioSequence}: 长度=${frameBuffer.byteLength}字节, 样本数=${sampleCount}, 时长=${durationMs.toFixed(1)}ms, 音频级别=${audioLevel.toFixed(4)}`);
          
          // 如果音频级别足够高，认为有语音活动
          if (audioLevel > 0.001) {
            this._lastVoiceActivity = Date.now();
            
            // 发送16位PCM音频数据到服务器
            if (app.globalData.voiceWSManager && app.globalData.voiceWSManager.isConnected) {
              console.log('发送16位PCM音频数据帧到服务器');
              
              // 直接发送二进制PCM数据（ArrayBuffer）
              const sendResult = app.globalData.voiceWSManager.send(frameBuffer);
              console.log('PCM数据发送结果:', sendResult ? '成功' : '失败', '数据长度:', frameBuffer.byteLength);
              
              // 每10帧发送一次元数据用于调试（减少网络开销）
              if (this.data.audioSequence % 10 === 0) {
                const audioMeta = {
                  type: 'voice_data_meta',
                  format: 'pcm_16bit',
                  sampleRate: 16000,
                  channels: 1,
                  bitDepth: 16,
                  timestamp: Date.now(),
                  frameSize: frameBuffer.byteLength,
                  sequence: this.data.audioSequence,
                  audioLevel: audioLevel,
                  sampleCount: sampleCount,
                  durationMs: durationMs
                };
                this.safeSendMessage(audioMeta);
                console.log('发送音频元数据:', audioMeta);
              }
            } else {
              console.warn('WebSocket未连接，无法发送音频数据');
            }
          } else {
            // 静音帧，偶尔发送以保持连接
            if (this.data.audioSequence % 50 === 0) {
              console.log('检测到静音帧，音频级别:', audioLevel.toFixed(4));
            }
          }
        } else {
          console.warn('收到空音频帧数据');
        }
      });
      
      recorderManager.onStart(() => {
        console.log('16位PCM音频录制开始');
        this.setData({ recordingStatus: 'recording' });
        wx.showToast({
          title: '开始录音 (16位PCM)',
          icon: 'none',
          duration: 1000
        });
      });
      
      recorderManager.onError((error) => {
        console.error('16位PCM音频录制错误:', error);
        this.setData({ recordingStatus: 'idle' });
        wx.showToast({
          title: '音频录制失败: ' + (error.errMsg || '未知错误'),
          icon: 'none',
          duration: 2000
        });
      });
      
      recorderManager.onStop(() => {
        console.log('16位PCM音频录制停止');
        this.setData({ recordingStatus: 'idle' });
      });
    }
    
    // 重要：实际开始录音
    try {
      console.log('正在启动16位PCM录音...');
      recorderManager.start(recordingOptions);
      console.log('已调用recorderManager.start()开始16位PCM录音');
    } catch (error) {
      console.error('启动16位PCM录音失败:', error);
      this.setData({ recordingStatus: 'idle' });
      wx.showToast({
        title: '启动录音失败: ' + (error.errMsg || '未知错误'),
        icon: 'none',
        duration: 2000
      });
    }
  },

  /**
   * 停止录制PCM音频数据
   */
  stopAudioRecording() {
    console.log('停止录制PCM音频数据');
    
    // 检查是否正在录音
    if (this.data.recordingStatus !== 'recording') {
      console.log('当前未在录音状态，无需停止');
      return;
    }
    
    try {
      // 停止录音
      const recorderManager = this.data.recorderManager || wx.getRecorderManager();
      recorderManager.stop();
      console.log('已调用recorderManager.stop()停止录音');
      
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
        console.log('已发送用户停止说话通知');
      }
      
      this.setData({ recordingStatus: 'processing' });
      
      // 2秒后恢复为idle状态
      setTimeout(() => {
        if (this.data.recordingStatus === 'processing') {
          this.setData({ recordingStatus: 'idle' });
        }
      }, 2000);
      
    } catch (error) {
      console.error('停止录音失败:', error);
      this.setData({ recordingStatus: 'idle' });
    }
  },

  /**
   * 处理语音WebSocket消息
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
        if (message.data.startsWith('AI: ')) {
          const aiText = message.data.substring(4);
          console.log('收到AI文本回复:', aiText);
          this.handleAIResponse(aiText);
          return;
        }
        
        // 检查是否为PCM音频数据（AI语音回复）
        if (message.data.startsWith('PCM: ')) {
          const pcmBase64 = message.data.substring(5);
          console.log('收到AI语音回复（PCM数据）');
          this.handleAIVoiceResponse(pcmBase64);
          return;
        }
        
        // 尝试解析JSON消息
        try {
          const data = JSON.parse(message.data);
          this.handleJSONMessage(data);
        } catch (jsonError) {
          console.log('收到纯文本消息:', message.data);
        }
      } else if (message.data instanceof ArrayBuffer) {
        // 处理二进制PCM音频数据
        console.log('收到二进制PCM音频数据，长度:', message.data.byteLength);
        this.playPCMAudio(message.data);
      }
    } catch (error) {
      console.error('处理语音消息失败:', error);
    }
  },

  /**
   * 处理JSON格式消息
   */
  handleJSONMessage(data) {
    switch (data.type) {
      case 'voice_call_answer':
        this.handleVoiceCallAnswer(data);
        break;
      case 'voice_call_end':
        this.handleCallEnd();
        break;
      case 'user_speaking_start':
        console.log('对方开始说话');
        break;
      case 'user_speaking_end':
        console.log('对方停止说话');
        break;
      case 'ai_processing_start':
        console.log('AI开始处理语音');
        wx.showToast({
          title: '正在处理...',
          icon: 'loading',
          duration: 2000
        });
        break;
      case 'ai_processing_end':
        console.log('AI处理完成');
        wx.hideToast();
        break;
      case 'error':
        console.error('服务器错误:', data.message);
        wx.showToast({
          title: data.message || '处理失败',
          icon: 'none'
        });
        break;
      default:
        console.log('收到未知类型的JSON消息:', data);
    }
  },

  /**
   * 处理AI文本回复
   */
  handleAIResponse(aiText) {
    console.log('处理AI文本回复:', aiText);
    
    // 显示AI文本回复
    this.addMessageToChat('AI: ' + aiText, false, 'text');
    
    // 可以在这里触发TTS语音合成
    this.synthesizeSpeech(aiText);
  },

  /**
   * 处理AI语音回复
   */
  handleAIVoiceResponse(pcmBase64) {
    console.log('处理AI语音回复');
    
    try {
      // 将Base64解码为二进制数据
      const binaryString = wx.base64ToArrayBuffer(pcmBase64);
      
      // 播放PCM音频
      this.playPCMAudio(binaryString);
      
      // 添加到聊天记录
      this.addMessageToChat('AI语音回复', false, 'voice');
    } catch (error) {
      console.error('处理AI语音回复失败:', error);
    }
  },

  /**
   * TTS语音合成
   */
  synthesizeSpeech(text) {
    console.log('TTS语音合成:', text);
    
    // 这里可以调用后端的TTS服务
    const app = getApp();
    if (app.globalData.voiceWSManager && app.globalData.voiceWSManager.isConnected) {
      const ttsMessage = {
        type: 'tts_request',
        text: text,
        voice: 'default', // 可以选择不同的语音类型
        speed: 1.0, // 语速
        senderId: this.data.localUserInfo.id,
        targetUserId: this.data.targetUserId,
        timestamp: Date.now()
      };
      
      this.safeSendMessage(ttsMessage);
    }
  },

  /**
   * 添加消息到聊天记录
   */
  addMessageToChat(content, isMe, type) {
    const message = {
      id: `msg_${Date.now()}`,
      type: type, // text, voice, system
      content: content,
      isMe: isMe,
      timestamp: Date.now()
    };
    
    // 这里可以实现添加到UI的逻辑
    console.log('添加消息到聊天记录:', message);
  },

  /**
   * 安全发送WebSocket消息（过滤心跳消息）
   */
  safeSendMessage(message) {
    const app = getApp();
    
    if (!app.globalData.voiceWSManager || !app.globalData.voiceWSManager.isConnected) {
      console.warn('WebSocket未连接，无法发送消息:', message);
      return false;
    }
    
    // 过滤心跳消息，不发送给AI处理
    if (message && (message.type === 'ping' || message.type === 'pong')) {
      console.log('心跳消息，不发送给AI处理:', message);
      return true;
    }
    
    try {
      return app.globalData.voiceWSManager.send(message);
    } catch (error) {
      console.error('发送WebSocket消息失败:', error);
      return false;
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
   * 处理语音消息（包括AI回复和TTS合成）
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
        if (message.data.startsWith('AI: ') && message.data.length > 4) {
          const aiText = message.data.substring(4);
          console.log('收到AI文本回复:', aiText);
          this.handleAIReply(aiText);
          return;
        }
        
        // 检查是否为错误消息
        if (message.data.startsWith('抱歉，处理您的请求时发生了错误') || 
            message.data.startsWith('处理失败:') || 
            message.data.startsWith('识别失败:') || 
            message.data.startsWith('AI处理失败:')) {
          console.error('AI处理错误:', message.data);
          wx.showToast({
            title: 'AI处理失败，请重试',
            icon: 'none'
          });
          return;
        }
        
        // 尝试解析JSON消息
        try {
          const data = JSON.parse(message.data);
          this.handleJSONMessage(data);
        } catch (e) {
          console.log('收到纯文本消息:', message.data);
        }
      } else if (message.data instanceof ArrayBuffer) {
        // 收到二进制PCM音频数据（TTS合成的语音）
        console.log('收到PCM音频数据（TTS合成），长度:', message.data.byteLength);
        this.playPCMAudio(message.data);
      }
    } catch (error) {
      console.error('处理语音消息失败:', error);
    }
  },

  /**
   * 处理JSON格式的消息
   */
  handleJSONMessage(data) {
    if (!data || !data.type) return;
    
    switch (data.type) {
      case 'voice_pcm_data':
        // 收到PCM音频数据（TTS合成）
        if (data.audioData) {
          console.log('收到TTS PCM音频数据，长度:', data.audioData.length);
          this.playBase64Audio(data.audioData);
        }
        break;
        
      case 'ai_reply':
        // 收到AI回复
        if (data.text) {
          console.log('收到AI文本回复:', data.text);
          this.handleAIReply(data.text);
        }
        break;
        
      case 'user_speaking_start':
        // 其他用户开始说话
        console.log('对方开始说话');
        this.setData({ isRemoteSpeaking: true });
        break;
        
      case 'user_speaking_end':
        // 其他用户停止说话
        console.log('对方停止说话');
        this.setData({ isRemoteSpeaking: false });
        break;
        
      case 'error':
        // 错误消息
        console.error('收到错误消息:', data.message);
        wx.showToast({
          title: data.message || '处理失败',
          icon: 'none'
        });
        break;
        
      default:
        console.log('收到未知类型的JSON消息:', data.type);
    }
  },

  /**
   * 处理AI回复文本
   */
  handleAIReply(text) {
    console.log('处理AI回复:', text);
    
    // 显示AI回复文本（可选）
    this.setData({ aiReplyText: text });
    
    // 这里可以添加文本到语音的逻辑，如果后端没有自动进行TTS合成
    // 或者可以发送请求让后端进行TTS合成
    const app = getApp();
    if (app.globalData.voiceWSManager && app.globalData.voiceWSManager.isConnected) {
      const ttsRequest = {
        type: 'tts_request',
        text: text,
        senderId: this.data.localUserInfo.id,
        targetUserId: this.data.targetUserId,
        timestamp: Date.now()
      };
      
      this.safeSendMessage(ttsRequest);
    }
  },

  /**
   * 播放Base64编码的音频数据
   */
  playBase64Audio(base64AudioData) {
    if (!base64AudioData) return;
    
    try {
      // 将Base64转换为ArrayBuffer
      const binaryString = wx.base64ToArrayBuffer(base64AudioData);
      this.playPCMAudio(binaryString);
    } catch (error) {
      console.error('播放Base64音频失败:', error);
    }
  },

  /**
   * 播放PCM音频数据
   */
  playPCMAudio(arrayBuffer) {
    try {
      console.log('开始播放PCM音频数据，长度:', arrayBuffer.byteLength);
      
      // 创建Web Audio上下文
      if (!this.audioContext) {
        this.audioContext = wx.createWebAudioContext ? wx.createWebAudioContext() : null;
      }
      
      if (!this.audioContext) {
        console.error('Web Audio上下文创建失败');
        return;
      }
      
      const audioContext = this.audioContext;
      
      // 创建音频缓冲区 - 16kHz采样率，单声道
      const audioBuffer = audioContext.createBuffer(1, arrayBuffer.byteLength / 2, 16000);
      const channelData = audioBuffer.getChannelData(0);
      
      // 将16位PCM数据转换为32位浮点
      const dataView = new DataView(arrayBuffer);
      for (let i = 0; i < channelData.length; i++) {
        channelData[i] = dataView.getInt16(i * 2, true) / 0x7FFF;
      }
      
      // 创建音频源并播放
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start();
      
      console.log('PCM音频播放成功，时长:', audioBuffer.duration, '秒');
    } catch (error) {
      console.error('PCM音频播放失败:', error);
      wx.showToast({
        title: '音频播放失败',
        icon: 'none'
      });
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
   * 切换录音状态
   */
  toggleRecording() {
    if (this.data.recordingStatus === 'recording') {
      // 停止录音
      this.stopAudioRecording();
    } else {
      // 开始录音
      this.startAudioRecording();
    }
  },

  /**
   * 切换录音状态
   */
  toggleRecording() {
    if (this.data.recordingStatus === 'recording') {
      // 停止录音
      this.stopAudioRecording();
    } else {
      // 开始录音
      this.startAudioRecording();
    }
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
   * 处理二进制音频消息 - 验证16位PCM格式
   * 确保正确接收和处理WebSocket二进制音频数据
   */
  handleBinaryMessage(arrayBuffer) {
    try {
      console.log('开始处理二进制音频消息...');
      
      // 验证二进制数据
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        console.error('收到空的二进制音频数据');
        return;
      }
      
      // 验证16位PCM格式：数据长度应该是偶数（每个样本2字节）
      if (arrayBuffer.byteLength % 2 !== 0) {
        console.warn('二进制音频数据长度异常，可能不是16位PCM格式:', arrayBuffer.byteLength);
      }
      
      const sampleCount = arrayBuffer.byteLength / 2; // 16位 = 2字节/样本
      const durationMs = (sampleCount / 16000) * 1000; // 16000Hz采样率
      
      console.log(`二进制音频数据验证通过: 长度=${arrayBuffer.byteLength}字节, 样本数=${sampleCount}, 时长=${durationMs.toFixed(1)}ms`);
      
      // 验证音频数据内容（简单的完整性检查）
      const dataView = new DataView(arrayBuffer);
      let validSampleCount = 0;
      let zeroSampleCount = 0;
      let maxAmplitude = 0;
      
      for (let i = 0; i < sampleCount; i++) {
        const sample = dataView.getInt16(i * 2, true);
        const absSample = Math.abs(sample);
        if (absSample > 100) { // 阈值：认为非静音的最小幅度
          validSampleCount++;
        } else {
          zeroSampleCount++;
        }
        if (absSample > maxAmplitude) {
          maxAmplitude = absSample;
        }
      }
      
      console.log(`音频数据内容分析: 有效样本=${validSampleCount}, 零值样本=${zeroSampleCount}, 有效比例=${((validSampleCount/sampleCount)*100).toFixed(1)}%, 最大幅度=${maxAmplitude}`);
      
      // 如果有效样本比例太低，可能是静音或数据异常
      if (validSampleCount === 0) {
        console.warn('音频数据全部为静音（零值）');
      } else if ((validSampleCount/sampleCount) < 0.01) {
        console.warn('音频数据有效样本比例极低，可能存在问题');
      }
      
      // 播放PCM音频
      this.playPCMAudio(arrayBuffer);
      
      // 添加到聊天记录
      this.addMessageToChat(`收到PCM音频 (${arrayBuffer.byteLength}字节, ${durationMs.toFixed(0)}ms)`, false, 'voice');
      
    } catch (error) {
      console.error('处理二进制音频消息失败:', error);
      wx.showToast({
        title: '音频处理失败',
        icon: 'none'
      });
    }
  },

  /**
   * 增强的WebSocket消息处理 - 支持二进制音频数据
   */
  handleWebSocketMessage(message) {
    try {
      if (typeof message.data === 'string') {
        // 处理文本消息（保持原有逻辑）
        this.handleTextMessage(message.data);
      } else if (message.data instanceof ArrayBuffer) {
        // 处理二进制音频数据
        console.log('收到WebSocket二进制消息，类型: ArrayBuffer, 长度:', message.data.byteLength, '字节');
        this.handleBinaryMessage(message.data);
      } else {
        console.warn('收到未知类型的WebSocket消息:', typeof message.data);
      }
    } catch (error) {
      console.error('处理WebSocket消息失败:', error);
    }
  },

  /**
   * 处理文本WebSocket消息
   */
  handleTextMessage(textData) {
    // 检查是否为心跳消息
    if (textData === 'ping' || textData === 'pong') {
      console.log('收到心跳消息:', textData);
      return;
    }
    
    // 检查是否为AI回复
    if (textData.startsWith('AI: ')) {
      const aiText = textData.substring(4);
      console.log('收到AI文本回复:', aiText);
      this.handleAIReply(aiText);
      return;
    }
    
    // 检查是否为错误消息
    if (textData.startsWith('抱歉，处理您的请求时发生了错误') || 
        textData.startsWith('处理失败:') || 
        textData.startsWith('识别失败:') || 
        textData.startsWith('AI处理失败:')) {
      console.error('AI处理错误:', textData);
      wx.showToast({
        title: 'AI处理失败，请重试',
        icon: 'none'
      });
      return;
    }
    
    // 尝试解析JSON消息
    try {
      const data = JSON.parse(textData);
      this.handleJSONMessage(data);
    } catch (e) {
      console.log('收到纯文本消息:', textData);
    }
  }
})