import {
  initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js"; import { getAuth, signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js"; import {   getFirestore, collection, getDocs, addDoc, getDoc, setDoc, deleteDoc, updateDoc, doc, increment, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";
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
const PRIMARY_ADMIN_EMAIL = "admin@smartid.com";

const ADMIN_STORE_CODE = "9999";


const DASHBOARD_RESET_AT = new Date("2026-08-25T12:34:00+03:00").getTime();
function valueToMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value.seconds) return value.seconds * 1000;
  return 0;
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
  currentCanAdd = profile.canAdd === true || ["admin","suport"].includes(currentRole);
  currentCanManage = profile.canManage === true || currentRole === "admin";
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

  if (currentRole === "admin" && code === ADMIN_STORE_CODE) {
    if (!["carrefour","franciza"].includes(currentCategory)) currentCategory = "carrefour";
    currentStoreId = "";
    currentStoreName = currentCategory === "franciza" ? "Admin Franciză" : "Admin Carrefour";
    currentStoreFormat = "";
    el("storeModal").classList.remove("open");
    await loadMaterials();
    renderEquipment();
    showPage("equipmentPage");
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
          ${isPrimaryAdmin() ? `<button class="danger" data-delete-material="${material.id}">Șterge</button>` : ""}
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
  document.querySelectorAll("[data-stat-details]").forEach(button => {
    button.onclick = async event => {
      event.preventDefault();
      event.stopPropagation();

      const key = button.dataset.statDetails;
      const { sessions, views, shares } = dashboardDetailCache;

      if (key === "logins") {
        openDashboardDetails(
          "Autentificări",
          "Cine s-a autentificat, magazinul și momentul accesării.",
          [...sessions]
            .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))
            .map(x=>({
              title: displayUser(x.email),
              detail: x.storeName ? `${x.storeName}${x.storeId ? ` · ID ${x.storeId}` : ""}` : (x.role || ""),
              when: dashboardTimestamp(x.createdAt)
            }))
        );
      } else if (key === "stores") {
        const storeMap = new Map();
        sessions.forEach(x => {
          if (!x.storeId && !x.storeName) return;
          const k = x.storeId || x.storeName;
          const v = storeMap.get(k) || { name:x.storeName || "Magazin", id:x.storeId || "", count:0, last:x.createdAt };
          v.count++;
          if ((x.createdAt?.seconds||0) > (v.last?.seconds||0)) v.last = x.createdAt;
          storeMap.set(k, v);
        });

        openDashboardDetails(
          "Magazine active",
          "Magazinele care au accesat SmartID Portal.",
          [...storeMap.values()]
            .sort((a,b)=>b.count-a.count)
            .map(x=>({
              title:`${x.name}${x.id ? ` · ID ${x.id}` : ""}`,
              detail:`${x.count} autentificări`,
              when:`Ultima accesare: ${dashboardTimestamp(x.last)}`
            }))
        );
      } else if (key === "videos") {
        openDashboardDetails(
          "Vizualizări videoclipuri",
          "Videoclipurile accesate și utilizatorii care le-au vizualizat.",
          [...views]
            .filter(x=>normType(x.type)==="videoclip")
            .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))
            .map(x=>({
              title:x.title || "Videoclip",
              detail:`${displayUser(x.email)}${x.storeName ? ` · ${x.storeName}` : ""}`,
              when:dashboardTimestamp(x.createdAt)
            }))
        );
      } else if (key === "procedures") {
        openDashboardDetails(
          "Vizualizări proceduri",
          "Procedurile accesate și utilizatorii care le-au consultat.",
          [...views]
            .filter(x=>normType(x.type)==="procedura")
            .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))
            .map(x=>({
              title:x.title || "Procedură",
              detail:`${displayUser(x.email)}${x.storeName ? ` · ${x.storeName}` : ""}`,
              when:dashboardTimestamp(x.createdAt)
            }))
        );
      } else if (key === "shares") {
        openDashboardDetails(
          "Distribuiri",
          "Materialele distribuite, cine le-a trimis și metoda folosită.",
          [...shares]
            .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))
            .map(x=>({
              title:x.title || "Material",
              detail:`${displayUser(x.email)} · ${x.method || x.channel || "Distribuire"}`,
              when:dashboardTimestamp(x.createdAt)
            }))
        );
      } else if (key === "pending") {
        const pending = materials.filter(m => (m.status || "approved") === "pending");
        openDashboardDetails(
          "Materiale de aprobat",
          "Materialele încărcate de echipă care așteaptă aprobarea Adminului principal.",
          pending.map(m=>({
            title:m.title || "Material",
            detail:`${normType(m.type)==="videoclip" ? "Videoclip" : "Procedură"} · ${displayUser(m.createdBy)}`,
            when:dashboardTimestamp(m.createdAt)
          }))
        );
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

    const sessions = sessionsSnap.docs
      .map(item => item.data())
      .filter(item => valueToMillis(item.createdAt) >= DASHBOARD_RESET_AT);

    const views = viewsSnap.docs
      .map(item => item.data())
      .filter(item => valueToMillis(item.createdAt) >= DASHBOARD_RESET_AT);

    const shares = sharesSnap.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .filter(item => valueToMillis(item.createdAt) >= DASHBOARD_RESET_AT);

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
    if (el("diagramVideos")) el("diagramVideos").textContent = videoViews;
    if (el("diagramProcedures")) el("diagramProcedures").textContent = procedureViews;
    if (el("diagramTotal")) el("diagramTotal").textContent = totalViews;
    if (el("usageDiagram")) {
      el("usageDiagram").style.background = totalViews
        ? `conic-gradient(#6d28d9 0deg ${videoAngle}deg, #c026d3 ${videoAngle}deg 360deg)`
        : "conic-gradient(#e5e7eb 0deg 360deg)";
    }

    // Activitate echipa = doar materiale noi, cu autor cunoscut.
    const recentTeamMaterials = materials.filter(item =>
      valueToMillis(item.createdAt) >= DASHBOARD_RESET_AT &&
      item.createdBy &&
      String(item.createdBy).trim().toLowerCase() !== "necunoscut"
    );

    const byUser = {};
    recentTeamMaterials.forEach(item => {
      const email = item.createdBy;
      byUser[email] ??= { videos: 0, procedures: 0 };
      if (normType(item.type) === "videoclip") byUser[email].videos++;
      if (normType(item.type) === "procedura") byUser[email].procedures++;
    });

    el("teamVideosTotal").textContent =
      recentTeamMaterials.filter(item => normType(item.type) === "videoclip").length;
    el("teamProceduresTotal").textContent =
      recentTeamMaterials.filter(item => normType(item.type) === "procedura").length;

    const contributors = Object.entries(byUser)
      .sort((a,b) => (b[1].videos + b[1].procedures) - (a[1].videos + a[1].procedures));

    el("contributorsList").innerHTML = contributors.length
      ? contributors.map(([email, values]) => `
          <div class="team-member-row" data-team-email="${escapeHtml(email)}">
            <div class="team-member-name">
              <div class="team-avatar">${escapeHtml((displayUser(email) || "?").charAt(0).toUpperCase())}</div>
              <div>
                <b>${escapeHtml(displayUser(email))}</b>
                <small>${values.videos + values.procedures} materiale încărcate</small>
              </div>
            </div>
            <div class="team-metrics">
              <span class="metric-pill video-pill">▶ ${values.videos} videoclipuri</span>
              <span class="metric-pill procedure-pill">▣ ${values.procedures} proceduri</span>
            </div>
          </div>
        `).join("")
      : '<div class="empty">Nu există încă activitate nouă a echipei.</div>';

    document.querySelectorAll(".team-member-row").forEach(row => {
      row.onclick = () => {
        const email = row.dataset.teamEmail || "";
        const own = recentTeamMaterials
          .filter(m => m.createdBy === email)
          .sort((a,b) => valueToMillis(b.createdAt) - valueToMillis(a.createdAt));

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
    console.error("Dashboard:", error);
  }
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
    .sort((a,b) => String(a.name || "").localeCompare(String(b.name || ""), "ro"))
    .map(store => `
      <div class="store-row ${store.active === false ? "store-row-inactive" : ""}">
        <div class="store-row-main">
          <b>${escapeHtml(store.name || store.id)}</b>
          <div class="store-meta">
            ID: ${escapeHtml(store.id)} ·
            <span class="${store.active === false ? "store-status-inactive" : "store-status-active"}">
              ${store.active === false ? "Inactiv" : "Activ"}
            </span>
          </div>
        </div>
        ${currentRole === "admin" ? `
          <div class="store-row-actions">
            <button type="button" class="store-edit-btn" data-edit-store="${escapeHtml(store.id)}">Edit</button>
            <button type="button" class="store-delete-btn" data-delete-store="${escapeHtml(store.id)}" data-store-name="${escapeHtml(store.name || store.id)}">Șterge</button>
          </div>` : ""}
      </div>
    `).join("");

  const group = (title, list, key) => `
    <div class="group-block">
      <button class="group-head" data-store-group="${key}">
        <span>${title}</span><span>${list.length} ▸</span>
      </button>
      <div class="group-body collapsed" id="group-${key}">
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

  bindStoreEditButtons();
  bindStoreDeleteButtons();
}



function editStore(storeId) {
  if (currentRole !== "admin") return;

  const store = storesCache.find(item => String(item.id) === String(storeId));
  if (!store) {
    if (el("saveStoreStatus")) el("saveStoreStatus").textContent = "Magazinul nu a fost găsit.";
    return;
  }

  el("newStoreId").value = store.id || storeId;
  el("newStoreName").value = store.name || "";
  el("newStoreCategory").value = normCategory(store.category || store.type) || "carrefour";
  toggleStoreFormat();

  if (el("newStoreCategory").value === "carrefour") {
    el("newStoreFormat").value = String(store.format || "hiper").toLowerCase();
  }

  el("newStoreActive").value = store.active === false ? "false" : "true";

  if (el("saveStoreStatus")) {
    el("saveStoreStatus").textContent = `Editezi magazinul ${store.name || storeId} · ID ${storeId}.`;
  }

  const formTarget = el("newStoreId");
  if (formTarget) {
    formTarget.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => el("newStoreName")?.focus(), 300);
  }
}

function bindStoreEditButtons() {
  document.querySelectorAll("[data-edit-store]").forEach(button => {
    button.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      editStore(button.dataset.editStore);
    };
  });
}

async function deleteStorePermanently(storeId, storeName) {
  if (currentRole !== "admin") return;

  const confirmed = confirm(`Sigur vrei să ștergi definitiv magazinul "${storeName}" (ID ${storeId})?`);
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "stores", String(storeId)));
    el("saveStoreStatus").textContent = `Magazinul ${storeName} a fost șters definitiv.`;
    await loadStores();
  } catch (error) {
    console.error("Ștergere magazin:", error);
    el("saveStoreStatus").textContent = "Magazinul nu a putut fi șters.";
  }
}

function bindStoreDeleteButtons() {
  document.querySelectorAll("[data-delete-store]").forEach(button => {
    button.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      deleteStorePermanently(button.dataset.deleteStore, button.dataset.storeName || button.dataset.deleteStore);
    };
  });
}

function toggleStoreFormat() {
  const isCarrefour = el("newStoreCategory").value === "carrefour";
  el("newStoreFormat").classList.toggle("hidden", !isCarrefour);
}

async function saveStore() {
  const id = el("newStoreId").value.trim();
  const name = el("newStoreName").value.trim();
  const category = el("newStoreCategory").value;

  if (!id || !name) {
    el("saveStoreStatus").textContent = "Completează ID-ul și numele magazinului.";
    return;
  }

  const data = {
    name,
    category,
    active: el("newStoreActive").value === "true"
  };
  if (category === "carrefour") data.format = el("newStoreFormat").value;
  else data.format = "";

  await setDoc(doc(db, "stores", id), data, { merge: true });
  el("saveStoreStatus").textContent = "Magazinul a fost salvat. Lista rămâne restrânsă.";
  el("newStoreId").value = "";
  el("newStoreName").value = "";
  el("newStoreActive").value = "true";
  await loadStores();
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

async function saveUserProfile(){if(!isPrimaryAdmin()){el("userStatus").textContent="Doar Adminul principal poate modifica drepturile.";return;}const email=el("userEmail").value.trim().toLowerCase();if(!email){el("userStatus").textContent="Completează emailul.";return;}await setDoc(doc(db,"users",email),{displayName:el("userDisplayName")?.value||"",role:el("userRole").value,category:el("userCategory").value,canAdd:el("userCanAdd").checked,canManage:el("userCanManage").checked,canManageUsers:false,updatedAt:serverTimestamp(),updatedBy:currentEmail},{merge:true});const savedName=el("userDisplayName")?.value||"";
el("userStatus").textContent="Drepturile au fost salvate.";
await loadUsers();}


async function recordShare(method) {
  if (!currentOpenMaterial) return;
  try {
    await addDoc(collection(db, "shares"), {
      materialId: currentOpenMaterial.id,
      title: currentOpenMaterial.title || "",
      type: currentOpenMaterial.type || "",
      method,
      email: currentEmail,
      storeId: currentStoreId,
      storeName: currentStoreName,
      storeFormat: currentStoreFormat,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.warn("Distribuirea nu a putut fi înregistrată.", error);
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
    if (page === "usersPage") await loadUsers();
    if (page === "storesPage") await loadStores();
    showPage(page);
    closeMenu();
  });
});


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


const GEO_ADDRESS_BY_NAME = {"barlad": "Bld. Republicii nr. 320, Barlad, Jud. Vaslui", "ploiesti 2": "Piata 1 Decembrie 1918 nr. 1, Ploiesti, Jud. Prahova", "sfantu gheorghe": "Str. Lunca Oltului nr. 31-35, Sfantu Gheorghe, Jud. Covasna", "colosseum": "Sos. Chitilei nr. 284-286, Bucuresti Sector 1", "piatra neamt": "Bld. Decebal nr. 79, Piatra Neamt, Jud. Neamt", "drobeta": "Bd. Tudor Vladimirescu nr. 126, bl. IS4A, jud. Mehedinti", "alba iulia": "Str. Alexandru Ioan Cuza nr. 2, Alba Iulia, Jud. Alba", "craiova": "Calea Severinului nr. 61, Craiova, Jud. Dolj", "arad": "Calea Aurel Vlaicu nr. 14, Arad, Jud. Arad", "roman": "Strada Mihai Viteazul nr. 3, Roman Value Center, Roman, Jud. Neamt", "targu jiu": "Str. Ecaterina Teodoroiu, nr. 19, Targu Jiu, jud. Gorj", "iasi felicia": "Str. Bucium nr. 36, Iasi, Jud. Iasi", "pitesti": "Str. Victoriei nr.85, Pitesti", "chiajna": "Autostrada A1 km 11.4, Comuna Chiajna, Jud. Ilfov", "galati": "Strada George Cosbuc nr. 251, Galati, Jud. Galati", "rm. valcea": "Str. Ferdinand nr. 38, Ramnicu Valcea, Jud. Valcea", "braila": "Str. Mihai Eminescu, nr. 90, Braila, jud. Braila", "suceava": "Calea Unirii nr. 27-27bis, Suceava, Jud. Suceava", "city park": "Str. Alexandru Lapusneanu nr. 116c, Constanta, Jud. Constanta", "bratianu": "Str. Cumpenei nr. 2, Constanta, Jud. Constanta", "alexandriei": "Sos. Alexandria nr. 152, Bucuresti Sector 5", "pantelimon": "Sos. Vergului nr. 20, Bucuresti Sector 2", "cluj 2": "Bld. 1 Decembrie nr. 142, Cluj-Napoca, Jud. Cluj", "bacau": "Str. Milcov nr. 55", "ploiesti afi": "Str. Calomfirescu nr. 2, Ploiesti, Jud. Prahova", "lujerului": "Bld. Iuliu Maniu nr. 19, Bucuresti Sector 6", "drobeta 2": "Aleea Constructorului nr. 1, Drobeta-Turnu Severin, Jud. Mehedinti", "oradea lotus": "Str. Nufarului nr. 30, Oradea, Jud. Bihor", "zalau": "Str. Iuliu Maniu, nr. 25, jud. Zalau", "buzau": "Bulevardul Unirii nr. 232, Buzau, Jud. Buzau", "iasi valea lupului": "Sat. Valea Lupului, com. Valea Lupului, jud. Iasi", "gilau": "Str Principala nr 229 Comuna Gilau", "timisoara bucovinei": "Str. Bucovinei, nr. 47, Timisoara, jud. Timis", "chilia veche": "Str. Chilia Veche, nr. 2, Bucuresti, sector 6", "timisoara rebreanu": "Bd. Liviu Rebreanu, nr. 160, mun. Timisoara, jud. Timis", "caramfil": "Str. Nicolae Caramfil, nr. 71-73, Bucuresti, sector 1", "iasi niciman": "Str. Niciman nr. 2, Iasi, jud. Iasi", "berceni": "Bd. 1 Mai, nr. 61E, Berceni, jud. Ilfov", "iasi alexandru": "Piata Voievozilor nr. 1, bl. A8-A9, jud. Iasi", "galati dunarea": "Bd. Brailei, nr. 220, Galati, jud. Galati", "cultural (obregia)": "Bd. Alexandru Obregia, nr. 31, bloc 15, Bucuresti, sector 4", "timisoara 3": "Bd. Dambovita, nr. 49A, Timisoara, jud. Timis", "brasov cosmos": "Str. Uranus, nr. 1, jud. Brasov", "regie": "Str. Economu Cezarescu, nr. 34-42, sector 6, Bucuresti", "dorobanti": "Calea Dorobanti, nr. 31-33, Bucuresti, sector 1", "craiova fagaras": "Str. Fagaras, nr. 3-5, Craiova, jud. Dolj", "subcetate": "Str. Subcetate, nr. 49, sector 1, Bucuresti", "brasov zorilor": "Str. Zorilor, nr. 4, jud. Brasov (Brasov 406 Zorilor)", "targu mures": "Tg. Mures Dambu 1848  - BLD.1848 46A, TG, MURES", "cloud9": "Soseaua Pipera, nr. 61", "cluj ferdinand": "Strada Regele Ferdinand nr. 22-26, Cluj-Napoca, Jud Cluj", "buzias": "Loc. Buziaș, Oraș Buziaș, Strada PIATA BISERICII, Nr. 15, Judet Timiș", "cosmopolis plaza": "Str. Europa, Nr. 9 bis, tarla 44, jud. Ilfov", "brasov privilegio": "Strada Traian Nr. 4, Brasov, Jud. Brasov", "ipotesti suceava": "Str. Mihai Viteazu nr. 410C, jud. Suceava", "ferdinand bucuresti": "Bulevardul Ferdinand I nr.118, București 021395", "cluj zorilor": "Str. L. Pasteur nr. 75-77, Cluj-Napoca", "minis titan": "Str. Barajul Dunării nr. 12A, Bl.C9, Bucuresti", "rasnov": "Calea Braşovului nr. 1, Rasnov", "giurgiu": "Str. Tineretului nr. 88 (fosta Constantin Brâncoveanu), Giurgiu", "ciorogarla darvari": "Sat Dârvari, comuna Ciorogârla, Strada Adunaţi nr. 44, Jud. Ilfov", "victor brauner": "Str. Victor Brauner nr. 42B, sc. A - B, parter, Lot 1, sector 3", "bragadiru cristalului": "Str. Cristalului, Nr. 6, Bragadiru, jud. Ilfov", "volovat": "Str. Stefan cel Mare nr. 212, jud. Suceava", "onesti": "Bd. Belvedere, nr. 1G, jud. Bacau", "lugoj2": "str. Bucegi, nr. 1-3, Lugoj, jud. Timis", "orsova": "Str 1 Decembrie 1918 jud Mehedinti", "lugoj 1": "Str Nicolae Balcescu, nr 5.", "sanpetru": "Sânpetru Shop Park, Corp 2, parter, jud. Brașov", "orhideea towers": "Sos. Orhideelor, nr. 15A, Bucuresti, sector 6", "cosmopolis 2": "Linia de Centura, nr. 50, in incinta Complex Rezidental Cosmopolis, tarla 44, parcela 337, jud. Ilfov", "iasi nicolina": "Sos. Nicolina, nr. 116, bl. 1011, sc. Tr. I, parter, ap. spatiu comercial, Iasi", "sibiu": "Str. Revolutiei, nr. 1A, ap. nr. 5 (partial), nr. 7, nr. 8, nr. 9, mun. Sibiu, jud. Sibiu", "oradea republicii": "Calea Republicii nr. 1, jud. Bihor", "brasov muresenilor": "Str. Sf. Ioan, nr. 2, jud. Brasov", "cluj septimiu albini": "Str. Septimiu Albini, nr. 140-142-144, jud. Cluj", "iasi gemi": "Calea Galata, nr. 5-9, bloc F3A, parter, jud. Iasi", "iasi palas": "Iasi Palas Campus, Cladirea C+D, Str. Sf. Andrei, Nr. 39A", "mario plaza": "Calea Dorobantilor, nr. 172, Bucuresti, sector 1", "cosmopolis 3": "Str. Europa nr. 9bis, jud. Ilfov (Corp B)", "craiova valea rosie": "Str. G-ral Magheru nr. 130, Craiova, judetul Dolj", "cotroceni one": "Str. Sergent Nutu Ion nr. 44, Bucuresti", "constanta stefan cel mare": "Str. Stefan cel Mare nr. 24, bloc M6, parter, jud. Constanta", "joy residence": "Str. Biruintei nr.87, Joy Residence, Bloc 1, scara A, jud. Ilfov", "navodari biruintei": "Str. Brizei nr. 4-14, spatiul comercial nr. 1, jud. Constanta", "otopeni aeroport": "Calea Bucureştilor nr. 224E, Otopeni, Ilfov", "bucuresti basarabiei": "Bd. Basarabia nr. 64 si 66, sector 2, Bucuresti", "voluntari 1d": "Bd. Pipera 1D-6, Voluntari", "bucuresti piata rosetti": "Piata Rosetti nr. 3", "bucuresti penes curcanul": "Str. Penes Curcanul nr. 14, sector 3", "brasov galerie": "Calea Bucuresti, Nr. 107, Brasov, Jud. Brasov", "buzau unirii 48a": "Bd. Unirii nr. 48A", "bucuresti win herastrau": "Mun. Bucureşti, sector 1, str. Barajul Argeş nr. 8A, WIN HERĂSTRĂU", "constanta dezrobirii": "Constanța, Strada Dezrobirii nr. 92, județul Constanța", "brasov republicii": "Brașov, Strada Republicii nr. 59, ap. 9, jud. Brașov", "calarasi": "Prelungirea Bucuresti nr. 24, jud. Calarasi", "adjud": "Str. Republicii bl. 90, scara 1, parter, județul Vrancea", "bolotesti": "Sat Gagesti Str Principala nr 308 com Bolotesti", "maicanesti": "Str. Domneasca nr. 21, jud. Vrancea", "voluntari 2": "Bd. Voluntari nr. 72bis, oras Voluntari", "targu frumos": "Str. Buznea, nr. 5, jud. Iasi", "vicovu de jos": "Com. Vicovu de Jos, Sat Vicovu de Jos Nr. 1351, parter, Jud. Suceava", "cluj 21 decembrie": "Bd. 21 Decembrie 1989, nr. 148, bl. B1, ap. 115, jud. Cluj", "focsani": "Str. Republicii nr. 41, jud. Vrancea", "cluj dionisie": "Str. Dionisie Roman nr. 1", "dealu tugulea": "Str. Dealul Țugulea nr. 3, bloc O1C, parter, sector 6 și Strada Roșia Montană nr. 2, bloc O1B, parter, sector 6", "sacele": "Loc. Săcele, Strada Viitorului nr. 23-26, jud. Brașov", "brasov piata sfatului": "Piata Sfatului nr. 5", "giroc": "Str. Ciocarliei nr. 6, jud. Timis", "iasi ciric": "Str Ciric nr 2, Iasi", "arad ziridava": "Str. Revoluţiei nr. 39-43, Arad, jud Arad,", "brasov grivitei": "Str. Grivitei, nr. 47, jud. Brasov", "brasov harman": "Str. Avram Iancu, nr. 45-46, com. Harman, jud. Brasov", "brasov bod": "Str. Tudor Vladimirescu, nr. 271, Bod, jud. Brasov", "galati pescarus": "Str. Vadul Sacalelor, nr. 1, bl. Pescarus 1, jud. Galati", "brasov branduselor": "Str. Branduselor, nr. 84, jud. Brasov", "galati domneasca": "Str. Domneasca, nr. 142, et. subsol+parter, ap. unit. 110, bloc B, mun. Galati, jud. Galati", "harsova": "Str. Revolutiei, nr. 40, Harsova, jud. Constanta", "brasov gospodarilor": "Str. Gospodarilor, nr. 5, jud. Brasov", "brasov prunului": "Str. Prunului, nr. 13, jud. Brasov", "bv mircea cel batran": "Str. Mircea cel Batran, nr. 39, bl. 51, parter, jud. Brasov", "calarasi republicii": "Bd. Republicii, nr. 1, jud. Calarasi", "brasov avantgarden": "Str. Graurului, nr. 17, etaj demisol, jud. Brasov", "zimnicea mihai viteazul": "Str. Mihai Viteazul, nr. 1, Zimnicea, jud. Teleorman", "brasov zizinului": "Str. Zizinului, nr. 2, bloc 40, scara C, parter, jud. Brasov", "galati faleza marea unire": "Bd. Marea Unire, nr. 11. cartier Tiglina 1, sp. comercial 8, bl. U3, sc. 1, et. parter, jud. Galati", "voluntari market nord": "Bd. Pipera – Tunari, nr. 200A, complex Vita Bella, corp A, spatiul comercial, jud. Ilfov", "targu neamt": "Bd. Mihai Eminescu, nr. 4, Targu Neamt, jud. Neamt", "brasov crinului": "Str. Crinului, nr. 75, jud. Brasov", "brasov oltet": "Str. Oltet, nr. 31-33, bloc 307, jud. Brasov", "brasov ion creanga": "Str. Ion Creanga, nr. 17, bloc 16, jud. Brasov", "brasov paraului": "Str. Paraului, nr. 21, jud. Brasov", "braila buzaului": "Sos. Buzaului, nr. 3, cartier Buzaului, bloc B2, jud. Braila", "brasov stadionului": "Str. Stadionului, nr. 2, jud. Brasov", "constanta muncel": "Str. Muncel, nr. 40C, jud. Constanta", "bucuresti zagazului": "Str. Zagazului, nr. 13-19, Bucuresti, sector 1", "afumati": "Sos. Bucuresti-Urziceni, nr. 160, Afumati, jud. Ilfov", "brasov saturn": "Bd. Saturn, nr. 31-33, jud. Brasov", "galati micro": "Str. Brailei, nr. 196, parter, jud. Galati", "buc. postalionului": "Str Postalionului nr 2-4 Bucuresti sector 4", "galati constructorilor": "Str. Constructorilor, Nr. 47, parter, Galati", "galati brailei 173a": "Str. Brailei, Nr. 173A, Galati", "cluj jora": "Str. Campina, Nr. 10, Cluj Napoca, jud. Cluj", "luduș": "Str. Viitorului, nr. 12, oras Ludus, jud. Mures", "craiova balaci": "Bd. Ilie Balaci nr. 1, municipiul Craiova, judet Dolj", "calarasi dor marunt": "Sos. Bucuresti-Constanta nr. 72, Sat Dor Marunt, Com. Dor Marunt, jud. Calarasi", "brasov colonia bod": "Str. Fabricii, Nr. FN, loc. Colonia Bod, judet Brasov", "galati siderurgistilor": "Str. Siderurgistilor, Nr. 35, Galati, jud. Galati", "craiova enescu": "Str. George Enescu, Nr. 76, Bl. 15, Craiova, jud. Dolj", "cugir market": "Str. Tineretului, Nr. 4, Cugir, jud. Alba", "buc. rami ajustorului": "Str. Ajustorului, Nr. 12, parter, bloc F, sector 6, Bucuresti"};

/* GEOLOCALIZARE - modul izolat, nu modifică routerul existent */
async function openGeoSafePage() {
  try {
    document.querySelectorAll(".page").forEach(p => p.classList.add("hidden"));
    const page = document.getElementById("geoSafePage");
    if (page) page.classList.remove("hidden");

    let list = Array.isArray(storesCache) ? storesCache : [];
    if (!list.length) {
      const snap = await getDocs(collection(db, "stores"));
      list = snap.docs.map(d => ({id:d.id, ...d.data()}));
    }

    const select = document.getElementById("geoSafeStore");
    if (!select) return;
    select.innerHTML = '<option value="">Selectează magazinul...</option>' +
      list.filter(s => s.active !== false)
          .sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id),"ro"))
          .map(s=>`<option value="${escapeHtml(String(s.id))}">${escapeHtml(s.name||String(s.id))} · ID ${escapeHtml(String(s.id))}</option>`)
          .join("");
  } catch(err) {
    console.error("Geolocalizare:", err);
  }
}

document.getElementById("geoSafeBtn")?.addEventListener("click", openGeoSafePage);

document.getElementById("geoSafeStore")?.addEventListener("change", async function() {
  const id = this.value;
  if (!id) return;
  let store = Array.isArray(storesCache) ? storesCache.find(s=>String(s.id)===String(id)) : null;
  if (!store) {
    const snap = await getDoc(doc(db,"stores",String(id)));
    if (snap.exists()) store = {id:snap.id,...snap.data()};
  }
  if (!store) return;
  const excelAddress = GEO_ADDRESS_BY_NAME[String(store.name || "").trim().toLowerCase()] || "";
  document.getElementById("geoSafeAddress").value = store.address || excelAddress;
  document.getElementById("geoSafeLat").value = store.latitude ?? "";
  document.getElementById("geoSafeLng").value = store.longitude ?? "";
  const status = document.getElementById("geoSafeStatus");
  if (status && !store.address && excelAddress) {
    status.textContent = "Adresa a fost completată automat din lista magazinelor.";
  }
});

document.getElementById("geoSafeSave")?.addEventListener("click", async function() {
  const id = document.getElementById("geoSafeStore").value;
  const address = document.getElementById("geoSafeAddress").value.trim();
  const lat = Number(document.getElementById("geoSafeLat").value.trim().replace(",","."));
  const lng = Number(document.getElementById("geoSafeLng").value.trim().replace(",","."));
  const status = document.getElementById("geoSafeStatus");

  if (!id) { status.textContent="Selectează magazinul."; return; }
  if (!address) { status.textContent="Completează adresa."; return; }
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) { status.textContent="Latitudine invalidă."; return; }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) { status.textContent="Longitudine invalidă."; return; }

  try {
    await setDoc(doc(db,"stores",String(id)), {address, latitude:lat, longitude:lng}, {merge:true});
    if (Array.isArray(storesCache)) {
      const s=storesCache.find(x=>String(x.id)===String(id));
      if (s) Object.assign(s,{address,latitude:lat,longitude:lng});
    }
    status.textContent="Coordonatele au fost salvate.";
  } catch(err) {
    console.error(err);
    status.textContent="Eroare la salvare.";
  }
});


/* GEO AUTO - caută coordonatele DOAR la apăsarea utilizatorului */
document.getElementById("geoSafeFind")?.addEventListener("click", async function() {
  const addressInput = document.getElementById("geoSafeAddress");
  const latInput = document.getElementById("geoSafeLat");
  const lngInput = document.getElementById("geoSafeLng");
  const status = document.getElementById("geoSafeStatus");
  const storeSelect = document.getElementById("geoSafeStore");
  const button = this;

  const address = (addressInput?.value || "").trim();
  if (!storeSelect?.value) {
    status.textContent = "Selectează mai întâi magazinul.";
    return;
  }
  if (!address) {
    status.textContent = "Completează adresa magazinului.";
    addressInput?.focus();
    return;
  }

  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Se caută...";
  status.textContent = "Caut coordonatele pentru adresa introdusă...";

  try {
    const query = encodeURIComponent(`${address}, România`);
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ro&addressdetails=1&q=${query}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json", "Accept-Language": "ro" }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const results = await response.json();
    if (!Array.isArray(results) || !results.length) {
      status.textContent = "Nu am găsit coordonate pentru această adresă. Verifică adresa și încearcă din nou.";
      return;
    }

    const result = results[0];
    latInput.value = Number(result.lat).toFixed(7);
    lngInput.value = Number(result.lon).toFixed(7);
    status.textContent = `Coordonate găsite. Verifică valorile și apasă Salvează.`;
  } catch (error) {
    console.error("Geocodare adresă:", error);
    status.textContent = "Nu am putut căuta coordonatele acum. Adresa și câmpurile existente nu au fost modificate.";
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
});
