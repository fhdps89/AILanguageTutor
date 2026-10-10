import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';
import { initAnalytics } from './utils/analytics';
import { syncDeviceId } from './utils/audio';

// 기기 번호를 서버 쿠키와 먼저 맞춘 뒤(최대 2초) 기록과 화면을 시작한다
syncDeviceId().finally(() => {
  initAnalytics();
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
