// pages/MainInterface/MainInterface.js
const WebSocketManager = require('../../utils/websocket.js');

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
    this.loadHistoryMessages();
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
    if (this.data.voiceRecorder) {
      this.data.voiceRecorder.stop();
    }
  },

  /**
   * 初始化WebSocket连接
   */
  initWebSocket() {
    // 获取全局数据中的认证信息
    const app = getApp();
    const globalData = app.globalData || {};
    
    // 构建WebSocket URL，包含认证信息
    const url = `ws://localhost:8080/ws/chat?token=${globalData.token}&openId=${globalData.openId}`;
    
    const wsManager = new WebSocketManager({
      url: url,
      onOpen: this.onWebSocketOpen.bind(this),
      onMessage: this.onWebSocketMessage.bind(this),
      onClose: this.onWebSocketClose.bind(this),
      onError: this.onWebSocketError.bind(this),
      reconnectInterval: 3000,
      maxReconnectAttempts: 5
    });

    this.setData({ wsManager });
    wsManager.connect();
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
   * 收到WebSocket消息
   */
  onWebSocketMessage(event) {
    console.log('收到消息:', event.data);
    
    try {
      // 尝试解析JSON消息
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'CHAT':
          this.receiveMessage(data);
          break;
        case 'CONTROL':
          this.handleControlMessage(data);
          break;
        default:
          console.log('未知消息类型:', data.type);
      }
    } catch (e) {
      // 处理非JSON消息（如PING/PONG）
      if (event.data === 'PING') {
        // PING消息已在WebSocketManager中处理
        return;
      }
      console.log('收到非JSON消息:', event.data);
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
        content: '现在可以发送文本消息了。',
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
   * 发送消息
   */
  sendMessage() {
    const content = this.data.inputValue.trim();
    if (!content) return;

    // 通过WebSocket发送
    if (this.data.wsManager && this.data.wsManager.isConnected()) {
      const success = this.data.wsManager.send({
        type: 'CHAT',
        content: content
      });
      
      if (success) {
        // 发送成功，添加到本地消息列表
        const message = {
          id: `msg_${Date.now()}`,
          type: 'text',
          content: content,
          isMe: true,
          time: this.getCurrentTime(),
          avatar: this.data.currentUser.avatar,
          senderName: this.data.currentUser.name,
          senderId: this.data.currentUser.id
        };

        // 添加到本地消息列表
        const messages = [...this.data.messages, message];
        this.setData({
          messages: messages,
          inputValue: '',
          toView: `msg-${messages.length - 1}`
        });
      } else {
        wx.showToast({
          title: '发送失败',
          icon: 'none'
        });
      }
    } else {
      wx.showToast({
        title: '未连接到服务器',
        icon: 'none'
      });
    }
  },

  /**
   * 接收消息
   */
  receiveMessage(data) {
    const message = {
      id: `msg_${Date.now()}`,
      type: 'text',
      content: data.content,
      isMe: false,
      time: this.getCurrentTime(),
      avatar: this.data.targetUser.avatar,
      senderName: this.data.targetUser.name,
      senderId: this.data.targetUser.id
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
   * 开始录制语音
   */
  startRecording(e) {
    if (this.data.inputMode !== 'voice') return;
    
    this.setData({
      isRecording: true,
      recordingStatus: 'recording',
      recordingText: '松开发送'
    });

    // 开始录制
    this.data.voiceRecorder.start();
    this.startRecordingTimer();
  },

  /**
   * 停止录制语音
   */
  stopRecording() {
    if (!this.data.isRecording) return;

    this.setData({
      isRecording: false,
      recordingStatus: 'ready',
      recordingText: '按住说话',
      recordingTime: 0
    });

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

    // 发送语音消息
    this.sendVoiceMessage(res.tempFilePath, res.duration);
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
   * 发送语音消息
   */
  sendVoiceMessage(voiceUrl, duration) {
    const message = {
      id: `msg_${Date.now()}`,
      type: 'voice',
      voiceUrl: voiceUrl,
      duration: Math.ceil(duration / 1000),
      isMe: true,
      time: this.getCurrentTime(),
      avatar: this.data.currentUser.avatar,
      senderName: this.data.currentUser.name,
      senderId: this.data.currentUser.id
    };

    const messages = [...this.data.messages, message];
    this.setData({
      messages: messages,
      toView: `msg-${messages.length - 1}`
    });

    // 上传语音文件并发送
    this.uploadVoiceFile(voiceUrl, duration);
  },

  /**
   * 上传语音文件
   */
  uploadVoiceFile(filePath, duration) {
    wx.uploadFile({
      url: 'https://your-server.com/upload/voice',
      filePath: filePath,
      name: 'voice',
      formData: {
        duration: duration,
        senderId: this.data.currentUser.id,
        targetId: this.data.targetUser.id
      },
      success: (res) => {
        const data = JSON.parse(res.data);
        if (data.success) {
          // 通过WebSocket发送语音消息
          this.data.wsManager.send({
            type: 'message',
            messageType: 'voice',
            voiceUrl: data.url,
            duration: Math.ceil(duration / 1000),
            senderId: this.data.currentUser.id,
            targetId: this.data.targetUser.id,
            timestamp: Date.now()
          });
        }
      },
      fail: (error) => {
        console.error('上传语音失败:', error);
      }
    });
  },

  /**
   * 播放语音
   */
  playVoice(e) {
    const voiceUrl = e.currentTarget.dataset.voice;
    const duration = e.currentTarget.dataset.duration;
    
    if (!voiceUrl) return;

    const innerAudioContext = wx.createInnerAudioContext();
    innerAudioContext.src = voiceUrl;
    
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
   * 开始语音通话
   */
  startVoiceCall() {
    wx.showModal({
      title: '语音通话',
      content: '是否开始语音通话？',
      success: (res) => {
        if (res.confirm) {
          // 发送语音通话请求
          this.data.wsManager.send({
            type: 'voice_call_request',
            senderId: this.data.currentUser.id,
            targetId: this.data.targetUser.id,
            timestamp: Date.now()
          });
          
          // 跳转到通话页面
          wx.navigateTo({
            url: `/pages/voice-call/voice-call?type=voice&targetUserId=${this.data.targetUser.id}`
          });
        }
      }
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
          // 发送视频通话请求
          this.data.wsManager.send({
            type: 'video_call_request',
            senderId: this.data.currentUser.id,
            targetId: this.data.targetUser.id,
            timestamp: Date.now()
          });
          
          // 跳转到通话页面
          wx.navigateTo({
            url: `/pages/video-call/video-call?type=video&targetUserId=${this.data.targetUser.id}`
          });
        }
      }
    });
  },

  /**
   * 处理控制消息
   */
  handleControlMessage(data) {
    if (data.content === '连接已建立') {
      this.setData({
        connectionStatus: '已连接'
      });
    } else {
      // 其他控制消息作为系统消息显示
      const message = {
        id: `msg_${Date.now()}`,
        type: 'text',
        content: data.content,
        isMe: false,
        time: this.getCurrentTime(),
        avatar: this.data.targetUser.avatar,
        senderName: '系统',
        senderId: 'system'
      };

      const messages = [...this.data.messages, message];
      this.setData({
        messages: messages,
        toView: `msg-${messages.length - 1}`
      });
    }
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
   * 滚动到底部
   */
  scrollToBottom() {
    const length = this.data.messages.length;
    if (length > 0) {
      this.setData({
        toView: `msg-${length - 1}`
      });
    }
  }
})