// 语音通讯测试页面
const app = getApp();

// 简化的WebSocketManager实现
class WebSocketManager {
  constructor(options = {}) {
    this.url = options.url || '';
    this.onOpen = options.onOpen || function() {};
    this.onMessage = options.onMessage || function() {};
    this.onClose = options.onClose || function() {};
    this.onError = options.onError || function() {};
    this.reconnectInterval = options.reconnectInterval || 3000;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
    
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
  }

  connect() {
    if (this.socket && this.isConnected) {
      console.log('WebSocket已连接，无需重复连接');
      return;
    }

    console.log('正在连接WebSocket:', this.url);
    
    try {
      this.socket = wx.connectSocket({
        url: this.url,
        header: {
          'content-type': 'application/json'
        },
        method: 'GET',
        success: () => {
          console.log('WebSocket连接请求已发送');
        },
        fail: (error) => {
          console.error('WebSocket连接失败:', error);
          this.handleConnectionError(error);
        }
      });

      this.setupSocketEvents();
    } catch (error) {
      console.error('创建WebSocket连接异常:', error);
      this.handleConnectionError(error);
    }
  }

  setupSocketEvents() {
    if (!this.socket) return;

    // 连接成功
    this.socket.onOpen(() => {
      console.log('WebSocket连接已建立');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.onOpen();
    });

    // 收到消息
    this.socket.onMessage((message) => {
      console.log('收到WebSocket消息:', message);
      this.onMessage(message);
    });

    // 连接关闭
    this.socket.onClose((res) => {
      console.log('WebSocket连接已关闭:', res);
      this.isConnected = false;
      this.onClose(res);
    });

    // 连接错误
    this.socket.onError((error) => {
      console.error('WebSocket错误:', error);
      this.isConnected = false;
      this.onError(error);
    });
  }

  send(data) {
    if (!this.isConnected || !this.socket) {
      console.error('WebSocket未连接，无法发送消息');
      return false;
    }

    try {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      console.log('发送WebSocket消息:', message);
      
      this.socket.send({
        data: message,
        success: () => {
          console.log('消息发送成功');
        },
        fail: (error) => {
          console.error('消息发送失败:', error);
        }
      });
      
      return true;
    } catch (error) {
      console.error('发送消息异常:', error);
      return false;
    }
  }

  disconnect() {
    console.log('正在断开WebSocket连接');
    
    if (this.socket && this.isConnected) {
      this.socket.close({
        code: 1000,
        reason: '用户主动断开连接'
      });
    }
    
    this.socket = null;
    this.isConnected = false;
  }

  isConnected() {
    return this.isConnected;
  }
  
  handleConnectionError(error) {
    this.isConnected = false;
    this.onError(error);
  }
}

