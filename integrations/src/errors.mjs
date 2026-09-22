const messages = Object.freeze({
  CONFIG_MISSING: '필수 API 키가 설정되지 않았습니다.',
  CONFIG_INVALID: '서비스 설정 형식이 올바르지 않습니다.',
  CONFIG_READ: '.env 설정 파일을 읽지 못했습니다.',
  AUTH: 'API 키 또는 서비스 접근 권한을 확인하세요.',
  QUOTA: '서비스 할당량 또는 사용 한도를 확인하세요.',
  MODEL_UNAVAILABLE: '요청한 모델 또는 리소스를 사용할 수 없습니다.',
  TIMEOUT: '서비스 요청 시간이 초과되었습니다.',
  INVALID_RESPONSE: '서비스 응답 형식이 예상과 다릅니다.',
  REQUEST_FAILED: '서비스 요청에 실패했습니다.',
  CLEANUP_FAILED: '샌드박스 종료를 확인하지 못했습니다. 설정한 제한 시간 후 자동 종료됩니다.',
});

export class IntegrationError extends Error {
  constructor(service, code, status) {
    service = ['gemini', 'e2b', 'config'].includes(service) ? service : 'config';
    code = Object.hasOwn(messages, code) ? code : 'REQUEST_FAILED';
    super(`${service}: ${messages[code]}`);
    this.name = 'IntegrationError';
    this.service = service;
    this.code = code;
    if (Number.isInteger(status) && status >= 100 && status <= 599) this.status = status;
  }
}

export function safeError(error, service = 'config') {
  if (error instanceof IntegrationError) return error;
  const status = Number(error?.status ?? error?.statusCode ?? error?.response?.status);
  const code = [401, 403].includes(status) ? 'AUTH' : status === 429 ? 'QUOTA'
    : status === 404 ? 'MODEL_UNAVAILABLE'
      : [408, 504].includes(status) || ['AbortError', 'TimeoutError'].includes(error?.name) ? 'TIMEOUT'
        : 'REQUEST_FAILED';
  return new IntegrationError(service, code, status);
}

export function errorSummary(error, service = 'config') {
  const safe = safeError(error, service);
  return { service: safe.service, code: safe.code, ...(safe.status === undefined ? {} : { status: safe.status }), message: safe.message };
}

export function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
}
