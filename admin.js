// 후기 관리 페이지: Google 로그인 뒤, 관리자 계정만 후기를 승인·숨김·삭제할 수 있어요.
// 누가 관리자인지는 이 파일이 아니라 Firebase 보안 규칙이 정해요. (이 화면을 고쳐도 권한은 안 생겨요)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-lite.js";
import { firebaseConfig } from "./firebase-config.js";

const MAX_LIST = 300;

const userEl = document.getElementById("admin-user");
const loginButton = document.getElementById("admin-login");
const logoutButton = document.getElementById("admin-logout");
const statusEl = document.getElementById("admin-status");
const pendingSection = document.getElementById("pending-section");
const pendingList = document.getElementById("pending-list");
const pendingEmpty = document.getElementById("pending-empty");
const pendingCount = document.getElementById("pending-count");
const approvedSection = document.getElementById("approved-section");
const approvedList = document.getElementById("approved-list");
const approvedEmpty = document.getElementById("approved-empty");
const approvedCount = document.getElementById("approved-count");

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

function setStatus(message, isError) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", Boolean(isError));
}

function stars(rating) {
  const safe = Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : 0;
  return "★".repeat(safe) + "☆".repeat(5 - safe);
}

function formatDate(value) {
  const date = value && typeof value.toDate === "function" ? value.toDate() : null;
  if (!date) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return (
    date.getFullYear() + ". " + (date.getMonth() + 1) + ". " + date.getDate() + ". " +
    pad(date.getHours()) + ":" + pad(date.getMinutes())
  );
}

function millis(value) {
  return value && typeof value.toMillis === "function" ? value.toMillis() : 0;
}

function showLists(visible) {
  pendingSection.hidden = !visible;
  approvedSection.hidden = !visible;
}

function makeButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  if (className) button.className = className;
  button.addEventListener("click", onClick);
  return button;
}

async function runAction(button, message, action) {
  button.disabled = true;
  setStatus(message);
  try {
    await action();
    setStatus("처리했어요.");
    await loadReviews();
  } catch (error) {
    console.error(error);
    setStatus("처리하지 못했어요. 관리자 계정인지 확인하고 다시 시도해 주세요.", true);
    button.disabled = false;
  }
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

  const nameEl = document.createElement("strong");
  nameEl.textContent = String(review.name ?? "");

  const dateEl = document.createElement("span");
  dateEl.className = "muted";
  dateEl.textContent = formatDate(review.createdAt);

  head.append(starEl, nameEl, dateEl);

  const body = document.createElement("p");
  body.className = "review-text";
  body.textContent = String(review.text ?? "");

  const actions = document.createElement("div");
  actions.className = "admin-actions";
  const ref = doc(db, "reviews", review.id);

  if (review.approved === true) {
    actions.append(
      makeButton("숨기기", "button-plain", (event) =>
        runAction(event.currentTarget, "숨기는 중이에요.", () => updateDoc(ref, { approved: false }))
      )
    );
  } else {
    actions.append(
      makeButton("승인", "", (event) =>
        runAction(event.currentTarget, "승인하는 중이에요.", () => updateDoc(ref, { approved: true }))
      )
    );
  }

  // 삭제는 되돌릴 수 없어서 두 번 눌러야 지워져요.
  const deleteButton = makeButton("삭제", "button-danger", (event) => {
    const button = event.currentTarget;
    if (button.dataset.armed !== "yes") {
      button.dataset.armed = "yes";
      button.textContent = "정말 삭제 (다시 누르기)";
      setTimeout(() => {
        if (button.isConnected && !button.disabled) {
          button.dataset.armed = "";
          button.textContent = "삭제";
        }
      }, 4000);
      return;
    }
    runAction(button, "삭제하는 중이에요.", () => deleteDoc(ref));
  });
  actions.append(deleteButton);

  item.append(head, body, actions);
  return item;
}

async function loadReviews() {
  try {
    const snapshot = await getDocs(query(collection(db, "reviews"), limit(MAX_LIST)));
    const reviews = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => millis(b.createdAt) - millis(a.createdAt));

    const pending = reviews.filter((r) => r.approved !== true);
    const approved = reviews.filter((r) => r.approved === true);

    pendingList.replaceChildren(...pending.map(renderReview));
    approvedList.replaceChildren(...approved.map(renderReview));
    pendingEmpty.hidden = pending.length > 0;
    approvedEmpty.hidden = approved.length > 0;
    pendingCount.textContent = "(" + pending.length + ")";
    approvedCount.textContent = "(" + approved.length + ")";
    showLists(true);
  } catch (error) {
    console.error(error);
    showLists(false);
    setStatus("이 계정은 관리자 계정이 아니에요. 관리자 계정으로 다시 로그인해 주세요.", true);
  }
}

loginButton.addEventListener("click", async () => {
  setStatus("");
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (error) {
    console.error(error);
    if (error && error.code === "auth/popup-closed-by-user") return;
    setStatus("로그인하지 못했어요. 팝업 차단을 풀고 다시 시도해 주세요.", true);
  }
});

logoutButton.addEventListener("click", async () => {
  await signOut(auth);
  setStatus("");
});

onAuthStateChanged(auth, (user) => {
  if (!user) {
    userEl.textContent = "로그인하지 않았어요.";
    loginButton.hidden = false;
    logoutButton.hidden = true;
    showLists(false);
    return;
  }
  userEl.textContent = (user.email || "이름 없는 계정") + " 계정으로 로그인했어요.";
  loginButton.hidden = true;
  logoutButton.hidden = false;
  setStatus("");
  loadReviews();
});
