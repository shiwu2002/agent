/**
 * 语音录制器
 * 提供语音录制、播放等功能
 */
class VoiceRecorder {
  constructor(options = {}) {
    this.onStart = options.onStart || function() {};
    this.onStop = options.onStop || function() {};
    this.onError = options.onError || function() {};
    this.maxDuration = options.maxDuration || 60000; // 最大录制时长，默认60秒
    
    this.recorderManager = null;
    this.isRecording = false;
    this.startTime = 0;
    this.duration = 0;
    this.recordTimer = null;
  }

  /**
   * 初始化录音管理器
   */
  init() {
    if (this.recorderManager) return;

    this.recorderManager = wx.getRecorderManager();
    this.setupRecorderEvents();
  }

  /**
   * 设置录音事件监听
   */
  setupRecorderEvents() {
    if (!this.recorderManager) return;

    // 录音开始
    this.recorderManager.onStart(() => {
      console.log('录音开始');
      this.isRecording = true;
      this.startTime = Date.now();
      this.duration = 0;
      this.startDurationTimer();
      this.onStart();
    });

    // 录音停止
    this.recorderManager.onStop((res) => {
      console.log('录音停止:', res);
      this.isRecording = false;
      this.stopDurationTimer();
      
      // 计算实际录音时长
      this.duration = Date.now() - this.startTime;
      
      const result = {
        tempFilePath: res.tempFilePath,
        duration: this.duration,
        fileSize: res.fileSize
      };
      
      this.onStop(result);
    });

    // 录音错误
    this.recorderManager.onError((error) => {
      console.error('录音错误:', error);
      this.isRecording = false;
      this.stopDurationTimer();
      this.onError(error);
    });

    // 录音达到最大时长
    this.recorderManager.onInterruptionBegin(() => {
      console.log('录音被中断');
      this.stop();
    });

    // 录音中断结束
    this.recorderManager.onInterruptionEnd(() => {
      console.log('录音中断结束');
    });
  }

  /**
   * 开始录音
   */
  start() {
    if (this.isRecording) {
      console.log('正在录音中，无需重复开始');
      return;
    }

    this.init();

    // 检查权限
    this.checkPermission().then((hasPermission) => {
      if (!hasPermission) {
        this.onError({ errMsg: '没有录音权限' });
        return;
      }

      const options = {
        duration: this.maxDuration,
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 48000,
        format: 'mp3',
        frameSize: 2
      };

      console.log('开始录音，参数:', options);
      
      this.recorderManager.start(options);
    }).catch((error) => {
      console.error('检查录音权限失败:', error);
      this.onError(error);
    });
  }

  /**
   * 停止录音
   */
  stop() {
    if (!this.isRecording) {
      console.log('没有在录音，无需停止');
      return;
    }

    console.log('停止录音');
    this.recorderManager.stop();
  }

  /**
   * 暂停录音
   */
  pause() {
    if (!this.isRecording) {
      console.log('没有在录音，无法暂停');
      return;
    }

    console.log('暂停录音');
    if (this.recorderManager.pause) {
      this.recorderManager.pause();
    }
  }

  /**
   * 恢复录音
   */
  resume() {
    console.log('恢复录音');
    if (this.recorderManager.resume) {
      this.recorderManager.resume();
    }
  }

  /**
   * 检查录音权限
   */
  checkPermission() {
    return new Promise((resolve, reject) => {
      // 获取设置信息
      wx.getSetting({
        success: (res) => {
          const authSetting = res.authSetting;
          
          // 检查录音权限
          if (authSetting['scope.record'] === false) {
            // 用户已经拒绝过录音权限
            wx.showModal({
              title: '需要录音权限',
              content: '请允许使用录音功能',
              success: (modalRes) => {
                if (modalRes.confirm) {
                  // 引导用户去设置页面开启权限
                  wx.openSetting({
                    success: (settingRes) => {
                      const hasPermission = settingRes.authSetting['scope.record'] === true;
                      resolve(hasPermission);
                    },
                    fail: reject
                  });
                } else {
                  resolve(false);
                }
              }
            });
          } else if (authSetting['scope.record'] === true) {
            // 已经有录音权限
            resolve(true);
          } else {
            // 还没有请求过录音权限，先请求权限
            wx.authorize({
              scope: 'scope.record',
              success: () => {
                resolve(true);
              },
              fail: () => {
                resolve(false);
              }
            });
          }
        },
        fail: reject
      });
    });
  }

  /**
   * 开始时长计时器
   */
  startDurationTimer() {
    this.stopDurationTimer();
    
    this.recordTimer = setInterval(() => {
      this.duration = Date.now() - this.startTime;
      
      // 接近最大时长时给出提示
      if (this.duration >= this.maxDuration - 10000) {
        console.log('录音即将达到最大时长');
      }
    }, 1000);
  }

  /**
   * 停止时长计时器
   */
  stopDurationTimer() {
    if (this.recordTimer) {
      clearInterval(this.recordTimer);
      this.recordTimer = null;
    }
  }

  /**
   * 获取录音状态
   */
  getStatus() {
    return {
      isRecording: this.isRecording,
      duration: this.duration,
      startTime: this.startTime
    };
  }

  /**
   * 获取录音管理器
   */
  getRecorderManager() {
    return this.recorderManager;
  }

  /**
   * 销毁录音器
   */
  destroy() {
    console.log('销毁录音器');
    
    if (this.isRecording) {
      this.stop();
    }
    
    this.stopDurationTimer();
    this.recorderManager = null;
    this.isRecording = false;
    this.startTime = 0;
    this.duration = 0;
  }
}

module.exports = VoiceRecorder;