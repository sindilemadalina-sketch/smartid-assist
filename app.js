import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import {
  getFirestore, collection, getDocs, addDoc, getDoc, setDoc, deleteDoc,
  updateDoc, doc, increment, serverTimestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { INITIAL_STORES } from "./stores-seed.js";
import { EQUIPMENT } from "./equipment-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const el = id => document.getElementById(id);

let currentRole = "";
let currentCategory = "";
let currentEmail = "";
let currentStoreId = "";
let currentStoreName = "";
let currentStoreFormat = "";
let selectedEquipment = "";
let selectedEquipmentLabel = "";
let selectedMaterialType = "";
let materials = [];
let storesCache = [];
let currentOpenMaterial = null;
let editingMaterialId = null;
let currentCanAdd = false;
let currentCanManage = false;
let currentCanDelete = false;
let currentCanAddStores = false;
let currentCanAddEquipment = false;

const PRIMARY_ADMIN_EMAIL = "admin@smartid.com";
const ADMIN_ACCESS_CODES = {
  carrefour: "9999",
  franciza: "9998"
};

function updateAdminAccessCode() {
  if (!el("adminAccessCode")) return;
  if (currentRole !== "admin") {
    el("adminAccessCode").classList.add("hidden");
    return;
  }
  const category = currentCategory === "franciza" ? "franciza" : "carrefour";
  updateAdminAccessCode();
  el("adminAccessCode").textContent =
    `Acces Admin ${category === "franciza" ? "Franciză" : "Carrefour"} · Cod ${ADMIN_ACCESS_CODES[category]}`;
  el("adminAccessCode").classList.remove("hidden");
}

const LIMITED_TEAM_MEMBERS = new Set(["Robert Neagu", "Dan Oros"]);

function teamPermissionPreset(displayName) {
  const limited = LIMITED_TEAM_MEMBERS.has(displayName);
  return {
    canAdd: !limited,
    canDelete: !limited,
    canAddStores: true,
    canAddEquipment: true,
    canApprove: false
  };
}



const TEAM_DISPLAY_NAMES = [
  "Nistor Ionut",
  "Apetrei Andrei",
  "Robert Neagu",
  "Andreea Ianos",
  "Dan Oros",
  "Valentin Surugiu"
];
let usersNameMap = new Map();

async function loadUserNameMap() {
  try {
    const snap = await getDocs(collection(db, "users"));
    usersNameMap = new Map(snap.docs.map(d => {
      const data=d.data();
      return [d.id.toLowerCase(), data.displayName || d.id];
    }));
  } catch { usersNameMap = new Map(); }
}
function displayUser(email) {
  const key=String(email||"").toLowerCase();
  if (key === PRIMARY_ADMIN_EMAIL) return "Admin principal";
  return usersNameMap.get(key) || email || "Necunoscut";
}

const isPrimaryAdmin = () => currentEmail.toLowerCase() === PRIMARY_ADMIN_EMAIL;

async function logTeamActivity(action, material = null, extra = {}) {
  try {
    await addDoc(collection(db, "teamActivity"), {
      email: currentEmail, action,
      materialId: material?.id || extra.materialId || "",
      title: material?.title || extra.title || "",
      type: material?.type || extra.type || "",
      createdAt: serverTimestamp(), ...extra
    });
  } catch (error) { console.warn("Activitatea echipei nu a putut fi înregistrată.", error); }
}


const normRole = value => String(value || "").trim().toLowerCase();
const normCategory = value => {
  const v = String(value || "").trim().toLowerCase();
  return v === "franchise" ? "franciza" : v;
};
const normType = value => {
  const v = String(value || "").trim().toLowerCase();
  if (v === "video") return "videoclip";
  if (v === "procedure") return "procedura";
  return v;
};
const escapeHtml = value => String(value || "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

function showPage(id) {
  document.querySelectorAll(".page").forEach(page => page.classList.add("hidden"));
  el(id).classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function ensureStores() {
  try {
    const markerRef = doc(db, "system", "storesSeedV3");
    const marker = await getDoc(markerRef);
    if (marker.exists()) return;

    for (const store of INITIAL_STORES) {
      await setDoc(doc(db, "stores", store.id), store, { merge: true });
    }

    await setDoc(markerRef, {
      imported: true,
      count: INITIAL_STORES.length,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.warn("Lista de magazine nu a putut fi importată automat.", error);
  }
}

async function loadMaterials() {
  try {
    const snap = await getDocs(collection(db, "videos"));
    materials = snap.docs.map(item => {
      const data = item.data();
      const categories = Array.isArray(data.categories)
        ? data.categories.map(normCategory)
        : [normCategory(data.category)].filter(Boolean);
      const equipment = Array.isArray(data.equipment)
        ? data.equipment
        : data.equipment ? [data.equipment] : [];

      return {
        id: item.id,
        ...data,
        type: normType(data.type),
        categories,
        equipment
      };
    });
  } catch (error) {
    console.warn("Materialele nu au putut fi încărcate.", error);
    materials = [];
  }
}

function materialAllowed(material) {
  const status = material.status || "approved";
  if (currentRole === "admin" || currentRole === "suport") return true;
  return status === "approved" && material.categories.includes(currentCategory);
}

async function recordSession() {
  try {
    await addDoc(collection(db, "sessions"), {
      email: currentEmail,
      role: currentRole,
      category: currentCategory,
      storeId: currentStoreId,
      storeName: currentStoreName,
      storeFormat: currentStoreFormat,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.warn("Sesiunea nu a putut fi înregistrată.", error);
  }
}

async function finishLogin() {
  await ensureStores();
  await loadMaterials();
  await recordSession();

  el("loginPage").style.display = "none";
  el("app").classList.remove("hidden");
  document.querySelectorAll('[data-page="storesPage"]').forEach(btn => btn.classList.toggle("hidden", !(currentRole==="admin" || currentCanAddStores)));

  el("menuBtn").classList.remove("hidden");
  document.querySelectorAll('[data-permission="add"]').forEach(x => x.classList.toggle("hidden", !currentCanAdd));
  document.querySelectorAll('[data-permission="manage"]').forEach(x => x.classList.toggle("hidden", !currentCanManage));
  document.querySelectorAll('[data-permission="users"]').forEach(x => x.classList.toggle("hidden", !isPrimaryAdmin()));
  el("adminCategoryChooser").classList.toggle("hidden", currentRole !== "admin");

  if (currentRole === "admin") {
    await loadDashboard();
    showPage("dashboardPage");
  } else {
    renderEquipment();
    showPage("equipmentPage");
  }
}


async function applyAuthenticatedUser(user, { restored = false } = {}) {
  currentEmail = (user?.email || "").toLowerCase();
  if (!currentEmail) throw new Error("Contul autentificat nu are adresă de email.");

  const profileSnap = await getDoc(doc(db, "users", currentEmail));
  if (!profileSnap.exists()) throw new Error("Contul nu are rol atribuit în Firestore.");

  const profile = profileSnap.data();
  currentRole = normRole(profile.role);
  currentCanAdd = currentRole === "admin" ? true : profile.canAdd === true;
  currentCanManage = currentRole === "admin" ? true : profile.canManage === true;
  currentCanDelete = currentRole === "admin" ? true : profile.canDelete === true;
  currentCanAddStores = currentRole === "admin" ? true : profile.canAddStores === true;
  currentCanAddEquipment = currentRole === "admin" ? true : profile.canAddEquipment === true;
  currentCategory = normCategory(profile.category);

  if (!["admin", "suport", "carrefour", "franciza"].includes(currentRole)) {
    throw new Error("Rolul utilizatorului nu este valid.");
  }

  if (currentRole === "admin" || currentRole === "suport") {
    await finishLogin();
  } else {
    await ensureStores();
    el("loginPage").style.display = "none";
    el("storeModal").classList.add("open");
    el("storeCode").value = "";
    el("storeCode").focus();
    setTimeout(recommendStoreByLocation, 250);
  }
}

async function login() {
  el("loginError").textContent = "";
  el("loginBtn").disabled = true;
  el("loginBtn").textContent = "Se autentifică...";

  try {
    await setPersistence(auth, browserLocalPersistence);
    const credential = await signInWithEmailAndPassword(
      auth,
      el("email").value.trim().toLowerCase(),
      el("password").value
    );
    await applyAuthenticatedUser(credential.user);
  } catch (error) {
    const messages = {
      "auth/invalid-credential": "Email sau parolă incorectă.",
      "auth/invalid-login-credentials": "Email sau parolă incorectă.",
      "auth/invalid-email": "Adresa de email nu este validă.",
      "auth/too-many-requests": "Prea multe încercări. Încearcă mai târziu."
    };
    el("loginError").textContent = messages[error.code] || error.message || "Autentificarea nu a reușit.";
  } finally {
    el("loginBtn").disabled = false;
    el("loginBtn").textContent = "Autentificare";
  }
}

async function continueWithStore() {
  const code = el("storeCode").value.trim();
  el("storeError").textContent = "";
  if (!code) {
    el("storeError").textContent = "Introdu ID-ul magazinului.";
    return;
  }

  if (currentRole === "admin" && code === ADMIN_ACCESS_CODES.carrefour) {
    currentCategory = "carrefour";
    currentStoreId = "";
    currentStoreName = "Acces Admin Carrefour";
    currentStoreFormat = "";
    el("storeModal").classList.remove("open");
    await finishLogin();
    return;
  }
  if (currentRole === "admin" && code === ADMIN_ACCESS_CODES.franciza) {
    currentCategory = "franciza";
    currentStoreId = "";
    currentStoreName = "Acces Admin Franciză";
    currentStoreFormat = "";
    el("storeModal").classList.remove("open");
    await finishLogin();
    return;
  }

  let store = null;
  try {
    const snap = await getDoc(doc(db, "stores", code));
    if (snap.exists()) store = snap.data();
  } catch (error) {
    console.warn(error);
  }

  if (!store) store = INITIAL_STORES.find(item => String(item.id) === code) || null;
  if (!store) {
    el("storeError").textContent = "ID-ul magazinului nu există.";
    return;
  }
  if (store.active === false) {
    el("storeError").textContent = "Magazinul este inactiv.";
    return;
  }

  const storeCategory = normCategory(store.category || store.type);
  if (currentCategory !== "all" && storeCategory !== currentCategory) {
    el("storeError").textContent = "Magazinul nu corespunde categoriei contului.";
    return;
  }

  currentStoreId = code;
  currentStoreName = store.name || code;
  currentStoreFormat = store.format || "";
  el("storeModal").classList.remove("open");
  await finishLogin();
}

function renderEquipment() {
  const category = currentCategory === "franciza" ? "franciza" : "carrefour";
  const items = EQUIPMENT[category] || [];

  if (category === "franciza") {
    el("equipmentPageTitle").textContent = "Franciză";
  } else {
    el("equipmentPageTitle").innerHTML = '<span class="carrefour-title"><img src="carrefour-logo.svg" alt="Carrefour"><span>Carrefour</span></span>';
  }
  el("carrefourBrand").classList.toggle("hidden", category !== "carrefour");
  el("storeWelcome").textContent = currentStoreName
    ? `${currentStoreName}${currentStoreFormat ? ` · ${currentStoreFormat[0].toUpperCase()}${currentStoreFormat.slice(1)}` : ""}`
    : "";

  el("equipmentGrid").innerHTML = items.map(item => `
    <article class="equipment-card" data-equipment="${item.id}" data-label="${escapeHtml(item.label)}">
      <div class="equipment-icon">${item.icon}</div>
      <h2>${escapeHtml(item.label)}</h2>
      <p>${selectedMaterialType === "videoclip" ? "Videoclipuri" : "Proceduri"} pentru acest echipament.</p>
    </article>
  `).join("");

  document.querySelectorAll(".equipment-card").forEach(card => {
    card.addEventListener("click", () => {
      selectedEquipment = card.dataset.equipment;
      selectedEquipmentLabel = card.dataset.label;
      renderSelectedMaterials();
      showPage("materialsPage");
    });
  });
}

function youtubeId(raw) {
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.hostname.includes("youtu.be")) return url.pathname.replace("/", "").split("/")[0];
    if (url.hostname.includes("youtube.com")) {
      if (url.pathname.startsWith("/embed/")) return url.pathname.split("/embed/")[1].split("/")[0];
      if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/shorts/")[1].split("/")[0];
      return url.searchParams.get("v") || "";
    }
  } catch {}
  return "";
}

function renderSelectedMaterials() {
  const term = el("searchInput").value.trim().toLowerCase();
  const list = materials.filter(material => {
    const text = `${material.title || ""} ${material.description || ""} ${material.tags || ""}`.toLowerCase();
    return materialAllowed(material)
      && material.type === selectedMaterialType
      && material.equipment.includes(selectedEquipment)
      && (!term || text.includes(term));
  });

  const sorted = [...list].sort((a, b) => {
    const byViews = Number(b.views || 0) - Number(a.views || 0);
    if (byViews !== 0) return byViews;
    return String(a.title || "").localeCompare(String(b.title || ""), "ro");
  });

  el("materialsTitle").textContent = selectedMaterialType === "videoclip" ? "Videoclipuri" : "Proceduri";
  el("materialsSubtitle").textContent = `${selectedEquipmentLabel} · în ordinea celor mai vizionate`;

  const makeCard = (material, position) => {
    const yt = youtubeId(material.url || "");
    const preview = material.type === "videoclip" && yt
      ? `<div class="thumb"><img src="https://img.youtube.com/vi/${yt}/hqdefault.jpg" alt=""><div class="play">▶</div></div>`
      : `<div class="thumb">▣</div>`;

    const card = document.createElement("article");
    card.className = "material-card ranked-material";
    card.innerHTML = `
      <div class="rank-badge">#${position}</div>
      ${preview}
      <div class="material-body">
        <h3>${escapeHtml(material.title || "Material")}</h3>
        <p>${escapeHtml(material.description || "")}</p>
        <div class="material-info">👁 ${Number(material.views || 0)} vizualizări</div>
      </div>`;
    card.addEventListener("click", () => openViewer(material));
    return card;
  };

  const grid = el("materialsGrid");
  grid.innerHTML = "";

  if (!sorted.length) {
    grid.innerHTML = `<div class="empty">${escapeHtml(
      selectedMaterialType === "videoclip"
        ? `Nu există încă videoclipuri disponibile pentru ${selectedEquipmentLabel}.`
        : `Nu există încă proceduri disponibile pentru ${selectedEquipmentLabel}.`
    )}</div>`;
  } else {
    sorted.forEach((material, index) => grid.appendChild(makeCard(material, index + 1)));
  }
}

function driveSamePageUrl(raw) {
  if (!raw) return "about:blank";
  try {
    const u = new URL(raw);
    if (u.hostname.includes("drive.google.com")) {
      const m = u.pathname.match(/\/file\/d\/([^/]+)/);
      if (m) {
        const download = `https://drive.google.com/uc?export=download&id=${m[1]}`;
        return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(download)}`;
      }
    }
  } catch {}
  return raw;
}
async function openViewer(material) {
  currentOpenMaterial = material;
  el("viewerTitle").textContent = material.title || "Material";
  const yt = youtubeId(material.url || "");
  el("viewerFrame").src = material.type === "videoclip" && yt ? `https://www.youtube-nocookie.com/embed/${yt}?rel=0&cc_load_policy=0&playsinline=1` : driveSamePageUrl(material.url || "about:blank");
  el("viewer").classList.add("open");
  try {
    await addDoc(collection(db,"materialViews"),{materialId:material.id,title:material.title||"",type:material.type,email:currentEmail,storeId:currentStoreId,storeName:currentStoreName,storeFormat:currentStoreFormat,createdAt:serverTimestamp()});
    await updateDoc(doc(db,"videos",material.id),{views:increment(1)}); material.views=Number(material.views||0)+1;
  } catch(error){console.warn("Vizualizarea nu a putut fi înregistrată.",error);}
}

function renderEquipmentChoices() {
  for (const category of ["carrefour", "franciza"]) {
    el(`${category}EquipmentChoices`).innerHTML = EQUIPMENT[category].map(item => `
      <label><input type="checkbox" name="${category}Equipment" value="${item.id}"> ${escapeHtml(item.label)}</label>
    `).join("");
  }
}

async function saveMaterial() {
  const title = el("materialTitle").value.trim();
  const url = el("materialUrl").value.trim();
  const type = el("materialType").value;
  const categories = [...document.querySelectorAll('input[name="materialCategory"]:checked')].map(input => input.value);
  const equipment = [
    ...document.querySelectorAll('input[name="carrefourEquipment"]:checked'),
    ...document.querySelectorAll('input[name="francizaEquipment"]:checked')
  ].map(input => input.value);

  if (!title || !url) {
    el("materialStatus").textContent = "Completează titlul și linkul.";
    return;
  }
  if (!categories.length) {
    el("materialStatus").textContent = "Selectează cel puțin o categorie.";
    return;
  }
  if (!equipment.length) {
    el("materialStatus").textContent = "Selectează cel puțin un echipament.";
    return;
  }

  const payload = {
    title,
    url,
    type,
    categories,
    equipment,
    description: el("materialDescription").value.trim(),
    tags: el("materialTags").value.trim().toLowerCase(),
    updatedAt: serverTimestamp(),
    updatedBy: currentEmail
  };

  if (editingMaterialId) {
    await updateDoc(doc(db, "videos", editingMaterialId), {
      ...payload,
      status: isPrimaryAdmin() ? (materials.find(x=>x.id===editingMaterialId)?.status || "approved") : "pending"
    });
    await logTeamActivity("material_edited", null, {materialId:editingMaterialId,title,type});
    el("materialStatus").textContent = isPrimaryAdmin() ? "Modificările au fost salvate." : "Modificările au fost retrimise spre aprobare.";
  } else {
    const initialStatus = isPrimaryAdmin() ? "approved" : "pending";
    const createdRef = await addDoc(collection(db, "videos"), {
      ...payload, status: initialStatus, views: 0,
      createdAt: serverTimestamp(), createdBy: currentEmail,
      approvedBy: isPrimaryAdmin() ? currentEmail : "",
      approvedAt: isPrimaryAdmin() ? serverTimestamp() : null
    });
    await logTeamActivity("material_added", null, {materialId:createdRef.id,title,type,status:initialStatus});
    el("materialStatus").textContent = isPrimaryAdmin()
      ? "Materialul a fost adăugat și publicat."
      : "Materialul a fost trimis spre aprobarea Adminului principal.";
  }

  resetMaterialForm();
  await loadMaterials();
  await renderAdminMaterials();
}

function resetMaterialForm() {
  editingMaterialId = null;
  ["materialTitle", "materialUrl", "materialDescription", "materialTags"].forEach(id => el(id).value = "");
  document.querySelectorAll('#addMaterialPage input[type="checkbox"]').forEach(input => input.checked = false);
  document.querySelector('input[name="materialCategory"][value="carrefour"]').checked = true;
  el("materialType").value = "videoclip";
  el("saveMaterialBtn").textContent = "Adaugă material";
  el("cancelEditMaterialBtn").classList.add("hidden");
}

function startEditMaterial(materialId) {
  const material = materials.find(item => item.id === materialId);
  if (!material) return;

  editingMaterialId = material.id;
  el("materialTitle").value = material.title || "";
  el("materialUrl").value = material.url || "";
  el("materialType").value = material.type || "videoclip";
  el("materialDescription").value = material.description || "";
  el("materialTags").value = material.tags || "";

  document.querySelectorAll('#addMaterialPage input[type="checkbox"]').forEach(input => input.checked = false);

  (material.categories || []).forEach(category => {
    const input = document.querySelector(`input[name="materialCategory"][value="${category}"]`);
    if (input) input.checked = true;
  });

  (material.equipment || []).forEach(eq => {
    document.querySelectorAll(`#addMaterialPage input[type="checkbox"][value="${eq}"]`).forEach(input => {
      if (input.name !== "materialCategory") input.checked = true;
    });
  });

  el("saveMaterialBtn").textContent = "Salvează modificările";
  el("cancelEditMaterialBtn").classList.remove("hidden");
  el("materialStatus").textContent = "Editezi materialul selectat.";
  showPage("addMaterialPage");
  window.scrollTo({top:0, behavior:"smooth"});
}

async function renderAdminMaterials() {
  await loadMaterials();
  const container = el("adminMaterialsList");
  if (!materials.length) {
    container.innerHTML = '<div class="empty">Nu există materiale.</div>';
    return;
  }

  const manageTerm = el("manageMaterialSearch") ? el("manageMaterialSearch").value.trim().toLowerCase() : "";
  const manageType = el("manageMaterialType") ? el("manageMaterialType").value : "all";
  const managed = materials.filter(m => (!manageTerm || `${m.title||""} ${m.tags||""}`.toLowerCase().includes(manageTerm)) && (manageType === "all" || m.type === manageType));
  container.innerHTML = managed.map(material => {
    const tags = material.tags ? `<div class="material-tags">🏷 ${escapeHtml(material.tags)}</div>` : '<div class="material-tags">🏷 Fără tag-uri</div>';
    const views = Number(material.views || 0);
    return `
      <div class="admin-material-row">
        <b>${escapeHtml(material.title || "Material")}</b>
        <span class="badge">${material.type === "videoclip" ? "Videoclip" : "Procedură"}</span>
        <div class="store-meta">${escapeHtml((material.categories || []).join(", "))} · ${escapeHtml((material.equipment || []).join(", "))}</div>
        ${tags}
        <div class="material-info">👁 ${views} vizualizări${material.createdBy ? ` · Adăugat de ${escapeHtml(material.createdBy)}` : ""}</div>
        <div class="approval-line"><span class="status-badge status-${escapeHtml(material.status || "approved")}">${
          (material.status || "approved") === "pending" ? "În așteptare" : (material.status || "approved") === "rejected" ? "Respins" : "Aprobat"
        }</span></div>
        <div class="row-actions">
          <button class="secondary edit-material-btn" data-edit-material="${material.id}">✏️ Editează</button>
          ${isPrimaryAdmin() && (material.status || "approved") !== "approved" ? `<button class="primary" data-approve-material="${material.id}">✓ Aprobă</button>` : ""}
          ${isPrimaryAdmin() && (material.status || "approved") !== "rejected" ? `<button class="secondary" data-reject-material="${material.id}">Respinge</button>` : ""}
          ${(isPrimaryAdmin() || currentCanDelete) ? `<button class="danger" data-delete-material="${material.id}">Șterge</button>` : ""}
        </div>
      </div>
    `;
  }).join("");

  container.querySelectorAll("[data-edit-material]").forEach(button => {
    button.addEventListener("click", () => startEditMaterial(button.dataset.editMaterial));
  });

  container.querySelectorAll("[data-approve-material]").forEach(button => {
    button.addEventListener("click", async () => {
      if (!isPrimaryAdmin()) return;
      const material=materials.find(x=>x.id===button.dataset.approveMaterial);
      await updateDoc(doc(db,"videos",button.dataset.approveMaterial),{status:"approved",approvedBy:currentEmail,approvedAt:serverTimestamp()});
      await logTeamActivity("material_approved",material);
      await renderAdminMaterials(); await loadDashboard();
    });
  });
  container.querySelectorAll("[data-reject-material]").forEach(button => {
    button.addEventListener("click", async () => {
      if (!isPrimaryAdmin()) return;
      const material=materials.find(x=>x.id===button.dataset.rejectMaterial);
      await updateDoc(doc(db,"videos",button.dataset.rejectMaterial),{status:"rejected",approvedBy:currentEmail,approvedAt:serverTimestamp()});
      await logTeamActivity("material_rejected",material);
      await renderAdminMaterials(); await loadDashboard();
    });
  });

  container.querySelectorAll("[data-delete-material]").forEach(button => {
    button.addEventListener("click", async () => {
      if (!confirm("Ștergi materialul?")) return;
      const material=materials.find(x=>x.id===button.dataset.deleteMaterial);
      await deleteDoc(doc(db, "videos", button.dataset.deleteMaterial));
      await logTeamActivity("material_deleted",material);
      if (editingMaterialId === button.dataset.deleteMaterial) resetMaterialForm();
      await renderAdminMaterials();
    });
  });
}


function dashboardTimestamp(value) {
  const ms = value && typeof value.toMillis === "function" ? value.toMillis() : (value?.seconds ? value.seconds * 1000 : 0);
  return ms ? new Date(ms).toLocaleString("ro-RO") : "—";
}
function openDashboardDetails(title, subtitle, rows) {
  el("dashboardDetailsTitle").textContent = title;
  el("dashboardDetailsSubtitle").textContent = subtitle || "";
  el("dashboardDetailsBody").innerHTML = rows.length ? rows.map(row => `
    <div class="dashboard-detail-row">
      <div class="dashboard-detail-main"><b>${escapeHtml(row.title || "—")}</b><span>${escapeHtml(row.detail || "")}</span></div>
      <small>${escapeHtml(row.when || "")}</small>
    </div>`).join("") : '<div class="empty">Nu există încă informații.</div>';
  el("dashboardDetailsModal").classList.add("open");
}



let dashboardDetailCache = { sessions: [], views: [], shares: [] };

function setupDashboardInteractions() {
  document.querySelectorAll(".dashboard-stat-card").forEach(card => {
    card.onclick = event => {
      if (event.target.closest(".stat-details-link")) return;
      const key = card.dataset.stat;
      document.querySelectorAll(".stat-explain").forEach(box => {
        if (box.id !== `explain-${key}`) box.classList.add("hidden");
      });
      el(`explain-${key}`)?.classList.toggle("hidden");
    };
  });

  document.querySelectorAll("[data-stat-details]").forEach(button => {
    button.onclick = async event => {
      event.stopPropagation();
      const key = button.dataset.statDetails;
      const { sessions, views, shares } = dashboardDetailCache;

      if (key === "logins") {
        openDashboardDetails("Autentificări", "Cine s-a autentificat, magazinul și momentul accesării.",
          [...sessions].sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).map(x=>({
            title: displayUser(x.email),
            detail: x.storeName ? `${x.storeName}${x.storeId ? ` · ID ${x.storeId}` : ""}` : (x.role || ""),
            when: dashboardTimestamp(x.createdAt)
          })));
      } else if (key === "stores") {
        const storeMap = new Map();
        sessions.forEach(x => {
          if (!x.storeId && !x.storeName) return;
          const k=x.storeId||x.storeName;
          const v=storeMap.get(k)||{name:x.storeName||"Magazin",id:x.storeId||"",count:0,last:x.createdAt};
          v.count++;
          if((x.createdAt?.seconds||0)>(v.last?.seconds||0)) v.last=x.createdAt;
          storeMap.set(k,v);
        });
        openDashboardDetails("Magazine active","Magazinele care au accesat SmartID Portal.",
          [...storeMap.values()].sort((a,b)=>b.count-a.count).map(x=>({
            title:`${x.name}${x.id ? ` · ID ${x.id}` : ""}`,
            detail:`${x.count} autentificări`,
            when:`Ultima accesare: ${dashboardTimestamp(x.last)}`
          })));
      } else if (key === "videos") {
        openDashboardDetails("Vizualizări videoclipuri","Videoclipurile accesate și utilizatorii care le-au vizualizat.",
          [...views].filter(x=>normType(x.type)==="videoclip").sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).map(x=>({
            title:x.title||"Videoclip",
            detail:`${displayUser(x.email)}${x.storeName ? ` · ${x.storeName}` : ""}`,
            when:dashboardTimestamp(x.createdAt)
          })));
      } else if (key === "procedures") {
        openDashboardDetails("Vizualizări proceduri","Procedurile accesate și utilizatorii care le-au consultat.",
          [...views].filter(x=>normType(x.type)==="procedura").sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).map(x=>({
            title:x.title||"Procedură",
            detail:`${displayUser(x.email)}${x.storeName ? ` · ${x.storeName}` : ""}`,
            when:dashboardTimestamp(x.createdAt)
          })));
      } else if (key === "shares") {
        openDashboardDetails("Distribuiri","Materialele distribuite, cine le-a trimis și metoda folosită.",
          [...shares].sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).map(x=>({
            title:x.title||"Material",
            detail:`${displayUser(x.email)} · ${x.method || x.channel || "Distribuire"}`,
            when:dashboardTimestamp(x.createdAt)
          })));
      } else if (key === "pending") {
        showPage("manageMaterialsPage");
        await renderAdminMaterials();
      }
    };
  });
}

async function loadDashboard() {
  try {
    await loadUserNameMap();
    await loadMaterials();

    const [sessionsSnap, viewsSnap, sharesSnap] = await Promise.all([
      getDocs(collection(db, "sessions")),
      getDocs(collection(db, "materialViews")),
      getDocs(collection(db, "shares"))
    ]);

    const sessions = sessionsSnap.docs.map(item => item.data());
    const views = viewsSnap.docs.map(item => item.data());
    const shares = sharesSnap.docs.map(item => ({ id: item.id, ...item.data() }));
    dashboardDetailCache = { sessions, views, shares };

    const videoViews = views.filter(item => normType(item.type) === "videoclip").length;
    const procedureViews = views.filter(item => normType(item.type) === "procedura").length;
    const activeStores = new Set(sessions.map(item => item.storeId).filter(Boolean)).size;

    el("statLogins").textContent = sessions.length;
    el("statStores").textContent = activeStores;
    el("statVideos").textContent = videoViews;
    el("statProcedures").textContent = procedureViews;
    el("statShares").textContent = shares.length;
    if (el("statPending")) {
      el("statPending").textContent = materials.filter(m => (m.status || "approved") === "pending").length;
    }

    const totalViews = videoViews + procedureViews;
    const videoAngle = totalViews ? (videoViews / totalViews) * 360 : 0;
    el("diagramVideos").textContent = videoViews;
    el("diagramProcedures").textContent = procedureViews;
    el("diagramTotal").textContent = totalViews;
    el("usageDiagram").style.background = totalViews
      ? `conic-gradient(#6d28d9 0deg ${videoAngle}deg, #c026d3 ${videoAngle}deg 360deg)`
      : "conic-gradient(#e5e7eb 0deg 360deg)";

    const byUser = {};
    materials.forEach(item => {
      const email = item.createdBy || "Necunoscut";
      byUser[email] ??= { videos: 0, procedures: 0 };
      if (normType(item.type) === "videoclip") byUser[email].videos++;
      if (normType(item.type) === "procedura") byUser[email].procedures++;
    });

    el("teamVideosTotal").textContent = materials.filter(item => normType(item.type) === "videoclip").length;
    el("teamProceduresTotal").textContent = materials.filter(item => normType(item.type) === "procedura").length;

    const contributors = Object.entries(byUser)
      .sort((a, b) => (b[1].videos + b[1].procedures) - (a[1].videos + a[1].procedures));

    el("contributorsList").innerHTML = contributors.length
      ? contributors.map(([email, values]) => `
          <div class="team-member-row" data-team-email="${escapeHtml(email)}">
            <div class="team-member-name">
              <div class="team-avatar">${escapeHtml((displayUser(email) || "?").charAt(0).toUpperCase())}</div>
              <div>
                <b>${escapeHtml(displayUser(email))}</b>
                <small>${escapeHtml(email)} · ${values.videos + values.procedures} materiale încărcate</small>
              </div>
            </div>
            <div class="team-metrics">
              <span class="metric-pill video-pill">▶ ${values.videos} videoclipuri</span>
              <span class="metric-pill procedure-pill">▣ ${values.procedures} proceduri</span>
            </div>
          </div>
        `).join("")
      : '<div class="empty">Nu există încă materiale încărcate de echipă.</div>';

    document.querySelectorAll(".team-member-row").forEach(row => {
      row.classList.add("clickable-team-member");
      row.onclick = () => {
        const email = row.dataset.teamEmail || "Necunoscut";
        const own = materials
          .filter(m => (m.createdBy || "Necunoscut") === email)
          .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
        openDashboardDetails(
          displayUser(email),
          "Materialele încărcate de acest utilizator.",
          own.map(m => ({
            title: m.title || "Material",
            detail: normType(m.type) === "videoclip" ? "Videoclip" : "Procedură",
            when: dashboardTimestamp(m.createdAt)
          }))
        );
      };
    });

    setupDashboardInteractions();
  } catch (error) {
    console.error("Dashboard-ul nu a putut fi încărcat.", error);
    if (el("dashboardPage")) {
      const existing = el("dashboardPage").querySelector(".dashboard-load-error");
      if (!existing) {
        const box = document.createElement("div");
        box.className = "panel dashboard-load-error";
        box.innerHTML = "<b>Dashboard-ul nu s-a putut încărca.</b><p class='subtitle'>Verifică drepturile Firebase/Firestore sau reîncarcă pagina.</p>";
        el("dashboardPage").prepend(box);
      }
    }
  }
}

async function loadGeolocationStores() {
  if (!isPrimaryAdmin()) return;
  try {
    const snap = await getDocs(collection(db, "stores"));
    storesCache = snap.docs.map(item => ({ id: item.id, ...item.data() }));
    renderGeolocationStores();
  } catch (error) {
    console.error("Geolocalizare:", error);
    el("geoStoresList").innerHTML = '<div class="empty">Magazinele nu au putut fi încărcate.</div>';
  }
}

function renderGeolocationStores() {
  const container = el("geoStoresList");
  if (!container) return;

  const term = (el("geoStoreSearch")?.value || "").trim().toLowerCase();
  const filter = el("geoStoreFilter")?.value || "all";

  const rows = storesCache
    .filter(store => store.active !== false)
    .filter(store => {
      const category = normCategory(store.category || store.type);
      const hasCoords = Number.isFinite(Number(store.latitude)) && Number.isFinite(Number(store.longitude));
      const text = `${store.id} ${store.name || ""} ${store.address || ""}`.toLowerCase();
      const matchesText = !term || text.includes(term);
      const matchesFilter =
        filter === "all" ||
        filter === category ||
        (filter === "missing" && !hasCoords);
      return matchesText && matchesFilter;
    })
    .sort((a,b) => String(a.name || "").localeCompare(String(b.name || ""), "ro"));

  container.innerHTML = rows.length ? rows.map(store => {
    const lat = store.latitude ?? "";
    const lon = store.longitude ?? "";
    const mapsQuery = encodeURIComponent(store.address || `${store.name || ""}, Romania`);
    return `
      <div class="geo-store-row" data-geo-store="${escapeHtml(store.id)}">
        <div class="geo-store-main">
          <b>${escapeHtml(store.name || store.id)}</b>
          <small>ID ${escapeHtml(store.id)} · ${escapeHtml(normCategory(store.category || store.type) || "")}</small>
          <span>${escapeHtml(store.address || "Adresă indisponibilă")}</span>
        </div>
        <div class="geo-coordinates">
          <label>Latitudine
            <input data-geo-lat="${escapeHtml(store.id)}" inputmode="decimal" value="${escapeHtml(String(lat))}" placeholder="ex. 44.4268">
          </label>
          <label>Longitudine
            <input data-geo-lon="${escapeHtml(store.id)}" inputmode="decimal" value="${escapeHtml(String(lon))}" placeholder="ex. 26.1025">
          </label>
        </div>
        <div class="geo-actions">
          <a class="secondary geo-map-link" href="https://www.google.com/maps/search/?api=1&query=${mapsQuery}" target="_blank" rel="noopener">Google Maps</a>
          <button type="button" class="primary" data-save-geo="${escapeHtml(store.id)}">Salvează</button>
        </div>
      </div>
    `;
  }).join("") : '<div class="empty">Nu există magazine pentru filtrul selectat.</div>';

  container.querySelectorAll("[data-save-geo]").forEach(button => {
    button.onclick = async () => {
      const id = button.dataset.saveGeo;
      const latRaw = container.querySelector(`[data-geo-lat="${CSS.escape(id)}"]`)?.value.trim() || "";
      const lonRaw = container.querySelector(`[data-geo-lon="${CSS.escape(id)}"]`)?.value.trim() || "";
      const latitude = Number(latRaw.replace(",", "."));
      const longitude = Number(lonRaw.replace(",", "."));

      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
          !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        el("geoStatus").textContent = "Coordonatele introduse nu sunt valide.";
        return;
      }

      try {
        await updateDoc(doc(db, "stores", id), { latitude, longitude });
        const local = storesCache.find(s => String(s.id) === String(id));
        if (local) { local.latitude = latitude; local.longitude = longitude; }
        el("geoStatus").textContent = `Coordonatele pentru ${local?.name || id} au fost salvate.`;
        button.textContent = "Salvat ✓";
        setTimeout(() => button.textContent = "Salvează", 1200);
      } catch (error) {
        console.error("Salvare coordonate:", error);
        el("geoStatus").textContent = "Coordonatele nu au putut fi salvate.";
      }
    };
  });
}

async function loadStores() {
  const snap = await getDocs(collection(db, "stores"));
  storesCache = snap.docs.map(item => ({ id: item.id, ...item.data() }));
  renderStores();
}

function renderStores() {
  const term = el("storeSearch").value.trim().toLowerCase();
  const filter = el("storeFilter").value;

  const filtered = storesCache.filter(store => {
    const category = normCategory(store.category || store.type);
    const format = String(store.format || "").toLowerCase();
    const matchesText = !term || `${store.id} ${store.name || ""}`.toLowerCase().includes(term);
    const matchesFilter = filter === "all" || category === filter || format === filter;
    return matchesText && matchesFilter;
  });

  const carrefour = filtered.filter(s => normCategory(s.category || s.type) === "carrefour");
  const franciza = filtered.filter(s => normCategory(s.category || s.type) === "franciza");

  const renderRows = list => list
    .sort((a,b) => {
      const inactiveOrder = Number(a.active === false) - Number(b.active === false);
      if (inactiveOrder !== 0) return inactiveOrder;
      return String(a.name || "").localeCompare(String(b.name || ""), "ro");
    })
    .map(store => `
      <div class="store-row ${store.active === false ? "store-row-inactive" : ""}">
        <b>${escapeHtml(store.name || store.id)}</b>
        <div class="store-meta">
          ID: ${escapeHtml(store.id)} ·
          <span class="${store.active === false ? "store-status-inactive" : "store-status-active"}">
            ${store.active === false ? "Inactiv" : "Activ"}
          </span>
        
        ${isPrimaryAdmin() ? `<button type="button" class="store-delete-btn" data-delete-store="${escapeHtml(store.id)}" data-store-name="${escapeHtml(store.name || store.id)}">Șterge</button>` : ""}
      </div>
      </div>
    `).join("");

  const group = (title, list, key) => `
    <div class="group-block">
      <button class="group-head" data-store-group="${key}">
        <span>${title}</span><span>${list.length} ▾</span>
      </button>
      <div class="group-body" id="group-${key}">
        ${list.length ? renderRows(list) : '<div class="store-row"><small>Nu există magazine.</small></div>'}
      </div>
    </div>`;

  const hiper = carrefour.filter(s => String(s.format || "").toLowerCase() === "hiper");
  const superStores = carrefour.filter(s => String(s.format || "").toLowerCase() === "super");
  const express = carrefour.filter(s => String(s.format || "").toLowerCase() === "express");
  const noFormat = carrefour.filter(s => !["hiper","super","express"].includes(String(s.format || "").toLowerCase()));

  let output = "";
  if (filter !== "franciza") {
    output += '<h2 class="category-title">Carrefour</h2>';
    output += group("Hiper", hiper, "hiper");
    output += group("Super", superStores, "super");
    output += group("Express", express, "express");
    if (noFormat.length) output += group("Fără format", noFormat, "noformat");
  }

  if (filter !== "carrefour" && !["hiper","super","express"].includes(filter)) {
    output += '<h2 class="category-title">Franciză</h2>';
    output += group("Magazine Franciză", franciza, "franciza");
  }

  el("storesList").innerHTML = output || '<div class="empty">Nu există magazine pentru filtrul selectat.</div>';

  el("storesList").querySelectorAll("[data-store-group]").forEach(button => {
    button.addEventListener("click", () => {
      const body = el(`group-${button.dataset.storeGroup}`);
      body.classList.toggle("collapsed");
      const count = body.querySelectorAll(".store-row").length;
      button.querySelector("span:last-child").textContent = `${count} ${body.classList.contains("collapsed") ? "▸" : "▾"}`;
    });
  });

  bindStoreDeleteButtons();
}

function toggleStoreFormat() {
  const isCarrefour = el("newStoreCategory").value === "carrefour";
  el("newStoreFormat").classList.toggle("hidden", !isCarrefour);
}



async function deleteStorePermanently(storeId, storeName) {
  if (!isPrimaryAdmin()) return;

  const ok = confirm(
    `Sigur vrei să ștergi definitiv magazinul "${storeName}" (ID ${storeId})?\n\nMagazinul va fi eliminat din baza de magazine.`
  );
  if (!ok) return;

  try {
    await deleteDoc(doc(db, "stores", String(storeId)));
    el("saveStoreStatus").textContent = `Magazinul ${storeName} a fost șters definitiv.`;
    await loadStores();
  } catch (error) {
    console.error("Ștergere magazin:", error);
    el("saveStoreStatus").textContent = "Magazinul nu a putut fi șters. Verifică drepturile Firestore.";
  }
}

function bindStoreDeleteButtons() {
  document.querySelectorAll("[data-delete-store]").forEach(button => {
    button.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      deleteStorePermanently(
        button.dataset.deleteStore,
        button.dataset.storeName || button.dataset.deleteStore
      );
    };
  });
}

async function loadStoreIntoFormById() {
  const id = el("newStoreId").value.trim();
  if (!id) return;

  try {
    let store = storesCache.find(s => String(s.id) === id) || null;
    if (!store) {
      const snap = await getDoc(doc(db, "stores", id));
      if (snap.exists()) store = { id, ...snap.data() };
    }
    if (!store) return;

    el("newStoreName").value = store.name || "";
    el("newStoreCategory").value = normCategory(store.category || store.type) || "carrefour";
    toggleStoreFormat();

    if (el("newStoreCategory").value === "carrefour") {
      el("newStoreFormat").value = String(store.format || "hiper").toLowerCase();
    }

    el("newStoreActive").value = store.active === false ? "false" : "true";
    el("saveStoreStatus").textContent =
      `Editezi ${store.name || id}. Categoria și formatul existente au fost încărcate automat.`;
  } catch (error) {
    console.warn("Magazinul nu a putut fi încărcat în formular.", error);
  }
}

async function saveStore() {
  if (!(isPrimaryAdmin() || currentCanAddStores)) {
    el("saveStoreStatus").textContent = "Nu ai dreptul să adaugi sau să modifici magazine.";
    return;
  }

  const id = el("newStoreId").value.trim();
  const name = el("newStoreName").value.trim();

  if (!id || !name) {
    el("saveStoreStatus").textContent = "Completează ID-ul și numele magazinului.";
    return;
  }

  try {
    const storeRef = doc(db, "stores", id);
    const existingSnap = await getDoc(storeRef);
    const existing = existingSnap.exists() ? existingSnap.data() : null;

    const selectedCategory = el("newStoreCategory").value;
    const selectedFormat = selectedCategory === "carrefour"
      ? el("newStoreFormat").value
      : "";

    const data = {
      name,
      active: el("newStoreActive").value === "true",
      category: existing?.category || selectedCategory,
      format: existing?.format ?? selectedFormat
    };

    // Pentru magazin nou folosim categoria/formatul ales.
    if (!existing) {
      data.category = selectedCategory;
      data.format = selectedFormat;
    }

    await setDoc(storeRef, data, { merge: true });

    el("saveStoreStatus").textContent = data.active
      ? "Magazinul a fost salvat ca Activ."
      : "Magazinul a fost marcat Inactiv și a rămas în categoria lui.";

    el("newStoreId").value = "";
    el("newStoreName").value = "";
    el("newStoreActive").value = "true";
    await loadStores();
  } catch (error) {
    console.error(error);
    el("saveStoreStatus").textContent = "Magazinul nu a putut fi salvat.";
  }
}


function distanceKm(a,b,c,d){const R=6371,toRad=x=>x*Math.PI/180;const dLat=toRad(c-a),dLon=toRad(d-b);const q=Math.sin(dLat/2)**2+Math.cos(toRad(a))*Math.cos(toRad(c))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(q));}
async function recommendStoreByLocation(){
  const box=el("geoRecommendation"); if(!navigator.geolocation){box.textContent="Browserul nu suportă geolocalizarea.";box.className="geo-recommendation warn";return;}
  box.textContent="Se verifică locația..."; box.className="geo-recommendation";
  navigator.geolocation.getCurrentPosition(async pos=>{
    try{const snap=await getDocs(collection(db,"stores"));const candidates=snap.docs.map(d=>({id:d.id,...d.data()})).filter(s=>s.active!==false&&Number.isFinite(Number(s.latitude))&&Number.isFinite(Number(s.longitude))&&(currentCategory==="all"||normCategory(s.category||s.type)===currentCategory));
      if(!candidates.length){box.textContent="Magazinele nu au încă coordonate configurate. Adminul le poate completa din Coordonate magazine.";box.className="geo-recommendation warn";return;}
      const ranked=candidates.map(s=>({...s,distance:distanceKm(pos.coords.latitude,pos.coords.longitude,Number(s.latitude),Number(s.longitude))})).sort((a,b)=>a.distance-b.distance); const best=ranked[0];
      box.innerHTML=`Magazin recomandat: <b>${escapeHtml(best.name||best.id)}</b> · ID ${escapeHtml(best.id)} · ${best.distance.toFixed(1)} km`;box.className="geo-recommendation good";el("storeCode").value=best.id;
    }catch(err){box.textContent="Nu am putut calcula recomandarea.";box.className="geo-recommendation warn";}
  },()=>{box.textContent="Locația nu a fost permisă. Poți introduce ID-ul manual.";box.className="geo-recommendation warn";},{enableHighAccuracy:true,timeout:8000,maximumAge:300000});
}


