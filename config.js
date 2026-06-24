/************************************************************
 * config.js
 * การตั้งค่าฝั่ง Frontend
 *
 * ห้ามใส่ BACKEND_SECRET ในไฟล์นี้
 ************************************************************/

(function (window) {
  'use strict';

  const API_BASE =
    'https://alcoholtest.somchaibutphon.workers.dev';

  const CONFIG = {
    APP_NAME:
      'ระบบบันทึกการตรวจวัดปริมาณแอลกอฮอล์',

    API_BASE:
      API_BASE.replace(/\/+$/, ''),

    TIMEZONE:
      'Asia/Bangkok',

    API_TIMEOUT_MS:
      30000,

    SAVE_TIMEOUT_MS:
      120000,

    HISTORY_TIMEOUT_MS:
      60000,

    MAX_SAVE_PAYLOAD_BYTES:
      11 * 1024 * 1024,

    ALERT_THRESHOLD:
      1,

    GAUGE_MAX:
      50,

    MAX_ROUNDS:
      5,

    IMAGE_MAX_WIDTH:
      1280,

    JPEG_QUALITY:
      0.80,

    MAX_IMAGE_BYTES:
      2 * 1024 * 1024,

    CAMERA: {
      DEFAULT_FACING_MODE:
        'environment',

      IDEAL_WIDTH:
        1920,

      IDEAL_HEIGHT:
        1080
    },

    DEBUG:
      false
  };

  window.APP_CONFIG =
    Object.freeze(CONFIG);

})(window);
