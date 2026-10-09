import React from 'react';

// 사진과 저작권 안내. 기본은 접혀 있고 한 줄 제목만 보인다.
// 본문은 현재 서버가 실제로 하는 일만 적는다. 근거는 docs/policy/copyright-and-data.md.
export const PhotoNotice: React.FC<{ className?: string }> = ({ className = '' }) => (
  <details className={`text-xs text-slate-600 ${className}`}>
    <summary className="flex min-h-11 cursor-pointer items-center justify-center underline underline-offset-2 hover:text-slate-900">
      사진과 저작권 안내
    </summary>
    <div className="space-y-1.5 rounded-lg bg-slate-50 p-3 text-left leading-relaxed">
      <p>이 앱은 내가 직접 가진 책·교재의 페이지로 혼자 연습하는 도구예요.</p>
      <ul className="list-disc space-y-1.5 pl-4">
        <li>올린 사진은 글자 인식과 문장 카드 생성을 위해 Google의 Gemini AI로 보내져요.</li>
        <li>
          사진 파일과 인식된 본문 텍스트는 내 서재를 위해 서버에 저장돼요. 자동으로 지워지는 기간은 아직 없고, 서재에서 교재를 삭제하면 그 교재의 사진과 텍스트가 서버에서 지워져요. 생성된 음성은 따로 저장되어 교재 삭제와 함께 지워지지 않을 수 있어요.
        </li>
        <li>저작권이 있는 책의 본문은 AI가 그대로 옮기지 못할 수 있어요. 그럴 땐 다른 페이지를 시도해 주세요.</li>
        <li>다른 사람에게 보여 주거나 내려받아 퍼뜨리는 용도로 쓰지 말아 주세요.</li>
      </ul>
    </div>
  </details>
);