async function loadUsers() {
  const teamNames = [
    "Nistor Ionut",
    "Apetrei Andrei",
    "Robert Neagu",
    "Andreea Ianos",
    "Dan Oros",
    "Valentin Surugiu"
  ];

  // Pagina se afișează imediat, fără să depindă de răspunsul Firestore.
  const renderTeam = profilesByName => {
    const rows = teamNames.map(name => {
      const saved = profilesByName?.get(name.toLowerCase()) || null;
      const preset = teamPermissionPreset(name);
      return {
        displayName: name,
        email: saved?.email || "",
        role: saved?.role || "suport",
        category: saved?.category || "all",
        canAdd: saved ? saved.canAdd === true : preset.canAdd,
        canDelete: saved ? saved.canDelete === true : preset.canDelete,
        canAddStores: saved ? saved.canAddStores === true : preset.canAddStores,
        canAddEquipment: saved ? saved.canAddEquipment === true : preset.canAddEquipment
      };
    });

    el("usersList").innerHTML = rows.map(user => `
      <button type="button" class="user-team-card" data-team-name="${escapeHtml(user.displayName)}">
        <div class="user-row-main">
          <div class="team-avatar">${escapeHtml(user.displayName.charAt(0))}</div>
          <div class="user-identity">
            <b>${escapeHtml(user.displayName)}</b>
            <small>${user.email ? escapeHtml(user.email) : "Click pentru configurare"}</small>
          </div>
        </div>
        <div class="user-permission-summary">
          <span class="${user.canAdd ? "permission-yes" : "permission-no"}">Adaugă: ${user.canAdd ? "Da" : "Nu"}</span>
          <span class="${user.canDelete ? "permission-yes" : "permission-no"}">Șterge: ${user.canDelete ? "Da" : "Nu"}</span>
          <span class="permission-yes">Magazine: ${user.canAddStores ? "Da" : "Nu"}</span>
          <span class="permission-yes">Echipamente: ${user.canAddEquipment ? "Da" : "Nu"}</span>
          <span class="permission-no">Aprobă: Nu</span>
        </div>
      </button>
    `).join("");

    el("usersList").querySelectorAll("[data-team-name]").forEach(card => {
      card.onclick = () => {
        const name = card.dataset.teamName;
        const user = rows.find(x => x.displayName === name);
        if (!user) return;
        el("userDisplayName").value = user.displayName;
        el("userEmail").value = user.email;
        el("userRole").value = "suport";
        el("userCategory").value = "all";
        el("userCanAdd").checked = user.canAdd;
        el("userCanDelete").checked = user.canDelete;
        el("userCanAddStores").checked = user.canAddStores;
        el("userCanAddEquipment").checked = user.canAddEquipment;
        el("userStatus").textContent = user.email
          ? `Configurezi drepturile pentru ${user.displayName}.`
          : `Completează emailul Firebase pentru ${user.displayName} și apasă Salvează drepturi.`;
        setTimeout(() => el("userEmail").focus(), 50);
      };
    });
  };

  renderTeam(new Map());

  // Încercăm să citim drepturile deja salvate, dar nu blocăm pagina dacă Firestore refuză listarea.
  try {
    const snap = await getDocs(collection(db, "users"));
    const profiles = snap.docs.map(d => ({ email: d.id, ...d.data() }));
    const byName = new Map(
      profiles.filter(p => p.displayName)
        .map(p => [String(p.displayName).trim().toLowerCase(), p])
    );
    renderTeam(byName);
  } catch (error) {
    console.warn("Lista Firestore users nu poate fi citită; formularul rămâne disponibil.", error);
  }
}

