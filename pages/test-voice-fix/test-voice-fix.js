// 语音通讯修复验证脚本
// 用于验证空对象发送问题是否已修复

const app = getApp();

Page({
  data: {
    testResults: [],
    isTesting: false,
    connectionStatus: '未连接',
    messageLog: []
  },

  onLoad() {
    this.testVoiceCommunicationFix();
  },

  // 测试语音通讯修复
  testVoiceCommunicationFix() {
    this.setData({ 
      isTesting: true,
      testResults: [],
      messageLog: []
    });

    this.addResult('开始验证语音通讯修复...', 'info');
    this.addResult('测试目标：确保不再发送空对象 {}', 'info');

    // 步骤1：测试WebSocket连接
    this.testWebSocketConnection();
  },

  // 测试WebSocket连接
  testWebSocketConnection() {
    this.addResult('正在测试WebSocket连接...', 'info');
    
    const userId = app.globalData.openId || 'test_user_' + Date.now();
    
    // 使用页面内定义的WebSocketManager
    this.voiceWSManager = new WebSocketManager({
      url: `ws://localhost:8080/ws/voice?userId=${userId}`,
      onOpen: () => {
        this.addResult('WebSocket连接成功', 'success');
        this.setData({ connectionStatus: '已连接' });
        
        // 开始拦截和记录所有发送的消息
        this.interceptMessages();
        
        // 继续测试消息发送
        setTimeout(() => this.testMessageSending(), 1000);
      },
      onError: (error) => {
        this.addResult(`WebSocket连接失败: ${error.errMsg || '未知错误'}`, 'error');
        this.setData({ connectionStatus: '连接失败' });
        this.completeTest();
      },
      onMessage: (message) => {
        this.handleTestMessage(message);
      }
    });

    this.voiceWSManager.connect();
    
    // 10秒连接超时
    setTimeout(() => {
      if (this.data.connectionStatus === '未连接') {
        this.addResult('WebSocket连接超时', 'error');
        this.completeTest();
      }
    }, 10000);
  },

  // 拦截消息发送，记录所有发送的消息
  interceptMessages() {
    if (!this.voiceWSManager) return;
    
    const originalSend = this.voiceWSManager.send.bind(this.voiceWSManager);
    this.voiceWSManager.send = (data) => {
      this.logMessage('发送', data);
      return originalSend(data);
    };
    
    this.addResult('已启用消息拦截和记录', 'success');
  },

  // 记录消息
  logMessage(direction, data) {
    const timestamp = new Date().toLocaleTimeString();
    let messageInfo = '';
    
    if (data instanceof ArrayBuffer) {
      messageInfo = `二进制数据 (${data.byteLength} 字节)`;
    } else if (typeof data === 'string') {
      messageInfo = `文本: ${data}`;
      // 检查是否为空对象
      if (data === '{}') {
        messageInfo += ' [⚠️ 空对象!]';
        this.addResult('检测到空对象发送!', 'error');
      }
    } else {
      messageInfo = `未知类型: ${typeof data}`;
    }
    
    const logEntry = {
      time: timestamp,
      direction: direction,
      message: messageInfo,
      rawData: data instanceof ArrayBuffer ? `ArrayBuffer(${data.byteLength})` : data
    };
    
    const messageLog = [...this.data.messageLog, logEntry];
    this.setData({ messageLog: messageLog });
  },

  // 测试消息发送
  testMessageSending() {
    this.addResult('开始测试消息发送...', 'info');
    
    // 测试1：发送认证消息
    this.addResult('测试1: 发送认证消息', 'info');
    const authMessage = {
      type: 'auth',
      userId: 'test_user',
      targetUserId: 'test_target',
      service: 'voice'
    };
    this.voiceWSManager.send(JSON.stringify(authMessage));
    
    // 测试2：模拟发送空对象（应该被拦截）
    setTimeout(() => {
      this.addResult('测试2: 尝试发送空对象（应该被拦截）', 'info');
      this.voiceWSManager.send('{}');
    }, 1000);
    
    // 测试3：发送用户说话结束消息
    setTimeout(() => {
      this.addResult('测试3: 发送用户说话结束消息', 'info');
      const endMessage = {
        type: 'user_speaking_end',
        senderId: 'test_user',
        targetId: 'test_target',
        timestamp: Date.now()
      };
      this.voiceWSManager.send(JSON.stringify(endMessage));
    }, 2000);
    
    // 测试4：发送通话结束消息
    setTimeout(() => {
      this.addResult('测试4: 发送通话结束消息', 'info');
      const endCallMessage = {
        type: 'voice_call_end',
        senderId: 'test_user',
        targetUserId: 'test_target',
        timestamp: Date.now()
      };
      this.voiceWSManager.send(JSON.stringify(endCallMessage));
    }, 3000);
    
    // 完成测试
    setTimeout(() => {
      this.completeMessageTest();
    }, 4000);
  },

  // 完成消息测试
  completeMessageTest() {
    this.addResult('消息发送测试完成', 'info');
    
    // 分析消息日志
    const emptyObjectCount = this.data.messageLog.filter(log => 
      log.message.includes('{}') || log.message.includes('空对象')
    ).length;
    
    if (emptyObjectCount > 0) {
      this.addResult(`检测到 ${emptyObjectCount} 个空对象发送!`, 'error');
    } else {
      this.addResult('未检测到空对象发送 ✓', 'success');
    }
    
    // 继续测试音频录制
    setTimeout(() => this.testAudioRecording(), 1000);
  },

  // 测试音频录制
  testAudioRecording() {
    this.addResult('开始测试音频录制...', 'info');
    
    const recorderManager = wx.getRecorderManager();
    
    // 录制参数 - 修复后的配置
    const recordingOptions = {
      duration: 3000, // 3秒测试
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 64000,
      format: 'pcm',
      frameSize: 2
    };

    let audioFrameCount = 0;
    let validFrameCount = 0;

    // 监听音频帧数据
    recorderManager.onFrameRecorded((res) => {
      if (res.frameBuffer && res.frameBuffer.byteLength > 0) {
        audioFrameCount++;
        
        // 验证音频数据（模拟安全发送方法的逻辑）
        const dataView = new DataView(res.frameBuffer);
        let hasValidData = false;
        
        const sampleCount = Math.min(50, res.frameBuffer.byteLength / 2);
        for (let i = 0; i < sampleCount; i++) {
          const sample = dataView.getInt16(i * 2, true);
          if (sample !== 0) {
            hasValidData = true;
            break;
          }
        }
        
        if (hasValidData) {
          validFrameCount++;
          this.logMessage('发送', res.frameBuffer);
        } else {
          this.addResult(`跳过无效音频帧 ${audioFrameCount}`, 'warning');
        }
      }
    });

    recorderManager.onStart(() => {
      this.addResult('音频录制开始', 'success');
    });

    recorderManager.onStop(() => {
      this.addResult(`音频录制停止，共收到 ${audioFrameCount} 帧，有效帧 ${validFrameCount}`, 'success');
      this.completeTest();
    });

    recorderManager.onError((error) => {
      this.addResult(`音频录制错误: ${error.errMsg}`, 'error');
      this.completeTest();
    });

    // 开始录制
    recorderManager.start(recordingOptions);
    this.addResult(`录制参数: PCM, 16kHz, 单声道, ${recordingOptions.encodeBitRate}bps`, 'info');
    
    // 3秒后停止录制
    setTimeout(() => {
      recorderManager.stop();
    }, 3000);
  },

  // 处理测试消息
  handleTestMessage(message) {
    if (typeof message.data === 'string') {
      this.logMessage('接收', message.data);
      
      try {
        const data = JSON.parse(message.data);
        if (data.type) {
          this.addResult(`收到${data.type}响应`, 'success');
        }
      } catch (e) {
        // 不是JSON格式，忽略
      }
    } else if (message.data instanceof ArrayBuffer) {
      this.logMessage('接收', message.data);
      this.addResult(`收到二进制音频数据: ${message.data.byteLength} 字节`, 'success');
    }
  },

  // 添加测试结果
  addResult(message, type = 'info') {
    const results = [...this.data.testResults, {
      message,
      type,
      time: new Date().toLocaleTimeString()
    }];
    
    this.setData({ testResults: results });
  },

  // 完成测试
  completeTest() {
    this.addResult('测试完成', 'info');
    this.setData({ isTesting: false });
    
    // 断开WebSocket连接
    if (this.voiceWSManager) {
      this.voiceWSManager.disconnect();
      this.setData({ connectionStatus: '已断开' });
    }
    
    // 显示测试总结
    const successCount = this.data.testResults.filter(r => r.type === 'success').length;
    const errorCount = this.data.testResults.filter(r => r.type === 'error').length;
    const warningCount = this.data.testResults.filter(r => r.type === 'warning').length;
    
    this.addResult(`测试总结: 成功 ${successCount}, 警告 ${warningCount}, 错误 ${errorCount}`, 'info');
    
    if (errorCount === 0) {
      this.addResult('✅ 所有测试通过！空对象问题已修复', 'success');
    } else {
      this.addResult('❌ 测试未完全通过，需要进一步修复', 'error');
    }
  },

  // 重新测试
  retest() {
    this.testVoiceCommunicationFix();
  },

  // 返回
  goBack() {
    wx.navigateBack();
  },

  onUnload() {
    // 清理资源
    if (this.voiceWSManager) {
      this.voiceWSManager.disconnect();
    }
    if (this.connectionCheckTimer) {
      clearInterval(this.connectionCheckTimer);
    }
  }
})