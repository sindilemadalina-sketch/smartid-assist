import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import {
  getFirestore, collection, getDocs, addDoc, getDoc, setDoc, deleteDoc,
  updateDoc, doc, increment, serverTimestamp
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
  if (currentRole === "admin" || currentRole === "suport") return true;
  return material.categories.includes(currentCategory);
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
  el("menuBtn").classList.toggle("hidden", currentRole !== "admin");

  if (currentRole === "admin") {
    await loadDashboard();
    showPage("dashboardPage");
  } else {
    renderEquipment();
    showPage("equipmentPage");
  }
}

async function login() {
  el("loginError").textContent = "";
  el("loginBtn").disabled = true;
  el("loginBtn").textContent = "Se autentifică...";

  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      el("email").value.trim().toLowerCase(),
      el("password").value
    );

    currentEmail = (credential.user.email || "").toLowerCase();
    const profileSnap = await getDoc(doc(db, "users", currentEmail));
    if (!profileSnap.exists()) throw new Error("Contul nu are rol atribuit în Firestore.");

    const profile = profileSnap.data();
    currentRole = normRole(profile.role);
    currentCategory = normCategory(profile.category);

    if (!["admin", "suport", "carrefour", "franciza"].includes(currentRole)) {
      throw new Error("Rolul utilizatorului nu este valid.");
    }

    if (currentRole === "admin" || currentRole === "suport") {
      await finishLogin();
    } else {
      await ensureStores();
      el("storeModal").classList.add("open");
      el("storeCode").focus();
    }
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

  el("equipmentPageTitle").textContent = category === "franciza" ? "Franciză" : "Carrefour";
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

  el("materialsTitle").textContent = selectedMaterialType === "videoclip" ? "Videoclipuri" : "Proceduri";
  el("materialsSubtitle").textContent = selectedEquipmentLabel;
  const grid = el("materialsGrid");
  grid.innerHTML = "";

  if (!list.length) {
    const message = selectedMaterialType === "videoclip"
      ? `Nu există încă videoclipuri disponibile pentru ${selectedEquipmentLabel}.`
      : `Nu există încă proceduri disponibile pentru ${selectedEquipmentLabel}.`;
    grid.innerHTML = `<div class="empty">${escapeHtml(message)}</div>`;
    return;
  }

  list.forEach(material => {
    const yt = youtubeId(material.url || "");
    const preview = material.type === "videoclip" && yt
      ? `<div class="thumb"><img src="https://img.youtube.com/vi/${yt}/hqdefault.jpg" alt=""><div class="play">▶</div></div>`
      : `<div class="thumb">▣</div>`;

    const card = document.createElement("article");
    card.className = "material-card";
    card.innerHTML = `${preview}<div class="material-body"><h3>${escapeHtml(material.title || "Material")}</h3><p>${escapeHtml(material.description || "")}</p></div>`;
    card.addEventListener("click", () => openViewer(material));
    grid.appendChild(card);
  });
}

async function openViewer(material) {
  currentOpenMaterial = material;

  if (material.type === "procedura") {
    try {
      await addDoc(collection(db, "materialViews"), {
        materialId: material.id,
        title: material.title || "",
        type: material.type,
        email: currentEmail,
        storeId: currentStoreId,
        storeName: currentStoreName,
        storeFormat: currentStoreFormat,
        createdAt: serverTimestamp()
      });
      await updateDoc(doc(db, "videos", material.id), { views: increment(1) });
    } catch (error) {
      console.warn("Vizualizarea nu a putut fi înregistrată.", error);
    }

    window.open(material.url || "about:blank", "_blank", "noopener,noreferrer");
    currentOpenMaterial = null;
    return;
  }

  el("viewerTitle").textContent = material.title || "Material";
  const yt = youtubeId(material.url || "");
  el("viewerFrame").src = yt
    ? `https://www.youtube-nocookie.com/embed/${yt}?rel=0&cc_load_policy=0&playsinline=1`
    : material.url || "about:blank";
  el("viewer").classList.add("open");

  try {
    await addDoc(collection(db, "materialViews"), {
      materialId: material.id,
      title: material.title || "",
      type: material.type,
      email: currentEmail,
      storeId: currentStoreId,
      storeName: currentStoreName,
      storeFormat: currentStoreFormat,
      createdAt: serverTimestamp()
    });
    await updateDoc(doc(db, "videos", material.id), { views: increment(1) });
  } catch (error) {
    console.warn("Vizualizarea nu a putut fi înregistrată.", error);
  }
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
    await updateDoc(doc(db, "videos", editingMaterialId), payload);
    el("materialStatus").textContent = "Modificările au fost salvate.";
  } else {
    await addDoc(collection(db, "videos"), {
      ...payload,
      views: 0,
      createdAt: serverTimestamp(),
      createdBy: currentEmail
    });
    el("materialStatus").textContent = "Materialul a fost adăugat.";
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
  window.scrollTo({top:0, behavior:"smooth"});
}