async function saveUserProfile() {
  if (!isPrimaryAdmin()) {
    el("userStatus").textContent = "Doar Adminul principal poate modifica drepturile.";
    return;
  }

  const displayName = el("userDisplayName").value;
  const email = el("userEmail").value.trim().toLowerCase();

  if (!displayName) {
    el("userStatus").textContent = "Selectează colegul.";
    return;
  }
  if (!email) {
    el("userStatus").textContent = "Completează emailul colegului creat în Firebase.";
    return;
  }

  try {
    await setDoc(doc(db, "users", email), {
      displayName,
      role: "suport",
      category: "all",
      canAdd: el("userCanAdd").checked,
      canManage: el("userCanAdd").checked,
      canDelete: el("userCanDelete").checked,
      canAddStores: el("userCanAddStores").checked,
      canAddEquipment: el("userCanAddEquipment").checked,
      canApprove: false,
      canManageUsers: false,
      updatedAt: serverTimestamp(),
      updatedBy: currentEmail
    }, { merge: true });

    el("userStatus").textContent = `Drepturile pentru ${displayName} au fost salvate.`;
    await logTeamActivity("rights_updated", null, {
      targetEmail: email,
      title: displayName
    });
    loadUsers().catch(()=>{});
  } catch (error) {
    console.error("Drepturile nu au putut fi salvate.", error);
    el("userStatus").textContent = "Nu am putut salva drepturile. Verifică regulile Firestore.";
  }
}

