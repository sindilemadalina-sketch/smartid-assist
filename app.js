import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import { getFirestore, collection, getDocs, addDoc, getDoc, setDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { INITIAL_STORES } from "./stores-seed.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const el = id => document.getElementById(id);

let currentRole="", currentCategory="", currentEmail="", currentStoreId="", currentStoreName="", materials=[];

const normalizeRole=value=>String(value||"").trim().toLowerCase();
const normalizeCategory=value=>{const v=String(value||"").trim().toLowerCase();return v==="franchise"?"franciza":v};
const normalizeType=value=>{const v=String(value||"").trim().toLowerCase();if(v==="video")return"videoclip";if(v==="procedure")return"procedura";return v};

function showPage(id){
  document.querySelectorAll(".page").forEach(page=>page.classList.add("hidden"));
  el(id).classList.remove("hidden");
}

async function ensureSeedStores(){
  const markerRef=doc(db,"system","storesSeed");
  const marker=await getDoc(markerRef);
  if(marker.exists())return;
  for(const store of INITIAL_STORES){
    await setDoc(doc(db,"stores",store.id),store,{merge:true});
  }
  await setDoc(markerRef,{imported:true,count:INITIAL_STORES.length,createdAt:serverTimestamp()});
}

async function loadMaterials(){
  const snap=await getDocs(collection(db,"videos"));
  materials=snap.docs.map(item=>({id:item.id,...item.data(),type:normalizeType(item.data().type),category:normalizeCategory(item.data().category)}));
}

function allowedMaterial(material){
  if(currentRole==="admin"||currentRole==="suport")return true;
  return currentCategory==="all"||material.category===currentCategory;
}

function renderMaterials(type){
  const target=type==="videoclip"?el("videosGrid"):el("proceduresGrid");
  const term=el("searchInput").value.trim().toLowerCase();
  const list=materials.filter(material=>allowedMaterial(material)&&material.type===type&&(!term||`${material.title||""} ${material.tags||""}`.toLowerCase().includes(term)));
  target.innerHTML=list.length?list.map(material=>`
    <article class="material-card">
      <div class="thumb">${type==="videoclip"?"▶":"▣"}</div>
      <div class="material-body"><h3>${material.title||"Material"}</h3><p>Tag-uri: ${material.tags||"—"}</p></div>
    </article>`).join(""):'<div class="panel">Nu există materiale în această secțiune.</div>';
}

async function recordLogin(){
  try{
    await addDoc(collection(db,"sessions"),{email:currentEmail,role:currentRole,category:currentCategory,storeId:currentStoreId,storeName:currentStoreName,createdAt:serverTimestamp()});
  }catch(error){console.warn(error)}
}

async function finishLogin(){
  await ensureSeedStores();
  await loadMaterials();
  await recordLogin();
  el("loginPage").style.display="none";
  el("app").classList.remove("hidden");
  el("menuBtn").classList.toggle("hidden",currentRole!=="admin");
  if(currentRole==="admin"){await loadDashboard();showPage("dashboardPage")}else{showPage("userHomePage")}
}

async function login(){
  el("loginError").textContent="";
  el("loginBtn").disabled=true;
  el("loginBtn").textContent="Se autentifică...";
  try{
    const credential=await signInWithEmailAndPassword(auth,el("email").value.trim().toLowerCase(),el("password").value);
    currentEmail=(credential.user.email||"").toLowerCase();
    const profileSnap=await getDoc(doc(db,"users",currentEmail));
    if(!profileSnap.exists())throw new Error("Contul nu are rol atribuit în Firestore.");
    const profile=profileSnap.data();
    currentRole=normalizeRole(profile.role);
    currentCategory=normalizeCategory(profile.category);
    if(!["admin","suport","carrefour","franciza"].includes(currentRole))throw new Error("Rolul utilizatorului nu este valid.");
    if(currentRole==="admin"||currentRole==="suport"){await finishLogin()}else{await ensureSeedStores();el("storeModal").classList.add("open");el("storeCode").focus()}
  }catch(error){
    const map={"auth/invalid-credential":"Email sau parolă incorectă.","auth/invalid-login-credentials":"Email sau parolă incorectă.","auth/invalid-email":"Adresa de email nu este validă."};
    el("loginError").textContent=map[error.code]||error.message||"Autentificarea nu a reușit.";
  }finally{
    el("loginBtn").disabled=false;
    el("loginBtn").textContent="Autentificare";
  }
}

async function continueWithStore(){
  const code=el("storeCode").value.trim();
  el("storeError").textContent="";
  if(!code){el("storeError").textContent="Introdu ID-ul magazinului.";return}
  const storeSnap=await getDoc(doc(db,"stores",code));
  if(!storeSnap.exists()){el("storeError").textContent="ID-ul magazinului nu există.";return}
  const store=storeSnap.data();
  if(store.active===false){el("storeError").textContent="Magazinul este inactiv.";return}
  if(currentCategory!=="all"&&normalizeCategory(store.type)!==currentCategory){el("storeError").textContent="Magazinul nu corespunde tipului contului.";return}
  currentStoreId=code;currentStoreName=store.name||code;
  el("storeModal").classList.remove("open");
  await finishLogin();
}

async function loadDashboard(){
  const [sessionsSnap,viewsSnap]=await Promise.all([getDocs(collection(db,"sessions")),getDocs(collection(db,"materialViews"))]);
  const sessions=sessionsSnap.docs.map(item=>item.data());
  const views=viewsSnap.docs.map(item=>item.data());
  el("statLogins").textContent=sessions.length;
  el("statStores").textContent=new Set(sessions.map(item=>item.storeId).filter(Boolean)).size;
  el("statVideos").textContent=views.filter(item=>normalizeType(item.type)==="videoclip").length;
  el("statProcedures").textContent=views.filter(item=>normalizeType(item.type)==="procedura").length;
}

async function loadStoresAdmin(){
  const snap=await getDocs(collection(db,"stores"));
  const stores=snap.docs.map(item=>({id:item.id,...item.data()})).sort((a,b)=>String(a.name||"").localeCompare(String(b.name||"")));
  el("storesList").innerHTML=stores.map(store=>`<div class="store-row"><b>${store.name||store.id}</b><br><small>ID: ${store.id} · ${store.type||""} · ${store.active===false?"Inactiv":"Activ"}</small></div>`).join("");
}

async function saveStoreAdmin(){
  const id=el("newStoreId").value.trim(),name=el("newStoreName").value.trim();
  if(!id||!name){el("saveStoreStatus").textContent="Completează ID-ul și numele magazinului.";return}
  await setDoc(doc(db,"stores",id),{name,type:el("newStoreType").value,active:el("newStoreActive").value==="true"},{merge:true});
  el("saveStoreStatus").textContent="Magazinul a fost salvat.";
  el("newStoreId").value="";el("newStoreName").value="";
  await loadStoresAdmin();
}

function openMenu(){el("sidebar").classList.add("open");el("menuOverlay").classList.add("open")}
function closeMenu(){el("sidebar").classList.remove("open");el("menuOverlay").classList.remove("open")}

el("loginBtn").addEventListener("click",login);
el("password").addEventListener("keydown",event=>{if(event.key==="Enter")login()});
el("storeContinueBtn").addEventListener("click",continueWithStore);
el("logoutBtn").addEventListener("click",async()=>{await signOut(auth);location.reload()});
el("menuBtn").addEventListener("click",openMenu);
el("closeMenuBtn").addEventListener("click",closeMenu);
el("menuOverlay").addEventListener("click",closeMenu);
el("saveStoreBtn").addEventListener("click",saveStoreAdmin);

document.querySelectorAll(".side-btn").forEach(button=>{
  button.addEventListener("click",async()=>{
    const page=button.dataset.page;
    if(page==="storesPage")await loadStoresAdmin();
    if(page==="videosPage")renderMaterials("videoclip");
    if(page==="proceduresPage")renderMaterials("procedura");
    showPage(page);
    closeMenu();
  });
});

document.querySelectorAll(".user-card").forEach(card=>{
  card.addEventListener("click",()=>{
    const page=card.dataset.page;
    if(page==="videosPage")renderMaterials("videoclip");
    if(page==="proceduresPage")renderMaterials("procedura");
    showPage(page);
  });
});

document.querySelectorAll(".back-btn").forEach(button=>button.addEventListener("click",()=>showPage(currentRole==="admin"?"dashboardPage":"userHomePage")));

el("searchInput").addEventListener("input",()=>{
  if(!el("videosPage").classList.contains("hidden"))renderMaterials("videoclip");
  if(!el("proceduresPage").classList.contains("hidden"))renderMaterials("procedura");
});
