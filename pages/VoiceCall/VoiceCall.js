// 初始化录音管理器（小程序核心录音API）
const recorderManager = wx.getRecorderManager();
// 引入语音WebSocket管理器
const VoiceWebSocketManager = require('../../utils/voiceWebsocket.js');
// 初始化Socket实例
let voiceSocket = null;

// 音频播放相关
let innerAudioContext = null;
let audioBuffer = new Uint8Array(); // 音频缓冲区
let bufferTimeout = null; // 缓冲定时器
let audioQueue = []; // 音频队列
let isProcessingQueue = false; // 是否正在处理队列
let isPlayingAudio = false; // 是否正在播放音频
let audioChunks = []; // 音频数据块缓存
let lastAudioChunkTime = 0; // 最后一次接收音频数据的时间
let audioProcessTimer = null; // 音频处理定时器

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
    // 初始化音频播放器
    this.initAudioPlayer();
  },

  onUnload() {
    // 页面卸载：关闭Socket+停止录音
    this.disconnectWebSocket();
    this.stopAudioCapture();
    // 清理音频播放资源
    this.clearAllAudioResources();
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
      // 只有在未播放音频时才发送数据
      if (uint8Arr.length > 0 && this.data.isListening && !isPlayingAudio) {
        console.log('发送PCM数据大小:', uint8Arr.length);
        this.sendBinaryData(res.frameBuffer);
      } else {
        console.log('数据未发送，大小:', uint8Arr.length, '监听状态:', this.data.isListening, '播放状态:', isPlayingAudio);
      }
    });
  
    recorderManager.onStart(() => {
      console.log('录音开始');
      this.setData({ statusMessage: '正在录音...' });
      
      // 清空缓冲区
      audioBuffer = new Uint8Array();
    });
    
    recorderManager.onStop(() => {
      console.log('录音停止');
      this.setData({ isListening: false });
      audioBuffer = new Uint8Array(); // 清空缓冲区
    });
  
    recorderManager.onError((err) => {
      console.error('录音错误:', err);
      this.setData({ statusMessage: `录音错误: ${err.errMsg}` });
      this.stopAudioCapture();
    });
  },

  // 初始化音频播放器
  initAudioPlayer() {
    innerAudioContext = wx.createInnerAudioContext();
    innerAudioContext.obeyMuteSwitch = false; // 不遵循静音开关
    
    // 设置音频上下文参数以优化播放质量
    innerAudioContext.volume = 1.0;
    
    innerAudioContext.onPlay(() => {
      console.log('音频开始播放');
      isPlayingAudio = true;
      this.setData({ statusMessage: '正在播放AI回复...' });
    });
    
    innerAudioContext.onStop(() => {
      console.log('音频播放停止');
      isPlayingAudio = false;
      this.setData({ statusMessage: '播放停止' });
    });
    
    innerAudioContext.onPause(() => {
      console.log('音频播放暂停');
      isPlayingAudio = false;
    });
    
    innerAudioContext.onEnded(() => {
      console.log('音频播放完成');
      isPlayingAudio = false;
      this.setData({ statusMessage: '播放完成' });
      // 当前音频播放完成，继续处理队列中的下一个音频
      this.processAudioQueue();
    });
    
    innerAudioContext.onError((res) => {
      console.error('音频播放错误:', res);
      isPlayingAudio = false;
      this.setData({ statusMessage: '音频播放错误: ' + (res.errMsg || '未知错误') });
      // 即使出错也继续处理队列
      this.processAudioQueue();
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
          } 
          // 注意：二进制数据已经在VoiceWebSocketManager中通过onAudioData处理了
          // 不需要在这里再次处理
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
      },
      onAudioData: (data) => {
        // 处理二进制音频数据
        console.log('收到音频数据，大小:', data.byteLength);
        this.handleAudioData(data);
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
        // 播放缓冲区中剩余的音频
        this.flushAudioBuffer();
        break;
      case 'interrupted':
        this.setData({ isListening: false, statusMessage: '已打断' });
        this.stopAudioCapture();
        // 清空所有音频资源
        this.clearAllAudioResources();
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
    } else if (content.startsWith('ai:')) {
      // AI回复结果
      const aiResponse = content.substring(3);
      console.log('AI回复:', aiResponse);
      // 可以在这里处理AI回复的显示
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
    audioBuffer = new Uint8Array();
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
    // 清空所有音频资源
    this.clearAllAudioResources();
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
    
    // 清理缓冲区
    audioBuffer = new Uint8Array();
  },

  /**
   * 处理音频数据 - 使用缓冲机制优化播放
   * @param {ArrayBuffer} data - 音频数据
   */
  handleAudioData(data) {
    try {
      console.log('开始处理音频数据，大小:', data.byteLength);
      
      // 更新最后一次接收音频数据的时间
      lastAudioChunkTime = Date.now();
      
      // 清除之前的定时器
      if (audioProcessTimer) {
        clearTimeout(audioProcessTimer);
        audioProcessTimer = null;
      }
      
      // 处理数据转换
      let newDataArray;
      if (data instanceof ArrayBuffer) {
        newDataArray = new Uint8Array(data);
      } else {
        console.error('未知的音频数据类型:', typeof data);
        return;
      }
      
      // 添加到音频块缓存中
      this.addAudioChunk(newDataArray);
      
      // 设置定时器，300ms后检查是否还有音频数据到达
      audioProcessTimer = setTimeout(() => {
        const now = Date.now();
        // 如果距离上次接收音频数据已经过去300ms，则开始处理缓存的音频数据
        if (now - lastAudioChunkTime >= 300) {
          console.log('音频数据接收完毕，开始处理缓存的音频数据');
          this.processCachedAudioData();
        }
      }, 500);
    } catch (error) {
      console.error('处理音频数据时出错:', error);
      this.setData({ statusMessage: '处理音频数据出错: ' + (error.message || '未知错误') });
    }
  },

  /**
   * 将音频数据块添加到缓存中
   * @param {Uint8Array} chunk - 音频数据块
   */
  addAudioChunk(chunk) {
    // 将数据块添加到缓存数组
    audioChunks.push(chunk);
    console.log('音频块已添加到缓存，当前缓存块数:', audioChunks.length);
  },

  /**
   * 处理缓存的音频数据
   */
  processCachedAudioData() {
    if (audioChunks.length === 0) {
      console.log('音频块缓存为空，无需播放');
      return;
    }
    
    console.log('开始处理缓存的音频数据，块数:', audioChunks.length);
    
    // 计算总长度
    const totalLength = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
    
    // 创建合并后的数组
    const mergedArray = new Uint8Array(totalLength);
    let offset = 0;
    
    // 合并所有音频块
    for (const chunk of audioChunks) {
      mergedArray.set(chunk, offset);
      offset += chunk.length;
    }
    
    // 清空音频块缓存
    audioChunks = [];
    
    console.log('音频数据合并完成，总大小:', mergedArray.length);
    
    // 直接播放合并后的音频数据，而不是添加到队列
    this.playAudioData(mergedArray);
  },

  /**
   * 播放音频数据
   * @param {Uint8Array} audioData - 音频数据
   */
  playAudioData(audioData) {
    try {
      console.log('开始播放音频数据，大小:', audioData.length);
      
      // 使用临时文件方式处理音频数据，避免data URL问题
      const fs = wx.getFileSystemManager();
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 10000);
      const tempFilePath = `${wx.env.USER_DATA_PATH}/temp_audio_${timestamp}_${random}.mp3`;
      
      console.log('准备写入临时音频文件:', tempFilePath);
      
      // 写入临时文件
      fs.writeFile({
        filePath: tempFilePath,
        data: audioData.buffer,
        success: () => {
          console.log('临时音频文件写入成功:', tempFilePath);
          // 设置音频源
          innerAudioContext.src = tempFilePath;
          
          // 播放音频
          innerAudioContext.play();
        },
        fail: (err) => {
          console.error('写入临时音频文件失败:', err);
          this.setData({ statusMessage: '音频播放失败: ' + (err.errMsg || '写入文件失败') });
        }
      });
    } catch (error) {
      console.error('播放音频数据时出错:', error);
      this.setData({ statusMessage: '播放音频数据出错: ' + (error.message || '未知错误') });
    }
  },

  /**
   * 处理音频队列 - 使用小程序音频API实现无缝播放
   */
  processAudioQueue() {
    if (audioQueue.length === 0) {
      isProcessingQueue = false;
      console.log('音频队列为空，停止处理');
      return;
    }
    
    isProcessingQueue = true;
    
    // 获取队列中的第一个音频数据
    const audioData = audioQueue.shift();
    
    try {
      console.log('处理音频队列，数据大小:', audioData.length);
      
      // 使用临时文件方式处理音频数据，避免data URL问题
      const fs = wx.getFileSystemManager();
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 10000);
      const tempFilePath = `${wx.env.USER_DATA_PATH}/temp_audio_${timestamp}_${random}.mp3`;
      
      console.log('准备写入临时音频文件:', tempFilePath);
      
      // 写入临时文件
      fs.writeFile({
        filePath: tempFilePath,
        data: audioData.buffer,
        success: () => {
          console.log('临时音频文件写入成功:', tempFilePath);
          // 设置音频源
          innerAudioContext.src = tempFilePath;
          
          // 播放音频
          innerAudioContext.play();
        },
        fail: (err) => {
          console.error('写入临时音频文件失败:', err);
          this.setData({ statusMessage: '音频播放失败: ' + (err.errMsg || '写入文件失败') });
          // 即使出错也继续处理队列
          this.processAudioQueue();
        }
      });
    } catch (error) {
      console.error('处理音频队列时出错:', error);
      this.setData({ statusMessage: '处理音频队列出错: ' + (error.message || '未知错误') });
      // 即使出错也继续处理队列
      this.processAudioQueue();
    }
  },

  /**
   * 立即播放缓冲区中的音频（用于结束时）
   */
  flushAudioBuffer() {
    // 清除定时器
    if (bufferTimeout) {
      clearTimeout(bufferTimeout);
      bufferTimeout = null;
    }
    
    // 清除音频处理定时器
    if (audioProcessTimer) {
      clearTimeout(audioProcessTimer);
      audioProcessTimer = null;
    }
    
    // 处理缓存的音频数据
    this.processCachedAudioData();
  },

  /**
   * 清空音频缓冲区
   */
  clearAudioBuffer() {
    audioBuffer = new Uint8Array();
    audioChunks = [];
    
    // 清除定时器
    if (bufferTimeout) {
      clearTimeout(bufferTimeout);
      bufferTimeout = null;
    }
    
    // 清除音频处理定时器
    if (audioProcessTimer) {
      clearTimeout(audioProcessTimer);
      audioProcessTimer = null;
    }
  },

  /**
   * 清理所有音频资源
   */
  clearAllAudioResources() {
    // 清空缓冲区
    this.clearAudioBuffer();
    
    // 清空播放队列
    audioQueue = [];
    isProcessingQueue = false;
    
    // 停止当前播放
    if (innerAudioContext) {
      innerAudioContext.stop();
      isPlayingAudio = false;
    }
    
    // 清理临时文件
    try {
      const fs = wx.getFileSystemManager();
      // 获取用户数据目录下的所有文件
      fs.readdir({
        dirPath: wx.env.USER_DATA_PATH,
        success: (res) => {
          // 删除所有临时音频文件
          res.files.forEach(file => {
            if (file.startsWith('temp_audio_') && file.endsWith('.mp3')) {
              const filePath = `${wx.env.USER_DATA_PATH}/${file}`;
              fs.unlink({
                filePath: filePath,
                fail: (err) => {
                  console.log('删除临时文件失败:', filePath, err);
                }
              });
            }
          });
        },
        fail: (err) => {
          console.log('读取目录失败:', err);
        }
      });
    } catch (error) {
      console.log('清理临时文件时出错:', error);
    }
    
    this.setData({ statusMessage: '已清理音频资源' });
  }
});