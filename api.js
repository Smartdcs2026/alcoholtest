/************************************************************
 * api.js
 * ฟังก์ชันกลางสำหรับเรียก Cloudflare Worker
 *
 * รองรับ:
 * - Health / Options / Save
 * - ตรวจสอบผลบันทึกหลัง Timeout ด้วย Request ID
 * - Login / Session / Month / Day / Image / Logout
 * - ตรวจขนาด Payload ก่อนส่ง
 ************************************************************/

(function (window) {
  'use strict';

  const CONFIG = window.APP_CONFIG || {};

  const API_BASE = String(
    CONFIG.API_BASE || ''
  ).replace(/\/+$/, '');

  const DEFAULT_API_TIMEOUT_MS = 30000;
  const DEFAULT_SAVE_TIMEOUT_MS = 120000;
  const DEFAULT_HISTORY_TIMEOUT_MS = 60000;

  /*
   * Worker จำกัดข้อมูลไว้ประมาณ 12 MB
   * ฝั่งหน้าเว็บจำกัดต่ำกว่าเล็กน้อยเพื่อเผื่อ Header
   */
  const DEFAULT_MAX_SAVE_PAYLOAD_BYTES =
    11 * 1024 * 1024;

  const DEVICE_STORAGE_KEY =
    'alcohol_device_id_v1';

  const UNCERTAIN_SAVE_CODES =
    Object.freeze([
      'REQUEST_TIMEOUT',
      'NETWORK_ERROR',
      'EMPTY_API_RESPONSE',
      'INVALID_JSON_RESPONSE',
      'UPSTREAM_TIMEOUT',
      'UPSTREAM_EMPTY_RESPONSE',
      'UPSTREAM_INVALID_JSON',
      'UPSTREAM_FETCH_FAILED'
    ]);

  let memoryDeviceId = '';


  if (!API_BASE) {
    console.error(
      'ไม่พบ APP_CONFIG.API_BASE'
    );
  }


  /************************************************************
   * Error
   ************************************************************/

  class AlcoholAPIError extends Error {
    constructor(
      message,
      code,
      status,
      details,
      requestId,
      responseData
    ) {
      super(
        message ||
        'เกิดข้อผิดพลาดในการเรียก API'
      );

      this.name =
        'AlcoholAPIError';

      this.code =
        code ||
        'API_ERROR';

      this.status =
        Number(status) ||
        0;

      this.details =
        details ||
        null;

      this.requestId =
        requestId ||
        '';

      this.responseData =
        responseData ||
        null;

      this.retryable =
        isRetryableStatus(
          this.status
        ) ||
        isRetryableCode(
          this.code
        );
    }
  }


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


  function finiteNumber(
    value,
    fallback,
    minimum,
    maximum
  ) {
    const number =
      Number(value);

    let result =
      Number.isFinite(number)
        ? number
        : fallback;

    if (
      Number.isFinite(minimum)
    ) {
      result =
        Math.max(
          minimum,
          result
        );
    }

    if (
      Number.isFinite(maximum)
    ) {
      result =
        Math.min(
          maximum,
          result
        );
    }

    return result;
  }


  function delay(milliseconds) {
    return new Promise(
      function (resolve) {
        window.setTimeout(
          resolve,
          Math.max(
            0,
            Number(milliseconds) ||
            0
          )
        );
      }
    );
  }


  function isOnline() {
    return !(
      window.navigator &&
      window.navigator.onLine ===
        false
    );
  }


  function isRetryableStatus(status) {
    return [
      0,
      408,
      425,
      429,
      500,
      502,
      503,
      504
    ].includes(
      Number(status) ||
      0
    );
  }


  function isRetryableCode(code) {
    return [
      'REQUEST_TIMEOUT',
      'NETWORK_ERROR',
      'OFFLINE',
      'SYSTEM_BUSY',
      'UPSTREAM_TIMEOUT',
      'UPSTREAM_EMPTY_RESPONSE',
      'UPSTREAM_FETCH_FAILED'
    ].includes(
      cleanText(code)
        .toUpperCase()
    );
  }


  function isUncertainSaveError(
    error
  ) {
    return (
      error instanceof
        AlcoholAPIError &&
      UNCERTAIN_SAVE_CODES
        .includes(
          cleanText(
            error.code
          ).toUpperCase()
        )
    );
  }


  /************************************************************
   * Request ID
   ************************************************************/

  function createRequestId(prefix) {
    let randomPart = '';

    if (
      window.crypto &&
      typeof window.crypto.randomUUID ===
        'function'
    ) {
      randomPart =
        window.crypto
          .randomUUID()
          .replace(/-/g, '')
          .substring(0, 12)
          .toUpperCase();

    } else if (
      window.crypto &&
      typeof window.crypto.getRandomValues ===
        'function'
    ) {
      const values =
        new Uint32Array(2);

      window.crypto
        .getRandomValues(values);

      randomPart =
        Array.from(values)
          .map(
            function (value) {
              return value
                .toString(36)
                .toUpperCase();
            }
          )
          .join('')
          .substring(0, 12);

    } else {
      randomPart =
        Math.random()
          .toString(36)
          .substring(2, 14)
          .toUpperCase();
    }

    const cleanPrefix =
      cleanText(
        prefix ||
        'WEB'
      )
        .replace(
          /[^A-Za-z0-9_-]/g,
          ''
        )
        .substring(0, 20)
        .toUpperCase() ||
      'WEB';

    return (
      cleanPrefix +
      '-' +
      Date.now()
        .toString(36)
        .toUpperCase() +
      '-' +
      randomPart
    );
  }


  /************************************************************
   * Device ID
   ************************************************************/

  function getOrCreateDeviceId() {
    if (memoryDeviceId) {
      return memoryDeviceId;
    }

    try {
      const stored =
        cleanText(
          window.localStorage &&
          window.localStorage
            .getItem(
              DEVICE_STORAGE_KEY
            )
        );

      if (stored) {
        memoryDeviceId =
          stored.substring(
            0,
            250
          );

        return memoryDeviceId;
      }

    } catch (error) {
      /*
       * ใช้ค่าในหน่วยความจำแทน
       * เมื่อ Browser ปิด Local Storage
       */
    }

    memoryDeviceId =
      createRequestId(
        'DEVICE'
      );

    try {
      if (window.localStorage) {
        window.localStorage
          .setItem(
            DEVICE_STORAGE_KEY,
            memoryDeviceId
          );
      }

    } catch (error) {
      /*
       * ไม่ให้ Local Storage
       * กระทบการทำงานหลัก
       */
    }

    return memoryDeviceId;
  }


  /************************************************************
   * URL / JSON / Payload
   ************************************************************/

  function buildUrl(path) {
    if (!API_BASE) {
      throw new AlcoholAPIError(
        'ยังไม่ได้กำหนด API_BASE',
        'API_BASE_NOT_CONFIGURED'
      );
    }

    const cleanPath =
      String(path || '')
        .trim()
        .replace(/^\/+/, '');

    return cleanPath
      ? (
        API_BASE +
        '/' +
        cleanPath
      )
      : (
        API_BASE +
        '/'
      );
  }


  function stringifyPayload(payload) {
    try {
      return JSON.stringify(
        payload
      );

    } catch (error) {
      throw new AlcoholAPIError(
        'ไม่สามารถแปลงข้อมูลเป็น JSON ได้',
        'PAYLOAD_SERIALIZE_FAILED',
        0,
        {
          originalMessage:
            cleanText(
              error &&
              error.message
            )
        }
      );
    }
  }


  function estimatePayloadBytes(
    payload
  ) {
    try {
      const json =
        typeof payload ===
          'string'
          ? payload
          : JSON.stringify(
            payload
          );

      if (
        typeof TextEncoder ===
        'function'
      ) {
        return new TextEncoder()
          .encode(json)
          .byteLength;
      }

      return new Blob([
        json
      ]).size;

    } catch (error) {
      return 0;
    }
  }


  function sanitizePreview(value) {
    return cleanText(value)
      .replace(
        /<script[\s\S]*?<\/script>/gi,
        ''
      )
      .replace(
        /<style[\s\S]*?<\/style>/gi,
        ''
      )
      .replace(
        /<[^>]+>/g,
        ' '
      )
      .replace(
        /\s+/g,
        ' '
      )
      .substring(
        0,
        300
      );
  }


  /************************************************************
   * Core Request
   ************************************************************/

  async function request(
    path,
    options
  ) {
    const settings =
      options || {};

    const timeoutMs =
      finiteNumber(
        settings.timeoutMs,
        finiteNumber(
          CONFIG.API_TIMEOUT_MS,
          DEFAULT_API_TIMEOUT_MS
        ),
        1000,
        300000
      );

    const controller =
      new AbortController();

    const timeoutId =
      window.setTimeout(
        function () {
          controller.abort();
        },
        timeoutMs
      );

    const requestId =
      cleanText(
        settings.requestId
      ) ||
      createRequestId();

    const headers =
      new Headers(
        settings.headers || {}
      );

    headers.set(
      'Accept',
      'application/json'
    );

    headers.set(
      'X-Request-ID',
      requestId
    );

    const fetchOptions = {
      method:
        cleanText(
          settings.method ||
          'GET'
        ).toUpperCase(),

      headers:
        headers,

      signal:
        controller.signal,

      credentials:
        'omit',

      cache:
        'no-store',

      redirect:
        'follow'
    };

    if (
      settings.body !== undefined &&
      settings.body !== null
    ) {
      headers.set(
        'Content-Type',
        'application/json;charset=UTF-8'
      );

      fetchOptions.body =
        typeof settings.body ===
          'string'
          ? settings.body
          : stringifyPayload(
            settings.body
          );
    }

    try {
      const response =
        await window.fetch(
          buildUrl(path),
          fetchOptions
        );

      const responseRequestId =
        cleanText(
          response.headers.get(
            'X-Request-ID'
          )
        ) ||
        requestId;

      const responseText =
        String(
          await response.text() ||
          ''
        ).replace(
          /^\uFEFF/,
          ''
        );

      if (!responseText.trim()) {
        throw new AlcoholAPIError(
          'API ไม่ได้ส่งข้อมูลกลับมา',
          'EMPTY_API_RESPONSE',
          response.status,
          null,
          responseRequestId
        );
      }

      let data;

      try {
        data =
          JSON.parse(
            responseText
          );

      } catch (error) {
        throw new AlcoholAPIError(
          'API ไม่ได้ส่งข้อมูล JSON กลับมา',
          'INVALID_JSON_RESPONSE',
          response.status,
          {
            preview:
              sanitizePreview(
                responseText
              )
          },
          responseRequestId
        );
      }

      if (
        !data ||
        typeof data !==
          'object' ||
        Array.isArray(data)
      ) {
        throw new AlcoholAPIError(
          'รูปแบบข้อมูลตอบกลับจาก API ไม่ถูกต้อง',
          'INVALID_API_RESPONSE',
          response.status,
          null,
          responseRequestId,
          data
        );
      }

      if (
        !response.ok ||
        data.ok === false
      ) {
        throw new AlcoholAPIError(
          data.message ||
          'API ทำงานไม่สำเร็จ',

          data.code ||
          'API_REQUEST_FAILED',

          response.status,

          data.details ||
          null,

          data.requestId ||
          responseRequestId,

          data
        );
      }

      return data;

    } catch (error) {
      if (
        error &&
        error.name ===
          'AbortError'
      ) {
        throw new AlcoholAPIError(
          'การเชื่อมต่อใช้เวลานานเกินกำหนด ระบบจะตรวจสอบผลรายการก่อนแจ้งให้ทราบ',
          'REQUEST_TIMEOUT',
          0,
          {
            timeoutMs:
              timeoutMs
          },
          requestId
        );
      }

      if (
        error instanceof
          AlcoholAPIError
      ) {
        throw error;
      }

      const online =
        isOnline();

      throw new AlcoholAPIError(
        online
          ? 'ไม่สามารถเชื่อมต่อระบบได้'
          : 'อุปกรณ์ไม่ได้เชื่อมต่ออินเทอร์เน็ต',

        online
          ? 'NETWORK_ERROR'
          : 'OFFLINE',

        0,

        {
          originalMessage:
            cleanText(
              error &&
              error.message
            ) ||
            String(error)
        },

        requestId
      );

    } finally {
      window.clearTimeout(
        timeoutId
      );
    }
  }


  /************************************************************
   * Health / Options
   ************************************************************/

  async function health() {
    return request(
      'api/health',
      {
        method:
          'GET',

        timeoutMs:
          finiteNumber(
            CONFIG.API_TIMEOUT_MS,
            DEFAULT_API_TIMEOUT_MS
          )
      }
    );
  }


  async function getOptions() {
    return request(
      'api/options',
      {
        method:
          'GET',

        timeoutMs:
          finiteNumber(
            CONFIG.API_TIMEOUT_MS,
            DEFAULT_API_TIMEOUT_MS
          )
      }
    );
  }


  /************************************************************
   * Record Status
   ************************************************************/

  async function getRecordStatus(
    requestId,
    options
  ) {
    const targetRequestId =
      cleanText(
        requestId
      );

    const settings =
      options || {};

    if (!targetRequestId) {
      throw new AlcoholAPIError(
        'ไม่พบ Request ID สำหรับตรวจสอบสถานะ',
        'REQUEST_ID_REQUIRED'
      );
    }

    return request(
      'api/record-status',
      {
        method:
          'POST',

        body: {
          requestId:
            targetRequestId
        },

        /*
         * Gateway Request ID แยกจาก
         * Request ID ของรายการที่กำลังค้นหา
         */
        requestId:
          settings.gatewayRequestId ||
          createRequestId(
            'STATUS'
          ),

        timeoutMs:
          finiteNumber(
            settings.timeoutMs,
            finiteNumber(
              CONFIG.HISTORY_TIMEOUT_MS,
              DEFAULT_HISTORY_TIMEOUT_MS
            )
          )
      }
    );
  }


  /************************************************************
   * ตรวจสอบ Save หลัง Timeout
   ************************************************************/

  async function verifyUncertainSave(
    requestId,
    originalError,
    settings
  ) {
    const configuredDelays =
      Array.isArray(
        settings.statusCheckDelays
      )
        ? settings.statusCheckDelays
        : [
          0,
          2000,
          5000
        ];

    const delays =
      configuredDelays.length
        ? configuredDelays
        : [0];

    let lastStatus =
      null;

    let lastStatusError =
      null;

    for (
      let index = 0;
      index < delays.length;
      index += 1
    ) {
      const waitMs =
        Math.max(
          0,
          Number(
            delays[index]
          ) ||
          0
        );

      if (waitMs > 0) {
        await delay(
          waitMs
        );
      }

      if (
        typeof settings.onStatusCheck ===
        'function'
      ) {
        try {
          settings.onStatusCheck({
            requestId:
              requestId,

            attempt:
              index + 1,

            totalAttempts:
              delays.length
          });

        } catch (callbackError) {
          console.warn(
            'onStatusCheck error:',
            callbackError
          );
        }
      }

      try {
        lastStatus =
          await getRecordStatus(
            requestId
          );

        if (
          lastStatus &&
          lastStatus.found === true &&
          lastStatus.state ===
            'COMPLETED'
        ) {
          return {
            ...lastStatus,

            ok:
              true,

            message:
              lastStatus.status ===
                'DENY'
                ? 'บันทึกสำเร็จ: ห้ามเข้าพื้นที่ / ห้ามปฏิบัติงาน'
                : 'บันทึกข้อมูลสำเร็จ',

            requestId:
              requestId,

            verifiedAfterUncertainSave:
              true,

            originalErrorCode:
              originalError.code ||
              ''
          };
        }

      } catch (statusError) {
        lastStatusError =
          statusError;

        if (
          statusError &&
          statusError.code ===
            'OFFLINE'
        ) {
          break;
        }
      }
    }

    originalError.details = {
      ...(
        originalError.details ||
        {}
      ),

      saveStatusChecked:
        true,

      lastKnownState:
        lastStatus &&
        lastStatus.state
          ? lastStatus.state
          : 'UNKNOWN',

      statusCheckError:
        lastStatusError &&
        lastStatusError.code
          ? lastStatusError.code
          : ''
    };

    originalError.message =
      'ยังไม่สามารถยืนยันผลการบันทึกได้ ' +
      'กรุณาอย่ากดบันทึกซ้ำทันที ' +
      'และตรวจสอบจากเมนูประวัติด้วย Request ID: ' +
      requestId;

    throw originalError;
  }


  /************************************************************
   * Save
   ************************************************************/

  async function saveRecord(
    payload,
    options
  ) {
    const settings =
      options || {};

    const sourcePayload =
      payload &&
      typeof payload ===
        'object' &&
      !Array.isArray(payload)
        ? payload
        : {};

    const requestId =
      cleanText(
        sourcePayload.requestId ||
        settings.requestId
      ) ||
      createRequestId();

    const finalPayload = {
      ...sourcePayload,

      requestId:
        requestId
    };

    /*
     * Serialize แค่ครั้งเดียว
     * ลดการใช้หน่วยความจำเมื่อมีภาพหลายภาพ
     */
    const serialized =
      stringifyPayload(
        finalPayload
      );

    const payloadBytes =
      estimatePayloadBytes(
        serialized
      );

    const maximumBytes =
      finiteNumber(
        CONFIG.MAX_SAVE_PAYLOAD_BYTES,
        DEFAULT_MAX_SAVE_PAYLOAD_BYTES,
        1024 * 1024,
        20 * 1024 * 1024
      );

    if (
      payloadBytes >
      maximumBytes
    ) {
      throw new AlcoholAPIError(
        'ข้อมูลและภาพรวมมีขนาดใหญ่เกินกำหนด กรุณาลดจำนวนรอบหรือถ่ายภาพใหม่',
        'PAYLOAD_TOO_LARGE_CLIENT',
        413,
        {
          payloadBytes:
            payloadBytes,

          maximumBytes:
            maximumBytes
        },
        requestId
      );
    }

    if (
      typeof settings.onBeforeSend ===
      'function'
    ) {
      try {
        settings.onBeforeSend({
          requestId:
            requestId,

          payloadBytes:
            payloadBytes,

          maximumBytes:
            maximumBytes
        });

      } catch (callbackError) {
        console.warn(
          'onBeforeSend error:',
          callbackError
        );
      }
    }

    try {
      return await request(
        'api/save',
        {
          method:
            'POST',

          body:
            serialized,

          requestId:
            requestId,

          timeoutMs:
            finiteNumber(
              settings.timeoutMs,
              finiteNumber(
                CONFIG.SAVE_TIMEOUT_MS,
                DEFAULT_SAVE_TIMEOUT_MS
              )
            )
        }
      );

    } catch (error) {
      /*
       * ห้ามส่งข้อมูลบันทึกซ้ำอัตโนมัติ
       * แต่ตรวจจาก Request ID ก่อน
       */
      if (
        settings.verifyOnUncertain ===
          false ||
        !isUncertainSaveError(
          error
        )
      ) {
        throw error;
      }

      return verifyUncertainSave(
        requestId,
        error,
        settings
      );
    }
  }


  /************************************************************
   * History Helpers
   ************************************************************/

  function historyPayload(
    payload,
    requireToken
  ) {
    const source =
      payload &&
      typeof payload ===
        'object' &&
      !Array.isArray(payload)
        ? payload
        : {};

    const result = {
      ...source,

      deviceId:
        cleanText(
          source.deviceId
        ) ||
        getOrCreateDeviceId(),

      requestId:
        cleanText(
          source.requestId
        ) ||
        createRequestId(
          'HISTORY'
        )
    };

    if (
      requireToken &&
      !cleanText(
        result.token
      )
    ) {
      throw new AlcoholAPIError(
        'ไม่พบ Session สำหรับดูประวัติ กรุณาเข้าสู่ระบบใหม่',
        'AUTH_REQUIRED',
        401,
        null,
        result.requestId
      );
    }

    return result;
  }


  function historyTimeout() {
    return finiteNumber(
      CONFIG.HISTORY_TIMEOUT_MS,
      DEFAULT_HISTORY_TIMEOUT_MS,
      5000,
      120000
    );
  }


  /************************************************************
   * History Login
   ************************************************************/

  async function historyLogin(
    payload
  ) {
    const body =
      historyPayload(
        payload,
        false
      );

    return request(
      'api/history/login',
      {
        method:
          'POST',

        body:
          body,

        requestId:
          body.requestId,

        timeoutMs:
          historyTimeout()
      }
    );
  }


  /************************************************************
   * History Session
   ************************************************************/

  async function historySession(
    payload
  ) {
    const body =
      historyPayload(
        payload,
        true
      );

    return request(
      'api/history/session',
      {
        method:
          'POST',

        body:
          body,

        requestId:
          body.requestId,

        timeoutMs:
          historyTimeout()
      }
    );
  }


  /************************************************************
   * History Month
   ************************************************************/

  async function historyMonth(
    payload
  ) {
    const body =
      historyPayload(
        payload,
        true
      );

    if (
      !/^\d{4}-\d{2}$/
        .test(
          cleanText(
            body.month
          )
        )
    ) {
      throw new AlcoholAPIError(
        'รูปแบบเดือนต้องเป็น yyyy-MM',
        'INVALID_HISTORY_MONTH',
        400,
        null,
        body.requestId
      );
    }

    return request(
      'api/history/month',
      {
        method:
          'POST',

        body:
          body,

        requestId:
          body.requestId,

        timeoutMs:
          historyTimeout()
      }
    );
  }


  /************************************************************
   * History Day
   ************************************************************/

  async function historyDay(
    payload
  ) {
    const body =
      historyPayload(
        payload,
        true
      );

    if (
      !/^\d{4}-\d{2}-\d{2}$/
        .test(
          cleanText(
            body.date
          )
        )
    ) {
      throw new AlcoholAPIError(
        'รูปแบบวันที่ต้องเป็น yyyy-MM-dd',
        'INVALID_HISTORY_DATE',
        400,
        null,
        body.requestId
      );
    }

    body.page =
      Math.max(
        1,
        Math.floor(
          Number(
            body.page
          ) ||
          1
        )
      );

   body.page =
  Math.max(
    1,

    Math.floor(
      Number(
        body.page
      ) ||
      1
    )
  );

body.pageSize =
  Math.min(
    30,

    Math.max(
      1,

      Math.floor(
        Number(
          body.pageSize
        ) ||
        10
      )
    )
  );

body.search =
  cleanText(
    body.search
  ).substring(
    0,
    200
  );

body.status =
  cleanText(
    body.status ||
    'ALL'
  ).toUpperCase();

body.checkpoint =
  cleanText(
    body.checkpoint
  ).substring(
    0,
    200
  );

body.image =
  cleanText(
    body.image ||
    'ALL'
  ).toUpperCase();

    return request(
      'api/history/day',
      {
        method:
          'POST',

        body:
          body,

        requestId:
          body.requestId,

        timeoutMs:
          historyTimeout()
      }
    );
  }


  /************************************************************
   * History Image
   ************************************************************/
  async function historyRecord(
  payload
) {
  const body =
    historyPayload(
      payload,
      true
    );


  if (
    !cleanText(
      body.recordId
    )
  ) {
    throw new AlcoholAPIError(
      'ไม่พบ Record ID',
      'RECORD_REFERENCE_REQUIRED',
      400,
      null,
      body.requestId
    );
  }


  return request(
    'api/history/record',

    {
      method:
        'POST',

      body:
        body,

      requestId:
        body.requestId,

      timeoutMs:
        historyTimeout()
    }
  );
}
  async function historyThumbnail(
  payload
) {
  const body =
    historyPayload(
      payload,
      true
    );


  if (
    !cleanText(
      body.recordId
    ) ||

    !cleanText(
      body.roundId
    )
  ) {
    throw new AlcoholAPIError(
      'ไม่พบ Record ID หรือ Round ID',
      'IMAGE_REFERENCE_REQUIRED',
      400,
      null,
      body.requestId
    );
  }


  return request(
    'api/history/thumbnail',

    {
      method:
        'POST',

      body:
        body,

      requestId:
        body.requestId,

      timeoutMs:
        historyTimeout()
    }
  );
}

  async function historyImage(
    payload
  ) {
    const body =
      historyPayload(
        payload,
        true
      );

    if (
      !cleanText(
        body.recordId
      ) ||
      !cleanText(
        body.roundId
      )
    ) {
      throw new AlcoholAPIError(
        'ไม่พบ Record ID หรือ Round ID',
        'IMAGE_REFERENCE_REQUIRED',
        400,
        null,
        body.requestId
      );
    }

    return request(
      'api/history/image',
      {
        method:
          'POST',

        body:
          body,

        requestId:
          body.requestId,

        timeoutMs:
          historyTimeout()
      }
    );
  }


  /************************************************************
   * History Logout
   ************************************************************/

  async function historyLogout(
    payload
  ) {
    const body =
      historyPayload(
        payload,
        false
      );

    return request(
      'api/history/logout',
      {
        method:
          'POST',

        body:
          body,

        requestId:
          body.requestId,

        timeoutMs:
          historyTimeout()
      }
    );
  }


  /************************************************************
   * Public API
   ************************************************************/

  window.AlcoholAPI =
    Object.freeze({
      health:
        health,

      getOptions:
        getOptions,

      saveRecord:
        saveRecord,

      getRecordStatus:
        getRecordStatus,

      historyLogin:
        historyLogin,

      historySession:
        historySession,

      historyMonth:
        historyMonth,

      historyDay:
  historyDay,

historyRecord:
  historyRecord,

historyThumbnail:
  historyThumbnail,

historyImage:
  historyImage,

      historyLogout:
        historyLogout,

      createRequestId:
        createRequestId,

      getOrCreateDeviceId:
        getOrCreateDeviceId,

      estimatePayloadBytes:
        estimatePayloadBytes,

      isUncertainSaveError:
        isUncertainSaveError,

      AlcoholAPIError:
        AlcoholAPIError
    });

})(window);