Page({
  data: {
    testStatus: 'ready', // ready, testing, completed
    testResults: [],
    connectionStatus: '未连接',
    recordingStatus: '未开始',
    audioLevel: 0,
    isRecording: false
  },

  onLoad() {
    this.testVoiceCommunication();
  },

  // 测试语音通讯
  testVoiceCommunication() {
    this.setData({ 
      testStatus: 'testing',
      testResults: []
    });

    this.addResult('开始语音通讯测试...', 'info');

    // 步骤1：测试WebSocket连接
    this.testWebSocketConnection();
  },

  // 测试WebSocket连接
  testWebSocketConnection() {
    this.addResult('正在测试WebSocket连接...', 'info');
    
    const userId = app.globalData.openId || 'test_user_' + Date.now();
    const WebSocketManager = require('../../utils/websocket-fix.js');
    
    this.voiceWSManager = new WebSocketManager({
      url: `ws://localhost:8080/ws/voice?userId=${userId}`,
      onOpen: () => {
        this.addResult('WebSocket连接成功', 'success');
        this.setData({ connectionStatus: '已连接' });
        
        // 发送认证信息
        this.voiceWSManager.send(JSON.stringify({
          type: 'auth',
          userId: userId,
          targetUserId: 'test_target',
          service: 'voice'
        }));
        
        // 继续测试音频录制
        setTimeout(() => this.testAudioRecording(), 1000);
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

  // 测试音频录制
  testAudioRecording() {
    this.addResult('正在测试音频录制...', 'info');
    this.setData({ recordingStatus: '准备录制' });
    
    const recorderManager = wx.getRecorderManager();
    
    // 录制参数 - 修复后的配置
    const recordingOptions = {
      duration: 5000, // 5秒测试
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 64000,
      format: 'pcm',
      frameSize: 2
    };

    let audioFrameCount = 0;
    let totalAudioData = 0;

    // 监听音频帧数据
    recorderManager.onFrameRecorded((res) => {
      if (res.frameBuffer && res.frameBuffer.byteLength > 0) {
        audioFrameCount++;
        totalAudioData += res.frameBuffer.byteLength;
        
        // 验证音频数据
        const isValid = this.validateAudioData(res.frameBuffer);
        
        if (isValid) {
          // 发送音频数据到服务器
          if (this.voiceWSManager && this.voiceWSManager.isConnected) {
            this.voiceWSManager.send(res.frameBuffer);
            
            if (audioFrameCount <= 3) { // 只显示前3帧的日志
              this.addResult(`发送音频帧 ${audioFrameCount}: ${res.frameBuffer.byteLength} 字节`, 'success');
            }
          }
        } else {
          this.addResult(`跳过无效音频帧 ${audioFrameCount}`, 'warning');
        }
      }
    });

    recorderManager.onStart(() => {
      this.addResult('音频录制开始', 'success');
      this.setData({ 
        recordingStatus: '录制中',
        isRecording: true
      });
    });

    recorderManager.onStop(() => {
      this.addResult(`音频录制停止，共收到 ${audioFrameCount} 帧，总数据量: ${totalAudioData} 字节`, 'success');
      this.setData({ 
        recordingStatus: '录制完成',
        isRecording: false
      });
      
      // 继续测试音频播放
      setTimeout(() => this.testAudioPlayback(), 1000);
    });

    recorderManager.onError((error) => {
      this.addResult(`音频录制错误: ${error.errMsg}`, 'error');
      this.setData({ recordingStatus: '录制失败' });
      this.completeTest();
    });

    // 开始录制
    recorderManager.start(recordingOptions);
    this.addResult(`录制参数: PCM, 16kHz, 单声道, ${recordingOptions.encodeBitRate}bps`, 'info');
    
    // 5秒后停止录制
    setTimeout(() => {
      if (this.data.isRecording) {
        recorderManager.stop();
      }
    }, 5000);
  },

  // 验证音频数据
  validateAudioData(buffer) {
    if (!buffer || buffer.byteLength === 0) {
      return false;
    }
    
    // 检查是否为有效的PCM数据（至少包含一些非零数据）
    const dataView = new DataView(buffer);
    let hasValidData = false;
    
    // 简单检查：查看前50个样本中是否有非零数据
    const sampleCount = Math.min(50, buffer.byteLength / 2);
    for (let i = 0; i < sampleCount; i++) {
      const sample = dataView.getInt16(i * 2, true);
      if (sample !== 0) {
        hasValidData = true;
        break;
      }
    }
    
    return hasValidData;
  },

  // 测试音频播放
  testAudioPlayback() {
    this.addResult('正在测试音频播放功能...', 'info');
    
    // 创建测试音频数据（1kHz正弦波，1秒）
    const sampleRate = 16000;
    const duration = 1; // 1秒
    const frequency = 1000; // 1kHz
    const samples = sampleRate * duration;
    
    const audioBuffer = new ArrayBuffer(samples * 2); // 16位PCM
    const dataView = new DataView(audioBuffer);
    
    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      const value = Math.sin(2 * Math.PI * frequency * t) * 0.5; // 50%音量
      const pcmValue = Math.floor(value * 32767); // 转换为16位PCM
      dataView.setInt16(i * 2, pcmValue, true);
    }
    
    this.addResult(`生成测试音频: ${duration}秒, ${frequency}Hz正弦波`, 'info');
    
    // 模拟从服务器接收音频数据
    setTimeout(() => {
      this.handleReceivedAudio(audioBuffer);
    }, 500);
  },

  // 处理接收到的音频数据
  handleReceivedAudio(audioData) {
    this.addResult(`收到音频数据: ${audioData.byteLength} 字节`, 'info');
    
    try {
      // 尝试播放音频（微信小程序环境可能不支持）
      if (wx.createWebAudioContext) {
        const audioContext = wx.createWebAudioContext();
        
        audioContext.decodeAudioData(audioData.slice(0), (audioBuffer) => {
          this.addResult('音频解码成功', 'success');
          
          const source = audioContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioContext.destination);
          
          // 注意：微信小程序中可能无法自动播放音频
          this.addResult('音频播放测试完成（需要用户交互才能实际播放）', 'success');
          this.completeTest();
          
        }, (error) => {
          this.addResult(`音频解码失败: ${error.message || '未知错误'}`, 'warning');
          this.completeTest();
        });
      } else {
        this.addResult('Web Audio API 不可用', 'warning');
        this.completeTest();
      }
    } catch (error) {
      this.addResult(`音频播放错误: ${error.message}`, 'error');
      this.completeTest();
    }
  },

  // 处理测试消息
  handleTestMessage(message) {
    if (typeof message.data === 'string') {
      try {
        const data = JSON.parse(message.data);
        
        if (data.type === 'pong') {
          const latency = Date.now() - data.originalTimestamp;
          this.addResult(`心跳响应延迟: ${latency}ms`, 'success');
        } else if (data.type === 'error') {
          this.addResult(`服务器错误: ${data.message}`, 'error');
        } else {
          this.addResult(`收到消息: ${data.type}`, 'info');
        }
      } catch (e) {
        this.addResult(`收到文本消息: ${message.data}`, 'info');
      }
    } else if (message.data instanceof ArrayBuffer) {
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
    
    // 自动滚动到底部
    this.scrollToBottom();
  },

  // 滚动到底部
  scrollToBottom() {
    // 在实际页面中可以实现滚动逻辑
  },

  // 完成测试
  completeTest() {
    this.addResult('测试完成', 'info');
    this.setData({ testStatus: 'completed' });
    
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
  },

  // 重新测试
  retest() {
    this.testVoiceCommunication();
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
  }
})