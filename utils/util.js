const formatTime = date => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()

  return `${[year, month, day].map(formatNumber).join('/')} ${[hour, minute, second].map(formatNumber).join(':')}`
}

const formatNumber = n => {
  n = n.toString()
  return n[1] ? n : `0${n}`
}

// 兼容微信小程序的模块导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatTime
  };
} else if (typeof define === 'function' && define.amd) {
  define(function() { 
    return {
      formatTime
    };
  });
} else {
  // 微信小程序环境
  if (typeof formatTime !== 'undefined') {
    // 全局导出，兼容小程序环境
    if (typeof global !== 'undefined') {
      global.formatTime = formatTime;
    }
    if (typeof window !== 'undefined') {
      window.formatTime = formatTime;
    }
  }
}
