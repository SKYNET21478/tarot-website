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
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  limit,
  serverTimestamp
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
const noticeSection = document.getElementById("notice-admin-section");
const noticeForm = document.getElementById("notice-form");
const noticeFormMode = document.getElementById("notice-form-mode");
const noticeTitle = document.getElementById("notice-title");
const noticeText = document.getElementById("notice-text");
const noticeVisible = document.getElementById("notice-visible");
const noticeSave = document.getElementById("notice-save");
const noticeCancel = document.getElementById("notice-cancel");
const noticeList = document.getElementById("notice-admin-list");
const noticeEmpty = document.getElementById("notice-admin-empty");
const noticeCount = document.getElementById("notice-admin-count");
const MAX_NOTICES = 50;
let editingNoticeId = null; // 고치는 중인 공지의 문서 ID. 새 공지를 쓸 때는 null 이에요.

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
  noticeSection.hidden = !visible;
}

function makeButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  if (className) button.className = className;
  button.addEventListener("click", onClick);
  return button;
}

async function runAction(button, message, action, reload = loadReviews) {
  button.disabled = true;
  setStatus(message);
  try {
    await action();
    setStatus("처리했어요.");
    await reload();
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

// ---------- 공지사항 관리 ----------

function resetNoticeForm() {
  editingNoticeId = null;
  noticeForm.reset();
  noticeVisible.checked = true;
  noticeFormMode.textContent = "새 공지를 써요.";
  noticeSave.textContent = "공지 저장";
  noticeCancel.hidden = true;
}

function startNoticeEdit(notice) {
  editingNoticeId = notice.id;
  noticeTitle.value = String(notice.title ?? "");
  noticeText.value = String(notice.text ?? "");
  noticeVisible.checked = notice.visible === true;
  noticeFormMode.textContent = "공지를 고치는 중이에요. 고친 뒤 '수정 저장'을 눌러요.";
  noticeSave.textContent = "수정 저장";
  noticeCancel.hidden = false;
  noticeTitle.focus();
  noticeForm.scrollIntoView({ block: "start" });
}

function renderNoticeRow(notice) {
  const item = document.createElement("li");
  item.className = "review";

  const head = document.createElement("div");
  head.className = "review-head";

  const badge = document.createElement("span");
  badge.className = notice.visible === true ? "notice-badge" : "notice-badge notice-badge-off";
  badge.textContent = notice.visible === true ? "공개" : "숨김";

  const titleEl = document.createElement("strong");
  titleEl.textContent = String(notice.title ?? "");

  const dateEl = document.createElement("span");
  dateEl.className = "muted";
  dateEl.textContent = formatDate(notice.createdAt);

  head.append(badge, titleEl, dateEl);

  const body = document.createElement("p");
  body.className = "review-text notice-preview";
  body.textContent = String(notice.text ?? "");

  const actions = document.createElement("div");
  actions.className = "admin-actions";
  const ref = doc(db, "notices", notice.id);

  actions.append(makeButton("수정", "", () => startNoticeEdit(notice)));
  actions.append(
    makeButton(notice.visible === true ? "숨기기" : "공개하기", "button-plain", (event) =>
      runAction(
        event.currentTarget,
        "바꾸는 중이에요.",
        () => updateDoc(ref, { visible: notice.visible !== true }),
        loadNotices
      )
    )
  );

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
    runAction(
      button,
      "삭제하는 중이에요.",
      async () => {
        await deleteDoc(ref);
        if (editingNoticeId === notice.id) resetNoticeForm();
      },
      loadNotices
    );
  });
  actions.append(deleteButton);

  item.append(head, body, actions);
  return item;
}

async function loadNotices() {
  try {
    const snapshot = await getDocs(query(collection(db, "notices"), limit(MAX_NOTICES)));
    const notices = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
    noticeList.replaceChildren(...notices.map(renderNoticeRow));
    noticeEmpty.hidden = notices.length > 0;
    noticeCount.textContent = "(" + notices.length + ")";
  } catch (error) {
    console.error(error);
    setStatus("공지를 불러오지 못했어요. 관리자 계정인지 확인해 주세요.", true);
  }
}

noticeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = noticeTitle.value.trim();
  const text = noticeText.value.replace(/\s+$/, "");
  const visible = noticeVisible.checked;

  if (title.length < 1 || title.length > 100) {
    setStatus("공지 제목을 1자에서 100자 사이로 써 주세요.", true);
    noticeTitle.focus();
    return;
  }
  if (text.length > 5000) {
    setStatus("공지 내용은 5000자까지 쓸 수 있어요.", true);
    noticeText.focus();
    return;
  }

  const editingId = editingNoticeId;
  await runAction(
    noticeSave,
    "공지를 저장하는 중이에요.",
    async () => {
      if (editingId) {
        await updateDoc(doc(db, "notices", editingId), { title, text, visible });
      } else {
        await addDoc(collection(db, "notices"), { title, text, visible, createdAt: serverTimestamp() });
      }
      resetNoticeForm();
    },
    loadNotices
  );
  noticeSave.disabled = false;
});

noticeCancel.addEventListener("click", () => {
  resetNoticeForm();
  setStatus("");
});

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
  // 후기를 먼저 불러와서 관리자 계정인지 확인하고, 맞을 때만 공지도 불러와요.
  loadReviews().then(() => {
    if (!noticeSection.hidden) loadNotices();
  });
});
