// 후기 게시판: 글은 Firebase Firestore 의 "reviews" 컬렉션에 저장돼요.
// 새 글은 approved=false 로 저장되고, Firebase 콘솔에서 approved 를 true 로 바꾼 글만 목록에 보여요.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  limit,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-lite.js";
import { firebaseConfig } from "./firebase-config.js";

const MAX_LIST = 100;
const MIN_TEXT = 5;
const MAX_TEXT = 500;
const MAX_NAME = 20;
const WAIT_MS = 60 * 1000; // 같은 브라우저에서 연달아 등록하는 것을 막아요.
const LAST_KEY = "tarot-review-last";

const form = document.getElementById("review-form");
const nameInput = document.getElementById("review-name");
const ratingInput = document.getElementById("review-rating");
const textInput = document.getElementById("review-text");
const trapInput = document.getElementById("review-website");
const submitButton = document.getElementById("review-submit");
const statusEl = document.getElementById("review-status");
const countEl = document.getElementById("review-count");
const listEl = document.getElementById("review-list");
const emptyEl = document.getElementById("review-empty");
const summaryEl = document.getElementById("review-summary");
const noticeSection = document.getElementById("notice-section");
const noticeList = document.getElementById("notice-list");
const MAX_NOTICES = 10;

const configured = Boolean(firebaseConfig.projectId && firebaseConfig.apiKey);
const db = configured ? getFirestore(initializeApp(firebaseConfig)) : null;

function setStatus(message, isError) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", Boolean(isError));
}

function stars(rating) {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

function formatDate(value) {
  const date = value && typeof value.toDate === "function" ? value.toDate() : null;
  if (!date) return "";
  return date.getFullYear() + ". " + (date.getMonth() + 1) + ". " + date.getDate() + ".";
}

function millis(value) {
  return value && typeof value.toMillis === "function" ? value.toMillis() : 0;
}

// 글 내용은 textContent 로만 넣어서, 태그가 들어 있어도 글자로만 보여요.
function renderReview(review) {
  const item = document.createElement("li");
  item.className = "review";

  const head = document.createElement("div");
  head.className = "review-head";

  const starEl = document.createElement("span");
  starEl.className = "review-stars";
  starEl.textContent = stars(review.rating);
  starEl.setAttribute("aria-label", "별점 " + review.rating + "점");

  const nameEl = document.createElement("strong");
  nameEl.textContent = review.name;

  const dateEl = document.createElement("span");
  dateEl.className = "muted";
  dateEl.textContent = formatDate(review.createdAt);

  head.append(starEl, nameEl, dateEl);

  const body = document.createElement("p");
  body.className = "review-text";
  body.textContent = review.text;

  item.append(head, body);
  return item;
}

async function loadReviews() {
  if (!db) {
    emptyEl.textContent = "후기 게시판을 준비하고 있어요.";
    return;
  }
  try {
    const snapshot = await getDocs(
      query(collection(db, "reviews"), where("approved", "==", true), limit(MAX_LIST))
    );
    const reviews = snapshot.docs
      .map((doc) => doc.data())
      .filter((r) => typeof r.text === "string" && typeof r.name === "string" && Number.isInteger(r.rating))
      .sort((a, b) => millis(b.createdAt) - millis(a.createdAt));

    listEl.replaceChildren(...reviews.map(renderReview));

    if (reviews.length === 0) {
      emptyEl.hidden = false;
      emptyEl.textContent = "아직 후기가 없어요. 첫 후기를 남겨 주세요.";
      summaryEl.textContent = "";
      return;
    }
    emptyEl.hidden = true;
    const average = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    summaryEl.textContent = "후기 " + reviews.length + "개 · 평균 별점 " + average.toFixed(1) + "점";
  } catch (error) {
    console.error(error);
    emptyEl.hidden = false;
    emptyEl.textContent = "후기를 불러오지 못했어요. 잠시 뒤에 다시 열어 주세요.";
  }
}

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

// 공지는 Firebase 콘솔의 "notices" 컬렉션에서 visible=true 인 글만 가져와요. 최신 글이 위에 와요.
async function loadNotices() {
  if (!db) return;
  try {
    const snapshot = await getDocs(
      query(collection(db, "notices"), where("visible", "==", true), limit(MAX_NOTICES))
    );
    const notices = snapshot.docs
      .map((doc) => doc.data())
      .filter((n) => typeof n.title === "string" && n.title)
      .sort((a, b) => millis(b.createdAt) - millis(a.createdAt));

    noticeList.replaceChildren(...notices.map(renderNotice));
    noticeSection.hidden = notices.length === 0;
  } catch (error) {
    // 공지를 못 불러와도 후기 기능은 그대로 쓸 수 있게 조용히 넘어가요.
    console.error(error);
    noticeSection.hidden = true;
  }
}

function recentlyPosted() {
  try {
    const last = Number(localStorage.getItem(LAST_KEY) || 0);
    return Date.now() - last < WAIT_MS;
  } catch (error) {
    return false;
  }
}

function rememberPost() {
  try {
    localStorage.setItem(LAST_KEY, String(Date.now()));
  } catch (error) {
    // 저장소를 쓸 수 없는 브라우저에서는 그냥 넘어가요.
  }
}

textInput.addEventListener("input", () => {
  countEl.textContent = String(textInput.value.length);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = nameInput.value.trim();
  const text = textInput.value.trim();
  const rating = Number(ratingInput.value);

  if (!db) {
    setStatus("후기 게시판을 준비하고 있어요. 조금만 기다려 주세요.", true);
    return;
  }
  if (trapInput.value) {
    // 자동 등록 프로그램으로 보고 조용히 끝내요.
    setStatus("후기가 접수됐어요. 확인 뒤 공개돼요.");
    form.reset();
    return;
  }
  if (name.length < 1 || name.length > MAX_NAME) {
    setStatus("닉네임을 1자에서 " + MAX_NAME + "자 사이로 써 주세요.", true);
    nameInput.focus();
    return;
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    setStatus("별점을 골라 주세요.", true);
    ratingInput.focus();
    return;
  }
  if (text.length < MIN_TEXT || text.length > MAX_TEXT) {
    setStatus("내용을 " + MIN_TEXT + "자에서 " + MAX_TEXT + "자 사이로 써 주세요.", true);
    textInput.focus();
    return;
  }
  if (recentlyPosted()) {
    setStatus("방금 후기를 남기셨어요. 1분 뒤에 다시 등록해 주세요.", true);
    return;
  }

  submitButton.disabled = true;
  setStatus("등록하는 중이에요.");
  try {
    await addDoc(collection(db, "reviews"), {
      name,
      rating,
      text,
      approved: false,
      createdAt: serverTimestamp()
    });
    rememberPost();
    form.reset();
    countEl.textContent = "0";
    setStatus("후기가 접수됐어요. 확인 뒤 이 페이지에 공개돼요. 고맙습니다.");
  } catch (error) {
    console.error(error);
    setStatus("후기를 등록하지 못했어요. 잠시 뒤에 다시 시도해 주세요.", true);
  } finally {
    submitButton.disabled = false;
  }
});

loadNotices();
loadReviews();
