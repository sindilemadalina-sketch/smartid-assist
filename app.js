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



/* GEO LISTA + IDENTIFICARE */
const GEO_EXCEL_STORES = [{"name": "Barlad", "address": "Bld. Republicii nr. 320, Barlad, Jud. Vaslui"}, {"name": "Ploiesti 2", "address": "Piata 1 Decembrie 1918 nr. 1, Ploiesti, Jud. Prahova"}, {"name": "Sfantu Gheorghe", "address": "Str. Lunca Oltului nr. 31-35, Sfantu Gheorghe, Jud. Covasna"}, {"name": "Colosseum", "address": "Sos. Chitilei nr. 284-286, Bucuresti Sector 1"}, {"name": "Piatra Neamt", "address": "Bld. Decebal nr. 79, Piatra Neamt, Jud. Neamt"}, {"name": "Drobeta", "address": "Bld. Mihai Viteazul nr. 78, Drobeta-Turnu Severin, Jud. Mehedinti"}, {"name": "Alba Iulia", "address": "Str. Alexandru Ioan Cuza nr. 2, Alba Iulia, Jud. Alba"}, {"name": "Craiova", "address": "Calea Severinului nr. 61, Craiova, Jud. Dolj"}, {"name": "Arad", "address": "Calea Aurel Vlaicu nr. 14, Arad, Jud. Arad"}, {"name": "Roman", "address": "Strada Mihai Viteazul nr. 3, Roman Value Center, Roman, Jud. Neamt"}, {"name": "Targu Jiu", "address": "Strada Termocentralei nr. 10, Targu Jiu, Jud. Gorj"}, {"name": "Iasi Felicia", "address": "Str. Bucium nr. 36, Iasi, Jud. Iasi"}, {"name": "Pitesti", "address": "Strada Tudor Vladimirescu nr. 35-37, Pitesti, Jud. Arges"}, {"name": "Chiajna", "address": "Autostrada A1 km 11.4, Comuna Chiajna, Jud. Ilfov"}, {"name": "Galati", "address": "Strada George Cosbuc nr. 251, Galati, Jud. Galati"}, {"name": "Rm. Valcea", "address": "Str. Ferdinand nr. 38, Ramnicu Valcea, Jud. Valcea"}, {"name": "Braila", "address": "DN21 Sat Varsatura, Comuna Chiscani, Jud. Braila"}, {"name": "Suceava", "address": "Calea Unirii nr. 27-27bis, Suceava, Jud. Suceava"}, {"name": "City Park", "address": "Str. Alexandru Lapusneanu nr. 116c, Constanta, Jud. Constanta"}, {"name": "Bratianu", "address": "Str. Cumpenei nr. 2, Constanta, Jud. Constanta"}, {"name": "Alexandriei", "address": "Sos. Alexandria nr. 152, Bucuresti Sector 5"}, {"name": "Pantelimon", "address": "Sos. Vergului nr. 20, Bucuresti Sector 2"}, {"name": "Cluj 2", "address": "Bld. 1 Decembrie nr. 142, Cluj-Napoca, Jud. Cluj"}, {"name": "Bacau", "address": "Str. Milcov nr. 2-4, Bacau, Jud. Bacau"}, {"name": "Ploiesti Afi", "address": "Str. Calomfirescu nr. 2, Ploiesti, Jud. Prahova"}, {"name": "Lujerului", "address": "Bld. Iuliu Maniu nr. 19, Bucuresti Sector 6"}, {"name": "Drobeta 2", "address": "Aleea Constructorului nr. 1, Drobeta-Turnu Severin, Jud. Mehedinti"}, {"name": "Oradea Lotus", "address": "Str. Nufarului nr. 30, Oradea, Jud. Bihor"}, {"name": "Zalau", "address": "Bld. Mihai Viteazul nr. 58B, Zalau, Jud. Salaj"}, {"name": "Buzau", "address": "Bulevardul Unirii nr. 232, Buzau, Jud. Buzau"}, {"name": "Iasi Valea Lupului", "address": "Sat. Valea Lupului, com. Valea Lupului, jud. Iasi"}, {"name": "Gilau", "address": "Str Principala nr 229 Comuna Gilau"}, {"name": "Timisoara Bucovinei", "address": "Str. Bucovinei, nr. 47, Timisoara, jud. Timis"}, {"name": "Chilia Veche", "address": "Str. Chilia Veche, nr. 2, Bucuresti, sector 6"}, {"name": "Timisoara Rebreanu", "address": "Bd. Liviu Rebreanu, nr. 160, mun. Timisoara, jud. Timis"}, {"name": "Caramfil", "address": "Str. Nicolae Caramfil, nr. 71-73, Bucuresti, sector 1"}, {"name": "Iasi Niciman", "address": "Str. Niciman nr. 2, Iasi, jud. Iasi"}, {"name": "Braila", "address": "Str. Mihai Eminescu, nr. 90, Braila, jud. Braila"}, {"name": "Targu Jiu", "address": "Str. Ecaterina Teodoroiu, nr. 19, Targu Jiu, jud. Gorj"}, {"name": "Zalau", "address": "Str. Iuliu Maniu, nr. 25, jud. Zalau"}, {"name": "Berceni", "address": "Bd. 1 Mai, nr. 61E, Berceni, jud. Ilfov"}, {"name": "Iasi Alexandru", "address": "Piata Voievozilor nr. 1, bl. A8-A9, jud. Iasi"}, {"name": "Galati Dunarea", "address": "Bd. Brailei, nr. 220, Galati, jud. Galati"}, {"name": "Cultural (Obregia)", "address": "Bd. Alexandru Obregia, nr. 31, bloc 15, Bucuresti, sector 4"}, {"name": "Timisoara 3", "address": "Bd. Dambovita, nr. 49A, Timisoara, jud. Timis"}, {"name": "Brasov Cosmos", "address": "Str. Uranus, nr. 1, jud. Brasov"}, {"name": "Regie", "address": "Str. Economu Cezarescu, nr. 34-42, sector 6, Bucuresti"}, {"name": "Dorobanti", "address": "Calea Dorobanti, nr. 31-33, Bucuresti, sector 1"}, {"name": "Craiova Fagaras", "address": "Str. Fagaras, nr. 3-5, Craiova, jud. Dolj"}, {"name": "Subcetate", "address": "Str. Subcetate, nr. 49, sector 1, Bucuresti"}, {"name": "Brasov Zorilor", "address": "Str. Zorilor, nr. 4, jud. Brasov (Brasov 406 Zorilor)"}, {"name": "Targu Mures", "address": "Tg. Mures Dambu 1848  - BLD.1848 46A, TG, MURES"}, {"name": "Cloud9", "address": "Soseaua Pipera, nr. 61"}, {"name": "Cluj Ferdinand", "address": "Strada Regele Ferdinand nr. 22-26, Cluj-Napoca, Jud Cluj"}, {"name": "Buzias", "address": "Loc. Buziaș, Oraș Buziaș, Strada PIATA BISERICII, Nr. 15, Judet Timiș"}, {"name": "Cosmopolis Plaza", "address": "Str. Europa, Nr. 9 bis, tarla 44, jud. Ilfov"}, {"name": "Brasov Privilegio", "address": "Strada Traian Nr. 4, Brasov, Jud. Brasov"}, {"name": "Ipotesti Suceava", "address": "Str. Mihai Viteazu nr. 410C, jud. Suceava"}, {"name": "Ferdinand Bucuresti", "address": "Bulevardul Ferdinand I nr.118, București 021395"}, {"name": "Cluj Zorilor", "address": "Str. L. Pasteur nr. 75-77, Cluj-Napoca"}, {"name": "Pitesti", "address": "Str. Victoriei nr.85, Pitesti"}, {"name": "Minis Titan", "address": "Str. Barajul Dunării nr. 12A, Bl.C9, Bucuresti"}, {"name": "Rasnov", "address": "Calea Braşovului nr. 1, Rasnov"}, {"name": "Giurgiu", "address": "Str. Tineretului nr. 88 (fosta Constantin Brâncoveanu), Giurgiu"}, {"name": "Ciorogarla Darvari", "address": "Sat Dârvari, comuna Ciorogârla, Strada Adunaţi nr. 44, Jud. Ilfov"}, {"name": "Victor Brauner", "address": "Str. Victor Brauner nr. 42B, sc. A - B, parter, Lot 1, sector 3"}, {"name": "Bragadiru Cristalului", "address": "Str. Cristalului, Nr. 6, Bragadiru, jud. Ilfov"}, {"name": "Volovat", "address": "Str. Stefan cel Mare nr. 212, jud. Suceava"}, {"name": "Onesti", "address": "Bd. Belvedere, nr. 1G, jud. Bacau"}, {"name": "Lugoj2", "address": "str. Bucegi, nr. 1-3, Lugoj, jud. Timis"}, {"name": "Orsova", "address": "Str 1 Decembrie 1918 jud Mehedinti"}, {"name": "Lugoj 1", "address": "Str Nicolae Balcescu, nr 5."}, {"name": "Sanpetru", "address": "Sânpetru Shop Park, Corp 2, parter, jud. Brașov"}, {"name": "Orhideea Towers", "address": "Sos. Orhideelor, nr. 15A, Bucuresti, sector 6"}, {"name": "Cosmopolis 2", "address": "Linia de Centura, nr. 50, in incinta Complex Rezidental Cosmopolis, tarla 44, parcela 337, jud. Ilfov"}, {"name": "Iasi Nicolina", "address": "Sos. Nicolina, nr. 116, bl. 1011, sc. Tr. I, parter, ap. spatiu comercial, Iasi"}, {"name": "Sibiu", "address": "Str. Revolutiei, nr. 1A, ap. nr. 5 (partial), nr. 7, nr. 8, nr. 9, mun. Sibiu, jud. Sibiu"}, {"name": "Oradea Republicii", "address": "Calea Republicii nr. 1, jud. Bihor"}, {"name": "Brasov Muresenilor", "address": "Str. Sf. Ioan, nr. 2, jud. Brasov"}, {"name": "Cluj Septimiu Albini", "address": "Str. Septimiu Albini, nr. 140-142-144, jud. Cluj"}, {"name": "Iasi Gemi", "address": "Calea Galata, nr. 5-9, bloc F3A, parter, jud. Iasi"}, {"name": "Iasi Palas", "address": "Iasi Palas Campus, Cladirea C+D, Str. Sf. Andrei, Nr. 39A"}, {"name": "Mario Plaza", "address": "Calea Dorobantilor, nr. 172, Bucuresti, sector 1"}, {"name": "Cosmopolis 3", "address": "Str. Europa nr. 9bis, jud. Ilfov (Corp B)"}, {"name": "Craiova Valea Rosie", "address": "Str. G-ral Magheru nr. 130, Craiova, judetul Dolj"}, {"name": "Cotroceni One", "address": "Str. Sergent Nutu Ion nr. 44, Bucuresti"}, {"name": "Constanta Stefan cel Mare", "address": "Str. Stefan cel Mare nr. 24, bloc M6, parter, jud. Constanta"}, {"name": "Joy Residence", "address": "Str. Biruintei nr.87, Joy Residence, Bloc 1, scara A, jud. Ilfov"}, {"name": "Navodari Biruintei", "address": "Str. Brizei nr. 4-14, spatiul comercial nr. 1, jud. Constanta"}, {"name": "Otopeni Aeroport", "address": "Calea Bucureştilor nr. 224E, Otopeni, Ilfov"}, {"name": "Bucuresti Basarabiei", "address": "Bd. Basarabia nr. 64 si 66, sector 2, Bucuresti"}, {"name": "Voluntari 1D", "address": "Bd. Pipera 1D-6, Voluntari"}, {"name": "Bucuresti Piata Rosetti", "address": "Piata Rosetti nr. 3"}, {"name": "Bucuresti Penes Curcanul", "address": "Str. Penes Curcanul nr. 14, sector 3"}, {"name": "Brasov Galerie", "address": "Calea Bucuresti, Nr. 107, Brasov, Jud. Brasov"}, {"name": "Buzau Unirii 48A", "address": "Bd. Unirii nr. 48A"}, {"name": "Bacau", "address": "Str. Milcov nr. 55"}, {"name": "Bucuresti WIN Herastrau", "address": "Mun. Bucureşti, sector 1, str. Barajul Argeş nr. 8A, WIN HERĂSTRĂU"}, {"name": "Constanta Dezrobirii", "address": "Constanța, Strada Dezrobirii nr. 92, județul Constanța"}, {"name": "Brasov Republicii", "address": "Brașov, Strada Republicii nr. 59, ap. 9, jud. Brașov"}, {"name": "Calarasi", "address": "Prelungirea Bucuresti nr. 24, jud. Calarasi"}, {"name": "Adjud", "address": "Str. Republicii bl. 90, scara 1, parter, județul Vrancea"}, {"name": "Bolotesti", "address": "Sat Gagesti Str Principala nr 308 com Bolotesti"}, {"name": "Maicanesti", "address": "Str. Domneasca nr. 21, jud. Vrancea"}, {"name": "Voluntari 2", "address": "Bd. Voluntari nr. 72bis, oras Voluntari"}, {"name": "Targu Frumos", "address": "Str. Buznea, nr. 5, jud. Iasi"}, {"name": "Vicovu de Jos", "address": "Com. Vicovu de Jos, Sat Vicovu de Jos Nr. 1351, parter, Jud. Suceava"}, {"name": "Cluj 21 Decembrie", "address": "Bd. 21 Decembrie 1989, nr. 148, bl. B1, ap. 115, jud. Cluj"}, {"name": "Drobeta", "address": "Bd. Tudor Vladimirescu nr. 126, bl. IS4A, jud. Mehedinti"}, {"name": "Focsani", "address": "Str. Republicii nr. 41, jud. Vrancea"}, {"name": "Cluj Dionisie", "address": "Str. Dionisie Roman nr. 1"}, {"name": "Dealu Tugulea", "address": "Str. Dealul Țugulea nr. 3, bloc O1C, parter, sector 6 și Strada Roșia Montană nr. 2, bloc O1B, parter, sector 6"}, {"name": "Sacele", "address": "Loc. Săcele, Strada Viitorului nr. 23-26, jud. Brașov"}, {"name": "Brasov Piata Sfatului", "address": "Piata Sfatului nr. 5"}, {"name": "Giroc", "address": "Str. Ciocarliei nr. 6, jud. Timis"}, {"name": "Iasi Ciric", "address": "Str Ciric nr 2, Iasi"}, {"name": "Arad Ziridava", "address": "Str. Revoluţiei nr. 39-43, Arad, jud Arad,"}, {"name": "Brasov Grivitei", "address": "Str. Grivitei, nr. 47, jud. Brasov"}, {"name": "Brasov Harman", "address": "Str. Avram Iancu, nr. 45-46, com. Harman, jud. Brasov"}, {"name": "Brasov Bod", "address": "Str. Tudor Vladimirescu, nr. 271, Bod, jud. Brasov"}, {"name": "Galati Pescarus", "address": "Str. Vadul Sacalelor, nr. 1, bl. Pescarus 1, jud. Galati"}, {"name": "Brasov Branduselor", "address": "Str. Branduselor, nr. 84, jud. Brasov"}, {"name": "Galati Domneasca", "address": "Str. Domneasca, nr. 142, et. subsol+parter, ap. unit. 110, bloc B, mun. Galati, jud. Galati"}, {"name": "Harsova", "address": "Str. Revolutiei, nr. 40, Harsova, jud. Constanta"}, {"name": "Brasov Gospodarilor", "address": "Str. Gospodarilor, nr. 5, jud. Brasov"}, {"name": "Brasov Prunului", "address": "Str. Prunului, nr. 13, jud. Brasov"}, {"name": "BV Mircea cel Batran", "address": "Str. Mircea cel Batran, nr. 39, bl. 51, parter, jud. Brasov"}, {"name": "Calarasi Republicii", "address": "Bd. Republicii, nr. 1, jud. Calarasi"}, {"name": "Brasov Avantgarden", "address": "Str. Graurului, nr. 17, etaj demisol, jud. Brasov"}, {"name": "Zimnicea Mihai Viteazul", "address": "Str. Mihai Viteazul, nr. 1, Zimnicea, jud. Teleorman"}, {"name": "Brasov Zizinului", "address": "Str. Zizinului, nr. 2, bloc 40, scara C, parter, jud. Brasov"}, {"name": "Galati Faleza Marea Unire", "address": "Bd. Marea Unire, nr. 11. cartier Tiglina 1, sp. comercial 8, bl. U3, sc. 1, et. parter, jud. Galati"}, {"name": "Voluntari Market Nord", "address": "Bd. Pipera – Tunari, nr. 200A, complex Vita Bella, corp A, spatiul comercial, jud. Ilfov"}, {"name": "Targu Neamt", "address": "Bd. Mihai Eminescu, nr. 4, Targu Neamt, jud. Neamt"}, {"name": "Brasov Crinului", "address": "Str. Crinului, nr. 75, jud. Brasov"}, {"name": "Brasov Oltet", "address": "Str. Oltet, nr. 31-33, bloc 307, jud. Brasov"}, {"name": "Brasov Ion Creanga", "address": "Str. Ion Creanga, nr. 17, bloc 16, jud. Brasov"}, {"name": "Brasov Paraului", "address": "Str. Paraului, nr. 21, jud. Brasov"}, {"name": "Braila Buzaului", "address": "Sos. Buzaului, nr. 3, cartier Buzaului, bloc B2, jud. Braila"}, {"name": "Brasov Stadionului", "address": "Str. Stadionului, nr. 2, jud. Brasov"}, {"name": "Constanta Muncel", "address": "Str. Muncel, nr. 40C, jud. Constanta"}, {"name": "Bucuresti Zagazului", "address": "Str. Zagazului, nr. 13-19, Bucuresti, sector 1"}, {"name": "Afumati", "address": "Sos. Bucuresti-Urziceni, nr. 160, Afumati, jud. Ilfov"}, {"name": "Brasov Saturn", "address": "Bd. Saturn, nr. 31-33, jud. Brasov"}, {"name": "Galati Micro", "address": "Str. Brailei, nr. 196, parter, jud. Galati"}, {"name": "Buc. Postalionului", "address": "Str Postalionului nr 2-4 Bucuresti sector 4"}, {"name": "Galati Constructorilor", "address": "Str. Constructorilor, Nr. 47, parter, Galati"}, {"name": "Galati Brailei 173A", "address": "Str. Brailei, Nr. 173A, Galati"}, {"name": "Cluj Jora", "address": "Str. Campina, Nr. 10, Cluj Napoca, jud. Cluj"}, {"name": "Luduș", "address": "Str. Viitorului, nr. 12, oras Ludus, jud. Mures"}, {"name": "Craiova Balaci", "address": "Bd. Ilie Balaci nr. 1, municipiul Craiova, judet Dolj"}, {"name": "Calarasi Dor Marunt", "address": "Sos. Bucuresti-Constanta nr. 72, Sat Dor Marunt, Com. Dor Marunt, jud. Calarasi"}, {"name": "Brasov Colonia Bod", "address": "Str. Fabricii, Nr. FN, loc. Colonia Bod, judet Brasov"}, {"name": "Galati Siderurgistilor", "address": "Str. Siderurgistilor, Nr. 35, Galati, jud. Galati"}, {"name": "Craiova Enescu", "address": "Str. George Enescu, Nr. 76, Bl. 15, Craiova, jud. Dolj"}, {"name": "Cugir Market", "address": "Str. Tineretului, Nr. 4, Cugir, jud. Alba"}, {"name": "Buc. Rami Ajustorului", "address": "Str. Ajustorului, Nr. 12, parter, bloc F, sector 6, Bucuresti"}];
let geoAdminStores=[];
function geoNorm(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();}
function geoExcelAddress(s){
 const n=geoNorm(s?.name); if(!n)return "";
 const x=GEO_EXCEL_STORES.find(v=>geoNorm(v.name)===n); if(x)return x.address;
 const c=GEO_EXCEL_STORES.filter(v=>{const z=geoNorm(v.name);return z&&(z.includes(n)||n.includes(z));});
 return c.length===1?c[0].address:"";
}
async function loadGeoAdminList(){
 const snap=await getDocs(collection(db,"stores"));
 geoAdminStores=snap.docs.map(d=>({id:d.id,...d.data()})).filter(s=>s.active!==false)
   .map(s=>({...s,address:String(s.address||geoExcelAddress(s)||"").trim()}))
   .sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id),"ro"));
 renderGeoAdminList();
}
function renderGeoAdminList(){
 const body=document.getElementById("geoListBody"); if(!body)return;
 const q=geoNorm(document.getElementById("geoListSearch")?.value);
 const rows=geoAdminStores.filter(s=>!q||geoNorm(`${s.name} ${s.id} ${s.address}`).includes(q));
 document.getElementById("geoListCount").textContent=`${rows.length} magazine`;
 body.innerHTML=rows.map(s=>`<tr><td><b>${escapeHtml(s.name||s.id)}</b><small>ID ${escapeHtml(String(s.id))}</small></td><td>${escapeHtml(s.address||"—")}</td><td>${s.latitude??"—"}</td><td>${s.longitude??"—"}</td><td><button class="geo-row-btn" data-geo-id="${escapeHtml(String(s.id))}">${s.latitude!=null&&s.longitude!=null?"Actualizeaza":"Gaseste coordonatele"}</button></td></tr>`).join("");
 body.querySelectorAll("[data-geo-id]").forEach(b=>b.onclick=()=>geocodeOneStore(b.dataset.geoId,b));
}
async function geocodeOneStore(id,b){
 const s=geoAdminStores.find(x=>String(x.id)===String(id)), st=document.getElementById("geoListStatus");
 if(!s?.address){st.textContent="Nu exista adresa.";return;}
 const old=b.textContent;b.disabled=true;b.textContent="Se cauta...";
 try{
  const q=encodeURIComponent(`${s.address}, Romania`);
  const r=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ro&q=${q}`,{headers:{"Accept":"application/json","Accept-Language":"ro"}});
  const a=await r.json(); if(!Array.isArray(a)||!a.length){st.textContent=`Nu am gasit coordonatele pentru ${s.name}.`;return;}
  const latitude=Number(a[0].lat),longitude=Number(a[0].lon);
  await setDoc(doc(db,"stores",String(id)),{address:s.address,latitude,longitude},{merge:true});
  s.latitude=latitude;s.longitude=longitude;st.textContent=`Coordonatele pentru ${s.name} au fost salvate.`;renderGeoAdminList();
 }catch(e){console.error(e);st.textContent="Cautarea nu a raspuns."}finally{b.disabled=false;b.textContent=old;}
}
document.getElementById("geoSafeBtn")?.addEventListener("click",async()=>{
 document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
 document.getElementById("geoSafePage")?.classList.remove("hidden"); await loadGeoAdminList();
});
document.getElementById("geoListSearch")?.addEventListener("input",renderGeoAdminList);

function geoDistanceKm(a,b,c,d){const R=6371,x=(c-a)*Math.PI/180,y=(d-b)*Math.PI/180;const z=Math.sin(x/2)**2+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(y/2)**2;return 2*R*Math.asin(Math.sqrt(z));}
async function identifyStoreByCurrentLocation(){
 if(!navigator.geolocation)return null;
 return new Promise(resolve=>navigator.geolocation.getCurrentPosition(async p=>{
  try{
   const snap=await getDocs(collection(db,"stores"));
   const a=snap.docs.map(d=>({id:d.id,...d.data()})).filter(s=>s.active!==false&&Number.isFinite(Number(s.latitude))&&Number.isFinite(Number(s.longitude)))
    .map(s=>({...s,distance:geoDistanceKm(p.coords.latitude,p.coords.longitude,Number(s.latitude),Number(s.longitude))})).sort((x,y)=>x.distance-y.distance);
   resolve(a[0]&&a[0].distance<=0.5?a[0]:null);
  }catch(e){resolve(null)}
 },()=>resolve(null),{enableHighAccuracy:true,timeout:8000,maximumAge:60000}));
}
window.identifyStoreByCurrentLocation=identifyStoreByCurrentLocation;
