// pages/MainInterface/MainInterface.js
const WebSocketManager = require('../../utils/websocket.js');

// 延迟加载VoiceRecorder以避免初始化错误
let VoiceRecorder = null;
try {
  VoiceRecorder = require('../../utils/voice-recorder.js');
} catch (e) {
  console.warn('VoiceRecorder模块加载失败:', e);
}

Page({

  /**
   * 页面的初始数据
   */
  data: {
    chatTitle: '聊天',
    connectionStatus: '连接中...',
    messages: [],
    inputValue: '',
    toView: '',
    inputMode: 'text', // text, voice
    showMoreMenu: false,
    isRecording: false,
    recordingStatus: 'ready', // ready, recording, cancel
    recordingTime: 0,
    recordingText: '按住说话',
    wsManager: null,
    voiceWSManager: null,
    videoWSManager: null,
    voiceRecorder: null,
    currentUser: {
      id: '',
      name: '',
      avatar: '/pages/images/个人详情.png'
    },
    targetUser: {
      id: 'user_456',
      name: '好友',
      avatar: '/pages/images/用户头像.png'
    }
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('MainInterface onLoad options:', options);
    
    let userData = null;
    
    // 方法1：接收从index页面传递过来的用户数据
    if (options) {
      const userAvatar = options.userAvatar || options.avatar;
      const userName = options.userName || options.name;
      
      console.log('接收到的用户数据:', {
        userAvatar: userAvatar,
        userName: userName
      });
      
      if (userAvatar && userName) {
        userData = {
          name: decodeURIComponent(userName),
          avatar: decodeURIComponent(userAvatar)
        };
      }
    }
    
    // 方法2：如果没有接收到参数，尝试从全局数据获取
    if (!userData) {
      const app = getApp();
      if (app && app.globalData && app.globalData.userInfo) {
        userData = {
          name: app.globalData.userInfo.nickName,
          avatar: app.globalData.userInfo.avatarUrl
        };
        console.log('从全局数据获取用户信息:', userData);
      }
    }
    
    // 方法3：尝试从本地存储获取
    if (!userData) {
      try {
        const userInfoStr = wx.getStorageSync('userInfo');
        if (userInfoStr) {
          const userInfo = JSON.parse(userInfoStr);
          userData = {
            name: userInfo.nickName,
            avatar: userInfo.avatarUrl
          };
          console.log('从本地存储获取用户信息:', userData);
        }
      } catch (e) {
        console.log('从本地存储获取用户信息失败:', e);
      }
    }
    
    // 如果获取到用户数据，更新页面数据
    if (userData) {
      this.setData({
        currentUser: {
          id: 'user_' + Date.now(),
          name: userData.name,
          avatar: userData.avatar
        },
        chatTitle: userData.name // 使用用户名字作为聊天标题
      });
      
      console.log('设置当前用户数据:', this.data.currentUser);
    } else {
      console.log('未获取到用户数据，使用默认值');
    }
    
    this.initWebSocket();
    this.initVoiceRecorder();
    this.loadHistoryMessages();
  },

  /**
   * 初始化WebSocket连接
   */
  initWebSocket() {
    console.log('初始化WebSocket连接');
    // WebSocket初始化逻辑将在这里实现
  },

  /**
   * 初始化语音录制器
   */
  initVoiceRecorder() {
    console.log('初始化语音录制器');
    if (VoiceRecorder) {
      this.voiceRecorder = new VoiceRecorder({
        onStart: () => {
          console.log('录音开始');
        },
        onStop: (result) => {
          console.log('录音停止', result);
        },
        onError: (error) => {
          console.error('录音错误', error);
        }
      });
      this.voiceRecorder.init();
    } else {
      console.warn('VoiceRecorder模块未加载，跳过初始化');
    }
  },

  /**
   * 加载历史消息
   */
  loadHistoryMessages() {
    console.log('加载历史消息');
    // 历史消息加载逻辑将在这里实现
  },

  /**
   * 头像加载失败处理
   */
  onAvatarError(e) {
    console.log('头像加载失败:', e);
    // 当头像加载失败时，使用默认头像
    this.setData({
      'currentUser.avatar': '/pages/images/个人详情.png'
    });
  },

  /**
   * 头像加载成功处理
   */
  onAvatarLoad(e) {
    console.log('头像加载成功:', e);
  },

  /**
   * 消息头像加载失败处理
   */
  onMessageAvatarError(e) {
    console.log('消息头像加载失败:', e);
    const avatarType = e.currentTarget.dataset.avatarType;
    const defaultAvatar = '/pages/images/个人详情.png';
    
    // 更新对应消息的头像为默认头像
    const messages = this.data.messages.map(msg => {
      if (msg.isMe && avatarType === 'current') {
        return { ...msg, avatar: defaultAvatar };
      } else if (!msg.isMe && avatarType === 'target') {
        return { ...msg, avatar: defaultAvatar };
      }
      return msg;
    });
    
    this.setData({
      messages: messages
    });
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    if (this.data.wsManager) {
      this.data.wsManager.disconnect();
    }
    if (this.data.voiceWSManager) {
      this.data.voiceWSManager.disconnect();
    }
    if (this.data.videoWSManager) {
      this.data.videoWSManager.disconnect();
    }
    if (this.data.voiceRecorder) {
      this.data.voiceRecorder.stop();
    }
  },

  /**
   * 初始化WebSocket连接（只连接文本聊天）
   */
  initWebSocket() {
    const app = getApp();
    const userId = app.globalData.openId || 'user123';
    
    // 文本聊天WebSocket（初始只连接文本）
    const wsManager = new WebSocketManager({
      url: `ws://localhost:8080/ws/chat?userId=${userId}`,
      onOpen: this.onWebSocketOpen.bind(this),
      onMessage: this.onWebSocketMessage.bind(this),
      onClose: this.onWebSocketClose.bind(this),
      onError: this.onWebSocketError.bind(this),
      reconnectInterval: 3000,
      maxReconnectAttempts: 5
    });

    // 初始化语音和视频WebSocket管理器（但不连接）
    const voiceWSManager = null;
    const videoWSManager = null;

    this.setData({ wsManager, voiceWSManager, videoWSManager });
    
    // 保存到全局数据，供通话页面使用
    app.globalData.wsManager = wsManager;
    app.globalData.voiceWSManager = voiceWSManager;
    app.globalData.videoWSManager = videoWSManager;
    
    // 只连接文本WebSocket
    wsManager.connect();
  },

  /**
   * 初始化语音录制器
   */
  initVoiceRecorder() {
    const voiceRecorder = new VoiceRecorder({
      onStart: this.onRecordingStart.bind(this),
      onStop: this.onRecordingStop.bind(this),
      onError: this.onRecordingError.bind(this),
      maxDuration: 60000 // 60秒
    });

    this.setData({ voiceRecorder });
  },

  /**
   * WebSocket连接成功
   */
  onWebSocketOpen() {
    console.log('WebSocket连接成功');
    this.setData({ connectionStatus: '已连接' });
    
    // 发送用户认证信息
    this.data.wsManager.send({
      type: 'auth',
      userId: this.data.currentUser.id,
      targetUserId: this.data.targetUser.id
    });
  },

  /**
   * 收到WebSocket消息（符合更新后的API文档规范）
   * 增强错误处理，支持新的控制命令和错误类型
   */
  onWebSocketMessage(message) {
    console.log('收到消息:', message);
    
    try {
      // 首先检查消息类型
      if (typeof message.data === 'string') {
        const messageText = message.data;
        
        // 检查是否为系统状态消息
        if (messageText.includes('已连接到') || messageText.includes('连接成功')) {
          console.log('系统连接状态消息:', messageText);
          this.setData({ connectionStatus: '已连接' });
          return;
        }
        
        // 检查是否为错误消息（包含新的错误类型）
        if (messageText.startsWith('抱歉，处理您的请求时发生了错误') || 
            messageText.startsWith('处理失败:') || 
            messageText.startsWith('识别失败:') || 
            messageText.startsWith('AI处理失败:') ||
            messageText.startsWith('处理消息失败:') ||
            messageText.includes('Cannot invoke') ||
            messageText.includes('NullPointerException') ||
            messageText.includes('NO_VALID_AUDIO_ERROR')) {
          console.error('服务器错误:', messageText);
          
          // 特殊处理NO_VALID_AUDIO_ERROR
          if (messageText.includes('NO_VALID_AUDIO_ERROR')) {
            wx.showToast({
              title: '音频数据无效，请重新录音',
              icon: 'none',
              duration: 3000
            });
          } else {
            wx.showToast({
              title: '服务器处理失败，请稍后重试',
              icon: 'none'
            });
          }
          return;
        }
        
        // 尝试解析JSON，如果失败则作为纯文本处理
        try {
          const data = JSON.parse(messageText);
          
          // 检查是否为标准JSON格式消息
          if (data.type === 'chat' && data.content) {
            console.log('收到标准格式聊天消息:', data);
            // 解析内容并处理
            try {
              const contentData = JSON.parse(data.content);
              this.receiveMessage({
                id: data.messageId || `msg_${Date.now()}`,
                type: contentData.type || 'text',
                content: contentData.content || contentData,
                isMe: false,
                time: this.getCurrentTime(),
                avatar: this.data.targetUser.avatar,
                senderName: contentData.senderName || this.data.targetUser.name,
                senderId: data.userId || this.data.targetUser.id,
                metadata: data.metadata || {}
              });
            } catch (contentError) {
              // 内容不是JSON，直接作为文本处理
              this.receiveMessage({
                id: data.messageId || `msg_${Date.now()}`,
                type: 'text',
                content: data.content,
                isMe: false,
                time: this.getCurrentTime(),
                avatar: this.data.targetUser.avatar,
                senderName: this.data.targetUser.name,
                senderId: data.userId || this.data.targetUser.id,
                metadata: data.metadata || {}
              });
            }
            return;
          }
          
          // 处理原有格式的消息
          switch (data.type) {
            case 'message':
              this.receiveMessage(data);
              break;
            case 'voice_call':
              this.handleVoiceCall(data);
              break;
            case 'video_call':
              this.handleVideoCall(data);
              break;
            case 'user_status':
              this.updateUserStatus(data);
              break;
            case 'ai_response':
              // AI回复消息
              this.handleAIResponse(data);
              break;
            case 'control_ack':
              // 控制命令确认（新的API文档要求）
              this.handleControlAck(data);
              break;
            case 'asr_result':
              // 语音识别结果（新的API文档要求）
              this.handleASRResult(data);
              break;
            case 'asr_error':
              // 语音识别错误（新的API文档要求）
              this.handleASRError(data);
              break;
            case 'message_error':
              // 消息处理错误（最新的API文档要求）
              this.handleMessageError(data);
              break;
            case 'ping':
              // 心跳响应
              console.log('收到心跳ping');
              break;
            case 'pong':
              // 心跳响应
              console.log('收到心跳pong，延迟:', Date.now() - data.timestamp, 'ms');
              break;
            default:
              console.log('未知消息类型:', data.type);
          }
        } catch (jsonError) {
          // JSON解析失败，作为纯文本消息处理
          console.log('收到纯文本消息，作为系统消息显示:', messageText);
          this.receiveMessage({
            id: `msg_${Date.now()}`,
            type: 'text',
            content: messageText,
            isMe: false,
            time: this.getCurrentTime(),
            avatar: this.data.targetUser.avatar,
            senderName: '系统',
            senderId: 'system'
          });
        }
      } else {
        console.log('收到非文本消息:', message.data);
      }
    } catch (error) {
      console.error('解析消息失败:', error, '原始消息:', message.data);
      // 最后的兜底处理
      if (typeof message.data === 'string') {
        this.receiveMessage({
          id: `msg_${Date.now()}`,
          type: 'text',
          content: '消息解析失败: ' + message.data,
          isMe: false,
          time: this.getCurrentTime(),
          avatar: this.data.targetUser.avatar,
          senderName: '系统',
          senderId: 'system'
        });
      }
    }
  },

  /**
   * WebSocket连接关闭
   */
  onWebSocketClose() {
    console.log('WebSocket连接关闭');
    this.setData({ connectionStatus: '已断开' });
  },

  /**
   * WebSocket错误
   */
  onWebSocketError(error) {
    console.error('WebSocket错误:', error);
    this.setData({ connectionStatus: '连接失败' });
  },

  /**
   * 收到语音WebSocket消息
   */
  onVoiceWebSocketMessage(message) {
    console.log('收到语音WebSocket消息，类型:', typeof message.data, '数据长度:', 
      typeof message.data === 'string' ? message.data.length : 
      message.data instanceof ArrayBuffer ? message.data.byteLength : 'unknown');
    
    try {
      if (message.data instanceof ArrayBuffer) {
        // 处理二进制音频数据
        console.log('收到二进制音频数据，长度:', message.data.byteLength, '字节');
        this.handleIncomingVoiceAudio(message.data);
      } else if (typeof message.data === 'string') {
        // 处理文本消息（元数据和控制消息）
        // 检查是否为错误消息
        if (message.data.startsWith('抱歉，处理您的请求时发生了错误') || 
            message.data.startsWith('处理失败:') || 
            message.data.startsWith('识别失败:') || 
            message.data.startsWith('AI处理失败:')) {
          console.error('语音服务器错误:', message.data);
          wx.showToast({
            title: '语音服务错误，请稍后重试',
            icon: 'none'
          });
          return;
        }
        
        const data = JSON.parse(message.data);
        
        switch (data.type) {
          case 'voice_call':
            this.handleVoiceCall(data);
            break;
          case 'voice_call_request':
            this.handleVoiceCallRequest(data);
            break;
          case 'voice_call_accept':
            this.handleVoiceCallAccept(data);
            break;
          case 'voice_call_reject':
            this.handleVoiceCallReject(data);
            break;
          case 'voice_call_end':
            this.handleVoiceCallEnd(data);
            break;
          case 'voice_message':
            this.handleVoiceMessageMetadata(data);
            break;
          default:
            console.log('未知语音消息类型:', data.type);
        }
      }
    } catch (error) {
      console.error('解析语音消息失败:', error, '原始消息:', message.data);
    }
  },

  /**
   * 语音WebSocket连接成功
   */
  onVoiceWebSocketOpen() {
    console.log('语音WebSocket连接成功');
    // 发送语音服务认证信息
    this.data.voiceWSManager.send({
      type: 'auth',
      userId: this.data.currentUser.id,
      targetUserId: this.data.targetUser.id,
      service: 'voice'
    });
  },

  /**
   * 收到语音WebSocket消息
   */
  onVoiceWebSocketMessage(message) {
    console.log('收到语音WebSocket消息:', message);
    
    try {
      if (typeof message.data === 'string') {
        // 检查是否为错误消息
        if (message.data.startsWith('抱歉，处理您的请求时发生了错误') || 
            message.data.startsWith('处理失败:') || 
            message.data.startsWith('识别失败:') || 
            message.data.startsWith('AI处理失败:')) {
          console.error('语音服务器错误:', message.data);
          wx.showToast({
            title: '语音服务错误，请稍后重试',
            icon: 'none'
          });
          return;
        }
        
        const data = JSON.parse(message.data);
        
        switch (data.type) {
          case 'voice_call':
            this.handleVoiceCall(data);
            break;
          case 'voice_call_request':
            this.handleVoiceCallRequest(data);
            break;
          case 'voice_call_accept':
            this.handleVoiceCallAccept(data);
            break;
          case 'voice_call_reject':
            this.handleVoiceCallReject(data);
            break;
          case 'voice_call_end':
            this.handleVoiceCallEnd(data);
            break;
          default:
            console.log('未知语音消息类型:', data.type);
        }
      }
    } catch (error) {
      console.error('解析语音消息失败:', error, '原始消息:', message.data);
    }
  },

  /**
   * 语音WebSocket连接关闭
   */
  onVoiceWebSocketClose() {
    console.log('语音WebSocket连接关闭');
  },

  /**
   * 语音WebSocket错误
   */
  onVoiceWebSocketError(error) {
    console.error('语音WebSocket错误:', error);
  },

  /**
   * 视频WebSocket连接成功
   */
  onVideoWebSocketOpen() {
    console.log('视频WebSocket连接成功');
    // 发送视频服务认证信息
    this.data.videoWSManager.send({
      type: 'auth',
      userId: this.data.currentUser.id,
      targetUserId: this.data.targetUser.id,
      service: 'video'
    });
  },

  /**
   * 收到视频WebSocket消息
   */
  onVideoWebSocketMessage(message) {
    console.log('收到视频WebSocket消息:', message);
    
    try {
      if (typeof message.data === 'string') {
        // 检查是否为错误消息
        if (message.data.startsWith('抱歉，处理您的请求时发生了错误') || 
            message.data.startsWith('处理失败:') || 
            message.data.startsWith('识别失败:') || 
            message.data.startsWith('AI处理失败:')) {
          console.error('视频服务器错误:', message.data);
          wx.showToast({
            title: '视频服务错误，请稍后重试',
            icon: 'none'
          });
          return;
        }
        
        const data = JSON.parse(message.data);
        
        switch (data.type) {
          case 'video_call':
            this.handleVideoCall(data);
            break;
          case 'video_call_request':
            this.handleVideoCallRequest(data);
            break;
          case 'video_call_accept':
            this.handleVideoCallAccept(data);
            break;
          case 'video_call_reject':
            this.handleVideoCallReject(data);
            break;
          case 'video_call_end':
            this.handleVideoCallEnd(data);
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
            console.log('未知视频消息类型:', data.type);
        }
      }
    } catch (error) {
      console.error('解析视频消息失败:', error, '原始消息:', message.data);
    }
  },

  /**
   * 视频WebSocket连接关闭
   */
  onVideoWebSocketClose() {
    console.log('视频WebSocket连接关闭');
  },

  /**
   * 视频WebSocket错误
   */
  onVideoWebSocketError(error) {
    console.error('视频WebSocket错误:', error);
  },

  /**
   * 加载历史消息
   */
  loadHistoryMessages() {
    // 模拟历史消息
    const historyMessages = [
      {
        id: 'msg_1',
        type: 'text',
        content: '你好！这是WebSocket聊天界面。',
        isMe: false,
        time: '14:30',
        avatar: this.data.targetUser.avatar,
        senderName: this.data.targetUser.name,
        senderId: this.data.targetUser.id
      },
      {
        id: 'msg_2',
        type: 'text',
        content: '支持文本、语音、图片等多种消息类型。',
        isMe: true,
        time: '14:32',
        avatar: this.data.currentUser.avatar,
        senderName: this.data.currentUser.name,
        senderId: this.data.currentUser.id
      }
    ];

    this.setData({
      messages: historyMessages
    }, () => {
      this.scrollToBottom();
    });
  },

  /**
   * 发送消息 - 符合API文档要求的文本聊天格式
   */
  sendMessage() {
    const content = this.data.inputValue.trim();
    if (!content) return;

    const message = {
      id: `msg_${Date.now()}`,
      type: 'text',
      content: content,
      isMe: true,
      time: this.getCurrentTime(),
      avatar: this.data.currentUser.avatar,
      senderName: this.data.currentUser.name,
      senderId: this.data.currentUser.id,
      targetId: this.data.targetUser.id
    };

    // 添加到本地消息列表
    const messages = [...this.data.messages, message];
    this.setData({
      messages: messages,
      inputValue: '',
      toView: `msg-${messages.length - 1}`
    });

    // 通过WebSocket发送 - 使用符合API文档的标准格式
    const chatMessage = {
      type: 'chat',
      content: content,
      messageId: `msg_${Date.now()}`,
      userId: this.data.currentUser.id,
      metadata: {
        targetUserId: this.data.targetUser.id,
        senderName: this.data.currentUser.name,
        timestamp: Date.now(),
        messageType: 'text'
      }
    };

    this.safeSendMessage(this.data.wsManager, chatMessage);
  },

  /**
   * 接收消息
   */
  receiveMessage(data) {
    const message = {
      id: data.id || `msg_${Date.now()}`,
      type: data.messageType || 'text',
      content: data.content,
      isMe: false,
      time: this.formatTime(data.timestamp),
      avatar: data.avatar || this.data.targetUser.avatar,
      senderName: data.senderName || this.data.targetUser.name,
      senderId: data.senderId
    };

    const messages = [...this.data.messages, message];
    this.setData({
      messages: messages,
      toView: `msg-${messages.length - 1}`
    });
  },

  /**
   * 切换输入模式（微信风格）
   */
  toggleInputMode() {
    const newMode = this.data.inputMode === 'text' ? 'voice' : 'text';
    this.setData({
      inputMode: newMode,
      showMoreMenu: false // 切换模式时关闭更多菜单
    });
  },

  /**
   * 开始录制语音（符合更新后的API文档规范）
   */
  startRecording(e) {
    if (this.data.inputMode !== 'voice') return;
    
    this.setData({
      isRecording: true,
      recordingStatus: 'recording',
      recordingText: '松开发送'
    });

    // 根据API文档，发送开始录音控制命令到服务器（通过文本聊天WebSocket）
    if (this.data.wsManager && this.data.wsManager.isConnected) {
      const startRecordingCommand = {
        type: 'control',
        content: 'start_recording',
        messageId: `control_${Date.now()}`,
        userId: this.data.currentUser.id,
        metadata: {
          commandType: 'voice_recording',
          targetUserId: this.data.targetUser.id,
          timestamp: Date.now()
        }
      };
      
      const sendResult = this.data.wsManager.send(startRecordingCommand);
      if (sendResult) {
        console.log('已发送开始录音控制命令（符合API文档）:', startRecordingCommand);
      } else {
        console.warn('发送开始录音控制命令失败');
      }
    } else {
      console.warn('文本聊天WebSocket未连接，无法发送开始录音控制命令');
    }

    // 开始录制
    this.data.voiceRecorder.start();
    this.startRecordingTimer();
  },

  /**
   * 停止录制语音（符合更新后的API文档规范）
   */
  stopRecording() {
    if (!this.data.isRecording) return;

    this.setData({
      isRecording: false,
      recordingStatus: 'ready',
      recordingText: '按住说话',
      recordingTime: 0
    });

    // 根据API文档，发送停止录音控制命令到服务器（通过文本聊天WebSocket）
    if (this.data.wsManager && this.data.wsManager.isConnected) {
      const stopRecordingCommand = {
        type: 'control',
        content: 'stop_recording',
        messageId: `control_${Date.now()}`,
        userId: this.data.currentUser.id,
        metadata: {
          commandType: 'voice_recording',
          targetUserId: this.data.targetUser.id,
          timestamp: Date.now()
        }
      };
      
      const sendResult = this.data.wsManager.send(stopRecordingCommand);
      if (sendResult) {
        console.log('已发送停止录音控制命令（符合API文档）:', stopRecordingCommand);
      } else {
        console.warn('发送停止录音控制命令失败');
      }
    } else {
      console.warn('文本聊天WebSocket未连接，无法发送停止录音控制命令');
    }

    // 停止录制
    this.stopRecordingTimer();
    this.data.voiceRecorder.stop();
  },

  /**
   * 录制语音时移动
   */
  onRecordingMove(e) {
    if (!this.data.isRecording) return;

    const touch = e.touches[0];
    const startY = e.currentTarget.offsetTop;
    const currentY = touch.pageY;
    
    // 如果手指向上移动超过50px，则取消发送
    if (startY - currentY > 50) {
      this.setData({
        recordingStatus: 'cancel',
        recordingText: '松开取消'
      });
    } else {
      this.setData({
        recordingStatus: 'recording',
        recordingText: '松开发送'
      });
    }
  },

  /**
   * 开始录制计时器
   */
  startRecordingTimer() {
    this.recordingTimer = setInterval(() => {
      this.setData({
        recordingTime: this.data.recordingTime + 1
      });
    }, 1000);
  },

  /**
   * 停止录制计时器
   */
  stopRecordingTimer() {
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }
  },

  /**
   * 录制开始回调
   */
  onRecordingStart() {
    console.log('开始录制语音');
  },

  /**
   * 录制停止回调
   */
  onRecordingStop(res) {
    console.log('停止录制语音:', res);
    
    if (this.data.recordingStatus === 'cancel') {
      console.log('取消发送语音');
      return;
    }

    if (res.duration < 1000) {
      wx.showToast({
        title: '录音时间太短',
        icon: 'none'
      });
      return;
    }

    // 通过文本聊天WebSocket发送语音二进制数据（符合API文档要求）
    console.log('准备通过文本聊天WebSocket发送语音数据...');
    this.sendVoiceBinaryData(res.tempFilePath, res.duration);
  },

  /**
   * 录制错误回调
   */
  onRecordingError(error) {
    console.error('录制语音错误:', error);
    wx.showToast({
      title: '录音失败',
      icon: 'none'
    });
  },

  /**
   * 在本地聊天界面添加语音消息
   */
  addVoiceMessageToChat(voiceUrl, duration, audioSize) {
    const message = {
      id: `msg_${Date.now()}`,
      type: 'voice',
      voiceUrl: voiceUrl,
      duration: Math.ceil(duration / 1000),
      isMe: true,
      time: this.getCurrentTime(),
      avatar: this.data.currentUser.avatar,
      senderName: this.data.currentUser.name,
      senderId: this.data.currentUser.id,
      audioSize: audioSize,
      isBinary: true // 标记为二进制音频数据
    };

    const messages = [...this.data.messages, message];
    this.setData({
      messages: messages,
      toView: `msg-${messages.length - 1}`
    });

    console.log('语音消息已添加到本地聊天界面');
  },

  /**
   * 通过文本聊天WebSocket发送语音二进制数据（符合更新后的API文档规范）
   * 根据API文档，发送语音消息应该通过文本聊天WebSocket端点
   * 添加了音频数据质量保证，避免NO_VALID_AUDIO_ERROR错误
   */
  sendVoiceBinaryData(filePath, duration) {
    // 读取语音文件为二进制数据（微信小程序专用方案）
    wx.getFileSystemManager().readFile({
      filePath: filePath,
      // 关键：微信小程序中删除encoding参数即可返回ArrayBuffer
      // 不要设置为null，直接删除该字段
      success: (res) => {
        const audioData = res.data;
        console.log('原始音频数据:', audioData);
        console.log('音频数据类型:', typeof audioData);
        console.log('音频数据构造函数:', audioData?.constructor?.name);
        console.log('音频文件大小:', audioData?.byteLength || 'unknown', '字节');
        
        // 微信小程序专用：处理音频数据类型
        let processedAudioData = audioData;
        
        // 微信小程序兼容性处理
        if (typeof audioData === 'string') {
          // 如果是base64字符串，需要转换为ArrayBuffer
          try {
            processedAudioData = wx.base64ToArrayBuffer(audioData);
            console.log('base64字符串转换为ArrayBuffer成功，新大小:', processedAudioData.byteLength);
          } catch (error) {
            console.error('base64转换ArrayBuffer失败:', error);
            wx.showToast({
              title: '语音数据转换失败',
              icon: 'none'
            });
            return;
          }
        }
        
        // 音频数据质量保证 - 避免NO_VALID_AUDIO_ERROR错误
        if (!processedAudioData || processedAudioData.byteLength === 0) {
          console.error('音频数据为空，可能导致NO_VALID_AUDIO_ERROR错误');
          wx.showToast({
            title: '音频数据为空',
            icon: 'none'
          });
          return;
        }
        
        // 验证音频参数符合API文档要求（16kHz采样率，16位深度，单声道）
        // 16位PCM数据应该是偶数个字节
        if (processedAudioData.byteLength % 2 !== 0) {
          console.warn('音频数据长度异常，不是16位PCM格式:', processedAudioData.byteLength);
          wx.showToast({
            title: '音频格式异常',
            icon: 'none'
          });
          return;
        }
        
        // 确保是有效的ArrayBuffer类型（微信小程序兼容版本）
        const isArrayBuffer = processedAudioData instanceof ArrayBuffer || 
                             (processedAudioData && 
                              typeof processedAudioData === 'object' && 
                              typeof processedAudioData.byteLength === 'number' &&
                              processedAudioData.constructor && 
                              processedAudioData.constructor.name === 'ArrayBuffer');
        
        if (!isArrayBuffer) {
          console.error('语音数据不是ArrayBuffer格式:', {
            type: typeof processedAudioData,
            constructor: processedAudioData?.constructor?.name,
            hasByteLength: typeof processedAudioData?.byteLength,
            byteLengthValue: processedAudioData?.byteLength,
            isInstanceOf: processedAudioData instanceof ArrayBuffer
          });
          wx.showToast({
            title: '语音数据格式错误',
            icon: 'none'
          });
          return;
        }
        
        console.log('ArrayBuffer验证通过:', {
          type: typeof processedAudioData,
          constructor: processedAudioData.constructor.name,
          byteLength: processedAudioData.byteLength
        });
        
        // 计算音频数据大小
        const audioDataSize = processedAudioData.byteLength;
        console.log('音频数据大小:', audioDataSize, '字节');
        
        // 根据API文档，发送语音消息应该通过文本聊天WebSocket
        if (this.data.wsManager && this.data.wsManager.isConnected) {
          // 首先验证音频数据质量，避免NO_VALID_AUDIO_ERROR错误
          if (audioDataSize < 100) { // 假设最小有效音频数据为100字节
            console.warn('音频数据过小，可能无效:', audioDataSize);
            wx.showToast({
              title: '音频数据过短',
              icon: 'none'
            });
            return;
          }
          
          // 发送语音二进制数据（这是关键 - 通过文本聊天WebSocket发送音频）
          const sendResult = this.data.wsManager.sendBinary(processedAudioData);
          console.log('语音二进制数据通过文本聊天WebSocket发送结果:', sendResult ? '成功' : '失败', '数据长度:', audioDataSize, '字节');
          
          if (sendResult) {
            // 成功发送音频数据后，在本地聊天界面添加语音消息
            this.addVoiceMessageToChat(filePath, duration, audioDataSize);
            
            wx.showToast({
              title: '语音消息发送成功',
              icon: 'success',
              duration: 1000
            });
          } else {
            wx.showToast({
              title: '语音发送失败',
              icon: 'none'
            });
          }
        } else {
          console.warn('文本聊天WebSocket未连接');
          wx.showToast({
            title: '聊天服务未连接',
            icon: 'none'
          });
        }
      },
      fail: (error) => {
        console.error('读取语音文件失败:', error);
        wx.showToast({
          title: '语音文件读取失败',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 播放语音
   */
  playVoice(e) {
    const voiceUrl = e.currentTarget.dataset.voice;
    const duration = e.currentTarget.dataset.duration;
    const isBinary = e.currentTarget.dataset.isBinary;
    
    if (!voiceUrl) return;

    const innerAudioContext = wx.createInnerAudioContext();
    
    if (isBinary) {
      // 对于二进制音频数据，需要转换为base64或使用特殊处理
      // 这里假设语音数据已经是可用的格式
      innerAudioContext.src = voiceUrl;
    } else {
      innerAudioContext.src = voiceUrl;
    }
    
    innerAudioContext.play();
    
    // 显示播放动画
    this.showVoiceAnimation(e.currentTarget);
    
    innerAudioContext.onEnded(() => {
      this.hideVoiceAnimation();
    });
    
    innerAudioContext.onError((err) => {
      console.error('播放语音失败:', err);
      this.hideVoiceAnimation();
      wx.showToast({
        title: '播放失败',
        icon: 'none'
      });
    });
  },

  /**
   * 显示语音播放动画
   */
  showVoiceAnimation(element) {
    // 添加播放动画样式
    element.classList.add('playing');
  },

  /**
   * 隐藏语音播放动画
   */
  hideVoiceAnimation() {
    // 移除播放动画样式
    const playingElements = document.querySelectorAll('.playing');
    playingElements.forEach(el => el.classList.remove('playing'));
  },

  /**
   * 选择图片
   */
  chooseImage() {
    wx.chooseImage({
      count: 9,
      sizeType: ['original', 'compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        res.tempFilePaths.forEach((filePath, index) => {
          this.sendImageMessage(filePath);
        });
      }
    });
  },

  /**
   * 选择文件
   */
  chooseFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      success: (res) => {
        const file = res.tempFiles[0];
        this.sendFileMessage(file.path, file.name, file.size);
      },
      fail: (error) => {
        console.error('选择文件失败:', error);
      }
    });
  },

  /**
   * 发送文件消息
   */
  sendFileMessage(filePath, fileName, fileSize) {
    const message = {
      id: `msg_${Date.now()}`,
      type: 'file',
      fileName: fileName,
      fileSize: this.formatFileSize(fileSize),
      filePath: filePath,
      isMe: true,
      time: this.getCurrentTime(),
      avatar: this.data.currentUser.avatar,
      senderName: this.data.currentUser.name,
      senderId: this.data.currentUser.id
    };

    const messages = [...this.data.messages, message];
    this.setData({
      messages: messages,
      toView: `msg-${messages.length - 1}`,
      showMoreMenu: false
    });

    // 上传文件
    this.uploadFile(filePath, fileName, fileSize);
  },

  /**
   * 上传文件
   */
  uploadFile(filePath, fileName, fileSize) {
    wx.uploadFile({
      url: 'https://your-server.com/upload/file',
      filePath: filePath,
      name: 'file',
      formData: {
        fileName: fileName,
        fileSize: fileSize,
        senderId: this.data.currentUser.id,
        targetId: this.data.targetUser.id
      },
      success: (res) => {
        const data = JSON.parse(res.data);
        if (data.success) {
          // 通过WebSocket发送文件消息
          this.data.wsManager.send({
            type: 'message',
            messageType: 'file',
            fileName: fileName,
            fileSize: this.formatFileSize(fileSize),
            fileUrl: data.url,
            senderId: this.data.currentUser.id,
            targetId: this.data.targetUser.id,
            timestamp: Date.now()
          });
        }
      },
      fail: (error) => {
        console.error('上传文件失败:', error);
      }
    });
  },

  /**
   * 分享位置
   */
  shareLocation() {
    wx.chooseLocation({
      success: (res) => {
        this.sendLocationMessage(res.name, res.address, res.latitude, res.longitude);
      },
      fail: (error) => {
        console.error('选择位置失败:', error);
      }
    });
  },

  /**
   * 发送位置消息
   */
  sendLocationMessage(name, address, latitude, longitude) {
    const message = {
      id: `msg_${Date.now()}`,
      type: 'location',
      locationName: name,
      locationAddress: address,
      latitude: latitude,
      longitude: longitude,
      isMe: true,
      time: this.getCurrentTime(),
      avatar: this.data.currentUser.avatar,
      senderName: this.data.currentUser.name,
      senderId: this.data.currentUser.id
    };

    const messages = [...this.data.messages, message];
    this.setData({
      messages: messages,
      toView: `msg-${messages.length - 1}`,
      showMoreMenu: false
    });

    // 通过WebSocket发送位置消息
    this.data.wsManager.send({
      type: 'message',
      messageType: 'location',
      locationName: name,
      locationAddress: address,
      latitude: latitude,
      longitude: longitude,
      senderId: this.data.currentUser.id,
      targetId: this.data.targetUser.id,
      timestamp: Date.now()
    });
  },

  /**
   * 格式化文件大小
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  /**
   * 下载文件
   */
  downloadFile(e) {
    const { url, name } = e.currentTarget.dataset;
    
    wx.downloadFile({
      url: url,
      success: (res) => {
        if (res.statusCode === 200) {
          // 保存文件到本地
          wx.saveFile({
            tempFilePath: res.tempFilePath,
            success: (saveRes) => {
              wx.showToast({
                title: '文件已保存',
                icon: 'success'
              });
            }
          });
        }
      },
      fail: (error) => {
        wx.showToast({
          title: '下载失败',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 打开位置
   */
  openLocation(e) {
    const { latitude, longitude, name, address } = e.currentTarget.dataset;
    
    wx.openLocation({
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      name: name,
      address: address
    });
  },

  /**
   * 发送图片消息
   */
  sendImageMessage(filePath) {
    const message = {
      id: `msg_${Date.now()}_${Math.random()}`,
      type: 'image',
      imageUrl: filePath,
      isMe: true,
      time: this.getCurrentTime(),
      avatar: this.data.currentUser.avatar,
      senderName: this.data.currentUser.name,
      senderId: this.data.currentUser.id
    };

    const messages = [...this.data.messages, message];
    this.setData({
      messages: messages,
      toView: `msg-${messages.length - 1}`,
      showMoreMenu: false
    });

    // 上传图片文件
    this.uploadImageFile(filePath);
  },

  /**
   * 上传图片文件
   */
  uploadImageFile(filePath) {
    wx.uploadFile({
      url: 'https://your-server.com/upload/image',
      filePath: filePath,
      name: 'image',
      formData: {
        senderId: this.data.currentUser.id,
        targetId: this.data.targetUser.id
      },
      success: (res) => {
        const data = JSON.parse(res.data);
        if (data.success) {
          // 通过WebSocket发送图片消息
          this.data.wsManager.send({
            type: 'message',
            messageType: 'image',
            imageUrl: data.url,
            senderId: this.data.currentUser.id,
            targetId: this.data.targetUser.id,
            timestamp: Date.now()
          });
        }
      },
      fail: (error) => {
        console.error('上传图片失败:', error);
      }
    });
  },

  /**
   * 预览图片
   */
  previewImage(e) {
    const currentSrc = e.currentTarget.dataset.src;
    const urls = this.data.messages
      .filter(msg => msg.type === 'image')
      .map(msg => msg.imageUrl);
    
    wx.previewImage({
      current: currentSrc,
      urls: urls
    });
  },

  /**
   * 初始化语音WebSocket连接（按需连接）
   */
  initVoiceWebSocket() {
    if (this.data.voiceWSManager) {
      return Promise.resolve(this.data.voiceWSManager);
    }

    return new Promise((resolve, reject) => {
      const app = getApp();
      const userId = app.globalData.openId || 'user123';
      
      const voiceWSManager = new WebSocketManager({
        url: `ws://localhost:8080/ws/voice?userId=${userId}`,
        onOpen: () => {
          console.log('语音WebSocket连接成功');
          this.onVoiceWebSocketOpen();
          resolve(voiceWSManager);
        },
        onMessage: this.onVoiceWebSocketMessage.bind(this),
        onClose: this.onVoiceWebSocketClose.bind(this),
        onError: (error) => {
          console.error('语音WebSocket连接失败:', error);
          this.onVoiceWebSocketError(error);
          reject(error);
        },
        reconnectInterval: 3000,
        maxReconnectAttempts: 5
      });

      this.setData({ voiceWSManager });
      app.globalData.voiceWSManager = voiceWSManager;
      
      voiceWSManager.connect();
    });
  },

  /**
   * 开始语音通话
   */
  startVoiceCall() {
    wx.showModal({
      title: '语音通话',
      content: '是否开始语音通话？',
      success: (res) => {
        if (res.confirm) {
          // 先初始化语音WebSocket连接
          this.initVoiceWebSocket().then((voiceWSManager) => {
            // 发送语音通话请求
            voiceWSManager.send({
              type: 'voice_call_request',
              senderId: this.data.currentUser.id,
              targetId: this.data.targetUser.id,
              timestamp: Date.now()
            });
            
            // 跳转到通话页面
            wx.navigateTo({
              url: `/pages/voice-call/voice-call?type=voice&targetUserId=${this.data.targetUser.id}`
            });
          }).catch((error) => {
            wx.showToast({
              title: '语音连接失败',
              icon: 'none'
            });
            console.error('语音WebSocket初始化失败:', error);
          });
        }
      }
    });
  },

  /**
   * 初始化视频WebSocket连接（按需连接）
   */
  initVideoWebSocket() {
    if (this.data.videoWSManager) {
      return Promise.resolve(this.data.videoWSManager);
    }

    return new Promise((resolve, reject) => {
      const app = getApp();
      const userId = app.globalData.openId || 'user123';
      
      const videoWSManager = new WebSocketManager({
        url: `ws://localhost:8080/ws/video?userId=${userId}`,
        onOpen: () => {
          console.log('视频WebSocket连接成功');
          this.onVideoWebSocketOpen();
          resolve(videoWSManager);
        },
        onMessage: this.onVideoWebSocketMessage.bind(this),
        onClose: this.onVideoWebSocketClose.bind(this),
        onError: (error) => {
          console.error('视频WebSocket连接失败:', error);
          this.onVideoWebSocketError(error);
          reject(error);
        },
        reconnectInterval: 3000,
        maxReconnectAttempts: 5
      });

      this.setData({ videoWSManager });
      app.globalData.videoWSManager = videoWSManager;
      
      videoWSManager.connect();
    });
  },

  /**
   * 开始语音通话（符合API文档规范）
   */
  startVoiceCall() {
    wx.showModal({
      title: '语音通话',
      content: '是否开始语音通话？',
      success: (res) => {
        if (res.confirm) {
          // 先初始化语音WebSocket连接
          this.initVoiceWebSocket().then((voiceWSManager) => {
            console.log('语音WebSocket连接成功，开始语音通话流程');
            
            // 根据API文档，语音通话不需要特殊的请求消息
            // 直接通过二进制音频数据进行实时通信
            
            // 跳转到语音通话页面，带上WebSocket连接状态
            wx.navigateTo({
              url: `/pages/voice-call/voice-call?type=voice&targetUserId=${this.data.targetUser.id}&isCaller=true&wsConnected=true`
            });
            
            console.log('已跳转到语音通话页面');
          }).catch((error) => {
            wx.showToast({
              title: '语音连接失败',
              icon: 'none'
            });
            console.error('语音WebSocket初始化失败:', error);
          });
        }
      }
    });
  },

  /**
   * 初始化语音WebSocket连接（按需连接）
   */
  initVoiceWebSocket() {
    if (this.data.voiceWSManager) {
      return Promise.resolve(this.data.voiceWSManager);
    }

    return new Promise((resolve, reject) => {
      const app = getApp();
      const userId = app.globalData.openId || 'user123';
      
      const voiceWSManager = new WebSocketManager({
        url: `ws://localhost:8080/ws/voice?userId=${userId}`,
        onOpen: () => {
          console.log('语音WebSocket连接成功');
          // 发送认证信息
          voiceWSManager.send({
            type: 'auth',
            userId: this.data.currentUser.id,
            targetUserId: this.data.targetUser.id,
            service: 'voice'
          });
          resolve(voiceWSManager);
        },
        onMessage: this.onVoiceWebSocketMessage.bind(this),
        onClose: this.onVoiceWebSocketClose.bind(this),
        onError: (error) => {
          console.error('语音WebSocket连接失败:', error);
          this.onVoiceWebSocketError(error);
          reject(error);
        },
        reconnectInterval: 3000,
        maxReconnectAttempts: 5
      });

      this.setData({ voiceWSManager });
      app.globalData.voiceWSManager = voiceWSManager;
      
      voiceWSManager.connect();
    });
  },

  /**
   * 开始视频通话
   */
  startVideoCall() {
    wx.showModal({
      title: '视频通话',
      content: '是否开始视频通话？',
      success: (res) => {
        if (res.confirm) {
          // 先初始化视频WebSocket连接
          this.initVideoWebSocket().then((videoWSManager) => {
            // 发送视频通话请求
            videoWSManager.send({
              type: 'video_call_request',
              senderId: this.data.currentUser.id,
              targetId: this.data.targetUser.id,
              timestamp: Date.now()
            });
            
            // 跳转到通话页面
            wx.navigateTo({
              url: `/pages/video-call/video-call?type=video&targetUserId=${this.data.targetUser.id}`
            });
          }).catch((error) => {
            wx.showToast({
              title: '视频连接失败',
              icon: 'none'
            });
            console.error('视频WebSocket初始化失败:', error);
          });
        }
      }
    });
  },

  /**
   * 处理语音通话
   */
  handleVoiceCall(data) {
    // 显示来电界面
    wx.showModal({
      title: '语音来电',
      content: `${this.data.targetUser.name} 邀请你进行语音通话`,
      confirmText: '接听',
      cancelText: '拒绝',
      success: (res) => {
        if (res.confirm) {
          // 接听
          this.data.voiceWSManager.send({
            type: 'voice_call_accept',
            senderId: this.data.currentUser.id,
            targetId: this.data.targetUser.id,
            timestamp: Date.now()
          });
          
          wx.navigateTo({
            url: `/pages/voice-call/voice-call?type=voice&targetUserId=${this.data.targetUser.id}&isCaller=false`
          });
        } else {
          // 拒绝
          this.data.voiceWSManager.send({
            type: 'voice_call_reject',
            senderId: this.data.currentUser.id,
            targetId: this.data.targetUser.id,
            timestamp: Date.now()
          });
        }
      }
    });
  },

  /**
   * 处理视频通话
   */
  handleVideoCall(data) {
    // 显示来电界面
    wx.showModal({
      title: '视频来电',
      content: `${this.data.targetUser.name} 邀请你进行视频通话`,
      confirmText: '接听',
      cancelText: '拒绝',
      success: (res) => {
        if (res.confirm) {
          // 接听
          this.data.videoWSManager.send({
            type: 'video_call_accept',
            senderId: this.data.currentUser.id,
            targetId: this.data.targetUser.id,
            timestamp: Date.now()
          });
          
          wx.navigateTo({
            url: `/pages/video-call/video-call?type=video&targetUserId=${this.data.targetUser.id}&isCaller=false`
          });
        } else {
          // 拒绝
          this.data.videoWSManager.send({
            type: 'video_call_reject',
            senderId: this.data.currentUser.id,
            targetId: this.data.targetUser.id,
            timestamp: Date.now()
          });
        }
      }
    });
  },

  /**
   * 显示更多菜单（微信风格：点击+号显示）
   */
  showMoreMenu() {
    this.setData({
      showMoreMenu: !this.data.showMoreMenu
    });
  },

  /**
   * 输入框内容变化
   */
  onInputChange(e) {
    this.setData({
      inputValue: e.detail.value
    });
  },

  /**
   * 获取当前时间
   */
  getCurrentTime() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  },

  /**
   * 格式化时间
   */
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  },

  /**
   * 处理语音通话请求
   */
  handleVoiceCallRequest(data) {
    console.log('处理语音通话请求:', data);
    this.handleVoiceCall(data);
  },

  /**
   * 处理语音通话接受
   */
  handleVoiceCallAccept(data) {
    console.log('语音通话已接受:', data);
    wx.showToast({
      title: '对方已接受语音通话',
      icon: 'none'
    });
  },

  /**
   * 处理语音通话拒绝
   */
  handleVoiceCallReject(data) {
    console.log('语音通话被拒绝:', data);
    wx.showToast({
      title: '对方拒绝了语音通话',
      icon: 'none'
    });
  },

  /**
   * 处理语音通话结束
   */
  handleVoiceCallEnd(data) {
    console.log('语音通话结束:', data);
    wx.showToast({
      title: '语音通话已结束',
      icon: 'none'
    });
  },

  /**
   * 处理视频通话请求
   */
  handleVideoCallRequest(data) {
    console.log('处理视频通话请求:', data);
    this.handleVideoCall(data);
  },

  /**
   * 处理视频通话接受
   */
  handleVideoCallAccept(data) {
    console.log('视频通话已接受:', data);
    wx.showToast({
      title: '对方已接受视频通话',
      icon: 'none'
    });
  },

  /**
   * 处理视频通话拒绝
   */
  handleVideoCallReject(data) {
    console.log('视频通话被拒绝:', data);
    wx.showToast({
      title: '对方拒绝了视频通话',
      icon: 'none'
    });
  },

  /**
   * 处理视频通话结束
   */
  handleVideoCallEnd(data) {
    console.log('视频通话结束:', data);
    wx.showToast({
      title: '视频通话已结束',
      icon: 'none'
    });
  },

  /**
   * 处理WebRTC Offer
   */
  handleWebRTCOffer(data) {
    console.log('收到WebRTC Offer:', data);
    // 这里可以处理WebRTC连接建立
  },

  /**
   * 处理WebRTC Answer
   */
  handleWebRTCAnswer(data) {
    console.log('收到WebRTC Answer:', data);
    // 这里可以处理WebRTC连接建立
  },

  /**
   * 处理WebRTC ICE候选
   */
  handleWebRTCIce(data) {
    console.log('收到WebRTC ICE候选:', data);
    // 这里可以处理WebRTC连接建立
  },

  /**
   * 开始语音通话
   */
  startVoiceCall() {
    wx.showModal({
      title: '语音通话',
      content: '是否开始语音通话？',
      success: (res) => {
        if (res.confirm) {
          // 先初始化语音WebSocket连接
          this.initVoiceWebSocket().then((voiceWSManager) => {
            // 发送语音通话请求
            voiceWSManager.send({
              type: 'voice_call_request',
              senderId: this.data.currentUser.id,
              targetId: this.data.targetUser.id,
              timestamp: Date.now()
            });
            
            // 跳转到通话页面
            wx.navigateTo({
              url: `/pages/voice-call/voice-call?type=voice&targetUserId=${this.data.targetUser.id}`
            });
          }).catch((error) => {
            wx.showToast({
              title: '语音连接失败',
              icon: 'none'
            });
            console.error('语音WebSocket初始化失败:', error);
          });
        }
      }
    });
  },

  /**
   * 初始化语音WebSocket连接（按需连接）
   */
  initVoiceWebSocket() {
    if (this.data.voiceWSManager) {
      return Promise.resolve(this.data.voiceWSManager);
    }

    return new Promise((resolve, reject) => {
      const app = getApp();
      const userId = app.globalData.openId || 'user123';
      
      const voiceWSManager = new WebSocketManager({
        url: `ws://localhost:8080/ws/voice?userId=${userId}`,
        onOpen: () => {
          console.log('语音WebSocket连接成功');
          this.onVoiceWebSocketOpen();
          resolve(voiceWSManager);
        },
        onMessage: this.onVoiceWebSocketMessage.bind(this),
        onClose: this.onVoiceWebSocketClose.bind(this),
        onError: (error) => {
          console.error('语音WebSocket连接失败:', error);
          this.onVoiceWebSocketError(error);
          reject(error);
        },
        reconnectInterval: 3000,
        maxReconnectAttempts: 5
      });

      this.setData({ voiceWSManager });
      app.globalData.voiceWSManager = voiceWSManager;
      
      voiceWSManager.connect();
    });
  },

  /**
   * 语音WebSocket连接成功
   */
  onVoiceWebSocketOpen() {
    console.log('语音WebSocket连接成功');
    // 发送语音服务认证信息
    if (this.data.voiceWSManager) {
      this.data.voiceWSManager.send({
        type: 'auth',
        userId: this.data.currentUser.id,
        targetUserId: this.data.targetUser.id,
        service: 'voice'
      });
    }
  },

  /**
   * 收到语音WebSocket消息
   */
  onVoiceWebSocketMessage(message) {
    console.log('收到语音WebSocket消息:', message);
    
    try {
      if (typeof message.data === 'string') {
        // 检查是否为错误消息
        if (message.data.startsWith('抱歉，处理您的请求时发生了错误') || 
            message.data.startsWith('处理失败:') || 
            message.data.startsWith('识别失败:') || 
            message.data.startsWith('AI处理失败:')) {
          console.error('语音服务器错误:', message.data);
          wx.showToast({
            title: '语音服务错误，请稍后重试',
            icon: 'none'
          });
          return;
        }
        
        const data = JSON.parse(message.data);
        
        switch (data.type) {
          case 'voice_call':
            this.handleVoiceCall(data);
            break;
          case 'voice_call_request':
            this.handleVoiceCallRequest(data);
            break;
          case 'voice_call_accept':
            this.handleVoiceCallAccept(data);
            break;
          case 'voice_call_reject':
            this.handleVoiceCallReject(data);
            break;
          case 'voice_call_end':
            this.handleVoiceCallEnd(data);
            break;
          default:
            console.log('未知语音消息类型:', data.type);
        }
      }
    } catch (error) {
      console.error('解析语音消息失败:', error, '原始消息:', message.data);
    }
  },

  /**
   * 语音WebSocket连接关闭
   */
  onVoiceWebSocketClose() {
    console.log('语音WebSocket连接关闭');
  },

  /**
   * 语音WebSocket错误
   */
  onVoiceWebSocketError(error) {
    console.error('语音WebSocket错误:', error);
  },

  /**
   * 处理语音通话（符合API文档的实时通信模式）
   */
  handleVoiceCall(data) {
    console.log('处理语音通话请求，数据:', data);
    
    // 根据API文档，语音通话是基于WebSocket二进制数据的实时通信
    // 不需要复杂的请求/响应机制
    
    // 显示来电界面
    wx.showModal({
      title: '语音来电',
      content: `${this.data.targetUser.name} 邀请你进行语音通话`,
      confirmText: '接听',
      cancelText: '拒绝',
      success: (res) => {
        if (res.confirm) {
          console.log('用户选择接听语音通话');
          
          // 接听 - 直接跳转到通话页面，通过WebSocket进行实时通信
          wx.navigateTo({
            url: `/pages/voice-call/voice-call?type=voice&targetUserId=${this.data.targetUser.id}&isCaller=false`
          });
          
          console.log('已跳转到语音通话页面，开始实时语音通信');
        } else {
          console.log('用户拒绝接听语音通话');
          // 拒绝 - 不需要特殊处理，关闭弹窗即可
        }
      }
    });
  },

  /**
   * 处理语音通话请求
   */
  handleVoiceCallRequest(data) {
    console.log('处理语音通话请求:', data);
    this.handleVoiceCall(data);
  },

  /**
   * 处理语音通话接受
   */
  handleVoiceCallAccept(data) {
    console.log('语音通话已接受:', data);
    wx.showToast({
      title: '对方已接受语音通话',
      icon: 'none'
    });
  },

  /**
   * 处理语音通话拒绝
   */
  handleVoiceCallReject(data) {
    console.log('语音通话被拒绝:', data);
    wx.showToast({
      title: '对方拒绝了语音通话',
      icon: 'none'
    });
  },

  /**
   * 处理语音通话结束
   */
  handleVoiceCallEnd(data) {
    console.log('语音通话结束:', data);
    wx.showToast({
      title: '语音通话已结束',
      icon: 'none'
    });
  },

  /**
   * 滚动到底部
   */
  scrollToBottom() {
    const length = this.data.messages.length;
    if (length > 0) {
      this.setData({
        toView: `msg-${length - 1}`
      });
    }
  },

  /**
   * 检查WebSocket连接状态
   */
  isWebSocketConnected(wsManager) {
    return wsManager && wsManager.isConnected;
  },

  /**
   * 安全发送WebSocket消息
   */
  safeSendMessage(wsManager, message) {
    if (this.isWebSocketConnected(wsManager)) {
      wsManager.send(message);
      return true;
    } else {
      console.warn('WebSocket未连接，无法发送消息:', message);
      wx.showToast({
        title: '连接断开，请稍后重试',
        icon: 'none'
      });
      return false;
    }
  },

  /**
   * 处理传入的语音音频数据（符合API文档规范）
   */
  handleIncomingVoiceAudio(audioData) {
    console.log('处理传入语音音频数据，长度:', audioData.byteLength, '字节');
    
    // 检查音频数据格式是否符合要求（PCM, 16kHz, 16bit, 单声道）
    if (audioData.byteLength === 0) {
      console.warn('收到的音频数据为空');
      return;
    }
    
    // 创建临时文件保存音频数据
    const fileManager = wx.getFileSystemManager();
    const tempFilePath = `${wx.env.USER_DATA_PATH}/voice_${Date.now()}.pcm`;
    
    try {
      // 将ArrayBuffer写入临时文件
      fileManager.writeFile({
        filePath: tempFilePath,
        data: audioData,
        encoding: 'binary',
        success: () => {
          console.log('语音音频数据已保存到临时文件:', tempFilePath);
          
          // 第三步：修复语音文件大小读取（使用ArrayBuffer原生属性）
            const audioDataSize = audioData.byteLength; // 正确使用ArrayBuffer的byteLength属性
            console.log('语音数据实际大小:', audioDataSize, '字节');
            
            // 根据API文档规范计算音频参数
            const sampleCount = audioDataSize / 2; // 16位样本数
            const durationMs = (sampleCount / 16000) * 1000; // 16kHz采样率
          
          // 创建语音消息（符合API文档的PCM格式）
          const message = {
            id: `voice_${Date.now()}`,
            type: 'voice',
            voiceUrl: tempFilePath,
            duration: Math.ceil(durationMs / 1000), // 转换为秒
            isMe: false,
            time: this.getCurrentTime(),
            avatar: this.data.targetUser.avatar,
            senderName: this.data.targetUser.name,
            senderId: this.data.targetUser.id,
            isBinary: true, // 标记为二进制音频数据
            audioSize: audioDataSize, // 使用修复后的大小
            format: 'pcm_16bit', // 符合API文档要求
            sampleRate: 16000,
            channels: 1,
            bitDepth: 16
          };

          // 添加到消息列表
          const messages = [...this.data.messages, message];
          this.setData({
            messages: messages,
            toView: `msg-${messages.length - 1}`
          });
          
          console.log('语音消息已添加到聊天界面，格式: PCM, 16kHz, 16bit, 单声道');
        },
        fail: (error) => {
          console.error('保存语音音频数据失败:', error);
        }
      });
    } catch (error) {
      console.error('处理传入语音音频数据异常:', error);
    }
  },

  /**
   * 处理语音消息元数据
   */
  handleVoiceMessageMetadata(data) {
    console.log('处理语音消息元数据:', data);
    
    if (data.duration && data.audioSize) {
      // 查找最近的语音消息并更新其元数据
      const messages = this.data.messages.map(msg => {
        if (msg.type === 'voice' && msg.isBinary && msg.audioSize === data.audioSize) {
          return {
            ...msg,
            duration: data.duration,
            hasMetadata: true
          };
        }
        return msg;
      });
      
      this.setData({ messages });
      console.log('语音消息元数据已更新');
    }
  },

  /**
   * 获取下一个序列号
   */
  getNextSequenceNumber() {
    if (!this.sequenceNumber) {
      this.sequenceNumber = 0;
    }
    return this.sequenceNumber++;
  },

  /**
   * 处理AI回复消息
   */
  handleAIResponse(data) {
    console.log('收到AI回复:', data);
    
    // 检查AI回复的状态
    if (data.status === 'success' && data.data) {
      // 创建AI回复消息
      const aiMessage = {
        id: `ai_${Date.now()}`,
        type: 'text',
        content: data.data,
        isMe: false,
        time: this.getCurrentTime(),
        avatar: this.data.targetUser.avatar,
        senderName: 'AI助手',
        senderId: 'ai_assistant'
      };
      
      // 添加到消息列表
      const messages = [...this.data.messages, aiMessage];
      this.setData({
        messages: messages,
        toView: `msg-${messages.length - 1}`
      });
      
      console.log('AI回复已添加到聊天界面:', data.data);
    } else {
      console.error('AI回复格式错误:', data);
      if (data.message) {
        wx.showToast({
          title: data.message,
          icon: 'none'
        });
      }
    }
  },

  /**
   * 计算音频级别（简化版本）
   */
  calculateAudioLevel(audioData) {
    if (!(audioData instanceof ArrayBuffer)) return 0;
    
    const dataView = new DataView(audioData);
    const sampleCount = dataView.byteLength / 2; // 16位样本
    let sum = 0;
    
    // 计算RMS（均方根）值作为音频级别
    for (let i = 0; i < sampleCount; i++) {
      const sample = dataView.getInt16(i * 2, true) / 32768.0; // 归一化到-1到1
      sum += sample * sample;
    }
    
    const rms = Math.sqrt(sum / sampleCount);
    return Math.min(rms, 1.0); // 限制在0-1范围内
  },

  /**
   * 处理控制命令确认（新的API文档要求）
   */
  handleControlAck(data) {
    console.log('收到控制命令确认:', data);
    
    if (data.action === 'start_recording' && data.status === 'success') {
      console.log('服务器确认录音开始');
      wx.showToast({
        title: '录音已开始',
        icon: 'success',
        duration: 1000
      });
    } else if (data.action === 'stop_recording' && data.status === 'success') {
      console.log('服务器确认录音停止');
      wx.showToast({
        title: '录音已停止',
        icon: 'success',
        duration: 1000
      });
    }
  },

  /**
   * 处理语音识别结果（新的API文档要求）
   */
  handleASRResult(data) {
    console.log('收到语音识别结果:', data);
    
    if (data.status === 'success' && data.data) {
      // 显示语音识别结果
      const asrMessage = {
        id: `asr_${Date.now()}`,
        type: 'text',
        content: `语音识别: ${data.data}`,
        isMe: false,
        time: this.getCurrentTime(),
        avatar: this.data.targetUser.avatar,
        senderName: '语音识别',
        senderId: 'asr_system'
      };
      
      const messages = [...this.data.messages, asrMessage];
      this.setData({
        messages: messages,
        toView: `msg-${messages.length - 1}`
      });
    }
  },

  /**
   * 处理语音识别错误（新的API文档要求）
   */
  handleASRError(data) {
    console.error('收到语音识别错误:', data);
    
    let errorMessage = '语音识别失败';
    if (data.message) {
      if (data.message.includes('NO_VALID_AUDIO_ERROR')) {
        errorMessage = '音频数据无效，请重新录音';
      } else {
        errorMessage = data.message;
      }
    }
    
    wx.showToast({
      title: errorMessage,
      icon: 'none',
      duration: 3000
    });
  },

  /**
   * 处理消息错误（最新的API文档要求）
   */
  handleMessageError(data) {
    console.error('收到消息处理错误:', data);
    
    let errorMessage = '处理消息失败';
    if (data.message) {
      errorMessage = data.message;
    }
    
    wx.showToast({
      title: errorMessage,
      icon: 'none',
      duration: 3000
    });
  },

  /**
   * 语音WebSocket连接成功
   */
  onVoiceWebSocketOpen() {
    console.log('语音WebSocket连接成功');
    // 发送语音服务认证信息
    if (this.data.voiceWSManager) {
      this.data.voiceWSManager.send({
        type: 'auth',
        userId: this.data.currentUser.id,
        targetUserId: this.data.targetUser.id,
        service: 'voice'
      });
    }
  },

  /**
   * 语音WebSocket连接关闭
   */
  onVoiceWebSocketClose() {
    console.log('语音WebSocket连接关闭');
  },

  /**
   * 语音WebSocket错误
   */
  onVoiceWebSocketError(error) {
    console.error('语音WebSocket错误:', error);
  }
})