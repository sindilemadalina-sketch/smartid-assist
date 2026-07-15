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
    const markerRef = doc(db, "system", "storesSeedV2");
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
      <p>Videoclipuri și proceduri pentru acest echipament.</p>
    </article>
  `).join("");

  document.querySelectorAll(".equipment-card").forEach(card => {
    card.addEventListener("click", () => {
      selectedEquipment = card.dataset.equipment;
      selectedEquipmentLabel = card.dataset.label;
      el("selectedEquipmentTitle").textContent = selectedEquipmentLabel;
      showPage("materialTypePage");
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
  el("viewerTitle").textContent = material.title || "Material";
  const yt = youtubeId(material.url || "");
  el("viewerFrame").src = material.type === "videoclip" && yt
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

  await addDoc(collection(db, "videos"), {
    title,
    url,
    type,
    categories,
    equipment,
    description: el("materialDescription").value.trim(),
    tags: el("materialTags").value.trim().toLowerCase(),
    views: 0,
    createdAt: serverTimestamp(),
    createdBy: currentEmail
  });

  ["materialTitle", "materialUrl", "materialDescription", "materialTags"].forEach(id => el(id).value = "");
  document.querySelectorAll('#addMaterialPage input[type="checkbox"]').forEach(input => input.checked = false);
  document.querySelector('input[name="materialCategory"][value="carrefour"]').checked = true;
  el("materialStatus").textContent = "Materialul a fost adăugat.";
  await loadMaterials();
  await renderAdminMaterials();
}

async function renderAdminMaterials() {
  await loadMaterials();
  const container = el("adminMaterialsList");
  if (!materials.length) {
    container.innerHTML = '<div class="empty">Nu există materiale.</div>';
    return;
  }

  container.innerHTML = materials.map(material => `
    <div class="admin-material-row">
      <b>${escapeHtml(material.title || "Material")}</b>
      <span class="badge">${material.type === "videoclip" ? "Videoclip" : "Procedură"}</span>
      <div class="store-meta">${escapeHtml(material.categories.join(", "))} · ${escapeHtml(material.equipment.join(", "))}</div>
      <div class="row-actions"><button class="danger" data-delete-material="${material.id}">Șterge</button></div>
    </div>
  `).join("");

  container.querySelectorAll("[data-delete-material]").forEach(button => {
    button.addEventListener("click", async () => {
      if (!confirm("Ștergi materialul?")) return;
      await deleteDoc(doc(db, "videos", button.dataset.deleteMaterial));
      await renderAdminMaterials();
    });
  });
}

async function loadDashboard() {
  try {
    const [sessionsSnap, viewsSnap] = await Promise.all([
      getDocs(collection(db, "sessions")),
      getDocs(collection(db, "materialViews"))
    ]);
    const sessions = sessionsSnap.docs.map(item => item.data());
    const views = viewsSnap.docs.map(item => item.data());

    el("statLogins").textContent = sessions.length;
    el("statStores").textContent = new Set(sessions.map(item => item.storeId).filter(Boolean)).size;
    el("statVideos").textContent = views.filter(item => normType(item.type) === "videoclip").length;
    el("statProcedures").textContent = views.filter(item => normType(item.type) === "procedura").length;

    el("recentLogins").innerHTML = sessions.slice(-5).reverse().map(item => `
      <div class="list-row"><b>${escapeHtml(item.storeName || item.email || "Utilizator")}</b><br><small>${escapeHtml(item.email || "")}</small></div>
    `).join("") || '<div class="list-row"><small>Nu există autentificări.</small></div>';

    await loadMaterials();
    el("recentMaterials").innerHTML = materials.slice(-5).reverse().map(item => `
      <div class="list-row"><b>${escapeHtml(item.title || "Material")}</b><br><small>${item.type === "videoclip" ? "Videoclip" : "Procedură"}</small></div>
    `).join("") || '<div class="list-row"><small>Nu există materiale.</small></div>';
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
  const list = storesCache
    .filter(store => {
      const category = normCategory(store.category || store.type);
      const format = store.format || "";
      const matchesText = !term || `${store.id} ${store.name || ""}`.toLowerCase().includes(term);
      const matchesFilter = filter === "all" || category === filter || format === filter;
      return matchesText && matchesFilter;
    })
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

  el("storesList").innerHTML = list.map(store => {
    const category = normCategory(store.category || store.type);
    return `
      <div class="store-row">
        <b>${escapeHtml(store.name || store.id)}</b>
        <span class="badge">${category === "franciza" ? "Franciză" : "Carrefour"}</span>
        ${category === "carrefour" && store.format ? `<span class="badge">${escapeHtml(store.format)}</span>` : ""}
        <div class="store-meta">ID: ${escapeHtml(store.id)} · ${store.active === false ? "Inactiv" : "Activ"}</div>
      </div>
    `;
  }).join("") || '<div class="empty">Nu există magazine pentru filtrul selectat.</div>';
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

function openMenu() {
  el("sidebar").classList.add("open");
  el("menuOverlay").classList.add("open");
}
function closeMenu() {
  el("sidebar").classList.remove("open");
  el("menuOverlay").classList.remove("open");
}

el("loginBtn").addEventListener("click", login);
el("password").addEventListener("keydown", event => { if (event.key === "Enter") login(); });
el("storeContinueBtn").addEventListener("click", continueWithStore);
el("logoutBtn").addEventListener("click", async () => { await signOut(auth); location.reload(); });
el("menuBtn").addEventListener("click", openMenu);
el("closeMenuBtn").addEventListener("click", closeMenu);
el("menuOverlay").addEventListener("click", closeMenu);
el("closeViewerBtn").addEventListener("click", () => {
  el("viewer").classList.remove("open");
  el("viewerFrame").src = "about:blank";
});
el("saveMaterialBtn").addEventListener("click", saveMaterial);
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
    renderSelectedMaterials();
    showPage("materialsPage");
  });
});

document.querySelectorAll("[data-back]").forEach(button => {
  button.addEventListener("click", () => showPage(button.dataset.back));
});

renderEquipmentChoices();
toggleStoreFormat();
