/************************************************************
 * api.js
 * ฟังก์ชันกลางสำหรับเรียก Cloudflare Worker
 ************************************************************/

(function (window) {
  'use strict';

  const CONFIG =
    window.APP_CONFIG || {};

  const API_BASE =
    String(
      CONFIG.API_BASE || ''
    ).replace(/\/+$/, '');

  if (!API_BASE) {
    console.error(
      'ไม่พบ APP_CONFIG.API_BASE'
    );
  }

  class AlcoholAPIError extends Error {
    constructor(
      message,
      code,
      status,
      details,
      requestId
    ) {
      super(
        message ||
        'เกิดข้อผิดพลาดในการเรียก API'
      );

      this.name =
        'AlcoholAPIError';

      this.code =
        code || 'API_ERROR';

      this.status =
        Number(status) || 0;

      this.details =
        details || null;

      this.requestId =
        requestId || '';
    }
  }


  function createRequestId() {
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

    } else {
      randomPart =
        Math.random()
          .toString(36)
          .substring(2, 14)
          .toUpperCase();
    }

    return (
      'WEB-' +
      Date.now()
        .toString(36)
        .toUpperCase() +
      '-' +
      randomPart
    );
  }


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

    return (
      API_BASE +
      '/' +
      cleanPath
    );
  }


  function estimatePayloadBytes(payload) {
    try {
      return new Blob([
        JSON.stringify(payload)
      ]).size;

    } catch (error) {
      return 0;
    }
  }


  async function request(
    path,
    options
  ) {
    const settings =
      options || {};

    const timeoutMs =
      Number(
        settings.timeoutMs ||
        CONFIG.API_TIMEOUT_MS ||
        30000
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
      String(
        settings.requestId ||
        createRequestId()
      );

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
        settings.method || 'GET',

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
        typeof settings.body === 'string'
          ? settings.body
          : JSON.stringify(
            settings.body
          );
    }

    try {
      const response =
        await fetch(
          buildUrl(path),
          fetchOptions
        );

      const responseText =
        await response.text();

      let data = null;

      if (responseText) {
        try {
          data =
            JSON.parse(responseText);

        } catch (error) {
          throw new AlcoholAPIError(
            'API ไม่ได้ส่งข้อมูล JSON กลับมา',
            'INVALID_JSON_RESPONSE',
            response.status,
            {
              preview:
                responseText
                  .replace(/<[^>]+>/g, ' ')
                  .replace(/\s+/g, ' ')
                  .substring(0, 300)
            },
            response.headers.get(
              'X-Request-ID'
            ) || requestId
          );
        }
      }

      if (!data) {
        throw new AlcoholAPIError(
          'API ไม่ได้ส่งข้อมูลกลับมา',
          'EMPTY_API_RESPONSE',
          response.status,
          null,
          requestId
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
          data.details || null,
          data.requestId ||
          requestId
        );
      }

      return data;

    } catch (error) {
      if (
        error &&
        error.name === 'AbortError'
      ) {
        throw new AlcoholAPIError(
          'การเชื่อมต่อใช้เวลานานเกินกำหนด กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
          'REQUEST_TIMEOUT',
          0,
          null,
          requestId
        );
      }

      if (
        error instanceof
        AlcoholAPIError
      ) {
        throw error;
      }

      throw new AlcoholAPIError(
        navigator.onLine === false
          ? 'อุปกรณ์ไม่ได้เชื่อมต่ออินเทอร์เน็ต'
          : 'ไม่สามารถเชื่อมต่อระบบได้',

        navigator.onLine === false
          ? 'OFFLINE'
          : 'NETWORK_ERROR',

        0,

        {
          originalMessage:
            error &&
            error.message
              ? error.message
              : String(error)
        },

        requestId
      );

    } finally {
      window.clearTimeout(
        timeoutId
      );
    }
  }


  async function health() {
    return request(
      'api/health',
      {
        method: 'GET',
        timeoutMs:
          CONFIG.API_TIMEOUT_MS
      }
    );
  }


  async function getOptions() {
    return request(
      'api/options',
      {
        method: 'GET',
        timeoutMs:
          CONFIG.API_TIMEOUT_MS
      }
    );
  }


  async function saveRecord(
    payload,
    options
  ) {
    const settings =
      options || {};

    const requestId =
      String(
        payload.requestId ||
        settings.requestId ||
        createRequestId()
      );

    const finalPayload = {
      ...payload,
      requestId:
        requestId
    };

    const payloadBytes =
      estimatePayloadBytes(
        finalPayload
      );

    if (
      typeof settings.onBeforeSend ===
      'function'
    ) {
      settings.onBeforeSend({
        requestId:
          requestId,

        payloadBytes:
          payloadBytes
      });
    }

    return request(
      'api/save',
      {
        method: 'POST',

        body:
          finalPayload,

        requestId:
          requestId,

        timeoutMs:
          CONFIG.SAVE_TIMEOUT_MS ||
          120000
      }
    );
  }


  window.AlcoholAPI =
    Object.freeze({
      health:
        health,

      getOptions:
        getOptions,

      saveRecord:
        saveRecord,

      createRequestId:
        createRequestId,

      estimatePayloadBytes:
        estimatePayloadBytes,

      AlcoholAPIError:
        AlcoholAPIError
    });

})(window);
