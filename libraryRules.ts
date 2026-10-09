// 서재(library.json) 규칙을 모아 둔 순수 함수들. server.ts에서 쓰고, 파일 입출력은 하지 않는다.
// - 서재 항목은 (교재 키, ownerId) 한 쌍마다 하나. 같은 사진(같은 키)을 여러 사람이 올리면 사람마다 항목이 생긴다.
// - 서재 개수 제한은 없다. 어떤 항목도 개수 때문에 빠지지 않는다(늘어나는 속도는 하루 사진 분석 한도가 막는다).

export type LibraryRow = { key: string; ownerId?: string; [field: string]: any };

// 호출한 사람의 항목만 갈아 끼운다: 그 사람의 같은 키 항목만 지우고 새 항목을 맨 앞(최신순)에 넣는다.
export function upsertOwnerRow<T extends LibraryRow>(lib: T[], row: T): T[] {
  const rest = lib.filter((item) => !(item.key === row.key && item.ownerId === row.ownerId));
  return [row, ...rest];
}

// 교재 열람 권한: 그 키의 항목 중 하나라도 호출한 사람 것이면 허용.
// 호출한 사람 항목이 없고 다른 사람 항목만 있으면 거부. 항목이 없거나 ownerId 없는 옛 항목뿐이면 예전처럼 허용.
export function canAccessLesson(lib: LibraryRow[], key: string, callerOwnerId: string): boolean {
  const rows = lib.filter((item) => item.key === key);
  if (rows.some((item) => item.ownerId === callerOwnerId)) return true;
  return !rows.some((item) => item.ownerId && item.ownerId !== callerOwnerId);
}

export type DeletePlan<T> =
  | { allowed: false }
  | { allowed: true; nextLib: T[]; removeFolder: boolean };

// 서재에서 지우기: 호출한 사람의 항목만 뺀다. 그 키를 가리키는 항목이 하나도 안 남을 때만 디스크 폴더를 지운다.
// 호출한 사람 항목이 없고 다른 사람 항목이 있으면 거부. 항목이 없거나 ownerId 없는 옛 항목뿐이면 예전처럼 모두 지운다.
export function planLessonDelete<T extends LibraryRow>(lib: T[], key: string, callerOwnerId: string): DeletePlan<T> {
  const rows = lib.filter((item) => item.key === key);
  const hasOwn = rows.some((item) => item.ownerId === callerOwnerId);
  const hasOthers = rows.some((item) => item.ownerId && item.ownerId !== callerOwnerId);
  if (!hasOwn && hasOthers) return { allowed: false };

  const nextLib = hasOwn
    ? lib.filter((item) => !(item.key === key && item.ownerId === callerOwnerId))
    : lib.filter((item) => item.key !== key);
  const removeFolder = !nextLib.some((item) => item.key === key);
  return { allowed: true, nextLib, removeFolder };
}
