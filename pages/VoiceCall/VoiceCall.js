// 初始化录音管理器（小程序核心录音API）
const recorderManager = wx.getRecorderManager();
// 引入语音WebSocket管理器
const VoiceWebSocketManager = require('../../utils/voiceWebsocket.js');
/**
 * 实时语音通话页面
 * 支持：实时录音、WebSocket音频流收发、TTS音频流播放
 */

// 初始化Socket实例
let voiceSocket = null;
// 定时发送录音数据的定时器
let sendTimer = null;
// 存储录音数据的缓冲区
let audioBuffer = [];
// 音频播放实例
let audioPlayer = null;

Page({
  data: {
    isConnected: false,       // WebSocket连接状态
    isListening: false,       // 录音/通话状态
    statusMessage: '未连接',  // 状态提示
    hasRecordAuth: false,     // 录音授权状态
    isPlaying: false          // 是否正在播放TTS音频
  },

  onLoad() {
    // 页面加载时检查录音授权+初始化录音监听
    this.checkRecordAuth();
    this.initRecorderListener();
    this.initAudioPlayer();
  },

  onUnload() {
    // 页面卸载：关闭Socket+停止录音
    this.disconnectWebSocket();
    this.stopAudioCapture();
    // 停止音频播放
    if (audioPlayer) {
      audioPlayer.stop();
      audioPlayer.destroy && audioPlayer.destroy();
      audioPlayer = null;
    }
    // 清理定时器
    if (sendTimer) {
      clearInterval(sendTimer);
      sendTimer = null;
    }
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
      // 非静音数据才发送
      if (uint8Arr.length > 0 && this.data.isListening) {
        console.log('发送PCM数据大小:', uint8Arr.length);
        this.sendBinaryData(res.frameBuffer);
      } else {
        console.log('数据未发送，大小:', uint8Arr.length, '监听状态:', this.data.isListening);
      }
      
      // 同时将数据添加到缓冲区，供定时发送使用
      if (this.data.isListening) {
        audioBuffer.push(res.frameBuffer);
        console.log('数据已添加到缓冲区，当前缓冲区大小:', audioBuffer.length);
      }
    });
  
    recorderManager.onStart(() => {
      console.log('录音开始');
      this.setData({ statusMessage: '正在录音...' });
      
      // 清空缓冲区
      audioBuffer = [];
      
      // 启动定时发送数据（作为onFrameRecorded的备选方案）
      if (sendTimer) {
        clearInterval(sendTimer);
      }
      sendTimer = setInterval(() => {
        if (this.data.isListening && audioBuffer.length > 0) {
          console.log('定时发送数据，缓冲区大小:', audioBuffer.length);
          // 合并缓冲区数据
          const totalLength = audioBuffer.reduce((acc, buf) => acc + buf.byteLength, 0);
          const mergedBuffer = new Uint8Array(totalLength);
          let offset = 0;
          for (const buf of audioBuffer) {
            mergedBuffer.set(new Uint8Array(buf), offset);
            offset += buf.byteLength;
          }
          this.sendBinaryData(mergedBuffer.buffer);
          audioBuffer = []; // 清空缓冲区
        }
      }, 100); // 每100ms发送一次
    });
    
    recorderManager.onStop(() => {
      console.log('录音停止');
      this.setData({ isListening: false });
      // 停止定时发送
      if (sendTimer) {
        clearInterval(sendTimer);
        sendTimer = null;
      }
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
          }
        } catch (err) {
          console.error('后端消息解析失败:', err.message, '原始消息:', res.data);
          this.setData({ statusMessage: '解析结果失败，请重试' });
        }
      },
      onAudioData: (audioBuffer) => {
        // 收到TTS音频流，直接播放
        this.playPcmAudio(audioBuffer);
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

  // 4. 处理后端消息（仅处理控制/错误，忽略TEXT）
  handleMessage(message) {
    switch (message.type) {
      case 'CONTROL':
        this.handleControlMessage(message.content);
        break;
      case 'ERROR':
        this.setData({ statusMessage: `错误: ${message.content}` });
        break;
      default:
        // 忽略TEXT等类型
        console.log('未知消息类型:', message.type);
    }
  },

  handleControlMessage(content) {
    switch (content) {
      case 'connected':
        this.setData({ statusMessage: '语音服务已就绪' });
        break;
      case 'start_recording':
      case 'recognition_started':
        this.setData({ isListening: true, statusMessage: '正在通话...' });
        this.startAudioCapture(); // 开始录音
        break;
      case 'stop_recording':
      case 'recording_stopped':
      case 'recognition_completed':
        this.setData({ isListening: false, statusMessage: '通话结束' });
        this.stopAudioCapture(); // 停止录音
        break;
      case 'interrupted':
        this.setData({ isListening: false, statusMessage: '已打断' });
        this.stopAudioCapture();
        break;
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

  // 6. 录音控制
  startAudioCapture() {
    console.log('准备开始录音，授权状态:', this.data.hasRecordAuth);
    if (!this.data.hasRecordAuth) {
      this.setData({ statusMessage: '需开启录音授权' });
      return;
    }
    // 使用标准的微信小程序录音参数
    const options = {
      duration: 600000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 96000,
      format: 'pcm',
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
  },

  // 7. 业务控制（开始/停止/打断录音）
  startRecording() {
    if (!this.data.isConnected) {
      this.setData({ statusMessage: '请先连接服务器' });
      return;
    }
    // 发送"开始录音"命令给后端
    console.log('发送开始录音命令');
    this.sendMessage({ type: 'CONTROL', content: 'start_recording' });
  },

  stopRecording() {
    if (!this.data.isConnected) {
      this.setData({ statusMessage: '请先连接服务器' });
      return;
    }
    // 发送"停止录音"命令给后端
    console.log('发送停止录音命令');
    this.sendMessage({ type: 'CONTROL', content: 'stop_recording' });
  },

  interruptRecognition() {
    if (!this.data.isConnected) {
      this.setData({ statusMessage: '请先连接服务器' });
      return;
    }
    this.stopAudioCapture();
    this.sendMessage({ type: 'CONTROL', content: 'interrupt' });
  },

  // 8. 音频播放相关
  initAudioPlayer() {
    if (audioPlayer) {
      audioPlayer.destroy && audioPlayer.destroy();
      audioPlayer = null;
    }
    audioPlayer = wx.createInnerAudioContext();
    audioPlayer.obeyMuteSwitch = false;
    audioPlayer.onPlay(() => {
      this.setData({ isPlaying: true, statusMessage: '正在播放AI语音...' });
    });
    audioPlayer.onEnded(() => {
      this.setData({ isPlaying: false, statusMessage: '播放结束' });
    });
    audioPlayer.onError((err) => {
      this.setData({ isPlaying: false, statusMessage: '播放出错' });
      console.error('音频播放错误:', err);
    });
  },

  /**
   * 播放PCM音频流（需转为WAV临时文件）
   * @param {ArrayBuffer} pcmBuffer
   */
  playPcmAudio(pcmBuffer) {
    // 1. PCM转WAV
    const wavBuffer = this.pcmToWav(pcmBuffer, {
      sampleRate: 16000,
      numChannels: 1,
      bitDepth: 16
    });
    // 2. 写入本地临时文件
    const fs = wx.getFileSystemManager();
    const filePath = `${wx.env.USER_DATA_PATH}/tts_play_${Date.now()}.wav`;
    try {
      fs.writeFileSync(filePath, wavBuffer, 'binary');
      // 3. 播放
      if (!audioPlayer) this.initAudioPlayer();
      audioPlayer.src = filePath;
      audioPlayer.play();
      this.setData({ isPlaying: true, statusMessage: '正在播放AI语音...' });
    } catch (e) {
      this.setData({ statusMessage: '音频播放失败' });
      console.error('写入WAV文件失败:', e);
    }
  },

  /**
   * PCM转WAV格式
   * @param {ArrayBuffer} pcmBuffer
   * @param {Object} options
   * @returns {ArrayBuffer}
   */
  pcmToWav(pcmBuffer, options) {
    // 参考WAV文件头格式
    const numChannels = options.numChannels || 1;
    const sampleRate = options.sampleRate || 16000;
    const bitDepth = options.bitDepth || 16;
    const bytesPerSample = bitDepth / 8;
    const pcmData = new Uint8Array(pcmBuffer);
    const dataLength = pcmData.length;
    const wavHeader = new ArrayBuffer(44);
    const view = new DataView(wavHeader);

    // "RIFF" chunk descriptor
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true); // 文件总长度-8
    this.writeString(view, 8, 'WAVE');
    // "fmt " sub-chunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // 子块大小
    view.setUint16(20, 1, true); // 音频格式 1=PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // 字节率
    view.setUint16(32, numChannels * bytesPerSample, true); // 块对齐
    view.setUint16(34, bitDepth, true);
    // "data" sub-chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    // 合并头部和PCM数据
    const wavBuffer = new Uint8Array(44 + dataLength);
    wavBuffer.set(new Uint8Array(wavHeader), 0);
    wavBuffer.set(pcmData, 44);
    return wavBuffer.buffer;
  },

  writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  },

  // 9. 辅助功能（断开连接）
  disconnectWebSocket() {
    this.stopAudioCapture();
    if (voiceSocket) {
      voiceSocket.disconnect();
      voiceSocket = null;
    }
    if (audioPlayer) {
      audioPlayer.stop();
      audioPlayer.destroy && audioPlayer.destroy();
      audioPlayer = null;
    }
    this.setData({ isConnected: false, isListening: false, isPlaying: false, statusMessage: '未连接' });
  }
});
