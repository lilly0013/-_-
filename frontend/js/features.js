// =============================================================
// 골목버림 - 새 기능 (지킴이 순번제, 고장 예측, 무단투기 감지,
// 이탈 방지, 기능 설정). api.js 다음에 불러옵니다.
// 지금은 모두 가짜 데이터이며, 나중에 백엔드 API로 바꿉니다.
// =============================================================

// ---------- 기능 켜고 끄기 (브라우저에 저장) ----------
const FEATURE_LIST = [
  { key: "eveningAlert", name: "저녁 7시 배출 알림", desc: "배출일 저녁 7시에 오늘 버릴 수 있는 것과 모음터 여유를 알려줘요" },
  { key: "guardian", name: "골목 지킴이 순번제", desc: "모음터 정리 당번을 알려주고, 인증하면 포인트를 드려요" },
  { key: "dumping", name: "무단투기 감지", desc: "모음터 카메라가 방치된 봉투를 찾아 알려줘요 (얼굴은 가려서 처리)" },
  { key: "fault", name: "장비 고장 예측", desc: "센서 값이 이상하면 고장을 의심하고 수리를 요청해요" },
  { key: "retention", name: "참여 리마인드·연속 참여 보상", desc: "집 앞 배출이 늘면 골목에 알리고, 3개월 연속 참여 세대에 보상해요" }
];

function getFeatures() {
  const defaults = Object.fromEntries(FEATURE_LIST.map(f => [f.key, true]));
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem("golmok_features") || "{}") };
  } catch (e) {
    return defaults;
  }
}

function setFeature(key, on) {
  const f = getFeatures();
  f[key] = on;
  try { localStorage.setItem("golmok_features", JSON.stringify(f)); } catch (e) {}
}

// ---------- 내 정보와 포인트 ----------
const ME = { unit: "201호", buildingIndex: 1, points: 2400 };

function getPoints() {
  try { return Number(localStorage.getItem("golmok_points")) || ME.points; } catch (e) { return ME.points; }
}
function addPoints(n) {
  const p = getPoints() + n;
  try { localStorage.setItem("golmok_points", String(p)); } catch (e) {}
  return p;
}

// ---------- 골목 지킴이 순번제 ----------
// 빌라 이름은 api.js의 MOCK.cluster.buildings 에서 가져옵니다.
function getGuardianRoster() {
  const buildings = MOCK.cluster.buildings;
  const units = ["101호", "201호", "102호", "301호", "202호", "302호"];
  const start = new Date("2026-11-09");
  const roster = [];
  for (let i = 0; i < 8; i++) {
    const from = new Date(start.getTime() + i * 7 * 86400000);
    const to = new Date(from.getTime() + 6 * 86400000);
    roster.push({
      week: `${from.getMonth() + 1}/${from.getDate()} ~ ${to.getMonth() + 1}/${to.getDate()}`,
      house: `${buildings[i % buildings.length].name} ${units[i % units.length]}`,
      isMe: i === 3
    });
  }
  return { roster, currentIndex: 0, myIndex: 3 };
}

function getMyDutyInfo() {
  const g = getGuardianRoster();
  const left = g.myIndex - g.currentIndex;
  return { left, week: g.roster[g.myIndex].week, house: g.roster[g.myIndex].house };
}

const GUARDIAN_REWARD = 300;

// ---------- 저녁 7시 알림 문구 ----------
async function buildEveningMessage() {
  const schedule = await getTodaySchedule();
  const stations = await getStations();
  const okTypes = schedule.items.filter(i => i.ok).map(i => i.type);
  const foodBins = stations.flatMap(s => s.bins).filter(b => b.type === "음식물");
  const freeAvg = Math.round(100 - foodBins.reduce((a, b) => a + b.fill, 0) / foodBins.length);
  if (okTypes.length === 0) return "오늘은 배출일이 아니에요. 집 안에 보관해 주세요.";
  return `오늘 ${okTypes.join("·")} 배출일이에요. 모음터 음식물통 여유 ${freeAvg}%.`;
}

