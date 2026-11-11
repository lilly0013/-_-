// =============================================================
// 모든 화면에 공통으로 들어가는 윗부분:
// 앱 이름, 탭(파란 밑줄), 내 당번 안내, 저녁 7시 공지, 알림 토스트
// 각 HTML의 <body data-tab="home"> 값으로 현재 탭을 표시합니다.
// =============================================================

const TABS = [
  { key: "home", name: "홈", href: "index.html" },
  { key: "scan", name: "사진 분리배출", href: "scan.html" },
  { key: "fill", name: "적재량", href: "dashboard.html" },
  { key: "alley", name: "골목단지", href: "join.html" }
];

function showToast(title, body) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    t.setAttribute("role", "status");
    document.body.appendChild(t);
  }
  t.innerHTML = `<div class="t-title">${title}</div><div class="t-body">${body}</div>`;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 5000);
}

function sendEveningAlert(message) {
  showToast("골목버림 · 저녁 7시 알림", message);
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("골목버림", { body: message });
    }
  } catch (e) {}
}

// 페이지를 켜 둔 상태로 저녁 7시가 되면 알림을 띄웁니다.
function scheduleEveningAlert(message) {
  const now = new Date();
  const seven = new Date(now);
  seven.setHours(19, 0, 0, 0);
  const wait = seven - now;
  if (wait > 0) setTimeout(() => sendEveningAlert(message), wait);
}

async function renderShell() {
  const active = document.body.dataset.tab;
  const features = getFeatures();
  const shell = document.createElement("div");

  const tabs = TABS.map(t =>
    `<a href="${t.href}" class="${t.key === active ? "active" : ""}"${t.key === active ? ' aria-current="page"' : ""}>${t.name}</a>`
  ).join("");

  let duty = "";
  if (features.guardian) {
    const d = getMyDutyInfo();
    duty = `
      <div class="strip duty">
        <div class="strip-row">
          <span>내 지킴이 당번까지 <strong>${d.left}번</strong> 남았어요 · ${d.week}</span>
          <a class="link" href="join.html#guardian">순번 보기</a>
        </div>
      </div>`;
  }

  let notice = "";
  if (features.eveningAlert) {
    const msg = await buildEveningMessage();
    const after7 = new Date().getHours() >= 19;
    notice = `
      <div class="strip">
        <div class="strip-row">
          <span>${after7 ? "<strong>저녁 7시 알림</strong> " : "<strong>오늘 저녁 7시</strong>에 알려드려요 · "}${msg}</span>
          <a class="link" href="#" id="previewAlert">미리 보기</a>
        </div>
      </div>`;
    scheduleEveningAlert(msg);
  }

  shell.innerHTML = `
    <div class="appbar"><span class="brand">골목버림</span><span class="place">${MOCK.cluster.name}</span></div>
    <nav class="tabs" aria-label="주요 메뉴">${tabs}</nav>
    ${duty}
    ${notice}`;
  document.body.prepend(shell);

  const preview = document.getElementById("previewAlert");
  if (preview) {
    preview.onclick = async e => {
      e.preventDefault();
      try {
        if ("Notification" in window && Notification.permission === "default") {
          await Notification.requestPermission();
        }
      } catch (err) {}
      sendEveningAlert(await buildEveningMessage());
    };
  }
}

renderShell();