async function shareWhatsApp() {
  if (!currentOpenMaterial) return;
  await recordShare("WhatsApp");
  const text = `${currentOpenMaterial.title || "Material"} - ${currentOpenMaterial.url || ""}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
}

async function shareEmail() {
  if (!currentOpenMaterial) return;
  await recordShare("E-mail");
  const subject = `SmartID Portal - ${currentOpenMaterial.title || "Material"}`;
  const body = `${currentOpenMaterial.title || "Material"}\n\n${currentOpenMaterial.url || ""}`;
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function copyMaterialLink() {
  if (!currentOpenMaterial) return;
  await navigator.clipboard.writeText(currentOpenMaterial.url || "");
  await recordShare("Copiere link");
  alert("Linkul a fost copiat.");
}

async function openSharesHistory() {
  try {
    const snap = await getDocs(collection(db, "shares"));
    const shares = snap.docs.map(item => ({ id: item.id, ...item.data() })).reverse();
    el("sharesList").innerHTML = shares.length
      ? shares.map(item => `
          <div class="share-row">
            <b>${escapeHtml(item.title || "Material")}</b>
            <small>
              Distribuit de: ${escapeHtml(item.email || "Utilizator")}
              ${item.storeName ? ` · Magazin: ${escapeHtml(item.storeName)}` : ""}
              ${item.storeId ? ` · ID: ${escapeHtml(item.storeId)}` : ""}
              · Metodă: ${escapeHtml(item.method || "Necunoscută")}
            </small>
          </div>
        `).join("")
      : '<div class="empty">Nu există distribuiri înregistrate.</div>';
    el("sharesModal").classList.add("open");
  } catch (error) {
    console.warn(error);
  }
}

function openMenu() {
  el("sidebar").classList.add("open");
  el("menuOverlay").classList.add("open");
}
function closeMenu() {
  el("sidebar").classList.remove("open");
  el("menuOverlay").classList.remove("open");
}


async function cancelStoreSelection() {
  currentStoreId = "";
  currentStoreName = "";
  currentStoreFormat = "";
  el("storeCode").value = "";
  el("storeError").textContent = "";
  el("storeModal").classList.remove("open");
  await signOut(auth);
  el("loginPage").style.display = "flex";
  el("app").classList.add("hidden");
  el("email").focus();
}

function onIfPresent(id, eventName, handler) {
  const node = el(id);
  if (node) node.addEventListener(eventName, handler);
}

el("loginBtn").addEventListener("click", login);
el("password").addEventListener("keydown", event => { if (event.key === "Enter") login(); });
el("storeContinueBtn").addEventListener("click", continueWithStore);
el("storeLogoutBtn").addEventListener("click", cancelStoreSelection);
el("logoutBtn").addEventListener("click", async () => { await signOut(auth); location.reload(); });
el("menuBtn").addEventListener("click", openMenu);
el("shareWhatsAppBtn").addEventListener("click", shareWhatsApp);
el("shareEmailBtn").addEventListener("click", shareEmail);
el("copyLinkBtn").addEventListener("click", copyMaterialLink);

onIfPresent("closeSharesModalBtn", "click", () => el("sharesModal")?.classList.remove("open"));
el("closeMenuBtn").addEventListener("click", closeMenu);
el("menuOverlay").addEventListener("click", closeMenu);
el("closeViewerBtn").addEventListener("click", () => {
  el("viewer").classList.remove("open");
  el("viewerFrame").src = "about:blank";
  currentOpenMaterial = null;
});
el("saveMaterialBtn").addEventListener("click", saveMaterial);
el("cancelEditMaterialBtn").addEventListener("click", () => { resetMaterialForm(); el("materialStatus").textContent = ""; });
el("saveStoreBtn").addEventListener("click", saveStore);
el("newStoreCategory").addEventListener("change", toggleStoreFormat);
el("storeSearch").addEventListener("input", renderStores);
el("storeFilter").addEventListener("change", renderStores);
el("searchInput").addEventListener("input", () => {
  if (!el("materialsPage").classList.contains("hidden")) renderSelectedMaterials();
});

document.querySelectorAll(".side-btn").forEach(button => {
  button.addEventListener("click", async () => {
    const page = button.dataset.page;
    if (page === "dashboardPage") await loadDashboard();
    if (page === "equipmentPage") {
      if (currentRole === "admin" && !["carrefour","franciza"].includes(currentCategory)) currentCategory = "carrefour";
      renderEquipment();
    }
    if (page === "manageMaterialsPage") await renderAdminMaterials();
    if (page === "usersPage") return;
    if (page === "geolocationPage") {
      if (!isPrimaryAdmin()) return;
      showPage(page);
      closeMenu();
      await loadGeolocationStores();
      return;
    }
    if (page === "storesPage") await loadStores();
    showPage(page);
    closeMenu();
  });
});



const usersMenuButton = el("usersMenuBtn");
if (usersMenuButton) {
  usersMenuButton.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    if (!isPrimaryAdmin()) return;
    showPage("usersPage");
    closeMenu();
    // Nu așteptăm Firestore ca să deschidem pagina.
    loadUsers().catch(error => console.warn("Utilizatori:", error));
  });
}

document.querySelectorAll("[data-admin-category]").forEach(button => {
  button.addEventListener("click", () => {
    if (currentRole !== "admin") return;
    currentCategory = button.dataset.adminCategory;
    document.querySelectorAll("[data-admin-category]").forEach(b=>b.classList.toggle("active", b===button));
    renderEquipment();
    showPage("equipmentPage");
  });
});

document.querySelectorAll(".type-card").forEach(card => {
  card.addEventListener("click", () => {
    selectedMaterialType = card.dataset.materialType;
    el("selectedMaterialTypeTitle").textContent =
      selectedMaterialType === "videoclip" ? "Categorii videoclipuri" : "Categorii proceduri";
    renderEquipment();
    showPage("materialTypePage");
  });
});

document.querySelectorAll("[data-back]").forEach(button => {
  button.addEventListener("click", () => showPage(button.dataset.back));
});

onIfPresent("detectLocationBtn", "click", recommendStoreByLocation);
onIfPresent("manageMaterialSearch", "input", renderAdminMaterials);
onIfPresent("manageMaterialType", "change", renderAdminMaterials);


onIfPresent("saveUserBtn", "click", saveUserProfile);




renderEquipmentChoices();
toggleStoreFormat();

if (el("closeDashboardDetailsBtn")) el("closeDashboardDetailsBtn").addEventListener("click",()=>el("dashboardDetailsModal").classList.remove("open"));
if (el("dashboardDetailsModal")) el("dashboardDetailsModal").addEventListener("click",e=>{if(e.target===el("dashboardDetailsModal")) el("dashboardDetailsModal").classList.remove("open");});





let authRestoreHandled = false;
onAuthStateChanged(auth, async user => {
  if (authRestoreHandled) return;
  authRestoreHandled = true;

  if (!user) {
    el("loginPage").style.display = "flex";
    el("app").classList.add("hidden");
    return;
  }

  try {
    await applyAuthenticatedUser(user, { restored: true });
  } catch (error) {
    console.warn("Sesiunea salvată nu a putut fi restaurată.", error);
    try { await signOut(auth); } catch {}
    el("loginPage").style.display = "flex";
    el("app").classList.add("hidden");
    el("loginError").textContent = error.message || "Autentifică-te din nou.";
  }
});



if (el("userDisplayName")) {
  el("userDisplayName").addEventListener("change", () => {
    const name = el("userDisplayName").value;
    if (!name) return;
    const preset = teamPermissionPreset(name);
    el("userCanAdd").checked = preset.canAdd;
    el("userCanDelete").checked = preset.canDelete;
    el("userCanAddStores").checked = preset.canAddStores;
    el("userCanAddEquipment").checked = preset.canAddEquipment;
  });
}

onIfPresent("newStoreId", "change", loadStoreIntoFormById);
onIfPresent("newStoreId", "blur", loadStoreIntoFormById);

onIfPresent("geoStoreSearch", "input", renderGeolocationStores);
onIfPresent("geoStoreFilter", "change", renderGeolocationStores);