// ---------- 장비 고장 예측 ----------
// 시간별 센서 기록: 문 열린 횟수(doorOpens), 통 무게(kg)
const SENSOR_LOGS = {
  11: [ [3, 21.0], [4, 22.1], [2, 22.8], [5, 24.2], [4, 25.3], [3, 26.1], [6, 27.9], [4, 29.0] ],
  12: [ [2, 8.0], [1, 8.3], [3, 9.1], [2, 9.6], [2, 10.0], [1, 10.2], [3, 11.0], [2, 11.5] ],
  13: [ [1, 6.0], [2, 6.6], [1, 6.9], [2, 7.4], [1, 7.6], [2, 8.1], [1, 8.3], [2, 8.9] ],
  // 문은 계속 열리는데 무게가 그대로 → 저울 고장 의심
  21: [ [3, 14.0], [4, 15.2], [3, 15.3], [4, 15.3], [5, 15.3], [4, 15.3], [3, 15.3], [4, 15.3] ],
  22: [ [3, 18.0], [2, 19.1], [4, 20.6], [3, 21.7], [2, 22.5], [3, 23.4], [4, 24.6], [3, 25.4] ],
  23: [ [2, 10.0], [1, 10.4], [2, 11.0], [1, 11.3], [2, 11.9], [2, 12.4], [1, 12.6], [2, 13.1] ],
  31: [ [1, 4.0], [2, 4.6], [1, 4.8], [1, 5.1], [2, 5.7], [1, 5.9], [1, 6.2], [2, 6.8] ],
  32: [ [1, 3.0], [1, 3.3], [2, 3.9], [1, 4.1], [1, 4.4], [2, 4.9], [1, 5.1], [1, 5.4] ],
  // 한 시간 만에 무게가 갑자기 튐 → 센서 오류 의심
  33: [ [2, 9.0], [1, 9.4], [2, 9.9], [1, 41.7], [2, 10.6], [1, 10.9], [2, 11.4], [1, 11.8] ]
};

// 판단 규칙 (팀원 1이 나중에 AI 모델로 바꿀 수 있는 자리)
function detectFault(binId) {
  const log = SENSOR_LOGS[binId];
  if (!log) return { status: "unknown" };

  for (let i = 1; i < log.length; i++) {
    const jump = Math.abs(log[i][1] - log[i - 1][1]);
    if (jump > 15) {
      return { status: "suspect", reason: `무게 값이 한 시간 만에 ${jump.toFixed(1)}kg 튀었어요`, type: "spike" };
    }
  }

  const recent = log.slice(-4);
  const opens = recent.reduce((a, r) => a + r[0], 0);
  const change = recent[recent.length - 1][1] - recent[0][1];
  if (opens >= 10 && change < 0.3) {
    return { status: "suspect", reason: `최근 4시간 동안 문이 ${opens}번 열렸는데 무게 변화가 없어요`, type: "stuck" };
  }
  return { status: "normal" };
}

// ---------- 무단투기 감지 ----------
const DUMPING_EVENTS = [
  { id: 1, stationId: 1, time: "2026-11-11T07:42", what: "모음터 옆 바닥에 종량제 봉투가 아닌 비닐봉투 2개", status: "new" },
  { id: 2, stationId: 3, time: "2026-11-10T23:15", what: "재활용통 앞에 상자와 스티로폼 방치", status: "new" },
  { id: 3, stationId: 2, time: "2026-11-09T21:03", what: "음식물통 위에 봉투째 올려둠", status: "done" }
];

// ---------- 이탈 방지 ----------
// 골목 카메라가 감지한 '집 앞 배출' 건수 (주별)
const DOORSTEP_WEEKLY = [
  { week: "9/29", count: 15 }, { week: "10/6", count: 9 }, { week: "10/13", count: 6 },
  { week: "10/20", count: 4 }, { week: "10/27", count: 3 }, { week: "11/3", count: 5 },
  { week: "11/10", count: 9 }
];

function checkDoorstepTrend() {
  const c = DOORSTEP_WEEKLY.map(w => w.count);
  const n = c.length;
  const rising = c[n - 1] > c[n - 2] && c[n - 2] > c[n - 3];
  return { rising, latest: c[n - 1], lowest: Math.min(...c) };
}

const MY_PARTICIPATION = [
  { month: "9월", ok: true },
  { month: "10월", ok: true },
  { month: "11월", ok: null } // 진행 중
];
const STREAK_REWARD = 1000;
