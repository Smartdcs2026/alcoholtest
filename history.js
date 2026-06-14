/************************************************************
 * history.js
 * ระบบ Login + ปฏิทิน + ประวัติรายวัน + ดูภาพ
 * เวอร์ชันปรับ UI ใหม่แบบ self-contained
 *
 * จุดสำคัญ:
 * - Inject CSS จากไฟล์นี้โดยตรง ป้องกัน CSS ไม่ถูกโหลด
 * - ใช้ SweetAlert2 เป็นกรอบ Modal
 * - แยกชื่อ Class ด้วย ahx- ป้องกันชนกับ CSS ระบบหลัก
 * - รองรับมือถือและคอมพิวเตอร์
 ************************************************************/

(function (window, document) {
  'use strict';

  const API = window.AlcoholAPI;
  const CONFIG = window.APP_CONFIG || {};

  const SESSION_KEY =
    'alcohol_history_session_v2';

  const LAST_MONTH_KEY =
    'alcohol_history_last_month_v2';

  const STYLE_ID =
    'alcoholHistoryV2Styles';

  const PAGE_SIZE = 20;

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
    initialized: false,
    opening: false,

    token: '',
    name: '',
    expiresAtIso: '',

    currentMonth: '',
    currentDate: '',
    currentPage: 1,

    monthData: null,
    imageDataUrl: '',

    cameraWasReady: false
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
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }


  function escapeAttribute(value) {
    return escapeHtml(value)
      .replace(/`/g, '&#096;');
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


  function getElement(id) {
    return document
      .getElementById(id);
  }


  /************************************************************
   * Date / Month
   ************************************************************/

  function currentBangkokMonth() {
    const formatter =
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
      );

    const parts = {};

    formatter
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


  function parseMonthKey(
    monthKey
  ) {
    const match =
      /^(\d{4})-(\d{2})$/
        .exec(
          cleanText(
            monthKey
          )
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
      parseMonthKey(
        monthKey
      ) ||
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


  function monthTitle(
    monthKey
  ) {
    const parsed =
      parseMonthKey(
        monthKey
      );

    if (!parsed) {
      return monthKey;
    }

    return (
      THAI_MONTHS[
        parsed.month - 1
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

      if (
        state.expiresAtIso
      ) {
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
    state.token = '';
    state.name = '';
    state.expiresAtIso = '';

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
   * CSS Injection
   ************************************************************/

  function injectStyles() {
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
        --ahx-primary-2: #176589;
        --ahx-bg: #eef3f6;
        --ahx-surface: #ffffff;
        --ahx-text: #18313e;
        --ahx-muted: #6c7f89;
        --ahx-border: #d4e0e6;
        --ahx-success: #138455;
        --ahx-danger: #d62e2e;
        --ahx-warning: #d99500;
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
          rgba(
            255,
            255,
            255,
            .34
          ) !important;

        border-radius:
          999px !important;

        color:
          #ffffff !important;

        background:
          rgba(
            255,
            255,
            255,
            .13
          ) !important;

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
          rgba(
            255,
            255,
            255,
            .25
          ) !important;
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
          var(--ahx-border) !important;

        border-radius:
          18px !important;

        background:
          var(--ahx-bg) !important;

        box-shadow:
          var(--ahx-shadow) !important;
      }


      .ahx-login-popup {
        width:
          min(
            92vw,
            430px
          ) !important;
      }


      .ahx-main-popup {
        width:
          min(
            94vw,
            920px
          ) !important;

        max-height:
          94dvh !important;
      }


      .ahx-login-html,
      .ahx-main-html {
        margin:
          0 !important;

        padding:
          0 !important;

        color:
          var(--ahx-text) !important;

        text-align:
          left !important;
      }


      .ahx-main-html {
        max-height:
          94dvh !important;

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
          0 22px 22px !important;
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
          8px 14px !important;

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
            var(--ahx-primary-2),
            var(--ahx-primary)
          ) !important;
      }


      .ahx-cancel-button {
        color:
          #425965 !important;

        background:
          #e6ecef !important;
      }


      .ahx-validation-message {
        margin:
          0 22px 12px !important;

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
          22px;
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
            var(--ahx-primary-2),
            var(--ahx-primary)
          );

        font-size:
          22px;

        box-shadow:
          0 10px 25px
          rgba(
            15,
            83,
            116,
            .22
          );
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

        line-height:
          1.4;
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
          rgba(
            76,
            158,
            195,
            .14
          );
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
          15;

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
          rgba(
            5,
            35,
            52,
            .22
          );
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
          rgba(
            255,
            255,
            255,
            .32
          );

        border-radius:
          10px;

        background:
          rgba(
            255,
            255,
            255,
            .10
          );

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
          rgba(
            255,
            255,
            255,
            .72
          );

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
      .ahx-text-button {
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
          rgba(
            255,
            255,
            255,
            .28
          );

        border-radius:
          8px;

        color:
          #ffffff;

        background:
          rgba(
            255,
            255,
            255,
            .11
          );

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


      .ahx-text-button {
        padding:
          5px 9px;
      }


      .ahx-text-button.danger {
        color:
          #ffe3e3;

        border-color:
          rgba(
            255,
            174,
            174,
            .42
          );

        background:
          rgba(
            178,
            15,
            15,
            .28
          );
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

        line-height:
          1.25;
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
          56px;

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
          rgba(
            16,
            56,
            80,
            .05
          );
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


      .ahx-calendar-empty {
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

        min-height:
          58px;

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

        box-shadow:
          inset 0 0 0 1px
          rgba(
            65,
            147,
            187,
            .06
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

        line-height:
          1;
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
          var(--ahx-primary-2);

        font-size:
          7px;

        font-weight:
          900;

        line-height:
          1.2;

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


      .ahx-day-dots {
        display:
          flex;

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
          var(--ahx-primary-2);
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
        display:
          flex;

        align-items:
          center;

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
          190px;

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
          var(--ahx-primary-2);

        border-radius:
          50%;

        animation:
          ahx-spin
          .7s
          linear
          infinite;
      }


      @keyframes ahx-spin {
        to {
          transform:
            rotate(360deg);
        }
      }


      .ahx-day-view {
        min-height:
          420px;
      }


      .ahx-back-button {
        flex:
          0 0 auto;

        min-height:
          32px;

        padding:
          5px 9px;

        border:
          1px solid
          rgba(
            255,
            255,
            255,
            .28
          );

        border-radius:
          8px;

        color:
          #ffffff;

        background:
          rgba(
            255,
            255,
            255,
            .11
          );

        font:
          inherit;

        font-size:
          9px;

        font-weight:
          800;
      }


      .ahx-breakdown {
        display:
          grid;

        gap:
          6px;

        padding:
          0 8px 8px;
      }


      .ahx-breakdown-row {
        display:
          grid;

        grid-template-columns:
          85px
          minmax(0, 1fr);

        gap:
          7px;

        align-items:
          start;

        padding:
          7px;

        border:
          1px solid
          var(--ahx-border);

        border-radius:
          9px;

        background:
          #ffffff;
      }


      .ahx-breakdown-row > strong {
        color:
          #49616c;

        font-size:
          8px;

        line-height:
          1.5;
      }


      .ahx-chip-list {
        display:
          flex;

        flex-wrap:
          wrap;

        gap:
          4px;
      }


      .ahx-chip {
        display:
          inline-flex;

        align-items:
          center;

        min-height:
          22px;

        padding:
          3px 7px;

        border:
          1px solid
          #cfe0e7;

        border-radius:
          999px;

        color:
          #385865;

        background:
          #eff7fa;

        font-size:
          7px;

        font-weight:
          700;
      }


      .ahx-chip b {
        margin-left:
          3px;

        color:
          var(--ahx-primary);
      }


      .ahx-record-list {
        display:
          grid;

        gap:
          8px;

        padding:
          0 8px 8px;
      }


      .ahx-record {
        overflow:
          hidden;

        border:
          1px solid
          var(--ahx-border);

        border-left:
          4px solid
          var(--ahx-success);

        border-radius:
          11px;

        background:
          #ffffff;

        box-shadow:
          0 3px 12px
          rgba(
            16,
            56,
            80,
            .07
          );
      }


      .ahx-record.deny {
        border-color:
          #efb3b3;

        border-left-color:
          var(--ahx-danger);
      }


      .ahx-record-head {
        display:
          flex;

        align-items:
          center;

        justify-content:
          space-between;

        gap:
          7px;

        padding:
          8px;

        border-bottom:
          1px solid
          #e2e9ec;

        background:
          #f8fafb;
      }


      .ahx-record.deny
      .ahx-record-head {
        background:
          #fff2f2;
      }


      .ahx-record-person {
        display:
          flex;

        align-items:
          center;

        gap:
          7px;

        min-width:
          0;
      }


      .ahx-record-time {
        flex:
          0 0 auto;

        color:
          #607783;

        font-size:
          8px;

        font-weight:
          800;
      }


      .ahx-record-name {
        overflow:
          hidden;

        color:
          #1f3945;

        font-size:
          11px;

        font-weight:
          900;

        text-overflow:
          ellipsis;

        white-space:
          nowrap;
      }


      .ahx-status-badge {
        flex:
          0 0 auto;

        max-width:
          44%;

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


      .ahx-record-meta {
        display:
          grid;

        grid-template-columns:
          repeat(
            4,
            minmax(0, 1fr)
          );

        gap:
          5px;

        padding:
          7px 8px 2px;
      }


      .ahx-meta-item {
        min-width:
          0;

        padding:
          5px 6px;

        border-radius:
          7px;

        background:
          #f4f8fa;
      }


      .ahx-meta-item small {
        display:
          block;

        color:
          #71838c;

        font-size:
          6px;
      }


      .ahx-meta-item strong {
        display:
          block;

        margin-top:
          1px;

        overflow:
          hidden;

        color:
          #2d4a57;

        font-size:
          8px;

        text-overflow:
          ellipsis;

        white-space:
          nowrap;
      }


      .ahx-value-grid {
        display:
          grid;

        grid-template-columns:
          repeat(
            4,
            minmax(0, 1fr)
          );

        gap:
          4px;

        padding:
          5px 8px 7px;
      }


      .ahx-value-card {
        min-width:
          0;

        padding:
          5px 3px;

        border:
          1px solid
          #dce5e9;

        border-radius:
          7px;

        color:
          #6b7e87;

        background:
          #fafcfd;

        font-size:
          6px;

        text-align:
          center;
      }


      .ahx-value-card b {
        display:
          block;

        margin-top:
          2px;

        overflow:
          hidden;

        color:
          var(--ahx-primary);

        font-size:
          10px;

        font-weight:
          900;

        text-overflow:
          ellipsis;

        white-space:
          nowrap;
      }


      .ahx-image-status {
        display:
          flex;

        align-items:
          center;

        justify-content:
          space-between;

        gap:
          7px;

        margin:
          0 8px 7px;

        padding:
          6px 7px;

        border:
          1px solid
          #d8e2e7;

        border-radius:
          8px;

        color:
          #506975;

        background:
          #f7fafb;

        font-size:
          7px;
      }


      .ahx-image-status strong {
        font-size:
          7px;
      }


      .ahx-image-status small {
        color:
          #7c8c94;

        font-size:
          6px;

        text-align:
          right;
      }


      .ahx-round-list {
        display:
          grid;

        gap:
          5px;

        padding:
          0 8px 8px;
      }


      .ahx-round {
        display:
          grid;

        grid-template-columns:
          minmax(110px, .85fr)
          minmax(120px, 1.15fr)
          auto;

        align-items:
          center;

        gap:
          6px;

        min-width:
          0;

        padding:
          6px;

        border:
          1px solid
          #dce5e9;

        border-radius:
          8px;
      }


      .ahx-round-main,
      .ahx-round-photo {
        min-width:
          0;
      }


      .ahx-round-main strong,
      .ahx-round-photo strong {
        display:
          block;

        overflow:
          hidden;

        color:
          #3b5662;

        font-size:
          7px;

        text-overflow:
          ellipsis;

        white-space:
          nowrap;
      }


      .ahx-round-main b {
        display:
          block;

        margin-top:
          1px;

        color:
          var(--ahx-primary);

        font-size:
          10px;
      }


      .ahx-round-main small,
      .ahx-round-photo small {
        display:
          block;

        overflow:
          hidden;

        margin-top:
          1px;

        color:
          #7b8c94;

        font-size:
          6px;

        text-overflow:
          ellipsis;

        white-space:
          nowrap;
      }


      .ahx-view-image {
        min-height:
          30px;

        padding:
          4px 8px;

        border:
          0;

        border-radius:
          7px;

        color:
          #ffffff;

        background:
          var(--ahx-primary-2);

        font:
          inherit;

        font-size:
          7px;

        font-weight:
          900;

        white-space:
          nowrap;
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
        padding:
          4px 8px;

        overflow:
          hidden;

        border-top:
          1px dashed
          #dce5e9;

        color:
          #8d999f;

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


      .ahx-image-overlay {
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
          rgba(
            2,
            12,
            18,
            .92
          );
      }


      .ahx-image-dialog {
        display:
          grid;

        grid-template-rows:
          auto
          minmax(0, 1fr);

        width:
          min(
            96vw,
            820px
          );

        max-height:
          94dvh;

        overflow:
          hidden;

        border:
          1px solid
          rgba(
            255,
            255,
            255,
            .18
          );

        border-radius:
          14px;

        background:
          #07131a;

        box-shadow:
          0 24px 80px
          rgba(
            0,
            0,
            0,
            .52
          );
      }


      .ahx-image-head {
        display:
          flex;

        align-items:
          center;

        justify-content:
          space-between;

        gap:
          8px;

        min-height:
          46px;

        padding:
          8px 10px;

        color:
          #ffffff;

        background:
          #0d354c;
      }


      .ahx-image-head strong {
        font-size:
          11px;
      }


      .ahx-image-head button {
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
          rgba(
            255,
            255,
            255,
            .24
          );

        border-radius:
          50%;

        color:
          #ffffff;

        background:
          rgba(
            255,
            255,
            255,
            .10
          );

        font:
          inherit;

        font-size:
          20px;
      }


      .ahx-image-body {
        display:
          flex;

        flex-direction:
          column;

        align-items:
          center;

        justify-content:
          center;

        min-height:
          230px;

        overflow:
          auto;

        padding:
          9px;

        color:
          #d9e7ed;
      }


      .ahx-image-body img {
        display:
          block;

        max-width:
          100%;

        max-height:
          calc(
            94dvh -
            90px
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
          rgba(
            255,
            255,
            255,
            .65
          );

        font-size:
          7px;

        text-align:
          center;
      }


      @media (
        max-width: 700px
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


        .ahx-summary-card {
          min-height:
            52px;
        }


        .ahx-calendar-wrap {
          margin-right:
            6px;

          margin-left:
            6px;
        }


        .ahx-calendar-grid {
          gap:
            3px;

          padding:
            4px;
        }


        .ahx-calendar-day,
        .ahx-calendar-empty {
          min-height:
            52px;
        }


        .ahx-calendar-day {
          padding:
            5px 4px;

          border-radius:
            7px;
        }


        .ahx-day-number {
          font-size:
            11px;
        }


        .ahx-day-badge {
          top:
            4px;

          right:
            4px;

          padding:
            1px 4px;

          font-size:
            6px;
        }


        .ahx-day-footer small {
          display:
            none;
        }


        .ahx-record-meta {
          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );
        }


        .ahx-round {
          grid-template-columns:
            minmax(85px, .85fr)
            minmax(100px, 1.15fr)
            auto;
        }


        .ahx-image-dialog {
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


        .ahx-summary-card strong {
          font-size:
            12px;
        }


        .ahx-calendar-day,
        .ahx-calendar-empty {
          min-height:
            48px;
        }


        .ahx-breakdown-row {
          grid-template-columns:
            66px
            minmax(0, 1fr);
        }


        .ahx-value-grid {
          gap:
            3px;

          padding-right:
            6px;

          padding-left:
            6px;
        }


        .ahx-round-list {
          padding-right:
            6px;

          padding-left:
            6px;
        }


        .ahx-round {
          grid-template-columns:
            minmax(70px, .8fr)
            minmax(78px, 1.2fr)
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
   * Camera Pause / Resume
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

      button.type =
        'button';

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
              '<span aria-hidden="true">' +
                'ℹ️' +
              '</span>' +

              '<span>' +
                'ระบบจะเก็บ Session เฉพาะแท็บนี้ ' +
                'และออกจากระบบอัตโนมัติเมื่อ Session หมดอายุ' +
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

        allowOutsideClick:
          function () {
            return !Swal.isLoading();
          },

        buttonsStyling:
          false,

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
            const nameInput =
              getElement(
                'ahxLoginName'
              );

            const passInput =
              getElement(
                'ahxLoginPass'
              );

            const name =
              cleanText(
                nameInput &&
                nameInput.value
              );

            const pas =
              cleanText(
                passInput &&
                passInput.value
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
        function () {
          renderCalendarView();
        },

      willClose:
        function () {
          releaseImageData();
        }
    });
  }


  function mainHeaderHtml(
    title,
    subtitle,
    showBack
  ) {
    return (
      '<header class="ahx-topbar">' +

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
                '<div ' +
                  'class="ahx-topbar-logo" ' +
                  'aria-hidden="true"' +
                '>' +
                  '📊' +
                '</div>'
              )
          ) +

          '<div class="ahx-topbar-title">' +

            '<div>' +
              '<h2>' +
                escapeHtml(title) +
              '</h2>' +

              '<p>' +
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


      '<section class="ahx-month-panel">' +

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
          'id="ahxNextMonth" ' +
          'type="button" ' +
          'aria-label="เดือนถัดไป"' +
        '>' +
          '›' +
        '</button>' +

      '</section>' +


      '<section ' +
        'id="ahxMonthSummary" ' +
        'class="ahx-summary-grid"' +
      '></section>' +


      '<section class="ahx-calendar-wrap">' +

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

      '</section>' +


      '<div class="ahx-legend">' +

        '<span>' +
          '<i class="ahx-dot-data"></i>' +
          'มีข้อมูล' +
        '</span>' +

        '<span>' +
          '<i class="ahx-dot-deny"></i>' +
          'มีผลห้ามเข้า' +
        '</span>' +

        '<span>' +
          '<i class="ahx-dot-deleted"></i>' +
          'ภาพถูกลบทั้งหมด' +
        '</span>' +

        '<span>' +
          '<i class="ahx-dot-issue"></i>' +
          'ภาพมีปัญหา' +
        '</span>' +

      '</div>';

    bindCommonHeaderEvents();

    const previousButton =
      getElement(
        'ahxPreviousMonth'
      );

    const nextButton =
      getElement(
        'ahxNextMonth'
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


  async function loadMonth(
    monthKey
  ) {
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

    if (!summary || !grid) {
      return;
    }

    if (generated) {
      generated.textContent =
        data.generatedAt
          ? (
            'อัปเดต ' +
            data.generatedAt
          )
          : '';
    }

    summary.innerHTML =
      monthSummaryHtml(
        data.totals || {}
      );

    grid.innerHTML =
      calendarGridHtml(
        data.month,
        data.days || {}
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
              const selectedDate =
                cleanText(
                  button.dataset
                    .ahxDate
                );

              if (!selectedDate) {
                return;
              }

              state.currentDate =
                selectedDate;

              state.currentPage =
                1;

              renderDayView(
                selectedDate
              );
            }
          );
        }
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
      summaryCardHtml(
        'วันที่มีข้อมูล',
        totals.daysWithData || 0
      ) +

      summaryCardHtml(
        'รายการ',
        totals.totalRecords || 0
      ) +

      summaryCardHtml(
        'จำนวนรอบ',
        totals.totalRounds || 0
      ) +

      summaryCardHtml(
        'อนุญาต',
        totals.allowCount || 0,
        'success'
      ) +

      summaryCardHtml(
        'ห้ามเข้า',
        totals.denyCount || 0,
        'danger'
      ) +

      summaryCardHtml(
        'ค่าสูงสุด',
        formatMg(
          totals.maxValue
        ) +
        ' Mg%'
      ) +

      summaryCardHtml(
        'ภาพพร้อมดู',
        totals.imagesAvailable || 0
      ) +

      summaryCardHtml(
        'ภาพถูกลบ',
        totals.imagesDeleted || 0
      ) +

      summaryCardHtml(
        'ภาพมีปัญหา',
        totals.imageIssues || 0,
        'warning'
      )
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

    let html = '';

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
    if (!item) {
      return (
        '<button ' +
          'type="button" ' +
          'class="ahx-calendar-day" ' +
          'disabled' +
        '>' +

          '<span class="ahx-day-number">' +
            day +
          '</span>' +

        '</button>'
      );
    }

    const classes = [
      'ahx-calendar-day',
      'has-data'
    ];

    if (item.hasDeny) {
      classes.push(
        'has-deny'
      );
    }

    if (
      item.allImagesDeleted
    ) {
      classes.push(
        'images-deleted'
      );
    }

    if (
      item.hasImageIssue
    ) {
      classes.push(
        'image-issue'
      );
    }

    return (
      '<button ' +
        'type="button" ' +
        'class="' +
          classes.join(' ') +
        '" ' +
        'data-ahx-date="' +
          escapeAttribute(key) +
        '" ' +
        'title="' +
          escapeAttribute(
            displayDateKey(key) +
            ' | ' +
            item.totalRecords +
            ' รายการ' +
            ' | ห้ามเข้า ' +
            item.denyCount
          ) +
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

        '<div class="ahx-day-footer">' +

          '<small>' +
            finiteNumber(
              item.totalRounds,
              0
            ) +
            ' รอบ' +
          '</small>' +

          '<span class="ahx-day-dots">' +

            '<i class="ahx-dot-data"></i>' +

            (
              item.hasDeny
                ? '<i class="ahx-dot-deny"></i>'
                : ''
            ) +

            (
              item.allImagesDeleted
                ? '<i class="ahx-dot-deleted"></i>'
                : ''
            ) +

            (
              item.hasImageIssue
                ? '<i class="ahx-dot-issue"></i>'
                : ''
            ) +

          '</span>' +

        '</div>' +

      '</button>'
    );
  }


  /************************************************************
   * Daily View
   ************************************************************/

  function renderDayView(
    selectedDate
  ) {
    const root =
      getElement(
        'ahxRoot'
      );

    if (!root) {
      return;
    }

    root.innerHTML =
      '<div class="ahx-day-view">' +

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
          'class="ahx-summary-grid"' +
        '></section>' +

        '<section ' +
          'id="ahxDayBreakdown" ' +
          'class="ahx-breakdown"' +
        '></section>' +

        '<section ' +
          'id="ahxRecordList" ' +
          'class="ahx-record-list"' +
        '>' +
          loadingHtml(
            'กำลังโหลดข้อมูลรายวัน...'
          ) +
        '</section>' +

        '<section ' +
          'id="ahxPagination" ' +
          'class="ahx-pagination"' +
        '></section>' +

      '</div>';

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

    loadDay(
      selectedDate,
      state.currentPage
    );
  }


  async function loadDay(
    selectedDate,
    page
  ) {
    const records =
      getElement(
        'ahxRecordList'
      );

    if (!records) {
      return;
    }

    records.innerHTML =
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
              PAGE_SIZE
          });

      state.currentPage =
        result.pagination &&
        result.pagination.page
          ? result.pagination.page
          : page;

      renderDayData(
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

      records.innerHTML =
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

    const breakdown =
      getElement(
        'ahxDayBreakdown'
      );

    const records =
      getElement(
        'ahxRecordList'
      );

    const pagination =
      getElement(
        'ahxPagination'
      );

    const day =
      data.summary || {};

    if (summary) {
      summary.innerHTML =
        summaryCardHtml(
          'รายการ',
          day.totalRecords || 0
        ) +

        summaryCardHtml(
          'จำนวนรอบ',
          day.totalRounds || 0
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
          ' Mg%'
        ) +

        summaryCardHtml(
          'ภาพพร้อมดู',
          day.imagesAvailable || 0
        ) +

        summaryCardHtml(
          'ภาพถูกลบ',
          day.imagesDeleted || 0
        ) +

        summaryCardHtml(
          'ภาพมีปัญหา',
          day.imageIssues || 0,
          'warning'
        );
    }

    if (breakdown) {
      breakdown.innerHTML =
        breakdownHtml(day);
    }

    if (records) {
      const list =
        Array.isArray(
          data.records
        )
          ? data.records
          : [];

      records.innerHTML =
        list.length
          ? list
            .map(
              recordHtml
            )
            .join('')
          : emptyHtml(
            'ไม่พบข้อมูลในวันที่เลือก'
          );

      bindImageButtons();
    }

    if (pagination) {
      pagination.innerHTML =
        paginationHtml(
          data.pagination || {}
        );

      bindPaginationEvents();
    }
  }


  function breakdownHtml(summary) {
    return (
      objectChipsHtml(
        'จุดตรวจ',
        summary.byCheckpoint
      ) +

      objectChipsHtml(
        'ประเภทบุคคล',
        summary.byPersonType
      ) +

      (
        summary.firstTime ||
        summary.lastTime
          ? (
            '<div class="ahx-breakdown-row">' +
              '<strong>' +
                'ช่วงเวลาตรวจ' +
              '</strong>' +

              '<div class="ahx-chip-list">' +
                '<span class="ahx-chip">' +
                  escapeHtml(
                    summary.firstTime ||
                    '--:--:--'
                  ) +
                  ' - ' +
                  escapeHtml(
                    summary.lastTime ||
                    '--:--:--'
                  ) +
                '</span>' +
              '</div>' +
            '</div>'
          )
          : ''
      )
    );
  }


  function objectChipsHtml(
    title,
    source
  ) {
    const entries =
      source &&
      typeof source ===
      'object'
        ? Object.entries(source)
        : [];

    if (!entries.length) {
      return '';
    }

    return (
      '<div class="ahx-breakdown-row">' +

        '<strong>' +
          escapeHtml(title) +
        '</strong>' +

        '<div class="ahx-chip-list">' +

          entries
            .map(
              function (entry) {
                return (
                  '<span class="ahx-chip">' +
                    escapeHtml(
                      entry[0]
                    ) +
                    ' <b>' +
                    escapeHtml(
                      entry[1]
                    ) +
                    '</b>' +
                  '</span>'
                );
              }
            )
            .join('') +

        '</div>' +

      '</div>'
    );
  }


  function metaItemHtml(
    label,
    value
  ) {
    return (
      '<div class="ahx-meta-item">' +

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


  function valueCardHtml(
    label,
    value
  ) {
    return (
      '<div class="ahx-value-card">' +

        escapeHtml(label) +

        '<b>' +
          escapeHtml(value) +
        '</b>' +

      '</div>'
    );
  }


  function recordHtml(record) {
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

    return (
      '<article class="ahx-record ' +
        (
          deny
            ? 'deny'
            : 'allow'
        ) +
      '">' +

        '<div class="ahx-record-head">' +

          '<div class="ahx-record-person">' +

            '<span class="ahx-record-time">' +
              escapeHtml(
                record.time ||
                '--:--:--'
              ) +
            '</span>' +

            '<strong class="ahx-record-name">' +
              escapeHtml(
                record.personName ||
                'ไม่ระบุชื่อ'
              ) +
            '</strong>' +

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


        '<div class="ahx-record-meta">' +

          metaItemHtml(
            'ประเภทบุคคล',
            record.personType
          ) +

          metaItemHtml(
            record.organizationType ||
            'บริษัท/สายรถ',

            record.organizationValue
          ) +

          metaItemHtml(
            'จุดตรวจ',
            record.checkpoint
          ) +

          metaItemHtml(
            'ผู้ตรวจวัด',
            record.inspector
          ) +

        '</div>' +


        '<div class="ahx-value-grid">' +

          valueCardHtml(
            'จำนวนรอบ',
            String(
              record.roundCount ||
              0
            )
          ) +

          valueCardHtml(
            'ครั้งแรก',
            formatMg(
              record.firstValueMg
            )
          ) +

          valueCardHtml(
            'ล่าสุด',
            formatMg(
              record.lastValueMg
            )
          ) +

          valueCardHtml(
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
                    return roundHtml(
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

      '</article>'
    );
  }


  function roundHtml(
    recordId,
    round
  ) {
    const detailDate =
      cleanText(
        round.measuredAt
      );

    const deletedOrExpire =
      round.imageDeletedAt
        ? (
          'ลบเมื่อ ' +
          round.imageDeletedAt
        )
        : (
          round.imageExpireAt
            ? (
              'กำหนดลบ ' +
              round.imageExpireAt
            )
            : ''
        );

    return (
      '<div class="ahx-round">' +

        '<div class="ahx-round-main">' +

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
              detailDate
            ) +
          '</small>' +

        '</div>' +


        '<div class="ahx-round-photo">' +

          '<strong>' +
            escapeHtml(
              round.imageStatusText ||
              'ไม่ทราบสถานะภาพ'
            ) +
          '</strong>' +

          '<small>' +
            escapeHtml(
              deletedOrExpire
            ) +
          '</small>' +

        '</div>' +


        (
          round.canViewImage ===
          true
            ? (
              '<button ' +
                'type="button" ' +
                'class="ahx-view-image" ' +
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


  function bindImageButtons() {
    document
      .querySelectorAll(
        '.ahx-view-image'
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
  }


  function paginationHtml(
    pagination
  ) {
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
    const previousButton =
      getElement(
        'ahxPreviousPage'
      );

    const nextButton =
      getElement(
        'ahxNextPage'
      );

    if (previousButton) {
      previousButton.addEventListener(
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

    if (nextButton) {
      nextButton.addEventListener(
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
   * Protected Image
   ************************************************************/

  async function openProtectedImage(
    recordId,
    roundId
  ) {
    closeImageOverlay();

    const overlay =
      document.createElement(
        'div'
      );

    overlay.id =
      'ahxImageOverlay';

    overlay.className =
      'ahx-image-overlay';

    overlay.innerHTML =
      '<div ' +
        'class="ahx-image-dialog" ' +
        'role="dialog" ' +
        'aria-modal="true"' +
      '>' +

        '<div class="ahx-image-head">' +

          '<strong>' +
            'ภาพหลักฐานที่เบลอแล้ว' +
          '</strong>' +

          '<button ' +
            'id="ahxImageClose" ' +
            'type="button" ' +
            'aria-label="ปิดภาพ"' +
          '>' +
            '×' +
          '</button>' +

        '</div>' +

        '<div ' +
          'id="ahxImageBody" ' +
          'class="ahx-image-body"' +
        '>' +

          loadingHtml(
            'กำลังโหลดภาพ...'
          ) +

        '</div>' +

      '</div>';

    document.body
      .appendChild(
        overlay
      );

    const closeButton =
      getElement(
        'ahxImageClose'
      );

    const body =
      getElement(
        'ahxImageBody'
      );

    if (closeButton) {
      closeButton.addEventListener(
        'click',
        closeImageOverlay
      );
    }

    overlay.addEventListener(
      'click',
      function (event) {
        if (
          event.target ===
          overlay
        ) {
          closeImageOverlay();
        }
      }
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

      if (!body) {
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
          ) +

          (
            result.imageDeletedAt
              ? (
                '<div class="ahx-image-caption">' +
                  'วันที่ดำเนินการ: ' +
                  escapeHtml(
                    result.imageDeletedAt
                  ) +
                '</div>'
              )
              : ''
          );

        return;
      }

      state.imageDataUrl =
        result.dataUrl;

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

      if (body) {
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
  }


  function closeImageOverlay() {
    const overlay =
      getElement(
        'ahxImageOverlay'
      );

    if (overlay) {
      overlay.remove();
    }

    releaseImageData();
  }


  function releaseImageData() {
    const image =
      document.querySelector(
        '#ahxImageOverlay img'
      );

    if (image) {
      image.removeAttribute(
        'src'
      );
    }

    state.imageDataUrl =
      '';
  }


  /************************************************************
   * Auth Failure / Logout
   ************************************************************/

  function handleAuthFailure(error) {
    if (!isAuthError(error)) {
      return false;
    }

    clearSession();
    closeImageOverlay();

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
    closeImageOverlay();

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
   * State Messages
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


  async function showGeneralError(
    error
  ) {
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

      closeImageOverlay();

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
