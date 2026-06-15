
/************************************************************
 * history.js
 * ระบบ Login + ปฏิทิน + ประวัติแบบการ์ดรูปภาพ
 * Mobile First / SweetAlert2 / Lazy Thumbnail
 *
 * ต้องโหลดหลัง:
 * - SweetAlert2
 * - config.js
 * - api.js
 ************************************************************/

(function (window, document) {
  'use strict';

  const API = window.AlcoholAPI;
  const CONFIG = window.APP_CONFIG || {};

  const SESSION_KEY =
    'alcohol_history_session_v3';

  const LAST_MONTH_KEY =
    'alcohol_history_last_month_v3';

  const STYLE_ID =
    'alcoholHistoryV3Styles';

  const PAGE_SIZE = 10;
  const SEARCH_DELAY_MS = 450;
  const THUMBNAIL_CACHE_LIMIT = 30;

  const AUTH_CODES = [
    'AUTH_REQUIRED',
    'SESSION_EXPIRED',
    'SESSION_DEVICE_MISMATCH',
    'INVALID_LOGIN'
  ];

  const THAI_MONTHS = [
    'มกราคม',
    'กุมภาพันธ์',
    'มีนาคม',
    'เมษายน',
    'พฤษภาคม',
    'มิถุนายน',
    'กรกฎาคม',
    'สิงหาคม',
    'กันยายน',
    'ตุลาคม',
    'พฤศจิกายน',
    'ธันวาคม'
  ];

  const state = {
    initialized:
      false,

    opening:
      false,

    token:
      '',

    name:
      '',

    expiresAtIso:
      '',

    currentMonth:
      '',

    currentDate:
      '',

    currentPage:
      1,

    monthData:
      null,

    dayData:
      null,

    filters: {
      search:
        '',

      status:
        'ALL',

      checkpoint:
        '',

      image:
        'ALL'
    },

    searchTimer:
      0,

    dayLoadSequence:
      0,

    thumbnailObserver:
      null,

    thumbnailCache:
      new Map(),

    cameraWasReady:
      false
  };


  /************************************************************
   * Helpers
   ************************************************************/

  function cleanText(value) {
    return (
      value === null ||
      value === undefined
    )
      ? ''
      : String(value).trim();
  }


  function escapeHtml(value) {
    return cleanText(value)
      .replace(
        /&/g,
        '&amp;'
      )
      .replace(
        /</g,
        '&lt;'
      )
      .replace(
        />/g,
        '&gt;'
      )
      .replace(
        /"/g,
        '&quot;'
      )
      .replace(
        /'/g,
        '&#039;'
      );
  }


  function escapeAttribute(value) {
    return escapeHtml(value)
      .replace(
        /`/g,
        '&#096;'
      );
  }


  function finiteNumber(
    value,
    fallback
  ) {
    const number =
      Number(value);

    return Number.isFinite(number)
      ? number
      : fallback;
  }


  function formatMg(value) {
    return finiteNumber(
      value,
      0
    ).toFixed(2);
  }


  function getElement(id) {
    return document
      .getElementById(id);
  }


  function getSwal() {
    return window.Swal || null;
  }


  function hasSweetAlert() {
    const Swal =
      getSwal();

    return Boolean(
      Swal &&
      typeof Swal.fire ===
        'function'
    );
  }


  function getDeviceId() {
    if (
      API &&
      typeof API
        .getOrCreateDeviceId ===
        'function'
    ) {
      return API
        .getOrCreateDeviceId();
    }

    return '';
  }


  function isAuthError(error) {
    return AUTH_CODES.includes(
      cleanText(
        error &&
        error.code
      ).toUpperCase()
    );
  }


  function debounceSearch(callback) {
    window.clearTimeout(
      state.searchTimer
    );

    state.searchTimer =
      window.setTimeout(
        callback,
        SEARCH_DELAY_MS
      );
  }


  /************************************************************
   * Date / Month
   ************************************************************/

  function currentBangkokMonth() {
    const parts = {};

    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone:
          CONFIG.TIMEZONE ||
          'Asia/Bangkok',

        year:
          'numeric',

        month:
          '2-digit'
      }
    )
      .formatToParts(
        new Date()
      )
      .forEach(
        function (part) {
          parts[
            part.type
          ] =
            part.value;
        }
      );

    return (
      parts.year +
      '-' +
      parts.month
    );
  }
function currentBangkokDateKey() {
  const parts = {};

  new Intl.DateTimeFormat(
    'en-CA',
    {
      timeZone:
        CONFIG.TIMEZONE ||
        'Asia/Bangkok',

      year:
        'numeric',

      month:
        '2-digit',

      day:
        '2-digit'
    }
  )
    .formatToParts(
      new Date()
    )
    .forEach(
      function (part) {
        parts[
          part.type
        ] =
          part.value;
      }
    );

  return (
    parts.year +
    '-' +
    parts.month +
    '-' +
    parts.day
  );
}


function fullThaiDateTitle(value) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/
      .exec(
        cleanText(value)
      );

  if (!match) {
    return cleanText(value);
  }

  const monthIndex =
    Number(match[2]) - 1;

  return (
    Number(match[3]) +
    ' ' +
    (
      THAI_MONTHS[monthIndex] ||
      match[2]
    ) +
    ' ' +
    match[1]
  );
}

  function parseMonthKey(
    monthKey
  ) {
    const match =
      /^(\d{4})-(\d{2})$/
        .exec(
          cleanText(monthKey)
        );

    if (!match) {
      return null;
    }

    const year =
      Number(match[1]);

    const month =
      Number(match[2]);

    if (
      year < 2000 ||
      year > 2200 ||
      month < 1 ||
      month > 12
    ) {
      return null;
    }

    return {
      year:
        year,

      month:
        month
    };
  }


  function shiftMonth(
    monthKey,
    amount
  ) {
    const parsed =
      parseMonthKey(monthKey) ||
      parseMonthKey(
        currentBangkokMonth()
      );

    const date =
      new Date(
        Date.UTC(
          parsed.year,

          parsed.month -
          1 +
          Number(
            amount || 0
          ),

          1
        )
      );

    return (
      date.getUTCFullYear() +
      '-' +
      String(
        date.getUTCMonth() +
        1
      ).padStart(
        2,
        '0'
      )
    );
  }


  function monthTitle(monthKey) {
    const parsed =
      parseMonthKey(monthKey);

    if (!parsed) {
      return cleanText(monthKey);
    }

    return (
      THAI_MONTHS[
        parsed.month -
        1
      ] +
      ' ' +
      parsed.year
    );
  }


  function daysInMonth(
    year,
    month
  ) {
    return new Date(
      Date.UTC(
        year,
        month,
        0
      )
    ).getUTCDate();
  }


  function mondayFirstOffset(
    year,
    month
  ) {
    const day =
      new Date(
        Date.UTC(
          year,
          month - 1,
          1
        )
      ).getUTCDay();

    return day === 0
      ? 6
      : day - 1;
  }


  function makeDateKey(
    year,
    month,
    day
  ) {
    return (
      String(year) +
      '-' +
      String(month)
        .padStart(
          2,
          '0'
        ) +
      '-' +
      String(day)
        .padStart(
          2,
          '0'
        )
    );
  }


  function displayDateKey(value) {
    const match =
      /^(\d{4})-(\d{2})-(\d{2})$/
        .exec(
          cleanText(value)
        );

    if (!match) {
      return cleanText(value);
    }

    return (
      match[3] +
      '/' +
      match[2] +
      '/' +
      match[1]
    );
  }


  /************************************************************
   * Session
   ************************************************************/

  function saveSession(data) {
    state.token =
      cleanText(
        data &&
        data.token
      );

    state.name =
      cleanText(
        data &&
        data.name
      );

    state.expiresAtIso =
      cleanText(
        data &&
        data.expiresAtIso
      );

    try {
      window.sessionStorage
        .setItem(
          SESSION_KEY,

          JSON.stringify({
            token:
              state.token,

            name:
              state.name,

            expiresAtIso:
              state.expiresAtIso
          })
        );

    } catch (error) {
      console.warn(
        'ไม่สามารถบันทึก Session ได้',
        error
      );
    }
  }


  function loadSession() {
    try {
      const raw =
        window.sessionStorage
          .getItem(
            SESSION_KEY
          );

      if (!raw) {
        return false;
      }

      const data =
        JSON.parse(raw);

      state.token =
        cleanText(
          data.token
        );

      state.name =
        cleanText(
          data.name
        );

      state.expiresAtIso =
        cleanText(
          data.expiresAtIso
        );

      if (!state.token) {
        clearSession();

        return false;
      }

      if (state.expiresAtIso) {
        const expiresAt =
          new Date(
            state.expiresAtIso
          ).getTime();

        if (
          Number.isFinite(
            expiresAt
          ) &&
          expiresAt <=
          Date.now()
        ) {
          clearSession();

          return false;
        }
      }

      return true;

    } catch (error) {
      clearSession();

      return false;
    }
  }


  function clearSession() {
    state.token =
      '';

    state.name =
      '';

    state.expiresAtIso =
      '';

    try {
      window.sessionStorage
        .removeItem(
          SESSION_KEY
        );

    } catch (error) {
      console.warn(error);
    }
  }


  function loadLastMonth() {
    try {
      const value =
        cleanText(
          window.sessionStorage
            .getItem(
              LAST_MONTH_KEY
            )
        );

      return parseMonthKey(value)
        ? value
        : '';

    } catch (error) {
      return '';
    }
  }


  function saveLastMonth(monthKey) {
    try {
      window.sessionStorage
        .setItem(
          LAST_MONTH_KEY,
          monthKey
        );

    } catch (error) {
      console.warn(error);
    }
  }


  /************************************************************
   * CSS
   ************************************************************/

  function injectStyles() {
    const oldStyle =
      getElement(
        'alcoholHistoryV2Styles'
      );

    if (oldStyle) {
      oldStyle.remove();
    }

    if (
      getElement(
        STYLE_ID
      )
    ) {
      return;
    }

    const style =
      document.createElement(
        'style'
      );

    style.id =
      STYLE_ID;

    style.textContent = `
      :root {
        --ahx-primary: #0e3b55;
        --ahx-primary2: #176589;
        --ahx-bg: #eef3f6;
        --ahx-text: #17313d;
        --ahx-muted: #6c7f89;
        --ahx-border: #d4e0e6;
        --ahx-success: #148255;
        --ahx-danger: #d52f2f;
        --ahx-warning: #d79000;
        --ahx-shadow:
          0 22px 70px
          rgba(5, 29, 43, .34);
      }

      #historyAccessButton.ahx-history-button {
        display:
          inline-flex !important;

        align-items:
          center !important;

        justify-content:
          center !important;

        gap:
          4px !important;

        min-height:
          22px !important;

        padding:
          3px 7px !important;

        border:
          1px solid
          rgba(255, 255, 255, .34)
          !important;

        border-radius:
          999px !important;

        color:
          #ffffff !important;

        background:
          rgba(255, 255, 255, .13)
          !important;

        font-size:
          8px !important;

        font-weight:
          800 !important;

        line-height:
          1 !important;

        white-space:
          nowrap !important;

        box-shadow:
          none !important;
      }

      #historyAccessButton.ahx-history-button:active {
        transform:
          scale(.96);

        background:
          rgba(255, 255, 255, .25)
          !important;
      }

      #historyAccessButton.ahx-history-button:disabled {
        opacity:
          .55 !important;
      }

      .ahx-login-popup,
      .ahx-main-popup {
        padding:
          0 !important;

        overflow:
          hidden !important;

        border:
          1px solid
          var(--ahx-border)
          !important;

        border-radius:
          18px !important;

        background:
          var(--ahx-bg)
          !important;

        box-shadow:
          var(--ahx-shadow)
          !important;
      }

      .ahx-login-popup {
        width:
          min(
            92vw,
            430px
          )
          !important;
      }

      .ahx-main-popup {
        width:
          min(
            95vw,
            980px
          )
          !important;

        max-height:
          95dvh
          !important;
      }

      .ahx-login-html,
      .ahx-main-html {
        margin:
          0 !important;

        padding:
          0 !important;

        color:
          var(--ahx-text)
          !important;

        text-align:
          left !important;
      }

      .ahx-main-html {
        max-height:
          95dvh
          !important;

        overflow:
          auto !important;

        overscroll-behavior:
          contain;
      }

      .ahx-login-actions {
        gap:
          8px !important;

        margin:
          0 !important;

        padding:
          0 22px 22px
          !important;
      }

      .ahx-confirm-button,
      .ahx-cancel-button {
        min-width:
          112px !important;

        min-height:
          42px !important;

        margin:
          0 !important;

        padding:
          8px 14px
          !important;

        border:
          0 !important;

        border-radius:
          10px !important;

        font-size:
          13px !important;

        font-weight:
          800 !important;
      }

      .ahx-confirm-button {
        color:
          #ffffff !important;

        background:
          linear-gradient(
            135deg,
            var(--ahx-primary2),
            var(--ahx-primary)
          )
          !important;
      }

      .ahx-cancel-button {
        color:
          #425965 !important;

        background:
          #e6ecef !important;
      }

      .ahx-validation-message {
        margin:
          0 22px 12px
          !important;

        border-radius:
          8px !important;

        font-size:
          12px !important;
      }

      .ahx-login-card {
        padding:
          24px 22px 14px;

        background:
          #ffffff;
      }

      .ahx-login-brand {
        display:
          flex;

        align-items:
          center;

        gap:
          12px;

        margin-bottom:
          20px;
      }

      .ahx-login-icon {
        display:
          grid;

        place-items:
          center;

        flex:
          0 0 48px;

        width:
          48px;

        height:
          48px;

        border-radius:
          14px;

        color:
          #ffffff;

        background:
          linear-gradient(
            145deg,
            var(--ahx-primary2),
            var(--ahx-primary)
          );

        font-size:
          22px;

        box-shadow:
          0 10px 25px
          rgba(15, 83, 116, .22);
      }

      .ahx-login-brand h2 {
        margin:
          0;

        color:
          var(--ahx-text);

        font-size:
          19px;

        line-height:
          1.25;
      }

      .ahx-login-brand p {
        margin:
          4px 0 0;

        color:
          var(--ahx-muted);

        font-size:
          11px;
      }

      .ahx-field {
        display:
          grid;

        gap:
          6px;

        margin-bottom:
          13px;
      }

      .ahx-field label {
        color:
          #36515f;

        font-size:
          11px;

        font-weight:
          800;
      }

      .ahx-field input {
        width:
          100%;

        height:
          44px;

        margin:
          0;

        padding:
          9px 11px;

        border:
          1px solid
          #c8d6dd;

        border-radius:
          10px;

        outline:
          none;

        color:
          var(--ahx-text);

        background:
          #ffffff;

        font:
          inherit;

        font-size:
          14px;

        box-shadow:
          none;
      }

      .ahx-field input:focus {
        border-color:
          #4c9ec3;

        box-shadow:
          0 0 0 3px
          rgba(76, 158, 195, .14);
      }

      .ahx-login-note {
        display:
          flex;

        align-items:
          flex-start;

        gap:
          7px;

        margin-top:
          4px;

        padding:
          9px 10px;

        border-radius:
          9px;

        color:
          #56707c;

        background:
          #f1f6f8;

        font-size:
          9px;

        line-height:
          1.45;
      }

      .ahx-app {
        min-height:
          420px;

        background:
          var(--ahx-bg);
      }

      .ahx-topbar {
        position:
          sticky;

        top:
          0;

        z-index:
          30;

        display:
          flex;

        align-items:
          center;

        justify-content:
          space-between;

        gap:
          10px;

        min-height:
          58px;

        padding:
          9px 12px;

        color:
          #ffffff;

        background:
          linear-gradient(
            135deg,
            #082d43,
            #145a7a
          );

        box-shadow:
          0 4px 15px
          rgba(5, 35, 52, .22);
      }

      .ahx-topbar-left,
      .ahx-topbar-title {
        display:
          flex;

        align-items:
          center;

        gap:
          9px;

        min-width:
          0;
      }

      .ahx-topbar-title > div {
        min-width:
          0;
      }

      .ahx-topbar-logo {
        display:
          grid;

        place-items:
          center;

        flex:
          0 0 36px;

        width:
          36px;

        height:
          36px;

        border:
          1px solid
          rgba(255, 255, 255, .32);

        border-radius:
          10px;

        background:
          rgba(255, 255, 255, .10);

        font-size:
          17px;
      }

      .ahx-topbar h2 {
        margin:
          0;

        overflow:
          hidden;

        font-size:
          14px;

        line-height:
          1.25;

        text-overflow:
          ellipsis;

        white-space:
          nowrap;
      }

      .ahx-topbar p {
        margin:
          2px 0 0;

        overflow:
          hidden;

        color:
          rgba(255, 255, 255, .72);

        font-size:
          8px;

        text-overflow:
          ellipsis;

        white-space:
          nowrap;
      }

      .ahx-topbar-actions {
        display:
          flex;

        align-items:
          center;

        gap:
          5px;

        flex:
          0 0 auto;
      }

      .ahx-icon-button,
      .ahx-text-button,
      .ahx-back-button {
        display:
          inline-flex;

        align-items:
          center;

        justify-content:
          center;

        min-height:
          32px;

        border:
          1px solid
          rgba(255, 255, 255, .28);

        border-radius:
          8px;

        color:
          #ffffff;

        background:
          rgba(255, 255, 255, .11);

        font:
          inherit;

        font-size:
          9px;

        font-weight:
          800;
      }

      .ahx-icon-button {
        width:
          32px;

        padding:
          0;

        font-size:
          18px;
      }

      .ahx-text-button,
      .ahx-back-button {
        padding:
          5px 9px;
      }

      .ahx-text-button.danger {
        color:
          #ffe3e3;

        border-color:
          rgba(255, 174, 174, .42);

        background:
          rgba(178, 15, 15, .28);
      }

      .ahx-month-panel {
        display:
          grid;

        grid-template-columns:
          38px
          minmax(0, 1fr)
          38px;

        align-items:
          center;

        gap:
          8px;

        padding:
          9px 10px;

        border-bottom:
          1px solid
          var(--ahx-border);

        background:
          #ffffff;
      }

      .ahx-month-panel button {
        display:
          grid;

        place-items:
          center;

        width:
          38px;

        height:
          36px;

        padding:
          0;

        border:
          1px solid
          #ccd9df;

        border-radius:
          9px;

        color:
          var(--ahx-primary);

        background:
          #f4f8fa;

        font:
          inherit;

        font-size:
          24px;

        font-weight:
          700;
      }

      .ahx-month-panel button:disabled {
        opacity:
          .45;
      }

      .ahx-month-title {
        min-width:
          0;

        text-align:
          center;
      }

      .ahx-month-title strong {
        display:
          block;

        color:
          var(--ahx-primary);

        font-size:
          15px;
      }

      .ahx-month-title small {
        display:
          block;

        margin-top:
          2px;

        overflow:
          hidden;

        color:
          var(--ahx-muted);

        font-size:
          8px;

        text-overflow:
          ellipsis;

        white-space:
          nowrap;
      }

      .ahx-summary-grid {
        display:
          grid;

        grid-template-columns:
          repeat(
            6,
            minmax(0, 1fr)
          );

        gap:
          6px;

        padding:
          8px;
      }

      .ahx-summary-grid.compact {
        grid-template-columns:
          repeat(
            4,
            minmax(0, 1fr)
          );
      }

      .ahx-summary-card {
        display:
          flex;

        flex-direction:
          column;

        align-items:
          center;

        justify-content:
          center;

        min-width:
          0;

        min-height:
          54px;

        padding:
          6px 4px;

        border:
          1px solid
          var(--ahx-border);

        border-radius:
          10px;

        background:
          #ffffff;

        text-align:
          center;

        box-shadow:
          0 2px 8px
          rgba(16, 56, 80, .05);
      }

      .ahx-summary-card small {
        overflow:
          hidden;

        width:
          100%;

        color:
          var(--ahx-muted);

        font-size:
          7px;

        font-weight:
          700;

        text-overflow:
          ellipsis;

        white-space:
          nowrap;
      }

      .ahx-summary-card strong {
        display:
          block;

        margin-top:
          3px;

        overflow:
          hidden;

        width:
          100%;

        color:
          var(--ahx-primary);

        font-size:
          14px;

        font-weight:
          900;

        text-overflow:
          ellipsis;

        white-space:
          nowrap;
      }

      .ahx-summary-card.success {
        border-color:
          #b9dfcc;

        background:
          #f0fbf5;
      }

      .ahx-summary-card.success strong {
        color:
          var(--ahx-success);
      }

      .ahx-summary-card.danger {
        border-color:
          #efb8b8;

        background:
          #fff1f1;
      }

      .ahx-summary-card.danger strong {
        color:
          var(--ahx-danger);
      }

      .ahx-summary-card.warning {
        border-color:
          #ecd899;

        background:
          #fff9e8;
      }

      .ahx-summary-card.warning strong {
        color:
          #916d00;
      }

      .ahx-calendar-wrap {
        margin:
          0 8px 8px;

        overflow:
          hidden;

        border:
          1px solid
          var(--ahx-border);

        border-radius:
          12px;

        background:
          #ffffff;
      }

      .ahx-weekdays,
      .ahx-calendar-grid {
        display:
          grid;

        grid-template-columns:
          repeat(
            7,
            minmax(0, 1fr)
          );
      }

      .ahx-weekdays {
        border-bottom:
          1px solid
          var(--ahx-border);

        background:
          #f3f7f9;
      }

      .ahx-weekdays span {
        padding:
          7px 2px;

        color:
          #526a75;

        font-size:
          8px;

        font-weight:
          800;

        text-align:
          center;
      }

      .ahx-calendar-grid {
        gap:
          4px;

        padding:
          6px;
      }

      .ahx-calendar-empty,
      .ahx-calendar-day {
        min-height:
          58px;
      }

      .ahx-calendar-day {
        position:
          relative;

        display:
          flex;

        flex-direction:
          column;

        justify-content:
          space-between;

        min-width:
          0;

        padding:
          6px;

        overflow:
          hidden;

        border:
          1px solid
          #dbe4e8;

        border-radius:
          9px;

        color:
          #284653;

        background:
          #f9fbfc;

        font:
          inherit;

        text-align:
          left;
      }

      .ahx-calendar-day:disabled {
        opacity:
          .48;
      }

      .ahx-calendar-day.has-data {
        border-color:
          #84b9d1;

        background:
          linear-gradient(
            145deg,
            #e9f6fc,
            #ffffff
          );
      }

      .ahx-calendar-day.has-deny {
        border-color:
          #e39191;

        background:
          linear-gradient(
            145deg,
            #fff0f0,
            #ffffff
          );
      }

      .ahx-calendar-day.images-deleted::after,
      .ahx-calendar-day.image-issue::after {
        position:
          absolute;

        right:
          0;

        bottom:
          0;

        left:
          0;

        height:
          3px;

        content:
          "";
      }

      .ahx-calendar-day.images-deleted::after {
        background:
          #7f8b91;
      }

      .ahx-calendar-day.image-issue::after {
        background:
          var(--ahx-warning);
      }

      .ahx-day-number {
        font-size:
          13px;

        font-weight:
          900;
      }

      .ahx-day-badge {
        position:
          absolute;

        top:
          5px;

        right:
          5px;

        min-width:
          18px;

        padding:
          2px 5px;

        border-radius:
          999px;

        color:
          #ffffff;

        background:
          var(--ahx-primary2);

        font-size:
          7px;

        font-weight:
          900;

        text-align:
          center;
      }

      .ahx-calendar-day.has-deny
      .ahx-day-badge {
        background:
          var(--ahx-danger);
      }

      .ahx-day-footer {
        display:
          flex;

        align-items:
          center;

        justify-content:
          space-between;

        gap:
          4px;

        margin-top:
          auto;
      }

      .ahx-day-footer small {
        overflow:
          hidden;

        color:
          #66808d;

        font-size:
          6px;

        text-overflow:
          ellipsis;

        white-space:
          nowrap;
      }

      .ahx-day-dots,
      .ahx-legend {
        display:
          flex;

        align-items:
          center;
      }

      .ahx-day-dots {
        gap:
          3px;
      }

      .ahx-day-dots i,
      .ahx-legend i {
        display:
          block;

        width:
          7px;

        height:
          7px;

        border-radius:
          50%;
      }

      .ahx-dot-data {
        background:
          var(--ahx-primary2);
      }

      .ahx-dot-deny {
        background:
          var(--ahx-danger);
      }

      .ahx-dot-deleted {
        background:
          #7f8b91;
      }

      .ahx-dot-issue {
        background:
          var(--ahx-warning);
      }

      .ahx-legend {
        justify-content:
          center;

        flex-wrap:
          wrap;

        gap:
          7px 13px;

        padding:
          2px 10px 11px;

        color:
          #5a717c;

        font-size:
          7px;

        font-weight:
          700;
      }

      .ahx-legend span {
        display:
          inline-flex;

        align-items:
          center;

        gap:
          4px;
      }

      .ahx-day-toolbar {
        position:
          sticky;

        top:
          58px;

        z-index:
          20;

        display:
          grid;

        grid-template-columns:
          minmax(180px, 1.4fr)
          repeat(
            3,
            minmax(120px, .7fr)
          )
          auto;

        gap:
          6px;

        padding:
          7px 8px;

        border-top:
          1px solid
          rgba(255, 255, 255, .4);

        border-bottom:
          1px solid
          var(--ahx-border);

        background:
          rgba(238, 243, 246, .96);

        backdrop-filter:
          blur(10px);
      }

      .ahx-search-wrap {
        position:
          relative;

        min-width:
          0;
      }

      .ahx-search-wrap span {
        position:
          absolute;

        left:
          10px;

        top:
          50%;

        transform:
          translateY(-50%);

        color:
          #71858f;

        font-size:
          13px;

        pointer-events:
          none;
      }

      .ahx-day-toolbar input,
      .ahx-day-toolbar select {
        width:
          100%;

        height:
          36px;

        min-width:
          0;

        padding:
          6px 8px;

        border:
          1px solid
          #c9d7de;

        border-radius:
          8px;

        outline:
          none;

        color:
          var(--ahx-text);

        background:
          #ffffff;

        font:
          inherit;

        font-size:
          9px;
      }

      .ahx-day-toolbar input {
        padding-left:
          29px;
      }

      .ahx-day-toolbar input:focus,
      .ahx-day-toolbar select:focus {
        border-color:
          #55a0c2;

        box-shadow:
          0 0 0 3px
          rgba(85, 160, 194, .13);
      }

      .ahx-filter-reset {
        min-height:
          36px;

        padding:
          5px 10px;

        border:
          1px solid
          #c9d7de;

        border-radius:
          8px;

        color:
          #47606c;

        background:
          #ffffff;

        font:
          inherit;

        font-size:
          8px;

        font-weight:
          800;

        white-space:
          nowrap;
      }

      .ahx-result-bar {
        display:
          flex;

        align-items:
          center;

        justify-content:
          space-between;

        gap:
          8px;

        padding:
          0 8px 7px;

        color:
          #5f737d;

        font-size:
          8px;
      }

      .ahx-result-bar strong {
        color:
          var(--ahx-primary);
      }

      .ahx-card-grid {
        display:
          grid;

        grid-template-columns:
          repeat(
            2,
            minmax(0, 1fr)
          );

        gap:
          9px;

        padding:
          0 8px 9px;
      }

      .ahx-person-card {
        display:
          grid;

        cursor:
          pointer;

        grid-template-columns:
          138px
          minmax(0, 1fr);

        min-width:
          0;

        min-height:
          188px;

        overflow:
          hidden;

        border:
          1px solid
          var(--ahx-border);

        border-left:
          4px solid
          var(--ahx-success);

        border-radius:
          13px;

        background:
          #ffffff;

        box-shadow:
          0 5px 17px
          rgba(17, 55, 76, .08);
      }

      .ahx-person-card.deny {
        border-color:
          #efb5b5;

        border-left-color:
          var(--ahx-danger);
      }

      .ahx-card-photo {
        position:
          relative;

        min-height:
          188px;

        overflow:
          hidden;

        background:
          linear-gradient(
            145deg,
            #dce7ec,
            #f5f8fa
          );
      }

      .ahx-card-photo img {
        display:
          block;

        width:
          100%;

        height:
          100%;

        min-height:
          188px;

        object-fit:
          cover;
      }

      .ahx-photo-placeholder {
        position:
          absolute;

        inset:
          0;

        display:
          flex;

        flex-direction:
          column;

        align-items:
          center;

        justify-content:
          center;

        gap:
          6px;

        padding:
          12px;

        color:
          #607580;

        background:
          linear-gradient(
            145deg,
            #e5edf1,
            #f8fafb
          );

        text-align:
          center;
      }

      .ahx-photo-placeholder.deleted {
        color:
          #5f6c72;

        background:
          linear-gradient(
            145deg,
            #e1e4e6,
            #f6f7f8
          );
      }

      .ahx-photo-placeholder.issue {
        color:
          #785c00;

        background:
          linear-gradient(
            145deg,
            #fff0bd,
            #fff9e5
          );
      }

      .ahx-photo-placeholder .icon {
        font-size:
          27px;

        line-height:
          1;
      }

      .ahx-photo-placeholder strong {
        font-size:
          9px;
      }

      .ahx-photo-placeholder small {
        font-size:
          7px;

        line-height:
          1.35;
      }

      .ahx-photo-open {
        position:
          absolute;

        right:
          7px;

        bottom:
          7px;

        min-height:
          28px;

        padding:
          4px 8px;

        border:
          1px solid
          rgba(255, 255, 255, .55);

        border-radius:
          999px;

        color:
          #ffffff;

        background:
          rgba(5, 36, 53, .76);

        font:
          inherit;

        font-size:
          7px;

        font-weight:
          850;

        backdrop-filter:
          blur(6px);
      }

      .ahx-card-body {
        display:
          flex;

        flex-direction:
          column;

        min-width:
          0;

        padding:
          9px;
      }

      .ahx-card-head {
        display:
          flex;

        align-items:
          flex-start;

        justify-content:
          space-between;

        gap:
          7px;

        min-width:
          0;
      }

      .ahx-card-identity {
        min-width:
          0;
      }

      .ahx-card-identity h3 {
        margin:
          0;

        overflow:
          hidden;

        color:
          #1b3642;

        font-size:
          12px;

        line-height:
          1.3;

        text-overflow:
          ellipsis;

        white-space:
          nowrap;
      }

      .ahx-card-identity p {
        margin:
          3px 0 0;

        overflow:
          hidden;

        color:
          #6a7d86;

        font-size:
          8px;

        text-overflow:
          ellipsis;

        white-space:
          nowrap;
      }

      .ahx-card-time {
        flex:
          0 0 auto;

        color:
          #54707c;

        font-size:
          8px;

        font-weight:
          850;
      }

      .ahx-status-badge {
        display:
          inline-flex;

        align-items:
          center;

        align-self:
          flex-start;

        margin-top:
          7px;

        max-width:
          100%;

        padding:
          4px 7px;

        overflow:
          hidden;

        border-radius:
          999px;

        font-size:
          7px;

        font-weight:
          900;

        text-overflow:
          ellipsis;

        white-space:
          nowrap;
      }

      .ahx-status-badge.allow {
        color:
          #087347;

        background:
          #ddf5e8;
      }

      .ahx-status-badge.deny {
        color:
          #ffffff;

        background:
          var(--ahx-danger);
      }

      .ahx-card-lines {
        display:
          grid;

        gap:
          4px;

        margin-top:
          8px;
      }

      .ahx-card-line {
        display:
          flex;

        align-items:
          center;

        gap:
          5px;

        min-width:
          0;

        color:
          #58707b;

        font-size:
          7px;
      }

      .ahx-card-line span:first-child {
        flex:
          0 0 auto;

        width:
          15px;

        text-align:
          center;
      }

      .ahx-card-line b {
        overflow:
          hidden;

        color:
          #2e4b58;

        font-weight:
          800;

        text-overflow:
          ellipsis;

        white-space:
          nowrap;
      }

      .ahx-card-values {
        display:
          grid;

        grid-template-columns:
          repeat(
            3,
            minmax(0, 1fr)
          );

        gap:
          4px;

        margin-top:
          8px;
      }

      .ahx-card-value {
        min-width:
          0;

        padding:
          5px 3px;

        border-radius:
          7px;

        color:
          #71828a;

        background:
          #f3f7f9;

        font-size:
          6px;

        text-align:
          center;
      }

      .ahx-card-value strong {
        display:
          block;

        margin-top:
          2px;

        overflow:
          hidden;

        color:
          var(--ahx-primary);

        font-size:
          9px;

        text-overflow:
          ellipsis;

        white-space:
          nowrap;
      }

      .ahx-person-card.deny
      .ahx-card-value.max strong {
        color:
          var(--ahx-danger);
      }

      .ahx-card-foot {
        display:
          flex;

        align-items:
          center;

        justify-content:
          space-between;

        gap:
          6px;

        margin-top:
          auto;

        padding-top:
          8px;
      }

      .ahx-card-image-state {
        min-width:
          0;

        overflow:
          hidden;

        color:
          #6d7f88;

        font-size:
          6px;

        text-overflow:
          ellipsis;

        white-space:
          nowrap;
      }

      .ahx-detail-button {
        flex:
          0 0 auto;

        min-height:
          30px;

        padding:
          5px 8px;

        border:
          0;

        border-radius:
          8px;

        color:
          #ffffff;

        background:
          var(--ahx-primary2);

        font:
          inherit;

        font-size:
          7px;

        font-weight:
          900;

        white-space:
          nowrap;
      }

      .ahx-pagination {
        display:
          grid;

        grid-template-columns:
          92px
          minmax(0, 1fr)
          92px;

        align-items:
          center;

        gap:
          6px;

        padding:
          0 8px 12px;
      }

      .ahx-pagination button {
        min-height:
          35px;

        border:
          1px solid
          #c9d8df;

        border-radius:
          8px;

        color:
          var(--ahx-primary);

        background:
          #ffffff;

        font:
          inherit;

        font-size:
          8px;

        font-weight:
          850;
      }

      .ahx-pagination button:disabled {
        opacity:
          .42;
      }

      .ahx-pagination span {
        color:
          #405b67;

        font-size:
          8px;

        font-weight:
          850;

        text-align:
          center;
      }

      .ahx-pagination small {
        display:
          block;

        margin-top:
          2px;

        color:
          var(--ahx-muted);

        font-size:
          6px;
      }

      .ahx-state {
        grid-column:
          1 / -1;

        display:
          flex;

        flex-direction:
          column;

        align-items:
          center;

        justify-content:
          center;

        gap:
          8px;

        min-height:
          170px;

        padding:
          20px;

        color:
          var(--ahx-muted);

        font-size:
          10px;

        text-align:
          center;
      }

      .ahx-state.error {
        color:
          var(--ahx-danger);
      }

      .ahx-spinner {
        width:
          28px;

        height:
          28px;

        border:
          3px solid
          #d8e4e9;

        border-top-color:
          var(--ahx-primary2);

        border-radius:
          50%;

        animation:
          ahx-spin
          .7s linear infinite;
      }

      @keyframes ahx-spin {
        to {
          transform:
            rotate(360deg);
        }
      }

      .ahx-overlay {
        position:
          fixed;

        inset:
          0;

        z-index:
          999999;

        display:
          grid;

        place-items:
          center;

        padding:
          10px;

        background:
          rgba(2, 12, 18, .92);
      }

      .ahx-dialog {
        display:
          grid;

        grid-template-rows:
          auto
          minmax(0, 1fr);

        width:
          min(
            96vw,
            860px
          );

        max-height:
          94dvh;

        overflow:
          hidden;

        border:
          1px solid
          rgba(255, 255, 255, .18);

        border-radius:
          14px;

        background:
          #f1f5f7;

        box-shadow:
          0 24px 80px
          rgba(0, 0, 0, .52);
      }

      .ahx-dialog.dark {
        background:
          #07131a;
      }

      .ahx-dialog-head {
        display:
          flex;

        align-items:
          center;

        justify-content:
          space-between;

        gap:
          8px;

        min-height:
          48px;

        padding:
          8px 10px;

        color:
          #ffffff;

        background:
          #0d354c;
      }

      .ahx-dialog-head strong {
        overflow:
          hidden;

        font-size:
          11px;

        text-overflow:
          ellipsis;

        white-space:
          nowrap;
      }

      .ahx-dialog-head button {
        display:
          grid;

        place-items:
          center;

        width:
          31px;

        height:
          31px;

        padding:
          0;

        border:
          1px solid
          rgba(255, 255, 255, .24);

        border-radius:
          50%;

        color:
          #ffffff;

        background:
          rgba(255, 255, 255, .10);

        font:
          inherit;

        font-size:
          20px;
      }

      .ahx-dialog-body {
        min-height:
          230px;

        overflow:
          auto;

        padding:
          9px;
      }

      .ahx-dialog.dark
      .ahx-dialog-body {
        display:
          flex;

        flex-direction:
          column;

        align-items:
          center;

        justify-content:
          center;

        color:
          #d9e7ed;

        background:
          #050b0f;
      }

      .ahx-dialog.dark
      .ahx-state {
        color:
          #d9e7ed;
      }

      .ahx-dialog.dark img {
        display:
          block;

        max-width:
          100%;

        max-height:
          calc(
            94dvh -
            95px
          );

        border-radius:
          9px;

        object-fit:
          contain;
      }

      .ahx-image-caption {
        margin-top:
          7px;

        color:
          rgba(255, 255, 255, .65);

        font-size:
          7px;

        text-align:
          center;
      }

      .ahx-detail-layout {
        display:
          grid;

        grid-template-columns:
          minmax(240px, .8fr)
          minmax(0, 1.2fr);

        gap:
          9px;
      }

      .ahx-detail-photo {
        position:
          sticky;

        top:
          0;

        align-self:
          start;

        min-height:
          300px;

        overflow:
          hidden;

        border:
          1px solid
          var(--ahx-border);

        border-radius:
          12px;

        background:
          #e7eef2;
      }

      .ahx-detail-photo img {
        display:
          block;

        width:
          100%;

        height:
          100%;

        min-height:
          300px;

        max-height:
          560px;

        object-fit:
          contain;

        background:
          #111b20;
      }

      .ahx-detail-content {
        display:
          grid;

        gap:
          8px;

        min-width:
          0;
      }

      .ahx-detail-title {
        display:
          flex;

        align-items:
          flex-start;

        justify-content:
          space-between;

        gap:
          8px;

        padding:
          10px;

        border:
          1px solid
          var(--ahx-border);

        border-radius:
          11px;

        background:
          #ffffff;
      }

      .ahx-detail-title h3 {
        margin:
          0;

        color:
          #1b3642;

        font-size:
          15px;
      }

      .ahx-detail-title p {
        margin:
          4px 0 0;

        color:
          #6b7e87;

        font-size:
          8px;
      }

      .ahx-detail-meta {
        display:
          grid;

        grid-template-columns:
          repeat(
            2,
            minmax(0, 1fr)
          );

        gap:
          5px;
      }

      .ahx-detail-meta > div {
        min-width:
          0;

        padding:
          7px;

        border:
          1px solid
          var(--ahx-border);

        border-radius:
          8px;

        background:
          #ffffff;
      }

      .ahx-detail-meta small {
        display:
          block;

        color:
          #72848d;

        font-size:
          7px;
      }

      .ahx-detail-meta strong {
        display:
          block;

        margin-top:
          2px;

        overflow:
          hidden;

        color:
          #294754;

        font-size:
          9px;

        text-overflow:
          ellipsis;

        white-space:
          nowrap;
      }

      .ahx-detail-values {
        display:
          grid;

        grid-template-columns:
          repeat(
            4,
            minmax(0, 1fr)
          );

        gap:
          5px;
      }

      .ahx-detail-values > div {
        padding:
          7px 4px;

        border:
          1px solid
          var(--ahx-border);

        border-radius:
          8px;

        background:
          #ffffff;

        color:
          #71828a;

        font-size:
          7px;

        text-align:
          center;
      }

      .ahx-detail-values strong {
        display:
          block;

        margin-top:
          2px;

        color:
          var(--ahx-primary);

        font-size:
          11px;
      }

      .ahx-image-status {
        display:
          flex;

        align-items:
          center;

        justify-content:
          space-between;

        gap:
          8px;

        padding:
          8px;

        border:
          1px solid
          var(--ahx-border);

        border-radius:
          9px;

        color:
          #526b76;

        background:
          #ffffff;
      }

      .ahx-image-status strong {
        font-size:
          8px;
      }

      .ahx-image-status small {
        color:
          #7a8b93;

        font-size:
          7px;

        text-align:
          right;
      }

      .ahx-round-list {
        display:
          grid;

        gap:
          5px;
      }

      .ahx-round-row {
        display:
          grid;

        grid-template-columns:
          48px
          minmax(80px, .7fr)
          minmax(120px, 1.3fr)
          auto;

        align-items:
          center;

        gap:
          6px;

        padding:
          7px;

        border:
          1px solid
          var(--ahx-border);

        border-radius:
          8px;

        background:
          #ffffff;
      }

      .ahx-round-row strong {
        color:
          #344f5c;

        font-size:
          8px;
      }

      .ahx-round-row b {
        color:
          var(--ahx-primary);

        font-size:
          10px;
      }

      .ahx-round-row small {
        overflow:
          hidden;

        color:
          #74868e;

        font-size:
          7px;

        text-overflow:
          ellipsis;

        white-space:
          nowrap;
      }

      .ahx-round-row button {
        min-height:
          29px;

        padding:
          4px 8px;

        border:
          0;

        border-radius:
          7px;

        color:
          #ffffff;

        background:
          var(--ahx-primary2);

        font:
          inherit;

        font-size:
          7px;

        font-weight:
          900;
      }

      .ahx-no-image {
        color:
          #8b999f;

        font-size:
          6px;

        font-weight:
          700;

        text-align:
          center;
      }

      .ahx-record-id {
        overflow:
          hidden;

        padding:
          5px 7px;

        border:
          1px dashed
          #d6e1e6;

        border-radius:
          7px;

        color:
          #87959c;

        background:
          #fafcfd;

        font-family:
          ui-monospace,
          SFMono-Regular,
          Consolas,
          monospace;

        font-size:
          6px;

        text-overflow:
          ellipsis;

        white-space:
          nowrap;
      }

      @media (
        max-width: 760px
      ) {

        .ahx-main-popup {
          width:
            100vw !important;

          height:
            100dvh !important;

          max-height:
            100dvh !important;

          border:
            0 !important;

          border-radius:
            0 !important;
        }

        .ahx-main-html {
          height:
            100dvh !important;

          max-height:
            100dvh !important;
        }

        .ahx-topbar {
          padding-top:
            calc(
              9px +
              env(
                safe-area-inset-top,
                0px
              )
            );
        }

        .ahx-summary-grid {
          grid-template-columns:
            repeat(
              4,
              minmax(0, 1fr)
            );

          gap:
            5px;

          padding:
            7px;
        }

        .ahx-summary-grid.compact {
          grid-template-columns:
            repeat(
              4,
              minmax(0, 1fr)
            );
        }

        .ahx-day-toolbar {
          top:
            calc(
              58px +
              env(
                safe-area-inset-top,
                0px
              )
            );

          grid-template-columns:
            minmax(0, 1fr)
            minmax(105px, .45fr);

          gap:
            5px;
        }

        .ahx-day-toolbar
        select:nth-of-type(2),
        .ahx-day-toolbar
        select:nth-of-type(3) {
          display:
            none;
        }

        .ahx-filter-reset {
          display:
            none;
        }

        .ahx-card-grid {
          grid-template-columns:
            1fr;

          gap:
            7px;

          padding-right:
            6px;

          padding-left:
            6px;
        }

        .ahx-person-card {
          grid-template-columns:
            120px
            minmax(0, 1fr);

          min-height:
            164px;
        }

        .ahx-card-photo,
        .ahx-card-photo img {
          min-height:
            164px;
        }

        .ahx-dialog {
          width:
            100vw;

          height:
            100dvh;

          max-height:
            100dvh;

          border:
            0;

          border-radius:
            0;
        }

        .ahx-detail-layout {
          grid-template-columns:
            1fr;
        }

        .ahx-detail-photo {
          position:
            relative;

          min-height:
            240px;
        }

        .ahx-detail-photo img {
          min-height:
            240px;

          max-height:
            44dvh;
        }

        .ahx-round-row {
          grid-template-columns:
            42px
            minmax(68px, .7fr)
            minmax(90px, 1.3fr)
            auto;
        }

      }

      @media (
        max-width: 390px
      ) {

        .ahx-login-card {
          padding-right:
            17px;

          padding-left:
            17px;
        }

        .ahx-login-actions {
          padding-right:
            17px !important;

          padding-left:
            17px !important;
        }

        .ahx-confirm-button,
        .ahx-cancel-button {
          min-width:
            100px !important;
        }

        .ahx-topbar {
          padding-right:
            8px;

          padding-left:
            8px;
        }

        .ahx-topbar-logo {
          flex-basis:
            32px;

          width:
            32px;

          height:
            32px;
        }

        .ahx-topbar h2 {
          font-size:
            12px;
        }

        .ahx-text-button {
          padding-right:
            6px;

          padding-left:
            6px;

          font-size:
            7px;
        }

        .ahx-summary-grid {
          grid-template-columns:
            repeat(
              3,
              minmax(0, 1fr)
            );
        }

        .ahx-summary-grid.compact {
          grid-template-columns:
            repeat(
              4,
              minmax(0, 1fr)
            );
        }

        .ahx-summary-card strong {
          font-size:
            12px;
        }

        .ahx-calendar-day,
        .ahx-calendar-empty {
          min-height:
            48px;
        }

        .ahx-person-card {
          grid-template-columns:
            106px
            minmax(0, 1fr);

          min-height:
            154px;
        }

        .ahx-card-photo,
        .ahx-card-photo img {
          min-height:
            154px;
        }

        .ahx-card-body {
          padding:
            7px;
        }

        .ahx-card-identity h3 {
          font-size:
            11px;
        }

        .ahx-card-lines {
          gap:
            3px;

          margin-top:
            6px;
        }

        .ahx-card-values {
          gap:
            3px;

          margin-top:
            6px;
        }

        .ahx-detail-meta {
          grid-template-columns:
            1fr 1fr;
        }

        .ahx-detail-values {
          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );
        }

        .ahx-round-row {
          grid-template-columns:
            38px
            minmax(58px, .7fr)
            minmax(66px, 1.3fr)
            auto;

          gap:
            4px;

          padding:
            5px;
        }

        .ahx-pagination {
          grid-template-columns:
            76px
            minmax(0, 1fr)
            76px;
        }

      }
    `;

    document.head
      .appendChild(style);
  }


  /************************************************************
   * Camera
   ************************************************************/

  function pauseCamera() {
    state.cameraWasReady =
      false;

    try {
      const camera =
        window.AlcoholCamera;

      if (
        camera &&
        typeof camera.getState ===
        'function'
      ) {
        const cameraState =
          camera.getState();

        state.cameraWasReady =
          Boolean(
            cameraState &&
            cameraState.ready
          );
      }

      if (
        state.cameraWasReady &&
        camera &&
        typeof camera.close ===
        'function'
      ) {
        camera.close();
      }

    } catch (error) {
      console.warn(
        'หยุดกล้องชั่วคราวไม่สำเร็จ',
        error
      );
    }
  }


  function resumeCamera() {
    if (!state.cameraWasReady) {
      return;
    }

    state.cameraWasReady =
      false;

    window.setTimeout(
      function () {
        try {
          const camera =
            window.AlcoholCamera;

          if (
            camera &&
            typeof camera.open ===
            'function'
          ) {
            camera.open();
          }

        } catch (error) {
          console.warn(
            'เปิดกล้องกลับไม่สำเร็จ',
            error
          );
        }
      },
      180
    );
  }


  /************************************************************
   * History Button
   ************************************************************/

  function ensureHistoryButton() {
    let button =
      getElement(
        'historyAccessButton'
      );

    if (!button) {
      button =
        document.createElement(
          'button'
        );

      button.id =
        'historyAccessButton';

      button.innerHTML =
        '<span aria-hidden="true">🔒</span>' +
        '<span>ประวัติ</span>';

      const target =
        document.querySelector(
          '.topbar-status-row'
        ) ||
        document.querySelector(
          '.topbar-info'
        ) ||
        document.querySelector(
          '.status-section'
        ) ||
        document.body;

      target.appendChild(
        button
      );
    }

    button.type =
      'button';

    button.className =
      'ahx-history-button';

    button.setAttribute(
      'aria-label',
      'เข้าสู่ระบบเพื่อดูประวัติการตรวจวัด'
    );

    button.title =
      'ดูประวัติการตรวจวัด';

    return button;
  }


  function setButtonBusy(busy) {
    const button =
      getElement(
        'historyAccessButton'
      );

    if (button) {
      button.disabled =
        Boolean(busy);
    }
  }


  /************************************************************
   * Authentication
   ************************************************************/

  async function ensureAuthenticated() {
    loadSession();

    if (state.token) {
      try {
        const result =
          await API
            .historySession({
              token:
                state.token,

              deviceId:
                getDeviceId()
            });

        saveSession({
          token:
            state.token,

          name:
            result.name ||
            state.name,

          expiresAtIso:
            result.expiresAtIso
        });

        return true;

      } catch (error) {
        if (
          !isAuthError(error)
        ) {
          throw error;
        }

        clearSession();
      }
    }

    return showLogin();
  }


  async function showLogin() {
    const Swal =
      getSwal();

    const result =
      await Swal.fire({
        title:
          '',

        icon:
          undefined,

        width:
          430,

        html:
          '<div class="ahx-login-card">' +

            '<div class="ahx-login-brand">' +

              '<div ' +
                'class="ahx-login-icon" ' +
                'aria-hidden="true"' +
              '>' +
                '🔐' +
              '</div>' +

              '<div>' +
                '<h2>' +
                  'เข้าสู่ระบบดูประวัติ' +
                '</h2>' +

                '<p>' +
                  'ใช้ชื่อและรหัสจากชีท Pass' +
                '</p>' +
              '</div>' +

            '</div>' +

            '<div class="ahx-field">' +

              '<label for="ahxLoginName">' +
                'ชื่อผู้ใช้งาน' +
              '</label>' +

              '<input ' +
                'id="ahxLoginName" ' +
                'type="text" ' +
                'maxlength="200" ' +
                'autocomplete="username" ' +
                'placeholder="กรอกชื่อผู้ใช้งาน"' +
              '>' +

            '</div>' +

            '<div class="ahx-field">' +

              '<label for="ahxLoginPass">' +
                'รหัสผ่าน' +
              '</label>' +

              '<input ' +
                'id="ahxLoginPass" ' +
                'type="password" ' +
                'maxlength="200" ' +
                'autocomplete="current-password" ' +
                'placeholder="กรอกรหัสผ่าน"' +
              '>' +

            '</div>' +

            '<div class="ahx-login-note">' +
              '<span>ℹ️</span>' +

              '<span>' +
                'Session จะถูกเก็บเฉพาะแท็บนี้ ' +
                'และหมดอายุอัตโนมัติ' +
              '</span>' +
            '</div>' +

          '</div>',

        showCancelButton:
          true,

        confirmButtonText:
          'เข้าสู่ระบบ',

        cancelButtonText:
          'ยกเลิก',

        reverseButtons:
          true,

        focusConfirm:
          false,

        showLoaderOnConfirm:
          true,

        buttonsStyling:
          false,

        allowOutsideClick:
          function () {
            return !Swal.isLoading();
          },

        customClass: {
          popup:
            'ahx-login-popup',

          htmlContainer:
            'ahx-login-html',

          actions:
            'ahx-login-actions',

          confirmButton:
            'ahx-confirm-button',

          cancelButton:
            'ahx-cancel-button',

          validationMessage:
            'ahx-validation-message'
        },

        didOpen:
          function () {
            const nameInput =
              getElement(
                'ahxLoginName'
              );

            const passInput =
              getElement(
                'ahxLoginPass'
              );

            if (nameInput) {
              nameInput.focus();
            }

            [
              nameInput,
              passInput
            ].forEach(
              function (input) {
                if (!input) {
                  return;
                }

                input.addEventListener(
                  'keydown',
                  function (event) {
                    if (
                      event.key ===
                      'Enter'
                    ) {
                      event.preventDefault();

                      const confirmButton =
                        Swal
                          .getConfirmButton();

                      if (confirmButton) {
                        confirmButton.click();
                      }
                    }
                  }
                );
              }
            );
          },

        preConfirm:
          async function () {
            const name =
              cleanText(
                getElement(
                  'ahxLoginName'
                ) &&
                getElement(
                  'ahxLoginName'
                ).value
              );

            const pas =
              cleanText(
                getElement(
                  'ahxLoginPass'
                ) &&
                getElement(
                  'ahxLoginPass'
                ).value
              );

            if (!name || !pas) {
              Swal.showValidationMessage(
                'กรุณากรอกชื่อและรหัสผ่านให้ครบ'
              );

              return false;
            }

            try {
              return await API
                .historyLogin({
                  name:
                    name,

                  pas:
                    pas,

                  deviceId:
                    getDeviceId()
                });

            } catch (error) {
              Swal.showValidationMessage(
                cleanText(
                  error &&
                  error.message
                ) ||
                'เข้าสู่ระบบไม่สำเร็จ'
              );

              return false;
            }
          }
      });

    if (
      !result.isConfirmed ||
      !result.value
    ) {
      return false;
    }

    saveSession(
      result.value
    );

    return true;
  }


  /************************************************************
   * Main Modal
   ************************************************************/

  async function showMainModal() {
    const Swal =
      getSwal();

    state.currentMonth =
      state.currentMonth ||
      loadLastMonth() ||
      currentBangkokMonth();

    await Swal.fire({
      title:
        '',

      html:
        '<div ' +
          'id="ahxRoot" ' +
          'class="ahx-app"' +
        '></div>',

      showConfirmButton:
        false,

      showCancelButton:
        false,

      showCloseButton:
        false,

      allowOutsideClick:
        false,

      allowEscapeKey:
        true,

      customClass: {
        popup:
          'ahx-main-popup',

        htmlContainer:
          'ahx-main-html'
      },

      didOpen:
        renderCalendarView,

      willClose:
        function () {
          disconnectThumbnailObserver();
          closeOverlay();
        }
    });
  }


  function mainHeaderHtml(
  title,
  subtitle,
  showBack
) {
  return (
    '<header class="ahx-topbar ahx-topbar-clean">' +

      '<div class="ahx-topbar-left">' +

        (
          showBack
            ? (
              '<button ' +
                'id="ahxBackButton" ' +
                'type="button" ' +
                'class="ahx-back-button"' +
              '>' +
                '‹ ปฏิทิน' +
              '</button>'
            )
            : (
              '<span ' +
                'class="ahx-title-mark" ' +
                'aria-hidden="true"' +
              '></span>'
            )
        ) +

        '<div class="ahx-topbar-title">' +

          '<div>' +
            '<h2>' +
              escapeHtml(title) +
            '</h2>' +

            '<p id="ahxHeaderMeta">' +
              escapeHtml(subtitle) +
            '</p>' +
          '</div>' +

        '</div>' +

      '</div>' +

      '<div class="ahx-topbar-actions">' +

        '<button ' +
          'id="ahxLogoutButton" ' +
          'type="button" ' +
          'class="ahx-text-button danger"' +
        '>' +
          'ออกจากระบบ' +
        '</button>' +

        '<button ' +
          'id="ahxCloseButton" ' +
          'type="button" ' +
          'class="ahx-icon-button" ' +
          'aria-label="ปิด"' +
        '>' +
          '×' +
        '</button>' +

      '</div>' +

    '</header>'
  );
}


  function bindCommonHeaderEvents() {
    const closeButton =
      getElement(
        'ahxCloseButton'
      );

    const logoutButton =
      getElement(
        'ahxLogoutButton'
      );

    if (closeButton) {
      closeButton.addEventListener(
        'click',
        function () {
          getSwal().close();
        }
      );
    }

    if (logoutButton) {
      logoutButton.addEventListener(
        'click',
        logoutHistory
      );
    }
  }


  /************************************************************
   * Calendar
   ************************************************************/

 function renderCalendarView() {
  disconnectThumbnailObserver();
  closeOverlay();

  const root =
    getElement(
      'ahxRoot'
    );

  if (!root) {
    return;
  }

  root.innerHTML =
    mainHeaderHtml(
      'ประวัติการตรวจวัดแอลกอฮอล์',

      'ผู้ใช้งาน: ' +
      (
        state.name ||
        '-'
      ),

      false
    ) +

    '<section class="ahx-month-panel ahx-month-panel-clean">' +

      '<button ' +
        'id="ahxPreviousMonth" ' +
        'type="button" ' +
        'aria-label="เดือนก่อนหน้า"' +
      '>' +
        '‹' +
      '</button>' +

      '<div class="ahx-month-title">' +

        '<strong id="ahxMonthTitle">' +
          escapeHtml(
            monthTitle(
              state.currentMonth
            )
          ) +
        '</strong>' +

        '<small id="ahxMonthGenerated">' +
          'กำลังโหลดข้อมูล...' +
        '</small>' +

      '</div>' +

      '<button ' +
        'id="ahxCurrentMonth" ' +
        'type="button" ' +
        'class="ahx-current-month-button"' +
      '>' +
        'เดือนปัจจุบัน' +
      '</button>' +

      '<button ' +
        'id="ahxNextMonth" ' +
        'type="button" ' +
        'aria-label="เดือนถัดไป"' +
      '>' +
        '›' +
      '</button>' +

    '</section>' +

    '<main class="ahx-month-layout">' +

      '<section class="ahx-month-calendar-pane">' +

        '<div class="ahx-calendar-wrap ahx-calendar-wrap-clean">' +

          '<div class="ahx-weekdays">' +
            '<span>จ</span>' +
            '<span>อ</span>' +
            '<span>พ</span>' +
            '<span>พฤ</span>' +
            '<span>ศ</span>' +
            '<span>ส</span>' +
            '<span>อา</span>' +
          '</div>' +

          '<div ' +
            'id="ahxCalendarGrid" ' +
            'class="ahx-calendar-grid"' +
          '>' +

            loadingHtml(
              'กำลังโหลดข้อมูลรายเดือน...'
            ) +

          '</div>' +

        '</div>' +

        '<div class="ahx-legend ahx-legend-clean">' +

          '<span>' +
            '<i class="ahx-dot-data"></i>' +
            'มีข้อมูล' +
          '</span>' +

          '<span>' +
            '<i class="ahx-dot-deny"></i>' +
            'มีผลห้ามเข้า' +
          '</span>' +

          '<span>' +
            '<i class="ahx-legend-selected"></i>' +
            'วันที่เลือก' +
          '</span>' +

        '</div>' +

      '</section>' +

      '<aside ' +
        'id="ahxMonthSummary" ' +
        'class="ahx-month-summary-panel"' +
      '>' +

        loadingHtml(
          'กำลังสรุปข้อมูล...'
        ) +

      '</aside>' +

      '<section ' +
        'id="ahxSelectedDayPanel" ' +
        'class="ahx-selected-day-panel"' +
      '>' +

        selectedDayPanelHtml(
          '',
          null
        ) +

      '</section>' +

    '</main>';

  bindCommonHeaderEvents();

  const previousButton =
    getElement(
      'ahxPreviousMonth'
    );

  const nextButton =
    getElement(
      'ahxNextMonth'
    );

  const currentButton =
    getElement(
      'ahxCurrentMonth'
    );

  if (previousButton) {
    previousButton.addEventListener(
      'click',
      function () {
        loadMonth(
          shiftMonth(
            state.currentMonth,
            -1
          )
        );
      }
    );
  }

  if (nextButton) {
    nextButton.addEventListener(
      'click',
      function () {
        loadMonth(
          shiftMonth(
            state.currentMonth,
            1
          )
        );
      }
    );
  }

  if (currentButton) {
    currentButton.addEventListener(
      'click',
      function () {
        loadMonth(
          currentBangkokMonth()
        );
      }
    );
  }

  if (
    state.monthData &&
    state.monthData.month ===
    state.currentMonth
  ) {
    renderMonthData(
      state.monthData
    );

  } else {
    loadMonth(
      state.currentMonth
    );
  }
}


  async function loadMonth(monthKey) {
    const grid =
      getElement(
        'ahxCalendarGrid'
      );

    const title =
      getElement(
        'ahxMonthTitle'
      );

    const generated =
      getElement(
        'ahxMonthGenerated'
      );

    if (!grid) {
      return;
    }

   if (
  state.currentMonth !==
  monthKey
) {
  state.currentDate =
    '';
}

state.currentMonth =
  monthKey;

saveLastMonth(
  monthKey
);

    if (title) {
      title.textContent =
        monthTitle(
          monthKey
        );
    }

    if (generated) {
      generated.textContent =
        'กำลังโหลดข้อมูล...';
    }

    grid.innerHTML =
      loadingHtml(
        'กำลังโหลดข้อมูลรายเดือน...'
      );

    setMonthButtonsDisabled(
      true
    );

    try {
      const result =
        await API
          .historyMonth({
            token:
              state.token,

            deviceId:
              getDeviceId(),

            month:
              monthKey
          });

      state.monthData =
        result;

      renderMonthData(
        result
      );

    } catch (error) {
      if (
        handleAuthFailure(
          error
        )
      ) {
        return;
      }

      grid.innerHTML =
        errorHtml(
          cleanText(
            error &&
            error.message
          ) ||
          'โหลดข้อมูลรายเดือนไม่สำเร็จ'
        );

      if (generated) {
        generated.textContent =
          'โหลดข้อมูลไม่สำเร็จ';
      }

    } finally {
      setMonthButtonsDisabled(
        false
      );
    }
  }


  function setMonthButtonsDisabled(
    disabled
  ) {
    [
      'ahxPreviousMonth',
      'ahxNextMonth'
    ].forEach(
      function (id) {
        const button =
          getElement(id);

        if (button) {
          button.disabled =
            Boolean(disabled);
        }
      }
    );
  }


  function renderMonthData(data) {
  const summary =
    getElement(
      'ahxMonthSummary'
    );

  const grid =
    getElement(
      'ahxCalendarGrid'
    );

  const generated =
    getElement(
      'ahxMonthGenerated'
    );

  const headerMeta =
    getElement(
      'ahxHeaderMeta'
    );

  if (!summary || !grid) {
    return;
  }

  if (generated) {
    generated.textContent =
      data.generatedAt
        ? (
          'อัปเดตล่าสุด ' +
          data.generatedAt
        )
        : '';
  }

  if (headerMeta) {
    headerMeta.textContent =
      'ผู้ใช้งาน: ' +
      (
        state.name ||
        '-'
      ) +
      (
        data.generatedAt
          ? (
            ' • อัปเดตล่าสุด ' +
            data.generatedAt
          )
          : ''
      );
  }

  summary.innerHTML =
    monthSummaryHtml(
      data.totals || {}
    );

  const days =
    data.days || {};

  grid.innerHTML =
    calendarGridHtml(
      data.month,
      days
    );

  const selectedDate =
    pickDefaultMonthDate(
      data.month,
      days
    );

  state.currentDate =
    selectedDate;

  setSelectedCalendarDay(
    selectedDate
  );

  renderSelectedDayPanel(
    selectedDate,

    selectedDate
      ? days[selectedDate]
      : null
  );

  grid
    .querySelectorAll(
      '[data-ahx-date]'
    )
    .forEach(
      function (button) {
        button.addEventListener(
          'click',
          function () {
            const selected =
              cleanText(
                button.dataset
                  .ahxDate
              );

            if (!selected) {
              return;
            }

            state.currentDate =
              selected;

            state.currentPage =
              1;

            setSelectedCalendarDay(
              selected
            );

            renderSelectedDayPanel(
              selected,

              days[selected] ||
              null
            );
          }
        );
      }
    );
}


function pickDefaultMonthDate(
  monthKey,
  days
) {
  if (
    state.currentDate &&
    state.currentDate.indexOf(
      monthKey +
      '-'
    ) ===
    0 &&
    days[state.currentDate]
  ) {
    return state.currentDate;
  }

  const dateKeys =
    Object
      .keys(days)
      .filter(
        function (key) {
          return Boolean(
            days[key] &&
            days[key].hasData !==
            false
          );
        }
      )
      .sort();

  return dateKeys.length
    ? dateKeys[
      dateKeys.length -
      1
    ]
    : '';
}


function setSelectedCalendarDay(
  dateKey
) {
  document
    .querySelectorAll(
      '.ahx-calendar-day.is-selected'
    )
    .forEach(
      function (button) {
        button.classList
          .remove(
            'is-selected'
          );
      }
    );

  if (!dateKey) {
    return;
  }

  const selected =
    document.querySelector(
      '[data-ahx-date="' +
      dateKey +
      '"]'
    );

  if (selected) {
    selected.classList
      .add(
        'is-selected'
      );
  }
}


function renderSelectedDayPanel(
  dateKey,
  item
) {
  const panel =
    getElement(
      'ahxSelectedDayPanel'
    );

  if (!panel) {
    return;
  }

  panel.innerHTML =
    selectedDayPanelHtml(
      dateKey,
      item
    );

  const openButton =
    getElement(
      'ahxOpenSelectedDay'
    );

  if (openButton) {
    openButton.addEventListener(
      'click',
      function () {
        if (!dateKey) {
          return;
        }

        state.currentDate =
          dateKey;

        state.currentPage =
          1;

        resetDayFilters();

        renderDayView(
          dateKey
        );
      }
    );
  }
}


function selectedDayPanelHtml(
  dateKey,
  item
) {
  if (!dateKey || !item) {
    return (
      '<div class="ahx-selected-empty">' +
        '<strong>' +
          'เลือกวันที่ที่มีข้อมูล' +
        '</strong>' +

        '<span>' +
          'ระบบจะแสดงสรุปของวันนั้นก่อนเปิดรายชื่อผู้ถูกตรวจ' +
        '</span>' +
      '</div>'
    );
  }

  return (
    '<div class="ahx-selected-head">' +

      '<span>' +
        'วันที่เลือก' +
      '</span>' +

      '<strong>' +
        escapeHtml(
          fullThaiDateTitle(
            dateKey
          )
        ) +
      '</strong>' +

    '</div>' +

    '<div class="ahx-selected-metrics">' +

      selectedMetricHtml(
        'รายการทั้งหมด',
        item.totalRecords ||
        0
      ) +

      selectedMetricHtml(
        'อนุญาต',
        item.allowCount ||
        0,
        'success'
      ) +

      selectedMetricHtml(
        'ห้ามเข้า',
        item.denyCount ||
        0,
        'danger'
      ) +

      selectedMetricHtml(
        'ค่าสูงสุด',

        formatMg(
          item.maxValue
        ) +
        ' Mg%',

        item.denyCount
          ? 'danger'
          : ''
      ) +

    '</div>' +

    '<button ' +
      'id="ahxOpenSelectedDay" ' +
      'type="button" ' +
      'class="ahx-open-selected-day"' +
    '>' +

      'ดูรายชื่อผู้ถูกตรวจ ' +

      finiteNumber(
        item.totalRecords,
        0
      ) +

      ' รายการ' +

    '</button>'
  );
}


function selectedMetricHtml(
  label,
  value,
  type
) {
  return (
    '<div class="ahx-selected-metric ' +
      escapeAttribute(
        type ||
        ''
      ) +
    '">' +

      '<span>' +
        escapeHtml(label) +
      '</span>' +

      '<strong>' +
        escapeHtml(value) +
      '</strong>' +

    '</div>'
  );
}
  function summaryCardHtml(
    label,
    value,
    type
  ) {
    return (
      '<div class="ahx-summary-card ' +
        escapeAttribute(
          type || ''
        ) +
      '">' +

        '<small>' +
          escapeHtml(label) +
        '</small>' +

        '<strong>' +
          escapeHtml(value) +
        '</strong>' +

      '</div>'
    );
  }


  function monthSummaryHtml(totals) {
  return (
    '<div class="ahx-month-summary-head">' +

      '<span>' +
        'สรุปประจำเดือน' +
      '</span>' +

      '<strong>' +
        escapeHtml(
          monthTitle(
            state.currentMonth
          )
        ) +
      '</strong>' +

    '</div>' +

    '<div class="ahx-month-primary">' +

      monthPrimaryMetricHtml(
        'รายการทั้งหมด',
        totals.totalRecords ||
        0
      ) +

      monthPrimaryMetricHtml(
        'อนุญาต',
        totals.allowCount ||
        0,
        'success'
      ) +

      monthPrimaryMetricHtml(
        'ห้ามเข้า',
        totals.denyCount ||
        0,
        'danger'
      ) +

      monthPrimaryMetricHtml(
        'ค่าสูงสุด',

        formatMg(
          totals.maxValue
        ) +
        ' Mg%',

        totals.denyCount
          ? 'danger'
          : ''
      ) +

    '</div>' +

    '<div class="ahx-month-secondary">' +

      monthSecondaryRowHtml(
        'วันที่มีข้อมูล',

        (
          totals.daysWithData ||
          0
        ) +
        ' วัน'
      ) +

      monthSecondaryRowHtml(
        'จำนวนรอบ',

        (
          totals.totalRounds ||
          0
        ) +
        ' รอบ'
      ) +

      monthSecondaryRowHtml(
        'ภาพพร้อมดู',

        (
          totals.imagesAvailable ||
          0
        ) +
        ' ภาพ'
      ) +

      monthSecondaryRowHtml(
        'ภาพถูกลบ',

        (
          totals.imagesDeleted ||
          0
        ) +
        ' ภาพ'
      ) +

      monthSecondaryRowHtml(
        'ภาพมีปัญหา',

        (
          totals.imageIssues ||
          0
        ) +
        ' ภาพ',

        totals.imageIssues
          ? 'warning'
          : ''
      ) +

    '</div>'
  );
}


function monthPrimaryMetricHtml(
  label,
  value,
  type
) {
  return (
    '<div class="ahx-month-primary-item ' +
      escapeAttribute(
        type ||
        ''
      ) +
    '">' +

      '<span>' +
        escapeHtml(label) +
      '</span>' +

      '<strong>' +
        escapeHtml(value) +
      '</strong>' +

    '</div>'
  );
}


function monthSecondaryRowHtml(
  label,
  value,
  type
) {
  return (
    '<div class="ahx-month-secondary-row ' +
      escapeAttribute(
        type ||
        ''
      ) +
    '">' +

      '<span>' +
        escapeHtml(label) +
      '</span>' +

      '<strong>' +
        escapeHtml(value) +
      '</strong>' +

    '</div>'
  );
}


  function calendarGridHtml(
    monthKey,
    days
  ) {
    const parsed =
      parseMonthKey(
        monthKey
      );

    if (!parsed) {
      return errorHtml(
        'รูปแบบเดือนไม่ถูกต้อง'
      );
    }

    let html =
      '';

    const totalDays =
      daysInMonth(
        parsed.year,
        parsed.month
      );

    const offset =
      mondayFirstOffset(
        parsed.year,
        parsed.month
      );

    for (
      let index = 0;
      index < offset;
      index += 1
    ) {
      html +=
        '<span class="ahx-calendar-empty"></span>';
    }

    for (
      let day = 1;
      day <= totalDays;
      day += 1
    ) {
      const key =
        makeDateKey(
          parsed.year,
          parsed.month,
          day
        );

      html +=
        calendarDayHtml(
          key,
          day,
          days[key] || null
        );
    }

    return html;
  }


  function calendarDayHtml(
  key,
  day,
  item
) {
  const classes = [
    'ahx-calendar-day'
  ];

  if (
    key ===
    currentBangkokDateKey()
  ) {
    classes.push(
      'is-today'
    );
  }

  if (!item) {
    return (
      '<button ' +
        'type="button" ' +
        'class="' +
          classes.join(' ') +
        '" ' +
        'disabled' +
      '>' +

        '<span class="ahx-day-number">' +
          day +
        '</span>' +

      '</button>'
    );
  }

  classes.push(
    'has-data'
  );

  if (item.hasDeny) {
    classes.push(
      'has-deny'
    );
  }

  const footerText =
    item.hasDeny
      ? (
        'ห้ามเข้า ' +

        finiteNumber(
          item.denyCount,
          0
        )
      )
      : (
        finiteNumber(
          item.totalRecords,
          0
        ) +

        ' รายการ'
      );

  return (
    '<button ' +
      'type="button" ' +
      'class="' +
        classes.join(' ') +
      '" ' +
      'data-ahx-date="' +
        escapeAttribute(key) +
      '"' +
    '>' +

      '<span class="ahx-day-number">' +
        day +
      '</span>' +

      '<span class="ahx-day-badge">' +

        finiteNumber(
          item.totalRecords,
          0
        ) +

      '</span>' +

      '<span class="ahx-day-status-text">' +
        escapeHtml(
          footerText
        ) +
      '</span>' +

    '</button>'
  );
}


  /************************************************************
   * Daily View
   ************************************************************/

  function resetDayFilters() {
    state.filters.search =
      '';

    state.filters.status =
      'ALL';

    state.filters.checkpoint =
      '';

    state.filters.image =
      'ALL';
  }


  function renderDayView(selectedDate) {
    disconnectThumbnailObserver();
    closeOverlay();

    const root =
      getElement(
        'ahxRoot'
      );

    if (!root) {
      return;
    }

    root.innerHTML =
      mainHeaderHtml(
        'ข้อมูลวันที่ ' +
        displayDateKey(
          selectedDate
        ),

        'ผู้ใช้งาน: ' +
        (
          state.name ||
          '-'
        ),

        true
      ) +

      '<section ' +
        'id="ahxDaySummary" ' +
        'class="ahx-summary-grid compact"' +
      '></section>' +

      '<section class="ahx-day-toolbar">' +

        '<div class="ahx-search-wrap">' +
          '<span>⌕</span>' +

          '<input ' +
            'id="ahxSearchInput" ' +
            'type="search" ' +
            'autocomplete="off" ' +
            'placeholder="ค้นหาชื่อ บริษัท จุดตรวจ หรือผู้ตรวจ"' +
          '>' +
        '</div>' +

        '<select ' +
          'id="ahxStatusFilter" ' +
          'aria-label="กรองผลตรวจ"' +
        '>' +
          '<option value="ALL">' +
            'ผลตรวจทั้งหมด' +
          '</option>' +

          '<option value="ALLOW">' +
            'อนุญาต' +
          '</option>' +

          '<option value="DENY">' +
            'ห้ามเข้าพื้นที่' +
          '</option>' +
        '</select>' +

        '<select ' +
          'id="ahxCheckpointFilter" ' +
          'aria-label="กรองจุดตรวจ"' +
        '>' +
          '<option value="">' +
            'ทุกจุดตรวจ' +
          '</option>' +
        '</select>' +

        '<select ' +
          'id="ahxImageFilter" ' +
          'aria-label="กรองสถานะภาพ"' +
        '>' +
          '<option value="ALL">' +
            'ภาพทั้งหมด' +
          '</option>' +

          '<option value="AVAILABLE">' +
            'ภาพพร้อมดู' +
          '</option>' +

          '<option value="DELETED">' +
            'ภาพถูกลบ' +
          '</option>' +

          '<option value="ISSUE">' +
            'ภาพมีปัญหา' +
          '</option>' +
        '</select>' +

        '<button ' +
          'id="ahxResetFilters" ' +
          'type="button" ' +
          'class="ahx-filter-reset"' +
        '>' +
          'ล้างตัวกรอง' +
        '</button>' +

      '</section>' +

      '<div ' +
        'id="ahxResultBar" ' +
        'class="ahx-result-bar"' +
      '>' +
        '<span>' +
          'กำลังโหลดข้อมูล...' +
        '</span>' +
      '</div>' +

      '<section ' +
        'id="ahxCardGrid" ' +
        'class="ahx-card-grid"' +
      '>' +

        loadingHtml(
          'กำลังโหลดข้อมูลรายวัน...'
        ) +

      '</section>' +

      '<section ' +
        'id="ahxPagination" ' +
        'class="ahx-pagination"' +
      '></section>';

    bindCommonHeaderEvents();

    const backButton =
      getElement(
        'ahxBackButton'
      );

    if (backButton) {
      backButton.addEventListener(
        'click',
        renderCalendarView
      );
    }

    bindDayFilterEvents();

    loadDay(
      selectedDate,
      state.currentPage
    );
  }


  function bindDayFilterEvents() {
    const searchInput =
      getElement(
        'ahxSearchInput'
      );

    const statusFilter =
      getElement(
        'ahxStatusFilter'
      );

    const checkpointFilter =
      getElement(
        'ahxCheckpointFilter'
      );

    const imageFilter =
      getElement(
        'ahxImageFilter'
      );

    const resetButton =
      getElement(
        'ahxResetFilters'
      );

    if (searchInput) {
      searchInput.value =
        state.filters.search;

      searchInput.addEventListener(
        'input',
        function () {
          state.filters.search =
            cleanText(
              searchInput.value
            );

          debounceSearch(
            function () {
              state.currentPage =
                1;

              loadDay(
                state.currentDate,
                1
              );
            }
          );
        }
      );
    }

    if (statusFilter) {
      statusFilter.value =
        state.filters.status;

      statusFilter.addEventListener(
        'change',
        function () {
          state.filters.status =
            cleanText(
              statusFilter.value
            ) ||
            'ALL';

          state.currentPage =
            1;

          loadDay(
            state.currentDate,
            1
          );
        }
      );
    }

    if (checkpointFilter) {
      checkpointFilter.value =
        state.filters.checkpoint;

      checkpointFilter.addEventListener(
        'change',
        function () {
          state.filters.checkpoint =
            cleanText(
              checkpointFilter.value
            );

          state.currentPage =
            1;

          loadDay(
            state.currentDate,
            1
          );
        }
      );
    }

    if (imageFilter) {
      imageFilter.value =
        state.filters.image;

      imageFilter.addEventListener(
        'change',
        function () {
          state.filters.image =
            cleanText(
              imageFilter.value
            ) ||
            'ALL';

          state.currentPage =
            1;

          loadDay(
            state.currentDate,
            1
          );
        }
      );
    }

    if (resetButton) {
      resetButton.addEventListener(
        'click',
        function () {
          resetDayFilters();

          state.currentPage =
            1;

          renderDayView(
            state.currentDate
          );
        }
      );
    }
  }


  async function loadDay(
    selectedDate,
    page
  ) {
    const grid =
      getElement(
        'ahxCardGrid'
      );

    const sequence =
      state.dayLoadSequence +
      1;

    state.dayLoadSequence =
      sequence;

    if (!grid) {
      return;
    }

    disconnectThumbnailObserver();

    grid.innerHTML =
      loadingHtml(
        'กำลังโหลดข้อมูลรายวัน...'
      );

    try {
      const result =
        await API
          .historyDay({
            token:
              state.token,

            deviceId:
              getDeviceId(),

            date:
              selectedDate,

            page:
              page,

            pageSize:
              PAGE_SIZE,

            search:
              state.filters.search,

            status:
              state.filters.status,

            checkpoint:
              state.filters.checkpoint,

            image:
              state.filters.image
          });

      if (
        sequence !==
        state.dayLoadSequence
      ) {
        return;
      }

      state.currentPage =
        result.pagination &&
        result.pagination.page
          ? result.pagination.page
          : page;

      state.dayData =
        result;

      renderDayData(
        result
      );

    } catch (error) {
      if (
        sequence !==
        state.dayLoadSequence
      ) {
        return;
      }

      if (
        handleAuthFailure(
          error
        )
      ) {
        return;
      }

      grid.innerHTML =
        errorHtml(
          cleanText(
            error &&
            error.message
          ) ||
          'โหลดข้อมูลรายวันไม่สำเร็จ'
        );
    }
  }


  function renderDayData(data) {
    const summary =
      getElement(
        'ahxDaySummary'
      );

    const grid =
      getElement(
        'ahxCardGrid'
      );

    const pagination =
      getElement(
        'ahxPagination'
      );

    const resultBar =
      getElement(
        'ahxResultBar'
      );

    const checkpointFilter =
      getElement(
        'ahxCheckpointFilter'
      );

    if (!summary || !grid) {
      return;
    }

    const day =
      data.filteredSummary ||
      data.summary ||
      {};

    summary.innerHTML =
      summaryCardHtml(
        'รายการ',
        day.totalRecords || 0
      ) +

      summaryCardHtml(
        'อนุญาต',
        day.allowCount || 0,
        'success'
      ) +

      summaryCardHtml(
        'ห้ามเข้า',
        day.denyCount || 0,
        'danger'
      ) +

      summaryCardHtml(
        'ค่าสูงสุด',
        formatMg(
          day.maxValue
        ) +
        ' Mg%',

        day.denyCount
          ? 'danger'
          : ''
      );

    updateCheckpointOptions(
      checkpointFilter,

      data.filterOptions &&
      data.filterOptions.checkpoints
    );

    const records =
      Array.isArray(
        data.records
      )
        ? data.records
        : [];

    grid.innerHTML =
      records.length
        ? records
          .map(
            personCardHtml
          )
          .join('')
        : emptyHtml(
          'ไม่พบข้อมูลตามเงื่อนไขที่เลือก'
        );

    if (resultBar) {
      const pageInfo =
        data.pagination || {};

      resultBar.innerHTML =
        '<span>' +
          'พบ <strong>' +
          finiteNumber(
            pageInfo.totalRecords,
            records.length
          ) +
          '</strong> รายการ' +

          (
            finiteNumber(
              pageInfo.totalBeforeFilter,
              0
            ) !==
            finiteNumber(
              pageInfo.totalRecords,
              0
            )
              ? (
                ' จากทั้งหมด ' +
                finiteNumber(
                  pageInfo.totalBeforeFilter,
                  0
                )
              )
              : ''
          ) +

        '</span>' +

        '<span>' +
          'หน้า ' +
          finiteNumber(
            pageInfo.page,
            1
          ) +
          '/' +
          finiteNumber(
            pageInfo.totalPages,
            1
          ) +
        '</span>';
    }

    if (pagination) {
      pagination.innerHTML =
        paginationHtml(
          data.pagination || {}
        );

      bindPaginationEvents();
    }

    bindPersonCards();
    setupThumbnailObserver();
  }


  function updateCheckpointOptions(
    select,
    checkpoints
  ) {
    if (!select) {
      return;
    }

    const current =
      state.filters.checkpoint;

    const list =
      Array.isArray(checkpoints)
        ? checkpoints
        : [];

    select.innerHTML =
      '<option value="">' +
        'ทุกจุดตรวจ' +
      '</option>' +

      list
        .map(
          function (item) {
            return (
              '<option value="' +
                escapeAttribute(item) +
              '">' +

                escapeHtml(item) +

              '</option>'
            );
          }
        )
        .join('');

    select.value =
      current;
  }


  /************************************************************
   * Person Card
   ************************************************************/

  function personCardHtml(record) {
    const deny =
      cleanText(
        record.status
      ).toUpperCase() ===
      'DENY';

    const canView =
      record.coverCanViewImage ===
      true &&
      cleanText(
        record.coverRoundId
      );

    return (
      '<article ' +
        'class="ahx-person-card ' +
          (
            deny
              ? 'deny'
              : 'allow'
          ) +
        '" ' +
        'data-record-id="' +
          escapeAttribute(
            record.recordId
          ) +
        '"' +
      '>' +

        '<div ' +
          'class="ahx-card-photo ahx-thumb" ' +
          'data-record-id="' +
            escapeAttribute(
              record.recordId
            ) +
          '" ' +
          'data-round-id="' +
            escapeAttribute(
              record.coverRoundId ||
              ''
            ) +
          '" ' +
          'data-can-view="' +
            (
              canView
                ? '1'
                : '0'
            ) +
          '"' +
        '>' +

          photoPlaceholderHtml(
            record
          ) +

          (
            canView
              ? (
                '<button ' +
                  'type="button" ' +
                  'class="ahx-photo-open" ' +
                  'data-open-image="1"' +
                '>' +
                  'ดูภาพ' +
                '</button>'
              )
              : ''
          ) +

        '</div>' +

        '<div class="ahx-card-body">' +

          '<div class="ahx-card-head">' +

            '<div class="ahx-card-identity">' +

              '<h3>' +
                escapeHtml(
                  record.personName ||
                  'ไม่ระบุชื่อ'
                ) +
              '</h3>' +

              '<p>' +
                escapeHtml(
                  record.personType ||
                  '-'
                ) +
              '</p>' +

            '</div>' +

            '<time class="ahx-card-time">' +
              escapeHtml(
                record.time ||
                '--:--:--'
              ) +
            '</time>' +

          '</div>' +

          '<span class="ahx-status-badge ' +
            (
              deny
                ? 'deny'
                : 'allow'
            ) +
          '">' +

            escapeHtml(
              record.statusMessage ||
              (
                deny
                  ? 'ห้ามเข้าพื้นที่'
                  : 'อนุญาต'
              )
            ) +

          '</span>' +

          '<div class="ahx-card-lines">' +

            '<div class="ahx-card-line">' +
              '<span>📍</span>' +

              '<b>' +
                escapeHtml(
                  record.checkpoint ||
                  '-'
                ) +
              '</b>' +
            '</div>' +

            '<div class="ahx-card-line">' +
              '<span>👤</span>' +

              '<b>' +
                'ผู้ตรวจ: ' +
                escapeHtml(
                  record.inspector ||
                  '-'
                ) +
              '</b>' +
            '</div>' +

            (
              record.organizationValue
                ? (
                  '<div class="ahx-card-line">' +
                    '<span>🏢</span>' +

                    '<b>' +
                      escapeHtml(
                        record.organizationValue
                      ) +
                    '</b>' +
                  '</div>'
                )
                : ''
            ) +

          '</div>' +

          '<div class="ahx-card-values">' +

            cardValueHtml(
              'ล่าสุด',
              formatMg(
                record.lastValueMg
              )
            ) +

            cardValueHtml(
              'สูงสุด',
              formatMg(
                record.maxValueMg
              ),
              'max'
            ) +

            cardValueHtml(
              'จำนวนรอบ',
              String(
                record.roundCount ||
                0
              )
            ) +

          '</div>' +

          '<div class="ahx-card-foot">' +

            '<span class="ahx-card-image-state">' +

              escapeHtml(
                record.coverImageStatusText ||
                record.imageStatusText ||
                'ไม่ทราบสถานะภาพ'
              ) +

            '</span>' +

            '<button ' +
              'type="button" ' +
              'class="ahx-detail-button"' +
            '>' +
              'ดูรายละเอียด ›' +
            '</button>' +

          '</div>' +

        '</div>' +

      '</article>'
    );
  }


  function cardValueHtml(
    label,
    value,
    extraClass
  ) {
    return (
      '<div class="ahx-card-value ' +
        escapeAttribute(
          extraClass ||
          ''
        ) +
      '">' +

        escapeHtml(label) +

        '<strong>' +
          escapeHtml(value) +
        '</strong>' +

      '</div>'
    );
  }


  function photoPlaceholderHtml(record) {
    const status =
      cleanText(
        record.coverImageStatus ||
        record.imageStatus
      ).toUpperCase();

    const statusText =
      cleanText(
        record.coverImageStatusText ||
        record.imageStatusText
      );

    const deletedAt =
      cleanText(
        record.coverImageDeletedAt ||
        record.imageDeletedAt
      );

    const canView =
      record.coverCanViewImage ===
      true &&
      cleanText(
        record.coverRoundId
      );

    if (canView) {
      return (
        '<div class="ahx-photo-placeholder">' +
          '<span class="icon">' +
            '🖼️' +
          '</span>' +

          '<strong>' +
            'กำลังโหลดภาพ' +
          '</strong>' +

          '<small>' +
            'แตะเพื่อดูภาพขนาดเต็ม' +
          '</small>' +
        '</div>'
      );
    }

    if (
      [
        'DELETED',
        'PERMANENTLY_DELETED',
        'TRASHED'
      ].includes(status)
    ) {
      return (
        '<div class="ahx-photo-placeholder deleted">' +
          '<span class="icon">' +
            '🗑️' +
          '</span>' +

          '<strong>' +
            'รูปภาพถูกลบแล้ว' +
          '</strong>' +

          '<small>' +
            escapeHtml(
              deletedAt ||
              statusText
            ) +
          '</small>' +
        '</div>'
      );
    }

    if (
      [
        'FAILED',
        'PARTIAL_FAILED',
        'MISSING',
        'NO_FILE_ID'
      ].includes(status)
    ) {
      return (
        '<div class="ahx-photo-placeholder issue">' +
          '<span class="icon">' +
            '⚠️' +
          '</span>' +

          '<strong>' +
            'ไม่สามารถแสดงภาพ' +
          '</strong>' +

          '<small>' +
            escapeHtml(
              statusText ||
              'ข้อมูลการตรวจยังอยู่ครบ'
            ) +
          '</small>' +
        '</div>'
      );
    }

    return (
      '<div class="ahx-photo-placeholder">' +
        '<span class="icon">' +
          '👤' +
        '</span>' +

        '<strong>' +
          'ไม่มีภาพตัวอย่าง' +
        '</strong>' +

        '<small>' +
          escapeHtml(
            statusText ||
            'กดรายละเอียดเพื่อดูข้อมูล'
          ) +
        '</small>' +
      '</div>'
    );
  }


  function bindPersonCards() {
    document
      .querySelectorAll(
        '.ahx-person-card'
      )
      .forEach(
        function (card) {
          card.addEventListener(
            'click',
            function (event) {
              const recordId =
                cleanText(
                  card.dataset
                    .recordId
                );

              if (!recordId) {
                return;
              }

              if (
                event.target &&
                event.target.closest(
                  '[data-open-image="1"]'
                )
              ) {
                const thumb =
                  card.querySelector(
                    '.ahx-thumb'
                  );

                if (thumb) {
                  openProtectedImage(
                    cleanText(
                      thumb.dataset
                        .recordId
                    ),

                    cleanText(
                      thumb.dataset
                        .roundId
                    )
                  );
                }

                return;
              }

              openRecordDetail(
                recordId
              );
            }
          );
        }
      );
  }


  /************************************************************
   * Thumbnail
   ************************************************************/

  function setupThumbnailObserver() {
    disconnectThumbnailObserver();

    const targets =
      Array.from(
        document.querySelectorAll(
          '.ahx-thumb[data-can-view="1"]'
        )
      );

    if (!targets.length) {
      return;
    }

    if (
      !(
        'IntersectionObserver'
        in window
      )
    ) {
      targets.forEach(
        loadThumbnailForElement
      );

      return;
    }

    state.thumbnailObserver =
      new IntersectionObserver(
        function (
          entries,
          observer
        ) {
          entries.forEach(
            function (entry) {
              if (!entry.isIntersecting) {
                return;
              }

              observer.unobserve(
                entry.target
              );

              loadThumbnailForElement(
                entry.target
              );
            }
          );
        },

        {
          rootMargin:
            '220px 0px'
        }
      );

    targets.forEach(
      function (target) {
        state.thumbnailObserver
          .observe(target);
      }
    );
  }


  function disconnectThumbnailObserver() {
    if (
      state.thumbnailObserver
    ) {
      state.thumbnailObserver
        .disconnect();

      state.thumbnailObserver =
        null;
    }
  }


  function thumbnailCacheKey(
    recordId,
    roundId
  ) {
    return (
      recordId +
      '::' +
      roundId
    );
  }


  function putThumbnailCache(
    key,
    dataUrl
  ) {
    if (
      state.thumbnailCache
        .has(key)
    ) {
      state.thumbnailCache
        .delete(key);
    }

    state.thumbnailCache
      .set(
        key,
        dataUrl
      );

    while (
      state.thumbnailCache.size >
      THUMBNAIL_CACHE_LIMIT
    ) {
      const firstKey =
        state.thumbnailCache
          .keys()
          .next()
          .value;

      state.thumbnailCache
        .delete(
          firstKey
        );
    }
  }


  async function loadThumbnailForElement(
    element
  ) {
    const recordId =
      cleanText(
        element.dataset
          .recordId
      );

    const roundId =
      cleanText(
        element.dataset
          .roundId
      );

    if (
      !recordId ||
      !roundId ||
      !API ||
      typeof API.historyThumbnail !==
        'function'
    ) {
      return;
    }

    const key =
      thumbnailCacheKey(
        recordId,
        roundId
      );

    const cached =
      state.thumbnailCache
        .get(key);

    if (cached) {
      renderThumbnail(
        element,
        cached
      );

      return;
    }

    try {
      const result =
        await API
          .historyThumbnail({
            token:
              state.token,

            deviceId:
              getDeviceId(),

            recordId:
              recordId,

            roundId:
              roundId
          });

      if (!element.isConnected) {
        return;
      }

      if (
        result.available &&
        result.dataUrl
      ) {
        putThumbnailCache(
          key,
          result.dataUrl
        );

        renderThumbnail(
          element,
          result.dataUrl
        );

      } else {
        const placeholder =
          element.querySelector(
            '.ahx-photo-placeholder'
          );

        if (placeholder) {
          placeholder.className =
            'ahx-photo-placeholder issue';

          placeholder.innerHTML =
            '<span class="icon">' +
              '⚠️' +
            '</span>' +

            '<strong>' +
              'ไม่พบภาพตัวอย่าง' +
            '</strong>' +

            '<small>' +
              escapeHtml(
                result.imageStatusText ||
                ''
              ) +
            '</small>';
        }
      }

    } catch (error) {
      if (
        handleAuthFailure(
          error
        )
      ) {
        return;
      }

      const placeholder =
        element.querySelector(
          '.ahx-photo-placeholder'
        );

      if (placeholder) {
        placeholder.className =
          'ahx-photo-placeholder issue';

        placeholder.innerHTML =
          '<span class="icon">' +
            '⚠️' +
          '</span>' +

          '<strong>' +
            'โหลดภาพไม่สำเร็จ' +
          '</strong>' +

          '<small>' +
            'กดดูรายละเอียดเพื่อทดลองใหม่' +
          '</small>';
      }
    }
  }


  function renderThumbnail(
    element,
    dataUrl
  ) {
    const oldImage =
      element.querySelector(
        'img'
      );

    if (oldImage) {
      oldImage.remove();
    }

    const image =
      document.createElement(
        'img'
      );

    image.alt =
      'ภาพผู้ถูกตรวจที่เบลอแล้ว';

    image.loading =
      'lazy';

    image.src =
      dataUrl;

    const placeholder =
      element.querySelector(
        '.ahx-photo-placeholder'
      );

    if (placeholder) {
      placeholder.remove();
    }

    element.insertBefore(
      image,
      element.firstChild
    );
  }


  /************************************************************
   * Pagination
   ************************************************************/

  function paginationHtml(pagination) {
    const page =
      Math.max(
        1,
        Number(
          pagination.page
        ) ||
        1
      );

    const totalPages =
      Math.max(
        1,
        Number(
          pagination.totalPages
        ) ||
        1
      );

    return (
      '<button ' +
        'id="ahxPreviousPage" ' +
        'type="button" ' +
        (
          pagination.hasPrevious
            ? ''
            : 'disabled'
        ) +
      '>' +
        '‹ ก่อนหน้า' +
      '</button>' +

      '<span>' +
        'หน้า ' +
        page +
        ' / ' +
        totalPages +

        '<small>' +
          'ทั้งหมด ' +
          finiteNumber(
            pagination.totalRecords,
            0
          ) +
          ' รายการ' +
        '</small>' +

      '</span>' +

      '<button ' +
        'id="ahxNextPage" ' +
        'type="button" ' +
        (
          pagination.hasNext
            ? ''
            : 'disabled'
        ) +
      '>' +
        'ถัดไป ›' +
      '</button>'
    );
  }


  function bindPaginationEvents() {
    const previous =
      getElement(
        'ahxPreviousPage'
      );

    const next =
      getElement(
        'ahxNextPage'
      );

    if (previous) {
      previous.addEventListener(
        'click',
        function () {
          if (
            state.currentPage >
            1
          ) {
            state.currentPage -=
              1;

            loadDay(
              state.currentDate,
              state.currentPage
            );
          }
        }
      );
    }

    if (next) {
      next.addEventListener(
        'click',
        function () {
          state.currentPage +=
            1;

          loadDay(
            state.currentDate,
            state.currentPage
          );
        }
      );
    }
  }


  /************************************************************
   * Record Detail
   ************************************************************/

  async function openRecordDetail(recordId) {
    if (
      !recordId ||
      !API ||
      typeof API.historyRecord !==
        'function'
    ) {
      showGeneralError(
        new Error(
          'ระบบยังไม่รองรับการโหลดรายละเอียดรายการ'
        )
      );

      return;
    }

    closeOverlay();

    const overlay =
      createOverlay(
        'รายละเอียดการตรวจวัด',
        false
      );

    const body =
      overlay.querySelector(
        '.ahx-dialog-body'
      );

    body.innerHTML =
      loadingHtml(
        'กำลังโหลดรายละเอียด...'
      );

    try {
      const result =
        await API
          .historyRecord({
            token:
              state.token,

            deviceId:
              getDeviceId(),

            recordId:
              recordId
          });

      if (!overlay.isConnected) {
        return;
      }

      const record =
        result.record || {};

      body.innerHTML =
        recordDetailHtml(
          record
        );

      bindDetailEvents(
        record
      );

      loadDetailCover(
        record
      );

    } catch (error) {
      if (
        handleAuthFailure(
          error
        )
      ) {
        return;
      }

      if (body) {
        body.innerHTML =
          errorHtml(
            cleanText(
              error &&
              error.message
            ) ||
            'โหลดรายละเอียดไม่สำเร็จ'
          );
      }
    }
  }


  function recordDetailHtml(record) {
    const deny =
      cleanText(
        record.status
      ).toUpperCase() ===
      'DENY';

    const rounds =
      Array.isArray(
        record.rounds
      )
        ? record.rounds
        : [];

    const cover =
      pickCoverRound(
        rounds
      );

    return (
      '<div class="ahx-detail-layout">' +

        '<div ' +
          'id="ahxDetailPhoto" ' +
          'class="ahx-detail-photo" ' +
          'data-record-id="' +
            escapeAttribute(
              record.recordId ||
              ''
            ) +
          '" ' +
          'data-round-id="' +
            escapeAttribute(
              cover
                ? cover.roundId
                : ''
            ) +
          '"' +
        '>' +

          detailPhotoPlaceholderHtml(
            record,
            cover
          ) +

        '</div>' +

        '<div class="ahx-detail-content">' +

          '<div class="ahx-detail-title">' +

            '<div>' +
              '<h3>' +
                escapeHtml(
                  record.personName ||
                  'ไม่ระบุชื่อ'
                ) +
              '</h3>' +

              '<p>' +
                escapeHtml(
                  record.dateTime ||
                  ''
                ) +
              '</p>' +
            '</div>' +

            '<span class="ahx-status-badge ' +
              (
                deny
                  ? 'deny'
                  : 'allow'
              ) +
            '">' +

              escapeHtml(
                record.statusMessage ||
                (
                  deny
                    ? 'ห้ามเข้าพื้นที่'
                    : 'อนุญาต'
                )
              ) +

            '</span>' +

          '</div>' +

          '<div class="ahx-detail-meta">' +

            detailMetaHtml(
              'ประเภทบุคคล',
              record.personType
            ) +

            detailMetaHtml(
              record.organizationType ||
              'บริษัท/สายรถ',

              record.organizationValue
            ) +

            detailMetaHtml(
              'จุดตรวจ',
              record.checkpoint
            ) +

            detailMetaHtml(
              'ผู้ตรวจวัด',
              record.inspector
            ) +

          '</div>' +

          '<div class="ahx-detail-values">' +

            detailValueHtml(
              'จำนวนรอบ',
              record.roundCount ||
              0
            ) +

            detailValueHtml(
              'ครั้งแรก',
              formatMg(
                record.firstValueMg
              )
            ) +

            detailValueHtml(
              'ล่าสุด',
              formatMg(
                record.lastValueMg
              )
            ) +

            detailValueHtml(
              'สูงสุด Mg%',
              formatMg(
                record.maxValueMg
              )
            ) +

          '</div>' +

          '<div class="ahx-image-status">' +

            '<strong>' +
              escapeHtml(
                record.imageStatusText ||
                'ไม่ทราบสถานะภาพ'
              ) +
            '</strong>' +

            '<small>' +

              escapeHtml(
                record.imageDeletedAt
                  ? (
                    'ดำเนินการ ' +
                    record.imageDeletedAt
                  )
                  : (
                    record.imageExpireAt
                      ? (
                        'กำหนดลบ ' +
                        record.imageExpireAt
                      )
                      : ''
                  )
              ) +

            '</small>' +

          '</div>' +

          '<div class="ahx-round-list">' +

            (
              rounds.length
                ? rounds
                  .map(
                    function (round) {
                      return roundRowHtml(
                        record.recordId,
                        round
                      );
                    }
                  )
                  .join('')
                : emptyHtml(
                  'ไม่พบรายละเอียดรอบตรวจ'
                )
            ) +

          '</div>' +

          '<div class="ahx-record-id">' +
            escapeHtml(
              record.recordId ||
              ''
            ) +
          '</div>' +

        '</div>' +

      '</div>'
    );
  }


  function pickCoverRound(rounds) {
    if (
      !Array.isArray(rounds) ||
      !rounds.length
    ) {
      return null;
    }

    for (
      let index =
        rounds.length -
        1;

      index >= 0;

      index -= 1
    ) {
      if (
        rounds[index]
          .canViewImage ===
        true
      ) {
        return rounds[index];
      }
    }

    return rounds[
      rounds.length -
      1
    ];
  }


  function detailPhotoPlaceholderHtml(
    record,
    cover
  ) {
    if (
      cover &&
      cover.canViewImage ===
      true
    ) {
      return (
        '<div class="ahx-photo-placeholder">' +
          '<span class="icon">' +
            '🖼️' +
          '</span>' +

          '<strong>' +
            'กำลังโหลดภาพ' +
          '</strong>' +

          '<small>' +
            'ภาพที่เบลอแล้ว' +
          '</small>' +
        '</div>'
      );
    }

    const statusText =
      cover &&
      cover.imageStatusText
        ? cover.imageStatusText
        : record.imageStatusText;

    return (
      '<div class="ahx-photo-placeholder deleted">' +
        '<span class="icon">' +
          '🗑️' +
        '</span>' +

        '<strong>' +
          'ไม่มีภาพสำหรับแสดง' +
        '</strong>' +

        '<small>' +
          escapeHtml(
            statusText ||
            ''
          ) +
        '</small>' +
      '</div>'
    );
  }


  function detailMetaHtml(
    label,
    value
  ) {
    return (
      '<div>' +
        '<small>' +
          escapeHtml(label) +
        '</small>' +

        '<strong>' +
          escapeHtml(
            value ||
            '-'
          ) +
        '</strong>' +
      '</div>'
    );
  }


  function detailValueHtml(
    label,
    value
  ) {
    return (
      '<div>' +
        escapeHtml(label) +

        '<strong>' +
          escapeHtml(value) +
        '</strong>' +
      '</div>'
    );
  }


  function roundRowHtml(
    recordId,
    round
  ) {
    return (
      '<div class="ahx-round-row">' +

        '<strong>' +
          'รอบ ' +
          escapeHtml(
            round.roundNumber ||
            '-'
          ) +
        '</strong>' +

        '<b>' +
          formatMg(
            round.valueMg
          ) +
          ' Mg%' +
        '</b>' +

        '<small>' +
          escapeHtml(
            round.measuredAt ||
            round.imageStatusText ||
            ''
          ) +
        '</small>' +

        (
          round.canViewImage ===
          true
            ? (
              '<button ' +
                'type="button" ' +
                'class="ahx-round-image-button" ' +
                'data-record-id="' +
                  escapeAttribute(
                    recordId
                  ) +
                '" ' +
                'data-round-id="' +
                  escapeAttribute(
                    round.roundId
                  ) +
                '"' +
              '>' +
                'ดูภาพ' +
              '</button>'
            )
            : (
              '<span class="ahx-no-image">' +
                'ไม่มีภาพ' +
              '</span>'
            )
        ) +

      '</div>'
    );
  }


  function bindDetailEvents(record) {
    document
      .querySelectorAll(
        '.ahx-round-image-button'
      )
      .forEach(
        function (button) {
          button.addEventListener(
            'click',
            function () {
              openProtectedImage(
                cleanText(
                  button.dataset
                    .recordId
                ),

                cleanText(
                  button.dataset
                    .roundId
                )
              );
            }
          );
        }
      );

    const cover =
      pickCoverRound(
        Array.isArray(
          record.rounds
        )
          ? record.rounds
          : []
      );

    const photo =
      getElement(
        'ahxDetailPhoto'
      );

    if (
      photo &&
      cover &&
      cover.canViewImage ===
      true
    ) {
      photo.style.cursor =
        'pointer';

      photo.addEventListener(
        'click',
        function () {
          openProtectedImage(
            record.recordId,
            cover.roundId
          );
        }
      );
    }
  }


  async function loadDetailCover(record) {
    const photo =
      getElement(
        'ahxDetailPhoto'
      );

    if (!photo) {
      return;
    }

    const rounds =
      Array.isArray(
        record.rounds
      )
        ? record.rounds
        : [];

    const cover =
      pickCoverRound(
        rounds
      );

    if (
      !cover ||
      cover.canViewImage !==
      true ||
      typeof API.historyThumbnail !==
      'function'
    ) {
      return;
    }

    const key =
      thumbnailCacheKey(
        record.recordId,
        cover.roundId
      );

    const cached =
      state.thumbnailCache
        .get(key);

    if (cached) {
      renderDetailImage(
        photo,
        cached
      );

      return;
    }

    try {
      const result =
        await API
          .historyThumbnail({
            token:
              state.token,

            deviceId:
              getDeviceId(),

            recordId:
              record.recordId,

            roundId:
              cover.roundId
          });

      if (!photo.isConnected) {
        return;
      }

      if (
        result.available &&
        result.dataUrl
      ) {
        putThumbnailCache(
          key,
          result.dataUrl
        );

        renderDetailImage(
          photo,
          result.dataUrl
        );
      }

    } catch (error) {
      if (
        handleAuthFailure(
          error
        )
      ) {
        return;
      }
    }
  }


  function renderDetailImage(
    container,
    dataUrl
  ) {
    container.innerHTML =
      '';

    const image =
      document.createElement(
        'img'
      );

    image.alt =
      'ภาพผู้ถูกตรวจที่เบลอแล้ว';

    image.src =
      dataUrl;

    container.appendChild(
      image
    );
  }


  /************************************************************
   * Overlay
   ************************************************************/

  function createOverlay(
    title,
    dark
  ) {
    closeOverlay();

    const overlay =
      document.createElement(
        'div'
      );

    overlay.id =
      'ahxOverlay';

    overlay.className =
      'ahx-overlay';

    overlay.innerHTML =
      '<div ' +
        'class="ahx-dialog ' +
          (
            dark
              ? 'dark'
              : ''
          ) +
        '" ' +
        'role="dialog" ' +
        'aria-modal="true"' +
      '>' +

        '<div class="ahx-dialog-head">' +

          '<strong>' +
            escapeHtml(title) +
          '</strong>' +

          '<button ' +
            'id="ahxOverlayClose" ' +
            'type="button" ' +
            'aria-label="ปิด"' +
          '>' +
            '×' +
          '</button>' +

        '</div>' +

        '<div class="ahx-dialog-body"></div>' +

      '</div>';

    document.body
      .appendChild(
        overlay
      );

    getElement(
      'ahxOverlayClose'
    ).addEventListener(
      'click',
      closeOverlay
    );

    overlay.addEventListener(
      'click',
      function (event) {
        if (
          event.target ===
          overlay
        ) {
          closeOverlay();
        }
      }
    );

    return overlay;
  }


  function closeOverlay() {
    const overlay =
      getElement(
        'ahxOverlay'
      );

    if (overlay) {
      overlay.remove();
    }
  }


  /************************************************************
   * Full Image
   ************************************************************/

  async function openProtectedImage(
    recordId,
    roundId
  ) {
    if (
      !recordId ||
      !roundId
    ) {
      return;
    }

    const overlay =
      createOverlay(
        'ภาพหลักฐานที่เบลอแล้ว',
        true
      );

    const body =
      overlay.querySelector(
        '.ahx-dialog-body'
      );

    body.innerHTML =
      loadingHtml(
        'กำลังโหลดภาพ...'
      );

    try {
      const result =
        await API
          .historyImage({
            token:
              state.token,

            deviceId:
              getDeviceId(),

            recordId:
              recordId,

            roundId:
              roundId
          });

      if (!overlay.isConnected) {
        return;
      }

      if (
        !result.available ||
        !result.dataUrl
      ) {
        body.innerHTML =
          emptyHtml(
            result.imageStatusText ||
            'ภาพนี้ไม่พร้อมแสดง'
          );

        return;
      }

      body.innerHTML =
        '';

      const image =
        document.createElement(
          'img'
        );

      image.alt =
        'ภาพหลักฐานที่เบลอแล้ว';

      image.src =
        result.dataUrl;

      const caption =
        document.createElement(
          'div'
        );

      caption.className =
        'ahx-image-caption';

      caption.textContent =
        recordId +
        ' / ' +
        roundId;

      body.appendChild(
        image
      );

      body.appendChild(
        caption
      );

    } catch (error) {
      if (
        handleAuthFailure(
          error
        )
      ) {
        return;
      }

      body.innerHTML =
        errorHtml(
          cleanText(
            error &&
            error.message
          ) ||
          'ไม่สามารถโหลดภาพได้'
        );
    }
  }


  /************************************************************
   * Authentication Failure / Logout
   ************************************************************/

  function handleAuthFailure(error) {
    if (
      !isAuthError(error)
    ) {
      return false;
    }

    clearSession();
    disconnectThumbnailObserver();
    closeOverlay();

    getSwal().close();

    window.setTimeout(
      function () {
        state.opening =
          false;

        openHistory();
      },
      180
    );

    return true;
  }


  async function logoutHistory() {
    const Swal =
      getSwal();

    try {
      if (state.token) {
        await API
          .historyLogout({
            token:
              state.token,

            deviceId:
              getDeviceId()
          });
      }

    } catch (error) {
      console.warn(
        'Logout API error:',
        error
      );
    }

    clearSession();
    disconnectThumbnailObserver();
    closeOverlay();

    Swal.close();

    await Swal.fire({
      icon:
        'success',

      title:
        'ออกจากระบบแล้ว',

      timer:
        850,

      showConfirmButton:
        false
    });
  }


  /************************************************************
   * UI State
   ************************************************************/

  function loadingHtml(message) {
    return (
      '<div class="ahx-state">' +

        '<span ' +
          'class="ahx-spinner" ' +
          'aria-hidden="true"' +
        '></span>' +

        '<span>' +
          escapeHtml(message) +
        '</span>' +

      '</div>'
    );
  }


  function errorHtml(message) {
    return (
      '<div class="ahx-state error">' +

        '<strong>' +
          'เกิดข้อผิดพลาด' +
        '</strong>' +

        '<span>' +
          escapeHtml(message) +
        '</span>' +

      '</div>'
    );
  }


  function emptyHtml(message) {
    return (
      '<div class="ahx-state">' +

        '<span>' +
          escapeHtml(message) +
        '</span>' +

      '</div>'
    );
  }


  async function showGeneralError(error) {
    const message =
      cleanText(
        error &&
        error.message
      ) ||
      'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';

    if (hasSweetAlert()) {
      await getSwal()
        .fire({
          icon:
            'error',

          title:
            'เปิดประวัติไม่สำเร็จ',

          text:
            message,

          confirmButtonText:
            'ตกลง'
        });

      return;
    }

    window.alert(
      message
    );
  }


  /************************************************************
   * Open / Initialize
   ************************************************************/

  async function openHistory() {
    if (state.opening) {
      return;
    }

    if (!API) {
      window.alert(
        'ไม่พบ AlcoholAPI กรุณาตรวจสอบลำดับการโหลดไฟล์'
      );

      return;
    }

    if (!hasSweetAlert()) {
      window.alert(
        'ไม่พบ SweetAlert2 กรุณาตรวจสอบ index.html'
      );

      return;
    }

    state.opening =
      true;

    setButtonBusy(
      true
    );

    pauseCamera();

    try {
      const authenticated =
        await ensureAuthenticated();

      if (authenticated) {
        await showMainModal();
      }

    } catch (error) {
      await showGeneralError(
        error
      );

    } finally {
      state.opening =
        false;

      setButtonBusy(
        false
      );

      disconnectThumbnailObserver();
      closeOverlay();
      resumeCamera();
    }
  }


  function initialize() {
    if (state.initialized) {
      return;
    }

    state.initialized =
      true;

    injectStyles();
    loadSession();

    const button =
      ensureHistoryButton();

    button.addEventListener(
      'click',
      openHistory
    );
  }


  if (
    document.readyState ===
    'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      initialize,
      {
        once:
          true
      }
    );

  } else {
    initialize();
  }


  window.AlcoholHistory =
    Object.freeze({
      open:
        openHistory,

      logout:
        logoutHistory,

      clearSession:
        clearSession
    });

})(window, document);