async function renderAdminMaterials() {
  await loadMaterials();
  const container = el("adminMaterialsList");
  if (!materials.length) {
    container.innerHTML = '<div class="empty">Nu există materiale.</div>';
    return;
  }

  container.innerHTML = materials.map(material => {
    const tags = material.tags ? `<div class="material-tags">🏷 ${escapeHtml(material.tags)}</div>` : '<div class="material-tags">🏷 Fără tag-uri</div>';
    const views = Number(material.views || 0);
    return `
      <div class="admin-material-row">
        <b>${escapeHtml(material.title || "Material")}</b>
        <span class="badge">${material.type === "videoclip" ? "Videoclip" : "Procedură"}</span>
        <div class="store-meta">${escapeHtml((material.categories || []).join(", "))} · ${escapeHtml((material.equipment || []).join(", "))}</div>
        ${tags}
        <div class="material-info">👁 ${views} vizualizări${material.createdBy ? ` · Adăugat de ${escapeHtml(material.createdBy)}` : ""}</div>
        <div class="row-actions">
          <button class="secondary edit-material-btn" data-edit-material="${material.id}">✏️ Editează</button>
          <button class="danger" data-delete-material="${material.id}">Șterge</button>
        </div>
      </div>
    `;
  }).join("");

  container.querySelectorAll("[data-edit-material]").forEach(button => {
    button.addEventListener("click", () => startEditMaterial(button.dataset.editMaterial));
  });

  container.querySelectorAll("[data-delete-material]").forEach(button => {
    button.addEventListener("click", async () => {
      if (!confirm("Ștergi materialul?")) return;
      await deleteDoc(doc(db, "videos", button.dataset.deleteMaterial));
      if (editingMaterialId === button.dataset.deleteMaterial) resetMaterialForm();
      await renderAdminMaterials();
    });
  });
}

async function loadDashboard() {
  try {
    const [sessionsSnap, viewsSnap, sharesSnap] = await Promise.all([
      getDocs(collection(db, "sessions")),
      getDocs(collection(db, "materialViews")),
      getDocs(collection(db, "shares"))
    ]);
    const sessions = sessionsSnap.docs.map(item => item.data());
    const views = viewsSnap.docs.map(item => item.data());
    const shares = sharesSnap.docs.map(item => ({ id: item.id, ...item.data() }));

    el("statLogins").textContent = sessions.length;
    el("statStores").textContent = new Set(sessions.map(item => item.storeId).filter(Boolean)).size;
    el("statVideos").textContent = views.filter(item => normType(item.type) === "videoclip").length;
    el("statProcedures").textContent = views.filter(item => normType(item.type) === "procedura").length;
    el("statShares").textContent = shares.length;

    await loadMaterials();
    const videoViews = views.filter(item => normType(item.type) === "videoclip").length;
    const procedureViews = views.filter(item => normType(item.type) === "procedura").length;
    const totalViews = videoViews + procedureViews;
    const videoAngle = totalViews ? (videoViews / totalViews) * 360 : 0;

    el("diagramVideos").textContent = videoViews;
    el("diagramProcedures").textContent = procedureViews;
    el("diagramTotal").textContent = totalViews;

    el("usageDiagram").style.background = totalViews
      ? `conic-gradient(#6d28d9 0deg ${videoAngle}deg, #c026d3 ${videoAngle}deg 360deg)`
      : "conic-gradient(#e5e7eb 0deg 360deg)";
  } catch (error) {
    console.warn("Dashboard-ul nu a putut fi încărcat.", error);
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
      <div class="store-row">
        <b>${escapeHtml(store.name || store.id)}</b>
        <div class="store-meta">
          ID: ${escapeHtml(store.id)} ·
          <span class="${store.active === false ? "store-status-inactive" : "store-status-active"}">
            ${store.active === false ? "Inactiv" : "Activ"}
          </span>
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
  el("saveStoreStatus").textContent = "Magazinul a fost salvat.";
  el("newStoreId").value = "";
  el("newStoreName").value = "";
  await loadStores();
}


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

el("loginBtn").addEventListener("click", login);
el("password").addEventListener("keydown", event => { if (event.key === "Enter") login(); });
el("storeContinueBtn").addEventListener("click", continueWithStore);
el("storeLogoutBtn").addEventListener("click", cancelStoreSelection);
el("logoutBtn").addEventListener("click", async () => { await signOut(auth); location.reload(); });
el("menuBtn").addEventListener("click", openMenu);
el("shareWhatsAppBtn").addEventListener("click", shareWhatsApp);
el("shareEmailBtn").addEventListener("click", shareEmail);
el("copyLinkBtn").addEventListener("click", copyMaterialLink);
el("sharesCard").addEventListener("click", openSharesHistory);
el("closeSharesModalBtn").addEventListener("click", () => el("sharesModal").classList.remove("open"));
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
      currentCategory = "carrefour";
      renderEquipment();
    }
    if (page === "addMaterialPage") await renderAdminMaterials();
    if (page === "storesPage") await loadStores();
    showPage(page);
    closeMenu();
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

renderEquipmentChoices();
toggleStoreFormat();
