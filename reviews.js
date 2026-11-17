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
const noticeLatest = document.getElementById("notice-latest");
const MAX_NOTICES = 10;

// 등록을 막는 표현들이에요. (욕설, 선정적인 말, 도박·대출 같은 광고, 링크)
// 같은 목록이 Firebase 보안 규칙(firestore.rules)에도 들어 있어서, 이 화면을 거치지 않고 보내도 막혀요.
// 목록을 고칠 때는 두 곳을 함께 고쳐요.
const BLOCKED_WORDS = [
  "시발", "씨발", "씨바", "씨팔", "ㅅㅂ", "ㅆㅂ", "병신", "ㅂㅅ", "지랄", "ㅈㄹ", "좆", "존나", "ㅈㄴ",
  "개새", "새끼", "ㅅㄲ", "썅", "쌍년", "쌍놈", "미친놈", "미친년", "염병", "엿먹", "닥쳐", "꺼져",
  "느금", "니애미", "창녀",
  "섹스", "야동", "포르노", "자위", "성인용품", "성인사이트", "성인방송", "조건만남", "원나잇",
  "카지노", "바카라", "토토", "도박", "대출",
  "fuck", "shit", "bitch", "asshole", "porn", "sex", "casino"
];
const LINK_PATTERN = /https?:\/\/|www\./i;

// 띄어쓰기나 기호를 사이에 끼워 넣어 피하는 것을 막으려고, 글자만 남겨서 비교해요.
function hasBlockedWord(value) {
  const raw = String(value).toLowerCase();
  if (LINK_PATTERN.test(raw)) return true;
  const compact = raw.replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ]/g, "");
  return BLOCKED_WORDS.some((word) => compact.includes(word));
}

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

// 후기게시판에는 가장 최근 공지의 제목 한 줄만 보여 주고, 누르면 공지사항 페이지로 가요.
// 공지는 Firebase 의 "notices" 컬렉션에서 visible=true 인 글만 가져와요.
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

    if (notices.length) {
      const date = formatDate(notices[0].createdAt);
      noticeLatest.textContent = notices[0].title + (date ? "  (" + date + ")" : "");
    }
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
  if (hasBlockedWord(name) || hasBlockedWord(text)) {
    setStatus("욕설, 선정적인 표현, 광고나 링크는 등록할 수 없어요. 내용을 고쳐서 다시 등록해 주세요.", true);
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
    if (error && error.code === "permission-denied") {
      setStatus("등록할 수 없는 표현이 들어 있어요. 내용을 고쳐서 다시 등록해 주세요.", true);
    } else {
      setStatus("후기를 등록하지 못했어요. 잠시 뒤에 다시 시도해 주세요.", true);
    }
  } finally {
    submitButton.disabled = false;
  }
});

loadNotices();
loadReviews();
