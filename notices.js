// 공지사항 페이지: Firebase Firestore 의 "notices" 컬렉션에서 visible=true 인 글만 최신순으로 보여 줘요.
// 공지는 관리자 페이지(admin.html)에서 쓰고 고쳐요. 고치면 이 페이지에 바로 반영돼요(GitHub 에 다시 올릴 필요 없음).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-lite.js";
import { firebaseConfig } from "./firebase-config.js";

const MAX_NOTICES = 50;
const listEl = document.getElementById("notice-list");
const emptyEl = document.getElementById("notice-empty");

const configured = Boolean(firebaseConfig.projectId && firebaseConfig.apiKey);
const db = configured ? getFirestore(initializeApp(firebaseConfig)) : null;

function formatDate(value) {
  const date = value && typeof value.toDate === "function" ? value.toDate() : null;
  if (!date) return "";
  return date.getFullYear() + ". " + (date.getMonth() + 1) + ". " + date.getDate() + ".";
}

function millis(value) {
  return value && typeof value.toMillis === "function" ? value.toMillis() : 0;
}

// 글은 textContent 로만 넣어서, 태그가 들어 있어도 글자로만 보여요.
function renderNotice(notice) {
  const item = document.createElement("li");
  item.className = "notice";

  const head = document.createElement("div");
  head.className = "review-head";

  const badge = document.createElement("span");
  badge.className = "notice-badge";
  badge.textContent = "공지";

  const titleEl = document.createElement("strong");
  titleEl.textContent = notice.title;

  const dateEl = document.createElement("span");
  dateEl.className = "muted";
  dateEl.textContent = formatDate(notice.createdAt);

  head.append(badge, titleEl, dateEl);
  item.append(head);

  if (typeof notice.text === "string" && notice.text) {
    const body = document.createElement("p");
    body.className = "review-text";
    body.textContent = notice.text;
    item.append(body);
  }
  return item;
}

async function loadNotices() {
  if (!db) {
    emptyEl.textContent = "공지를 불러올 수 없어요.";
    return;
  }
  try {
    const snapshot = await getDocs(
      query(collection(db, "notices"), where("visible", "==", true), limit(MAX_NOTICES))
    );
    const notices = snapshot.docs
      .map((doc) => doc.data())
      .filter((n) => typeof n.title === "string" && n.title)
      .sort((a, b) => millis(b.createdAt) - millis(a.createdAt));

    listEl.replaceChildren(...notices.map(renderNotice));
    emptyEl.hidden = notices.length > 0;
    if (!notices.length) emptyEl.textContent = "아직 공지가 없어요.";
  } catch (error) {
    console.error(error);
    emptyEl.hidden = false;
    emptyEl.textContent = "공지를 불러오지 못했어요. 잠시 뒤에 다시 열어 주세요.";
  }
}

loadNotices();
