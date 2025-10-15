// 初始化录音管理器（小程序核心录音API）
const recorderManager = wx.getRecorderManager();
// 初始化Socket（小程序Socket实例）
let socketTask = null;

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
      // 过滤静音数据
      const isSilence = uint8Arr.every(byte => byte === 0);
      if (isSilence) {
        console.log('跳过静音数据');
        return;
      }
      // 非静音数据才发送
      if (uint8Arr.length > 0) {
        console.log('发送PCM数据大小:', uint8Arr.length);
        this.sendBinaryData(res.frameBuffer);
      }
    });
  
    recorderManager.onError((err) => {
      this.setData({ statusMessage: `录音错误: ${err.errMsg}` });
      this.stopAudioCapture();
    });
  },

  // 3. WebSocket连接（替换浏览器WebSocket）
  connectWebSocket() {
    if (this.data.isConnected) return;

    // 1. 确定Socket地址（同Vue逻辑：开发/生产环境区分）
    let wsUrl;
    const env = __wxConfig.envVersion; // 小程序环境（develop/production）
    if (env === 'develop') {
      // 开发环境：需开启"不校验合法域名"（微信开发者工具→详情）
      const protocol = wx.getSystemInfoSync().platform === 'ios' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//127.0.0.1:8080/ws/voice`;
    }

    // 2. 创建Socket连接
    socketTask = wx.connectSocket({
      url: wsUrl,
      header: { 'content-type': 'application/json' },
      method: 'GET',
      success: () => {
        console.log('Socket连接中...', wsUrl);
      },
      fail: (err) => {
        this.setData({ statusMessage: 'Socket连接失败' });
        console.error('Socket连接失败:', err);
      }
    });

    // 3. 监听Socket事件
    socketTask.onOpen(() => {
      this.setData({ isConnected: true, statusMessage: '已连接' });
      console.log('Socket连接成功');
    });

    socketTask.onMessage((res) => {
      try {
        if (typeof res.data === 'string') {
          const message = JSON.parse(res.data);
          console.log('收到后端消息:', message); // 新增日志
          this.handleMessage(message);
        } else {
          console.log('收到二进制数据（非识别结果）:', res.data);
        }
      } catch (err) {
        console.error('后端消息解析失败:', err.message, '原始消息:', res.data);
        this.setData({ statusMessage: '解析结果失败，请重试' });
      }
    });

    socketTask.onClose(() => {
      this.setData({ isConnected: false, isListening: false, statusMessage: '连接已断开' });
      console.log('Socket连接关闭');
    });

    socketTask.onError((err) => {
      this.setData({ statusMessage: `Socket错误: ${err.errMsg}` });
      console.error('Socket错误:', err);
    });
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
    if (!this.data.isConnected || !socketTask) {
      this.setData({ statusMessage: '未连接到服务器' });
      return;
    }
    socketTask.send({
      data: JSON.stringify(message),
      fail: (err) => {
        console.error('发送消息失败:', err);
      }
    });
  },

  convertToLittleEndian(int16Array) {
    const buffer = new ArrayBuffer(int16Array.byteLength);
    const view = new DataView(buffer);
    for (let i = 0; i < int16Array.length; i++) {
      view.setInt16(i * 2, int16Array[i], true); // 第三个参数true表示小端序
    }
    return buffer;
  },
  

  sendBinaryData(data) {
    if (!this.data.isConnected || !socketTask) return;
    
    // 将小程序的Int16数据转为小端序（与Vue对齐）
    const int16Arr = new Int16Array(data);
    const littleEndianBuffer = this.convertToLittleEndian(int16Arr);
    
    socketTask.send({
      data: littleEndianBuffer, // 发送转换后的小端序数据
      fail: (err) => {
        console.error('二进制发送失败：', err.errMsg);
        this.setData({ statusMessage: `发送失败: ${err.errMsg}` });
      }
    });
  },

  // 6. 录音控制（替换Web Audio）
  startAudioCapture() {
    if (!this.data.hasRecordAuth) {
      this.setData({ statusMessage: '需开启录音授权' });
      return;
    }
  
    this.stopAudioCapture();
  
    // 修复后的录音参数
    const options = {
      sampleRate: 16000,
      numberOfChannels: 1,
      format: 'pcm',
      bitDepth: 16,
      frameSize: 1,         // 1KB/帧（关键修复）
      duration: 60000
    };
  
    recorderManager.start(options);
    this.setData({ statusMessage: '正在录音...' });
  },

  stopAudioCapture() {
    recorderManager.stop(); // 停止录音
  },

  // 7. 业务控制（开始/停止/打断录音）
  startRecording() {
    if (!this.data.isConnected) {
      this.setData({ statusMessage: '请先连接服务器' });
      return;
    }
    // 发送"开始识别"命令给后端
    this.sendMessage({ type: 'CONTROL', content: 'start_recognition' });
  },

  stopRecording() {
    if (!this.data.isConnected) {
      this.setData({ statusMessage: '请先连接服务器' });
      return;
    }
    // 发送"停止识别"命令给后端
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
    if (socketTask) {
      socketTask.close({ code: 1000, reason: '主动断开' });
      socketTask = null;
    }
    this.setData({ isConnected: false, isListening: false, statusMessage: '未连接' });
  }
});