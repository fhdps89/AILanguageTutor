// 서재(library.json) 규칙을 모아 둔 순수 함수들. server.ts에서 쓰고, 파일 입출력은 하지 않는다.
// - 서재 항목은 (교재 키, ownerId) 한 쌍마다 하나. 같은 사진(같은 키)을 여러 사람이 올리면 사람마다 항목이 생긴다.
// - 50개 제한은 사용자(ownerId)별로 건다. 다른 사람의 항목은 절대 빼지 않는다.
// - ownerId가 없는 옛 항목과 예시 수업 항목은 제한에서 제외하고 그대로 둔다.

export const LIBRARY_MAX_PER_OWNER = 50;
export const DEMO_LESSON_KEYS = ['demo-arc', 'demo-chinese'];

export type LibraryRow = { key: string; ownerId?: string; [field: string]: any };

// 사용자별로 앞에서부터(최신순) 최대 max개만 남긴다. ownerId 없는 항목·예시 수업은 그대로 둔다.
export function capLibraryPerOwner<T extends LibraryRow>(lib: T[], max = LIBRARY_MAX_PER_OWNER): T[] {
  const counts = new Map<string, number>();
  return lib.filter((item) => {
    if (!item || !item.ownerId || DEMO_LESSON_KEYS.includes(item.key)) return true;
    const n = (counts.get(item.ownerId) || 0) + 1;
    counts.set(item.ownerId, n);
    return n <= max;
  });
}

// 호출한 사람의 항목만 갈아 끼운다: 그 사람의 같은 키 항목만 지우고 새 항목을 맨 앞에 넣은 뒤 사용자별 제한을 건다.
export function upsertOwnerRow<T extends LibraryRow>(lib: T[], row: T, max = LIBRARY_MAX_PER_OWNER): T[] {
  const rest = lib.filter((item) => !(item.key === row.key && item.ownerId === row.ownerId));
  return capLibraryPerOwner([row, ...rest], max);
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
