// 初始化录音管理器（小程序核心录音API）
const recorderManager = wx.getRecorderManager();
// 引入语音WebSocket管理器
const VoiceWebSocketManager = require('../../utils/voiceWebsocket.js');
// 初始化Socket实例
let voiceSocket = null;
// 移除定时发送录音数据的定时器（不再使用）
// let sendTimer = null;
// 存储录音数据的缓冲区（不再使用）
// let audioBuffer = [];

// 重新定义audioBuffer为局部变量，避免全局污染
let audioBuffer = [];

Page({
  data: {
    isConnected: false,       // WebSocket连接状态
    isListening: false,       // 录音/识别状态
    recognitionResult: '',    // 实时识别结果
    finalResults: [],         // 识别历史
    statusMessage: '未连接',  // 状态提示
    hasRecordAuth: false      // 录音授权状态
  },

  onLoad() {
    // 页面加载时检查录音授权+初始化录音监听
    this.checkRecordAuth();
    this.initRecorderListener();
  },

  onUnload() {
    // 页面卸载：关闭Socket+停止录音
    this.disconnectWebSocket();
    this.stopAudioCapture();
    // 清理定时器
    // if (sendTimer) {
    //   clearInterval(sendTimer);
    //   sendTimer = null;
    // }
    
    // 清理缓冲区
    audioBuffer = [];
  },

  // 1. 检查录音授权（小程序必须手动处理）
  checkRecordAuth() {
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.record']) {
          this.setData({ hasRecordAuth: true });
        } else {
          // 无授权：请求授权
          wx.authorize({
            scope: 'scope.record',
            success: () => {
              this.setData({ hasRecordAuth: true });
            },
            fail: () => {
              this.setData({ statusMessage: '需开启录音授权' });
              // 引导用户去设置页开启授权
              wx.showModal({
                title: '授权提示',
                content: '请在设置中开启录音权限，否则无法使用语音识别',
                success: (modalRes) => {
                  if (modalRes.confirm) {
                    wx.openSetting();
                  }
                }
              });
            }
          });
        }
      }
    });
  },

  // 2. 初始化录音监听器（获取PCM帧数据）
  initRecorderListener() {
    recorderManager.onFrameRecorded((res) => {
      const uint8Arr = new Uint8Array(res.frameBuffer);
      console.log('录音帧数据大小:', uint8Arr.length, '监听状态:', this.data.isListening);
      // 过滤静音数据
      const isSilence = uint8Arr.every(byte => byte === 0);
      if (isSilence) {
        console.log('跳过静音数据');
        return;
      }
      
      // 直接发送非静音数据，确保后端能及时接收到音频数据
      if (uint8Arr.length > 0 && this.data.isListening) {
        console.log('发送PCM数据大小:', uint8Arr.length);
        this.sendBinaryData(res.frameBuffer);
      } else {
        console.log('数据未发送，大小:', uint8Arr.length, '监听状态:', this.data.isListening);
      }
      
      // 不再将数据添加到缓冲区，避免重复发送
      // if (this.data.isListening) {
      //   audioBuffer.push(res.frameBuffer);
      //   console.log('数据已添加到缓冲区，当前缓冲区大小:', audioBuffer.length);
      // }
    });
  
    recorderManager.onStart(() => {
      console.log('录音开始');
      this.setData({ statusMessage: '正在录音...' });
      
      // 清空缓冲区
      audioBuffer = [];
      
      // 移除定时发送数据逻辑，改用实时发送
      // if (sendTimer) {
      //   clearInterval(sendTimer);
      // }
      // sendTimer = setInterval(() => {
      //   if (this.data.isListening && audioBuffer.length > 0) {
      //     console.log('定时发送数据，缓冲区大小:', audioBuffer.length);
      //     // 合并缓冲区数据
      //     const totalLength = audioBuffer.reduce((acc, buf) => acc + buf.byteLength, 0);
      //     const mergedBuffer = new Uint8Array(totalLength);
      //     let offset = 0;
      //     for (const buf of audioBuffer) {
      //       mergedBuffer.set(new Uint8Array(buf), offset);
      //       offset += buf.byteLength;
      //     }
      //     this.sendBinaryData(mergedBuffer.buffer);
      //     audioBuffer = []; // 清空缓冲区
      //   }
      // }, 100); // 每100ms发送一次
    });
    
    recorderManager.onStop(() => {
      console.log('录音停止');
      this.setData({ isListening: false });
      // 停止定时发送
      // if (sendTimer) {
      //   clearInterval(sendTimer);
      //   sendTimer = null;
      // }
      audioBuffer = []; // 清空缓冲区
    });
  
    recorderManager.onError((err) => {
      console.error('录音错误:', err);
      this.setData({ statusMessage: `录音错误: ${err.errMsg}` });
      this.stopAudioCapture();
    });
  },

  // 3. WebSocket连接（使用VoiceWebSocketManager）
  connectWebSocket() {
    if (this.data.isConnected) return;

    // 1. 确定Socket地址（同Vue逻辑：开发/生产环境区分）
    let wsUrl;
    const env = __wxConfig.envVersion; // 小程序环境（develop/production）
    if (env === 'develop') {
      // 开发环境：需开启"不校验合法域名"（微信开发者工具→详情）
      // 使用新的API获取平台信息
      const deviceInfo = wx.getDeviceInfo();
      // 开发环境使用ws而非wss
      const protocol = deviceInfo.platform === 'ios' ? 'ws:' : 'ws:';
      // 确保后端服务正在运行在正确的端口上
      wsUrl = `${protocol}//192.168.1.3:8080/ws/voice`;
    } else {
      // 生产环境配置
      const deviceInfo = wx.getDeviceInfo();
      // 生产环境使用wss
      const protocol = deviceInfo.platform === 'ios' ? 'wss:' : 'wss:';
      // 根据实际情况修改生产环境地址
      wsUrl = `${protocol}//yourdomain.com/ws/voice`;
    }

    console.log('尝试连接WebSocket地址:', wsUrl);

    // 2. 创建Socket连接
    voiceSocket = new VoiceWebSocketManager({
      url: wsUrl,
      onOpen: () => {
        this.setData({ isConnected: true, statusMessage: '已连接' });
        console.log('Socket连接成功');
      },
      onMessage: (res) => {
        try {
          if (typeof res.data === 'string') {
            const message = JSON.parse(res.data);
            console.log('收到后端消息:', message);
            this.handleMessage(message);
          } else {
            console.log('收到二进制数据（非识别结果）:', res.data);
          }
        } catch (err) {
          console.error('后端消息解析失败:', err.message, '原始消息:', res.data);
          this.setData({ statusMessage: '解析结果失败，请重试' });
        }
      },
      onClose: () => {
        this.setData({ isConnected: false, isListening: false, statusMessage: '连接已断开' });
        console.log('Socket连接关闭');
      },
      onError: (err) => {
        this.setData({ statusMessage: `Socket错误: ${err.errMsg}` });
        console.error('Socket错误:', err);
      }
    });

    voiceSocket.connect();
  },

  // 4. 处理后端消息（同Vue逻辑）
  handleMessage(message) {
    switch (message.type) {
      case 'CONTROL':
        this.handleControlMessage(message.content);
        break;
      case 'TEXT':
        this.handleTextMessage(message.content);
        break;
      case 'ERROR':
        this.setData({ statusMessage: `错误: ${message.content}` });
        break;
      default:
        console.log('未知消息类型:', message.type);
    }
  },

  handleControlMessage(content) {
    switch (content) {
      case 'connected':
        this.setData({ statusMessage: '语音服务已就绪' });
        break;
      case 'recognition_started':
        this.setData({ isListening: true, statusMessage: '正在识别...' });
        this.startAudioCapture(); // 开始录音
        break;
      case 'recording_stopped':
      case 'recognition_completed':
        this.setData({ isListening: false, statusMessage: '识别完成' });
        this.stopAudioCapture(); // 停止录音
        break;
      case 'interrupted':
        this.setData({ isListening: false, statusMessage: '已打断' });
        this.stopAudioCapture();
        break;
    }
  },

  handleTextMessage(content) {
    if (content.startsWith('final:')) {
      // 最终结果：添加到历史
      const text = content.substring(6);
      const finalResults = [...this.data.finalResults, text];
      this.setData({ recognitionResult: text, finalResults });
    } else if (content.startsWith('partial:')) {
      // 中间结果：实时更新
      const text = content.substring(8);
      this.setData({ recognitionResult: text });
    }
  },

  // 5. 发送消息（文本/二进制）
  sendMessage(message) {
    if (!this.data.isConnected || !voiceSocket) {
      this.setData({ statusMessage: '未连接到服务器' });
      return;
    }
    voiceSocket.send(message);
  },

  convertToLittleEndian(int16Array) {
    const buffer = new ArrayBuffer(int16Array.length * 2); // 确保缓冲区大小正确
    const view = new DataView(buffer);
    for (let i = 0; i < int16Array.length; i++) {
      view.setInt16(i * 2, int16Array[i], true); // 小端序
    }
    return buffer;
  },
  

  sendBinaryData(data) {
    if (!this.data.isConnected || !voiceSocket) {
      console.log('WebSocket未连接，无法发送数据');
      return;
    }
    
    // 检查数据类型并进行适当处理
    let bufferToSend;
    if (data instanceof ArrayBuffer) {
      bufferToSend = data;
    } else if (data.buffer instanceof ArrayBuffer) {
      // 如果是TypedArray，提取其buffer
      bufferToSend = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    } else {
      console.log('未知的数据类型，无法发送');
      return;
    }
    
    console.log('准备发送音频数据，大小:', bufferToSend.byteLength);
    
    // 直接发送数据，使用改进的sendAudioData方法
    const result = voiceSocket.sendAudioData(bufferToSend);
    if (!result) {
      console.log('音频数据发送失败');
      this.setData({ statusMessage: '音频数据发送失败' });
    } else {
      console.log('音频数据发送成功');
    }
  },

  // 6. 录音控制（替换Web Audio）
  startAudioCapture() {
    console.log('准备开始录音，授权状态:', this.data.hasRecordAuth);
    if (!this.data.hasRecordAuth) {
      this.setData({ statusMessage: '需开启录音授权' });
      return;
    }
  
    // 使用标准的微信小程序录音参数
    const options = {
      // 最长录音时长，确保不会很快自动结束（单位 ms）
      duration: 600000,
      // 采样配置
      sampleRate: 16000,
      numberOfChannels: 1,
      // 编码比特率（对 pcm 会被忽略，但保留无碍）
      encodeBitRate: 96000,
      // 使用原始 PCM，便于后端实时识别
      format: 'pcm',
      // 恢复frameSize参数以确保onFrameRecorded回调正常触发
      frameSize: 5
    };
  
    console.log('开始录音，参数:', options);
    recorderManager.start(options);
  },

  stopAudioCapture() {
    console.log('停止录音');
    recorderManager.stop(); // 停止录音
    // 清理缓冲区
    audioBuffer = [];
    
    // 清理定时器
    // if (sendTimer) {
    //   clearInterval(sendTimer);
    //   sendTimer = null;
    // }
  },

  // 7. 业务控制（开始/停止/打断录音）
  startRecording() {
    if (!this.data.isConnected) {
      this.setData({ statusMessage: '请先连接服务器' });
      return;
    }
    // 发送"开始识别"命令给后端
    console.log('发送开始识别命令');
    this.sendMessage({ type: 'CONTROL', content: 'start_recognition' });
  },

  stopRecording() {
    if (!this.data.isConnected) {
      this.setData({ statusMessage: '请先连接服务器' });
      return;
    }
    // 发送"停止识别"命令给后端
    console.log('发送停止识别命令');
    this.sendMessage({ type: 'CONTROL', content: 'stop_recording' });
  },

  interruptRecognition() {
    if (!this.data.isConnected) {
      this.setData({ statusMessage: '请先连接服务器' });
      return;
    }
    this.stopAudioCapture();
    this.sendMessage({ type: 'CONTROL', content: 'interrupt' });
    this.setData({ recognitionResult: '' });
  },

  // 8. 辅助功能（清空历史/断开连接）
  clearResults() {
    this.setData({ finalResults: [], recognitionResult: '' });
  },

  disconnectWebSocket() {
    this.stopAudioCapture();
    if (voiceSocket) {
      voiceSocket.disconnect();
      voiceSocket = null;
    }
    this.setData({ isConnected: false, isListening: false, statusMessage: '未连接' });
    
    // 清理定时器
    // if (sendTimer) {
    //   clearInterval(sendTimer);
    //   sendTimer = null;
    // }
    
    // 清理缓冲区
    audioBuffer = [];
  }
});