import { getDeviceId } from './audio';

// 사용 기록 창구(/api/event)로 보내는 얇은 도구.
// 기기 번호와 모집 경로 꼬리표(src)만 쓰고, 이름·이메일·사진·문장 내용은 보내지 않는다.
// 모든 저장소 접근은 try/catch로 감싸고, 실패해도 화면에는 아무 변화가 없다.

const SRC_KEY = 'ai_tutor_src';
const INTERNAL_KEY = 'ai_tutor_internal';
const LAST_OPEN_KEY = 'ai_tutor_app_open_at';
const APP_OPEN_INTERVAL_MS = 30 * 60 * 1000;

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // 저장소를 못 쓰는 환경이면 건너뛴다
  }
}

export function track(name: string, props: Record<string, unknown> = {}) {
  try {
    const src = readLocal(SRC_KEY);
    const internal = readLocal(INTERNAL_KEY) === '1';
    fetch('/api/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-id': getDeviceId() },
      body: JSON.stringify({ name, props: { ...props, ...(src ? { src } : {}), internal } }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // 기록 실패는 사용자에게 보이지 않는다
  }
}

// 앱이 열릴 때 한 번 실행한다.
export function initAnalytics() {
  try {
    const url = new URL(window.location.href);
    const srcParam = url.searchParams.get('src');
    const internalParam = url.searchParams.get('internal');

    // 처음 꼬리표만 유지한다
    if (srcParam && !readLocal(SRC_KEY) && /^[a-z0-9_-]{1,24}$/.test(srcParam)) {
      writeLocal(SRC_KEY, srcParam);
    }
    if (internalParam === '1') writeLocal(INTERNAL_KEY, '1');
    else if (internalParam === '0') writeLocal(INTERNAL_KEY, null);

    // 주소를 복사해 전달해도 꼬리표가 따라가지 않게 두 파라미터만 지운다
    if (srcParam !== null || internalParam !== null) {
      url.searchParams.delete('src');
      url.searchParams.delete('internal');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }

    // app_open은 30분에 한 번만 보낸다
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(LAST_OPEN_KEY)) || 0;
    } catch {
      last = 0;
    }
    const now = Date.now();
    if (now - last >= APP_OPEN_INTERVAL_MS) {
      try {
        sessionStorage.setItem(LAST_OPEN_KEY, String(now));
      } catch {
        // 무시
      }
      track('app_open');
    }
  } catch {
    // 무시
  }
}
