/************************************************************
 * history.js
 * Login + ปฏิทิน + ประวัติรายวัน + ดูภาพแบบมีสิทธิ์
 *
 * ต้องโหลดหลัง:
 * - SweetAlert2
 * - config.js
 * - api.js
 ************************************************************/

(function (window, document) {
  'use strict';

  const API =
    window.AlcoholAPI;

  const CONFIG =
    window.APP_CONFIG || {};

  const SESSION_KEY =
    'alcohol_history_session_v1';

  const LAST_MONTH_KEY =
    'alcohol_history_last_month_v1';

  const PAGE_SIZE =
    20;

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

    imageDataUrl:
      ''
  };


  /************************************************************
   * Basic Helpers
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
    const parsed =
      Number(value);

    return Number.isFinite(parsed)
      ? parsed
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
      return value;
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
   * Session Storage
   ************************************************************/

  function saveSession(data) {
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
        'บันทึก Session ไม่สำเร็จ',
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


  function saveLastMonth(value) {
    try {
      window.sessionStorage
        .setItem(
          LAST_MONTH_KEY,
          value
        );

    } catch (error) {
      console.warn(error);
    }
  }


  /************************************************************
   * History Button
   ************************************************************/

  function ensureHistoryButton() {
    let button =
      document.getElementById(
        'historyAccessButton'
      );

    if (button) {
      return button;
    }

    button =
      document.createElement(
        'button'
      );

    button.id =
      'historyAccessButton';

    button.type =
      'button';

    button.className =
      'history-access-button';

    button.setAttribute(
      'aria-label',
      'เข้าสู่ระบบเพื่อดูประวัติการตรวจวัด'
    );

    button.innerHTML =
      '<span aria-hidden="true">🔒</span>' +
      '<span>ประวัติ</span>';

    const target =
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

    return button;
  }


  function setButtonBusy(busy) {
    const button =
      document.getElementById(
        'historyAccessButton'
      );

    if (!button) {
      return;
    }

    button.disabled =
      Boolean(busy);

    button.classList.toggle(
      'is-loading',
      Boolean(busy)
    );
  }


  /************************************************************
   * Open History
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
        'ไม่พบ SweetAlert2 กรุณาเพิ่ม SweetAlert2 ใน index.html'
      );

      return;
    }

    state.opening =
      true;

    setButtonBusy(true);

    try {
      const authenticated =
        await ensureAuthenticated();

      if (authenticated) {
        await showCalendar();
      }

    } catch (error) {
      await showGeneralError(
        error
      );

    } finally {
      state.opening =
        false;

      setButtonBusy(false);
    }
  }


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


  /************************************************************
   * Login
   ************************************************************/

  async function showLogin() {
    const Swal =
      getSwal();

    const result =
      await Swal.fire({
        title:
          'เข้าสู่ระบบดูประวัติ',

        html:
          '<div class="history-login-form">' +

            '<label for="historyLoginName">' +
              'ชื่อผู้ใช้งาน' +
            '</label>' +

            '<input ' +
              'id="historyLoginName" ' +
              'class="swal2-input history-login-input" ' +
              'type="text" ' +
              'maxlength="200" ' +
              'autocomplete="username" ' +
              'placeholder="กรอกชื่อในชีท Pass"' +
            '>' +

            '<label for="historyLoginPass">' +
              'รหัสผ่าน' +
            '</label>' +

            '<input ' +
              'id="historyLoginPass" ' +
              'class="swal2-input history-login-input" ' +
              'type="password" ' +
              'maxlength="200" ' +
              'autocomplete="current-password" ' +
              'placeholder="กรอกรหัสผ่าน"' +
            '>' +

          '</div>',

        icon:
          'info',

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

        didOpen:
          function () {
            const nameInput =
              document.getElementById(
                'historyLoginName'
              );

            const passInput =
              document.getElementById(
                'historyLoginPass'
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

                      const confirm =
                        Swal
                          .getConfirmButton();

                      if (confirm) {
                        confirm.click();
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
                document
                  .getElementById(
                    'historyLoginName'
                  )
                  .value
              );

            const pas =
              cleanText(
                document
                  .getElementById(
                    'historyLoginPass'
                  )
                  .value
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
                escapeHtml(
                  error &&
                  error.message
                    ? error.message
                    : 'เข้าสู่ระบบไม่สำเร็จ'
                )
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

    await Swal.fire({
      icon:
        'success',

      title:
        'เข้าสู่ระบบสำเร็จ',

      text:
        'ผู้ใช้งาน: ' +
        state.name,

      timer:
        900,

      showConfirmButton:
        false
    });

    return true;
  }


  /************************************************************
   * Calendar
   ************************************************************/

  async function showCalendar() {
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
        calendarShellHtml(),

      width:
        760,

      showConfirmButton:
        false,

      showCloseButton:
        true,

      allowOutsideClick:
        false,

      customClass: {
        popup:
          'history-swal-popup',

        htmlContainer:
          'history-swal-html'
      },

      didOpen:
        function () {
          bindCalendarEvents();

          loadMonth(
            state.currentMonth
          );
        }
    });
  }


  function calendarShellHtml() {
    return (
      '<div class="history-calendar-shell">' +

        '<div class="history-calendar-top">' +

          '<div>' +
            '<strong>' +
              'ประวัติการตรวจวัด' +
            '</strong>' +

            '<small id="historyViewerName">' +
              escapeHtml(
                state.name
              ) +
            '</small>' +
          '</div>' +

          '<button ' +
            'id="historyLogoutButton" ' +
            'type="button" ' +
            'class="history-small-action danger"' +
          '>' +
            'ออกจากระบบ' +
          '</button>' +

        '</div>' +

        '<div class="history-month-nav">' +

          '<button ' +
            'id="historyPreviousMonth" ' +
            'type="button" ' +
            'aria-label="เดือนก่อนหน้า"' +
          '>' +
            '‹' +
          '</button>' +

          '<div>' +
            '<strong id="historyMonthTitle">' +
              '--' +
            '</strong>' +

            '<small id="historyMonthGenerated">' +
              'กำลังโหลด...' +
            '</small>' +
          '</div>' +

          '<button ' +
            'id="historyNextMonth" ' +
            'type="button" ' +
            'aria-label="เดือนถัดไป"' +
          '>' +
            '›' +
          '</button>' +

        '</div>' +

        '<div ' +
          'id="historyMonthSummary" ' +
          'class="history-month-summary"' +
        '></div>' +

        '<div class="history-weekdays">' +
          '<span>จ</span>' +
          '<span>อ</span>' +
          '<span>พ</span>' +
          '<span>พฤ</span>' +
          '<span>ศ</span>' +
          '<span>ส</span>' +
          '<span>อา</span>' +
        '</div>' +

        '<div ' +
          'id="historyCalendarGrid" ' +
          'class="history-calendar-grid"' +
        '>' +
          loadingHtml(
            'กำลังโหลดข้อมูลรายเดือน...'
          ) +
        '</div>' +

        '<div class="history-calendar-legend">' +
          '<span>' +
            '<i class="has-record"></i>' +
            'มีข้อมูล' +
          '</span>' +

          '<span>' +
            '<i class="has-deny"></i>' +
            'มีผลห้ามเข้า' +
          '</span>' +

          '<span>' +
            '<i class="images-deleted"></i>' +
            'ภาพถูกลบทั้งหมด' +
          '</span>' +

          '<span>' +
            '<i class="image-issue"></i>' +
            'ภาพมีปัญหา' +
          '</span>' +
        '</div>' +

      '</div>'
    );
  }


  function bindCalendarEvents() {
    const previous =
      document.getElementById(
        'historyPreviousMonth'
      );

    const next =
      document.getElementById(
        'historyNextMonth'
      );

    const logout =
      document.getElementById(
        'historyLogoutButton'
      );

    if (previous) {
      previous.addEventListener(
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

    if (next) {
      next.addEventListener(
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

    if (logout) {
      logout.addEventListener(
        'click',
        logoutHistory
      );
    }
  }


  async function loadMonth(monthKey) {
    const grid =
      document.getElementById(
        'historyCalendarGrid'
      );

    const title =
      document.getElementById(
        'historyMonthTitle'
      );

    const generated =
      document.getElementById(
        'historyMonthGenerated'
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
        monthTitle(monthKey);
    }

    if (generated) {
      generated.textContent =
        'กำลังโหลด...';
    }

    grid.innerHTML =
      loadingHtml(
        'กำลังโหลดข้อมูลรายเดือน...'
      );

    setMonthNavigationDisabled(
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

      renderMonth(
        result
      );

    } catch (error) {
      if (
        await handleExpiredSession(
          error
        )
      ) {
        return;
      }

      grid.innerHTML =
        errorHtml(
          error &&
          error.message
            ? error.message
            : 'โหลดข้อมูลรายเดือนไม่สำเร็จ'
        );

      if (generated) {
        generated.textContent =
          'โหลดข้อมูลไม่สำเร็จ';
      }

    } finally {
      setMonthNavigationDisabled(
        false
      );
    }
  }


  function setMonthNavigationDisabled(
    disabled
  ) {
    [
      'historyPreviousMonth',
      'historyNextMonth'
    ].forEach(
      function (id) {
        const element =
          document.getElementById(id);

        if (element) {
          element.disabled =
            Boolean(disabled);
        }
      }
    );
  }


  function renderMonth(data) {
    const grid =
      document.getElementById(
        'historyCalendarGrid'
      );

    const summary =
      document.getElementById(
        'historyMonthSummary'
      );

    const generated =
      document.getElementById(
        'historyMonthGenerated'
      );

    if (!grid) {
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

    if (summary) {
      summary.innerHTML =
        monthSummaryHtml(
          data.totals || {}
        );
    }

    grid.innerHTML =
      calendarGridHtml(
        data.month,
        data.days || {}
      );

    grid
      .querySelectorAll(
        '[data-history-date]'
      )
      .forEach(
        function (button) {
          button.addEventListener(
            'click',
            function () {
              const selectedDate =
                cleanText(
                  button.dataset
                    .historyDate
                );

              if (!selectedDate) {
                return;
              }

              getSwal().close();

              window.setTimeout(
                function () {
                  showDay(
                    selectedDate,
                    1
                  );
                },
                0
              );
            }
          );
        }
      );
  }


  function summaryItemHtml(
    label,
    value,
    type
  ) {
    return (
      '<div class="history-summary-item ' +
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
      summaryItemHtml(
        'วันที่มีข้อมูล',
        totals.daysWithData || 0
      ) +

      summaryItemHtml(
        'รายการ',
        totals.totalRecords || 0
      ) +

      summaryItemHtml(
        'จำนวนรอบ',
        totals.totalRounds || 0
      ) +

      summaryItemHtml(
        'อนุญาต',
        totals.allowCount || 0,
        'success'
      ) +

      summaryItemHtml(
        'ห้ามเข้า',
        totals.denyCount || 0,
        'danger'
      ) +

      summaryItemHtml(
        'ค่าสูงสุด',
        formatMg(
          totals.maxValue
        ) +
        ' Mg%'
      ) +

      summaryItemHtml(
        'ภาพพร้อมดู',
        totals.imagesAvailable || 0
      ) +

      summaryItemHtml(
        'ภาพถูกลบ',
        totals.imagesDeleted || 0
      ) +

      summaryItemHtml(
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
        '<span class="history-day-empty"></span>';
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
          'class="history-day no-data" ' +
          'disabled' +
        '>' +

          '<span class="history-day-number">' +
            day +
          '</span>' +

        '</button>'
      );
    }

    const classes = [
      'history-day',
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
        'all-images-deleted'
      );
    }

    if (
      item.hasImageIssue
    ) {
      classes.push(
        'has-image-issue'
      );
    }

    const title = [
      displayDateKey(key),

      'รายการ ' +
        finiteNumber(
          item.totalRecords,
          0
        ),

      'ห้ามเข้า ' +
        finiteNumber(
          item.denyCount,
          0
        ),

      'ภาพถูกลบ ' +
        finiteNumber(
          item.imagesDeleted,
          0
        )
    ].join(' | ');

    return (
      '<button ' +
        'type="button" ' +
        'class="' +
          classes.join(' ') +
        '" ' +
        'data-history-date="' +
          escapeAttribute(key) +
        '" ' +
        'title="' +
          escapeAttribute(title) +
        '"' +
      '>' +

        '<span class="history-day-number">' +
          day +
        '</span>' +

        '<span class="history-day-count">' +
          finiteNumber(
            item.totalRecords,
            0
          ) +
          ' รายการ' +
        '</span>' +

        '<span class="history-day-markers">' +

          (
            item.hasDeny
              ? '<i class="deny"></i>'
              : ''
          ) +

          (
            item.allImagesDeleted
              ? '<i class="deleted"></i>'
              : ''
          ) +

          (
            item.hasImageIssue
              ? '<i class="issue"></i>'
              : ''
          ) +

        '</span>' +

      '</button>'
    );
  }


  /************************************************************
   * Daily History
   ************************************************************/

  async function showDay(
    selectedDate,
    page
  ) {
    const Swal =
      getSwal();

    let returnToCalendar =
      false;

    state.currentDate =
      selectedDate;

    state.currentPage =
      Math.max(
        1,
        Number(page) || 1
      );

    releaseImageData();

    await Swal.fire({
      title:
        '',

      html:
        dayShellHtml(
          selectedDate
        ),

      width:
        900,

      showConfirmButton:
        false,

      showCloseButton:
        true,

      allowOutsideClick:
        false,

      customClass: {
        popup:
          'history-swal-popup history-day-popup',

        htmlContainer:
          'history-swal-html'
      },

      didOpen:
        function () {
          const back =
            document.getElementById(
              'historyBackToCalendar'
            );

          const closeImage =
            document.getElementById(
              'historyImageOverlayClose'
            );

          if (back) {
            back.addEventListener(
              'click',
              function () {
                returnToCalendar =
                  true;

                Swal.close();
              }
            );
          }

          if (closeImage) {
            closeImage.addEventListener(
              'click',
              closeImageOverlay
            );
          }

          loadDay(
            selectedDate,
            state.currentPage
          );
        },

      willClose:
        releaseImageData
    });

    if (
      returnToCalendar &&
      state.token
    ) {
      await showCalendar();
    }
  }


  function dayShellHtml(
    selectedDate
  ) {
    return (
      '<div class="history-day-shell">' +

        '<div class="history-day-top">' +

          '<button ' +
            'id="historyBackToCalendar" ' +
            'type="button" ' +
            'class="history-small-action"' +
          '>' +
            '‹ ปฏิทิน' +
          '</button>' +

          '<div>' +
            '<strong>' +
              'ข้อมูลวันที่ ' +
              escapeHtml(
                displayDateKey(
                  selectedDate
                )
              ) +
            '</strong>' +

            '<small id="historyDayGenerated">' +
              'กำลังโหลด...' +
            '</small>' +
          '</div>' +

        '</div>' +

        '<div ' +
          'id="historyDaySummary" ' +
          'class="history-day-summary"' +
        '></div>' +

        '<div ' +
          'id="historyDayBreakdown" ' +
          'class="history-day-breakdown"' +
        '></div>' +

        '<div ' +
          'id="historyDayRecords" ' +
          'class="history-record-list"' +
        '>' +
          loadingHtml(
            'กำลังโหลดข้อมูลรายวัน...'
          ) +
        '</div>' +

        '<div ' +
          'id="historyDayPagination" ' +
          'class="history-pagination"' +
        '></div>' +

        '<div ' +
          'id="historyImageOverlay" ' +
          'class="history-image-overlay" ' +
          'hidden' +
        '>' +

          '<div class="history-image-card">' +

            '<div class="history-image-head">' +
              '<strong>' +
                'ภาพหลักฐานที่เบลอแล้ว' +
              '</strong>' +

              '<button ' +
                'id="historyImageOverlayClose" ' +
                'type="button" ' +
                'aria-label="ปิดภาพ"' +
              '>' +
                '×' +
              '</button>' +
            '</div>' +

            '<div ' +
              'id="historyImageContent" ' +
              'class="history-image-content"' +
            '></div>' +

          '</div>' +

        '</div>' +

      '</div>'
    );
  }


  async function loadDay(
    selectedDate,
    page
  ) {
    const records =
      document.getElementById(
        'historyDayRecords'
      );

    const generated =
      document.getElementById(
        'historyDayGenerated'
      );

    if (!records) {
      return;
    }

    records.innerHTML =
      loadingHtml(
        'กำลังโหลดข้อมูลรายวัน...'
      );

    setDayNavigationDisabled(
      true
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

      renderDay(
        result
      );

    } catch (error) {
      if (
        await handleExpiredSession(
          error
        )
      ) {
        return;
      }

      records.innerHTML =
        errorHtml(
          error &&
          error.message
            ? error.message
            : 'โหลดข้อมูลรายวันไม่สำเร็จ'
        );

      if (generated) {
        generated.textContent =
          'โหลดข้อมูลไม่สำเร็จ';
      }

    } finally {
      setDayNavigationDisabled(
        false
      );
    }
  }


  function renderDay(data) {
    const summary =
      document.getElementById(
        'historyDaySummary'
      );

    const breakdown =
      document.getElementById(
        'historyDayBreakdown'
      );

    const records =
      document.getElementById(
        'historyDayRecords'
      );

    const pagination =
      document.getElementById(
        'historyDayPagination'
      );

    const generated =
      document.getElementById(
        'historyDayGenerated'
      );

    const day =
      data.summary || {};

    if (generated) {
      generated.textContent =
        data.generatedAt
          ? (
            'อัปเดต ' +
            data.generatedAt
          )
          : '';
    }

    if (summary) {
      summary.innerHTML =
        summaryItemHtml(
          'รายการ',
          day.totalRecords || 0
        ) +

        summaryItemHtml(
          'จำนวนรอบ',
          day.totalRounds || 0
        ) +

        summaryItemHtml(
          'อนุญาต',
          day.allowCount || 0,
          'success'
        ) +

        summaryItemHtml(
          'ห้ามเข้า',
          day.denyCount || 0,
          'danger'
        ) +

        summaryItemHtml(
          'ค่าสูงสุด',
          formatMg(
            day.maxValue
          ) +
          ' Mg%'
        ) +

        summaryItemHtml(
          'ภาพพร้อมดู',
          day.imagesAvailable || 0
        ) +

        summaryItemHtml(
          'ภาพถูกลบ',
          day.imagesDeleted || 0
        ) +

        summaryItemHtml(
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
          ? list.map(
            recordHtml
          ).join('')
          : emptyHtml(
            'ไม่พบข้อมูลในวันที่เลือก'
          );

      bindRecordImageButtons();
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
    let html =
      objectChipsHtml(
        'จุดตรวจ',
        summary.byCheckpoint
      ) +

      objectChipsHtml(
        'ประเภทบุคคล',
        summary.byPersonType
      );

    if (
      summary.firstTime ||
      summary.lastTime
    ) {
      html +=
        '<div class="history-breakdown-group">' +
          '<strong>' +
            'ช่วงเวลาตรวจ' +
          '</strong>' +

          '<div class="history-chip-list">' +
            '<span class="history-chip">' +
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
        '</div>';
    }

    return html;
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
      '<div class="history-breakdown-group">' +

        '<strong>' +
          escapeHtml(title) +
        '</strong>' +

        '<div class="history-chip-list">' +

          entries
            .map(
              function (entry) {
                return (
                  '<span class="history-chip">' +
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


  function recordHtml(record) {
    const deny =
      cleanText(
        record.status
      ).toUpperCase() ===
      'DENY';

    const organization =
      record.organizationValue
        ? (
          '<span>' +
            escapeHtml(
              record.organizationType ||
              'บริษัท/สายรถ'
            ) +
            ': <b>' +
            escapeHtml(
              record.organizationValue
            ) +
            '</b>' +
          '</span>'
        )
        : '';

    const rounds =
      Array.isArray(
        record.rounds
      )
        ? record.rounds
        : [];

    return (
      '<article class="history-record-card ' +
        (
          deny
            ? 'is-deny'
            : 'is-allow'
        ) +
      '">' +

        '<div class="history-record-head">' +

          '<div>' +
            '<time>' +
              escapeHtml(
                record.time ||
                '--:--:--'
              ) +
            '</time>' +

            '<strong>' +
              escapeHtml(
                record.personName ||
                'ไม่ระบุชื่อ'
              ) +
            '</strong>' +
          '</div>' +

          '<span class="history-status-badge ' +
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

        '<div class="history-record-meta">' +

          '<span>' +
            'ประเภท: <b>' +
            escapeHtml(
              record.personType ||
              '-'
            ) +
            '</b>' +
          '</span>' +

          organization +

          '<span>' +
            'จุดตรวจ: <b>' +
            escapeHtml(
              record.checkpoint ||
              '-'
            ) +
            '</b>' +
          '</span>' +

          '<span>' +
            'ผู้ตรวจ: <b>' +
            escapeHtml(
              record.inspector ||
              '-'
            ) +
            '</b>' +
          '</span>' +

        '</div>' +

        '<div class="history-value-row">' +

          '<span>' +
            'รอบ <b>' +
            escapeHtml(
              record.roundCount || 0
            ) +
            '</b>' +
          '</span>' +

          '<span>' +
            'ครั้งแรก <b>' +
            formatMg(
              record.firstValueMg
            ) +
            '</b>' +
          '</span>' +

          '<span>' +
            'ล่าสุด <b>' +
            formatMg(
              record.lastValueMg
            ) +
            '</b>' +
          '</span>' +

          '<span>' +
            'สูงสุด <b>' +
            formatMg(
              record.maxValueMg
            ) +
            '</b> Mg%' +
          '</span>' +

        '</div>' +

        '<div class="history-record-image-status">' +

          '<span>' +
            escapeHtml(
              record.imageStatusText ||
              'ไม่ทราบสถานะภาพ'
            ) +
          '</span>' +

          (
            record.imageDeletedAt
              ? (
                '<small>' +
                  'วันที่ดำเนินการ: ' +
                  escapeHtml(
                    record.imageDeletedAt
                  ) +
                '</small>'
              )
              : (
                record.imageExpireAt
                  ? (
                    '<small>' +
                      'กำหนดลบ: ' +
                      escapeHtml(
                        record.imageExpireAt
                      ) +
                    '</small>'
                  )
                  : ''
              )
          ) +

        '</div>' +

        '<div class="history-round-list">' +

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
              : (
                '<small>' +
                  'ไม่พบรายละเอียดรอบตรวจ' +
                '</small>'
              )
          ) +

        '</div>' +

        '<div class="history-record-id">' +
          escapeHtml(
            record.recordId || ''
          ) +
        '</div>' +

      '</article>'
    );
  }


  function roundHtml(
    recordId,
    round
  ) {
    return (
      '<div class="history-round-row">' +

        '<div class="history-round-main">' +

          '<strong>' +
            'รอบ ' +
            escapeHtml(
              round.roundNumber ||
              '-'
            ) +
          '</strong>' +

          '<span>' +
            formatMg(
              round.valueMg
            ) +
            ' Mg%' +
          '</span>' +

          '<small>' +
            escapeHtml(
              round.measuredAt || ''
            ) +
          '</small>' +

        '</div>' +

        '<div class="history-round-image">' +

          '<span>' +
            escapeHtml(
              round.imageStatusText ||
              'ไม่ทราบสถานะภาพ'
            ) +
          '</span>' +

          (
            round.imageDeletedAt
              ? (
                '<small>' +
                  'ลบเมื่อ ' +
                  escapeHtml(
                    round.imageDeletedAt
                  ) +
                '</small>'
              )
              : (
                round.imageExpireAt
                  ? (
                    '<small>' +
                      'กำหนดลบ ' +
                      escapeHtml(
                        round.imageExpireAt
                      ) +
                    '</small>'
                  )
                  : ''
              )
          ) +

        '</div>' +

        (
          round.canViewImage ===
            true
            ? (
              '<button ' +
                'type="button" ' +
                'class="history-view-image-button" ' +
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
              '<span class="history-image-unavailable">' +
                'ไม่มีภาพ' +
              '</span>'
            )
        ) +

      '</div>'
    );
  }


  function bindRecordImageButtons() {
    document
      .querySelectorAll(
        '.history-view-image-button'
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


  /************************************************************
   * Pagination
   ************************************************************/

  function paginationHtml(
    pagination
  ) {
    const page =
      Math.max(
        1,
        Number(
          pagination.page
        ) || 1
      );

    const totalPages =
      Math.max(
        1,
        Number(
          pagination.totalPages
        ) || 1
      );

    return (
      '<button ' +
        'id="historyPreviousPage" ' +
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
        'id="historyNextPage" ' +
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
      document.getElementById(
        'historyPreviousPage'
      );

    const next =
      document.getElementById(
        'historyNextPage'
      );

    if (previous) {
      previous.addEventListener(
        'click',
        function () {
          if (
            state.currentPage > 1
          ) {
            loadDay(
              state.currentDate,
              state.currentPage - 1
            );
          }
        }
      );
    }

    if (next) {
      next.addEventListener(
        'click',
        function () {
          loadDay(
            state.currentDate,
            state.currentPage + 1
          );
        }
      );
    }
  }


  function setDayNavigationDisabled(
    disabled
  ) {
    [
      'historyPreviousPage',
      'historyNextPage'
    ].forEach(
      function (id) {
        const element =
          document.getElementById(id);

        if (element) {
          element.disabled =
            Boolean(disabled);
        }
      }
    );
  }


  /************************************************************
   * Protected Image
   ************************************************************/

  async function openProtectedImage(
    recordId,
    roundId
  ) {
    const overlay =
      document.getElementById(
        'historyImageOverlay'
      );

    const content =
      document.getElementById(
        'historyImageContent'
      );

    if (
      !overlay ||
      !content
    ) {
      return;
    }

    releaseImageData();

    overlay.hidden =
      false;

    content.innerHTML =
      loadingHtml(
        'กำลังโหลดภาพที่เบลอแล้ว...'
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

      if (
        !result.available ||
        !result.dataUrl
      ) {
        content.innerHTML =
          emptyHtml(
            result.imageStatusText ||
            'ภาพนี้ไม่พร้อมแสดง'
          ) +

          (
            result.imageDeletedAt
              ? (
                '<small class="history-image-note">' +
                  'วันที่ดำเนินการ: ' +
                  escapeHtml(
                    result.imageDeletedAt
                  ) +
                '</small>'
              )
              : ''
          );

        return;
      }

      state.imageDataUrl =
        result.dataUrl;

      content.innerHTML =
        '<img ' +
          'src="' +
            escapeAttribute(
              result.dataUrl
            ) +
          '" ' +
          'alt="ภาพหลักฐานที่เบลอแล้ว"' +
        '>' +

        '<small class="history-image-note">' +
          escapeHtml(
            recordId
          ) +
          ' / ' +
          escapeHtml(
            roundId
          ) +
        '</small>';

    } catch (error) {
      if (
        await handleExpiredSession(
          error
        )
      ) {
        return;
      }

      content.innerHTML =
        errorHtml(
          error &&
          error.message
            ? error.message
            : 'ไม่สามารถโหลดภาพได้'
        );
    }
  }


  function closeImageOverlay() {
    const overlay =
      document.getElementById(
        'historyImageOverlay'
      );

    if (overlay) {
      overlay.hidden =
        true;
    }

    releaseImageData();
  }


  function releaseImageData() {
    const image =
      document.querySelector(
        '#historyImageContent img'
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
   * Logout / Expired Session
   ************************************************************/

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

    Swal.close();

    await Swal.fire({
      icon:
        'success',

      title:
        'ออกจากระบบแล้ว',

      timer:
        800,

      showConfirmButton:
        false
    });
  }


  async function handleExpiredSession(
    error
  ) {
    if (!isAuthError(error)) {
      return false;
    }

    clearSession();

    const Swal =
      getSwal();

    Swal.close();

    await Swal.fire({
      icon:
        'warning',

      title:
        'Session หมดอายุ',

      text:
        'กรุณาเข้าสู่ระบบใหม่',

      confirmButtonText:
        'เข้าสู่ระบบ'
    });

    const loggedIn =
      await showLogin();

    if (loggedIn) {
      await showCalendar();
    }

    return true;
  }


  /************************************************************
   * Common UI
   ************************************************************/

  function loadingHtml(message) {
    return (
      '<div class="history-state-message loading">' +

        '<span ' +
          'class="history-spinner" ' +
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
      '<div class="history-state-message error">' +

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
      '<div class="history-state-message empty">' +

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
      error &&
      error.message
        ? error.message
        : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';

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
   * Initialize
   ************************************************************/

  function initialize() {
    if (state.initialized) {
      return;
    }

    state.initialized =
      true;

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
