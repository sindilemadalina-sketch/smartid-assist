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
let selectedBrowseCategory = "";
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
  const target = el(id);
  if (!target) {
    console.warn("Pagina nu există:", id);
    return;
  }
  document.querySelectorAll(".page").forEach(page => page.classList.add("hidden"));
  target.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}


const VERIFIED_STORE_COORDINATES = [{"id": "3051", "name": "Barlad", "latitude": 46.2433521, "longitude": 27.6798427}, {"id": "3052", "name": "Ploiesti 2", "latitude": 44.9278032, "longitude": 26.0336054}, {"id": "3050", "name": "Sfantu Gheorghe", "latitude": 45.8694957, "longitude": 25.8005023}, {"id": "27", "name": "Colosseum", "latitude": 44.491235, "longitude": 26.0148839}, {"id": "40", "name": "Piatra Neamt", "latitude": 46.9331422, "longitude": 26.347287}, {"id": "26", "name": "Drobeta", "latitude": 44.6323999, "longitude": 22.6642357}, {"id": "3053", "name": "Alba Iulia", "latitude": 46.0858748, "longitude": 23.5941804}, {"id": "3054", "name": "Craiova", "latitude": 44.3295487, "longitude": 23.7700859}, {"id": "3055", "name": "Arad", "latitude": 46.1948587, "longitude": 21.3021771}, {"id": "42", "name": "Roman", "latitude": 46.9373475, "longitude": 26.9235043}, {"id": "163", "name": "Targu Jiu", "latitude": 45.028129, "longitude": 23.2707127}, {"id": "10", "name": "Iasi Felicia", "latitude": 47.1445711, "longitude": 27.6114519}, {"id": "3056", "name": "Pitesti", "latitude": 44.8549692, "longitude": 24.874922}, {"id": "1", "name": "Chiajna", "latitude": 44.4388959, "longitude": 25.9564844}, {"id": "33", "name": "Galati", "latitude": 45.453685, "longitude": 28.0310582}, {"id": "41", "name": "Rm. Valcea", "latitude": 45.1117617, "longitude": 24.381556}, {"id": "11", "name": "Braila", "latitude": 45.2717228, "longitude": 27.9671303}, {"id": "12", "name": "Suceava", "latitude": 47.6642493, "longitude": 26.2650005}, {"id": "3061", "name": "City Park", "latitude": 44.2034381, "longitude": 28.6309113}, {"id": "3058", "name": "Bratianu", "latitude": 44.1691478, "longitude": 28.6117506}, {"id": "3059", "name": "Alexandriei", "latitude": 44.3984957, "longitude": 26.0487894}, {"id": "3066", "name": "Pantelimon", "latitude": 44.4381842, "longitude": 26.186549}, {"id": "3064", "name": "Cluj 2", "latitude": 46.7591587, "longitude": 23.5408016}, {"id": "3060", "name": "Bacau", "latitude": 45.2442136, "longitude": 26.7124142}, {"id": "3057", "name": "Ploiesti Afi", "latitude": 44.9468423, "longitude": 26.0324134}, {"id": "3065", "name": "Lujerului", "latitude": 44.4333157, "longitude": 26.0364995}, {"id": "3062", "name": "Drobeta 2", "latitude": 44.6374919, "longitude": 22.6763099}, {"id": "18", "name": "Oradea Lotus", "latitude": 47.0358968, "longitude": 21.9501909}, {"id": "46", "name": "Zalau", "latitude": 47.1808509, "longitude": 23.0527944}, {"id": "19", "name": "Buzau", "latitude": 45.1630072, "longitude": 26.8177615}, {"id": "317", "name": "Iasi Valea Lupului", "latitude": 47.1773857, "longitude": 27.5021393}, {"id": "280", "name": "Gilau", "latitude": 44.0106226, "longitude": 24.0165133}, {"id": "338", "name": "Timisoara Bucovinei", "latitude": 45.7702715, "longitude": 21.2119241}, {"id": "181", "name": "Chilia Veche", "latitude": 44.4171186, "longitude": 26.0282112}, {"id": "826", "name": "Timisoara Rebreanu", "latitude": 45.7370687, "longitude": 21.2449762}, {"id": "286", "name": "Caramfil", "latitude": 44.4822499, "longitude": 26.0920666}, {"id": "352", "name": "Iasi Niciman", "latitude": 47.1727365, "longitude": 27.5593474}, {"id": "118", "name": "Braila", "latitude": 45.2717228, "longitude": 27.9671303}, {"id": "65", "name": "Zalau", "latitude": 47.1808509, "longitude": 23.0527944}, {"id": "224", "name": "Berceni", "latitude": 44.3087462, "longitude": 26.1884907}, {"id": "867", "name": "Iasi Alexandru", "latitude": 47.162591, "longitude": 27.5642112}, {"id": "124", "name": "Galati Dunarea", "latitude": 45.4168862, "longitude": 28.0113772}, {"id": "125", "name": "Cultural (Obregia)", "latitude": 44.3817214, "longitude": 26.1160524}, {"id": "114", "name": "Timisoara 3", "latitude": 45.7340938, "longitude": 21.2016782}, {"id": "411", "name": "Brasov Cosmos", "latitude": 46.2520444, "longitude": 26.7690349}, {"id": "394", "name": "Regie", "latitude": 44.4418446, "longitude": 26.0565968}, {"id": "115", "name": "Dorobanti", "latitude": 44.4484295, "longitude": 26.0988595}, {"id": "393", "name": "Craiova Fagaras", "latitude": 44.3297523, "longitude": 23.7903509}, {"id": "388", "name": "Subcetate", "latitude": 44.48596, "longitude": 26.03313}, {"id": "840", "name": "Brasov Zorilor", "latitude": 45.6386512, "longitude": 25.6213839}, {"id": "872", "name": "Targu Mures", "latitude": 46.5280029, "longitude": 24.5956287}, {"id": "454", "name": "Cloud9", "latitude": 44.4841091, "longitude": 26.1090662}, {"id": "856", "name": "Cluj Ferdinand", "latitude": 46.7725853, "longitude": 23.5888739}, {"id": "457", "name": "Buzias", "latitude": 45.64688, "longitude": 21.5983638}, {"id": "455", "name": "Cosmopolis Plaza", "latitude": 44.5378704, "longitude": 26.1690217}, {"id": "166", "name": "Brasov Privilegio", "latitude": 45.6493081, "longitude": 25.6217643}, {"id": "461", "name": "Ipotesti Suceava", "latitude": 47.8372636, "longitude": 25.9272119}, {"id": "852", "name": "Ferdinand Bucuresti", "latitude": 44.4442073, "longitude": 26.1304445}, {"id": "858", "name": "Cluj Zorilor", "latitude": 46.7550437, "longitude": 23.5781187}, {"id": "121", "name": "Pitesti", "latitude": 44.8549692, "longitude": 24.874922}, {"id": "851", "name": "Minis Titan", "latitude": 44.4287502, "longitude": 26.1676642}, {"id": "844", "name": "Rasnov", "latitude": 45.5996206, "longitude": 25.4643359}, {"id": "815", "name": "Giurgiu", "latitude": 43.9066938, "longitude": 25.9773513}, {"id": "467", "name": "Ciorogarla Darvari", "latitude": 44.4228772, "longitude": 25.8774913}, {"id": "481", "name": "Victor Brauner", "latitude": 44.4112287, "longitude": 26.198837}, {"id": "486", "name": "Bragadiru Cristalului", "latitude": 44.392075, "longitude": 26.007381}, {"id": "487", "name": "Volovat", "latitude": 47.8083388, "longitude": 25.8945815}, {"id": "496", "name": "Onesti", "latitude": 46.256962, "longitude": 26.7780312}, {"id": "198", "name": "Lugoj2", "latitude": 45.6834558, "longitude": 21.9003314}, {"id": "871", "name": "Orsova", "latitude": 44.7249242, "longitude": 22.3989332}, {"id": "57", "name": "Lugoj 1", "latitude": 46.216202, "longitude": 24.7944634}, {"id": "316", "name": "Cosmopolis 2", "latitude": 44.5379429, "longitude": 26.1681528}, {"id": "315", "name": "Iasi Nicolina", "latitude": 47.1435354, "longitude": 27.5773711}, {"id": "319", "name": "Sibiu", "latitude": 45.7771959, "longitude": 24.1673848}, {"id": "325", "name": "Oradea Republicii", "latitude": 47.5219628, "longitude": 22.1321851}, {"id": "327", "name": "Brasov Muresenilor", "latitude": 45.6425562, "longitude": 25.6322564}, {"id": "309", "name": "Cluj Septimiu Albini", "latitude": 46.7613213, "longitude": 23.6138423}, {"id": "329", "name": "Iasi Gemi", "latitude": 47.1532589, "longitude": 27.5703787}, {"id": "453", "name": "Iasi Palas", "latitude": 47.1689253, "longitude": 27.5680793}, {"id": "328", "name": "Mario Plaza", "latitude": 44.4589317, "longitude": 26.0954311}, {"id": "464", "name": "Cosmopolis 3", "latitude": 44.3917722, "longitude": 26.0064829}, {"id": "302", "name": "Craiova Valea Rosie", "latitude": 44.3056654, "longitude": 23.8178492}, {"id": "390", "name": "Cotroceni One", "latitude": 44.4261624, "longitude": 26.0629}, {"id": "476", "name": "Constanta Stefan cel Mare", "latitude": 44.1756823, "longitude": 28.6429174}, {"id": "477", "name": "Joy Residence", "latitude": 44.3622525, "longitude": 26.1522168}, {"id": "478", "name": "Navodari Biruintei", "latitude": 44.3203409, "longitude": 28.6089395}, {"id": "876", "name": "Otopeni Aeroport", "latitude": 44.568339, "longitude": 26.1025536}, {"id": "479", "name": "Bucuresti Basarabiei", "latitude": 44.4373883, "longitude": 26.1693521}, {"id": "480", "name": "Voluntari 1D", "latitude": 44.4946549, "longitude": 26.1246933}, {"id": "483", "name": "Bucuresti Piata Rosetti", "latitude": 44.4361268, "longitude": 26.1058735}, {"id": "484", "name": "Bucuresti Penes Curcanul", "latitude": 44.4131226, "longitude": 26.1262678}, {"id": "485", "name": "Brasov Galerie", "latitude": 45.6318884, "longitude": 25.6389413}, {"id": "489", "name": "Buzau Unirii 48A", "latitude": 47.8009091, "longitude": 22.8728673}, {"id": "490", "name": "Bacau", "latitude": 45.2442136, "longitude": 26.7124142}, {"id": "491", "name": "Bucuresti WIN Herastrau", "latitude": 44.481109, "longitude": 26.0899801}, {"id": "493", "name": "Constanta Dezrobirii", "latitude": 44.1813027, "longitude": 28.6178357}, {"id": "488", "name": "Brasov Republicii", "latitude": 45.6424946, "longitude": 25.5907723}, {"id": "494", "name": "Calarasi", "latitude": 44.2048775, "longitude": 27.3140099}, {"id": "497", "name": "Adjud", "latitude": 46.1008679, "longitude": 27.179941}, {"id": "495", "name": "Bolotesti", "latitude": 45.8649764, "longitude": 27.0401053}, {"id": "492", "name": "Maicanesti", "latitude": 45.5025186, "longitude": 27.495112}, {"id": "475", "name": "Voluntari 2", "latitude": 44.4983106, "longitude": 26.1945472}, {"id": "498", "name": "Targu Frumos", "latitude": 47.1550933, "longitude": 27.5842186}, {"id": "499", "name": "Vicovu de Jos", "latitude": 47.9037609, "longitude": 25.7292389}, {"id": "500", "name": "Cluj 21 Decembrie", "latitude": 46.7773533, "longitude": 23.6108102}, {"id": "502", "name": "Drobeta", "latitude": 44.6323999, "longitude": 22.6642357}, {"id": "503", "name": "Focsani", "latitude": 45.6997857, "longitude": 27.1840805}, {"id": "501", "name": "Cluj Dionisie", "latitude": 46.7780721, "longitude": 23.6352219}, {"id": "506", "name": "Dealu Tugulea", "latitude": 45.1902986, "longitude": 28.4600317}, {"id": "504", "name": "Sacele", "latitude": 45.616651, "longitude": 25.6910299}, {"id": "5002", "name": "Brasov Grivitei", "latitude": 45.6581144, "longitude": 25.5979308}, {"id": "5013", "name": "Brasov Harman", "latitude": 45.7144989, "longitude": 25.6808761}, {"id": "5015", "name": "Brasov Bod", "latitude": 45.7706691, "longitude": 25.6468983}, {"id": "5017", "name": "Galati Pescarus", "latitude": 45.4316123, "longitude": 28.0538596}, {"id": "5019", "name": "Brasov Branduselor", "latitude": 45.6543097, "longitude": 25.6250927}, {"id": "5018", "name": "Galati Domneasca", "latitude": 45.4359302, "longitude": 28.0560703}, {"id": "5020", "name": "Harsova", "latitude": 44.6845194, "longitude": 27.9573428}, {"id": "5021", "name": "Brasov Gospodarilor", "latitude": 45.6653523, "longitude": 25.5706499}, {"id": "5022", "name": "Brasov Prunului", "latitude": 45.6159929, "longitude": 25.6391775}, {"id": "5023", "name": "BV Mircea cel Batran", "latitude": 45.6576813, "longitude": 25.6016409}, {"id": "5033", "name": "Calarasi Republicii", "latitude": 44.2023125, "longitude": 27.3214818}, {"id": "5034", "name": "Brasov Avantgarden", "latitude": 45.6684782, "longitude": 25.620476}, {"id": "5037", "name": "Zimnicea Mihai Viteazul", "latitude": 43.6576599, "longitude": 25.3653059}, {"id": "5032", "name": "Brasov Zizinului", "latitude": 45.6507939, "longitude": 25.6166841}, {"id": "5029", "name": "Galati Faleza Marea Unire", "latitude": 45.6459363, "longitude": 25.6192119}, {"id": "5040", "name": "Voluntari Market Nord", "latitude": 44.5067354, "longitude": 26.1370539}, {"id": "5038", "name": "Targu Neamt", "latitude": 47.202197, "longitude": 26.3582693}, {"id": "5036", "name": "Brasov Crinului", "latitude": 45.6484048, "longitude": 25.6300114}, {"id": "5026", "name": "Brasov Oltet", "latitude": 45.6655788, "longitude": 25.599345}, {"id": "5005", "name": "Brasov Ion Creanga", "latitude": 45.4130057, "longitude": 23.3703757}, {"id": "5045", "name": "Brasov Paraului", "latitude": 45.7112579, "longitude": 25.6310188}, {"id": "5046", "name": "Braila Buzaului", "latitude": 45.2508773, "longitude": 27.9408392}, {"id": "5049", "name": "Brasov Stadionului", "latitude": 46.2520444, "longitude": 26.7690349}, {"id": "5051", "name": "Constanta Muncel", "latitude": 44.1811029, "longitude": 28.6177596}, {"id": "5047", "name": "Bucuresti Zagazului", "latitude": 44.4780913, "longitude": 26.0939324}, {"id": "5052", "name": "Afumati", "latitude": 44.5020061, "longitude": 26.2101751}, {"id": "5044", "name": "Brasov Saturn", "latitude": 45.6407732, "longitude": 25.637011}, {"id": "5053", "name": "Galati Micro", "latitude": 45.4262991, "longitude": 28.0352288}, {"id": "5054", "name": "Buc. Postalionului", "latitude": 44.3678979, "longitude": 26.115165}, {"id": "5060", "name": "Galati Constructorilor", "latitude": 45.4313607, "longitude": 28.0273425}, {"id": "5059", "name": "Galati Brailei 173A", "latitude": 45.4262991, "longitude": 28.0352288}, {"id": "5061", "name": "Cluj Jora", "latitude": 46.7882652, "longitude": 23.6165001}, {"id": "5063", "name": "Luduș", "latitude": 46.4833006, "longitude": 24.0950842}, {"id": "5064", "name": "Craiova Balaci", "latitude": 44.3116947, "longitude": 23.7815894}, {"id": "5066", "name": "Calarasi Dor Marunt", "latitude": 44.4333048, "longitude": 27.0665332}, {"id": "5065", "name": "Brasov Colonia Bod", "latitude": 45.7552953, "longitude": 25.5977201}, {"id": "5070", "name": "Galati Siderurgistilor", "latitude": 45.4365713, "longitude": 28.0234852}, {"id": "5071", "name": "Craiova Enescu", "latitude": 44.3364867, "longitude": 23.7778357}, {"id": "5069", "name": "Cugir Market", "latitude": 45.8404678, "longitude": 23.3625175}, {"id": "5058", "name": "Buc. Rami Ajustorului", "latitude": 44.4433547, "longitude": 26.0235286}];

async function ensureVerifiedCoordinates() {
  try {
    const markerRef = doc(db, "system", "verifiedCoordinatesV1");
    const marker = await getDoc(markerRef);
    if (marker.exists()) return;
    for (const item of VERIFIED_STORE_COORDINATES) {
      await setDoc(doc(db, "stores", String(item.id)), {
        latitude:item.latitude,
        longitude:item.longitude
      }, { merge:true });
    }
    await setDoc(markerRef, {
      imported:true,
      count:VERIFIED_STORE_COORDINATES.length,
      createdAt:serverTimestamp()
    });
  } catch(error) {
    console.warn("Coordonatele verificate nu au putut fi sincronizate.", error);
  }
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
  if (currentRole === "admin") return true;
  if (currentRole === "suport") return status === "approved" && material.categories.includes(selectedBrowseCategory || "suport");
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


function configureAccountIdentity() {
setTimeout(syncSupportColleagueLayout,0);
  const badge = el("userRoleBadge");
  const hero = el("accountHero");
  const sidebarSubtitle = el("sidebarSubtitle");

  // Reset vizibilitate meniu.
  document.querySelectorAll('.side-btn[data-page="dashboardPage"], .side-btn[data-page="usersPage"], .side-btn[data-page="storesPage"]')
    .forEach(btn => btn.classList.toggle("hidden", currentRole !== "admin"));

  // Adăugare/Gestionare rămân strict după drepturile deja existente.
  document.querySelectorAll('[data-permission="add"]').forEach(x => x.classList.toggle("hidden", !currentCanAdd));
  document.querySelectorAll('[data-permission="manage"]').forEach(x => x.classList.toggle("hidden", !currentCanManage));

  if (currentRole === "admin") {
    badge?.classList.add("hidden");
    if (sidebarSubtitle) sidebarSubtitle.textContent = "Administrare SmartID Portal";
    if (hero) hero.innerHTML = "";
    return;
  }

  if (sidebarSubtitle) sidebarSubtitle.textContent = "Navigare SmartID Portal";
  badge?.classList.remove("hidden");

  if (currentRole === "suport") {
    document.body.classList.add("role-suport");
    badge.textContent = "SUPORT";
    badge.dataset.role = "suport";
    el("equipmentPageTitle").textContent = "SUPORT";
    el("carrefourBrand").classList.add("hidden");
    el("storeWelcome").textContent = "";
    if (hero) hero.innerHTML = "";
    renderPortalLandingForRole();
  } else if (currentRole === "franciza") {
    document.body.classList.remove("role-suport");
    badge.textContent = "FRANCIZĂ";
    badge.dataset.role = "franciza";
    el("equipmentPageTitle").textContent = "FRANCIZĂ";
    el("carrefourBrand").classList.add("hidden");
    if (hero) hero.innerHTML = "";
  } else {
    document.body.classList.remove("role-suport");
    badge.textContent = "CARREFOUR";
    badge.dataset.role = "carrefour";
    el("equipmentPageTitle").textContent = "CARREFOUR";
    el("carrefourBrand").classList.add("hidden");
    if (hero) hero.innerHTML = "";
  }
}


function normalizePortalRole(role, email) {
  const e = String(email || "").trim().toLowerCase();
  const r = String(role || "").trim().toLowerCase();
  if (e === String(PRIMARY_ADMIN_EMAIL || "").trim().toLowerCase()) return "admin";
  if (r === "suport" || r === "support" || e.includes("suport") || e.includes("support")) return "suport";
  if (r === "franciza" || r === "franciză") return "franciza";
  if (r === "carrefour") return "carrefour";
  return r || "carrefour";
}

async function finishLogin() {
  currentRole = normalizePortalRole(currentRole, currentEmail);
  await ensureStores();
  await ensureVerifiedCoordinates();
  await loadMaterials();
  await recordSession();

  el("loginPage").style.display = "none";
  el("app").classList.remove("hidden");
  el("menuBtn").classList.remove("hidden");
  document.querySelectorAll('[data-permission="add"]').forEach(x => x.classList.toggle("hidden", !currentCanAdd));
  document.querySelectorAll('[data-permission="manage"]').forEach(x => x.classList.toggle("hidden", !currentCanManage));
  document.querySelectorAll('[data-permission="users"]').forEach(x => x.classList.toggle("hidden", !isPrimaryAdmin()));
  el("adminCategoryChooser").classList.toggle("hidden", currentRole !== "admin");
  configureAccountIdentity();
  if (currentRole === "suport") {
    renderPortalLandingForRole();
    el("supportBuildMarker")?.classList.remove("hidden");
  }

  if (currentRole === "admin") {
    await loadDashboard();
    showPage(currentRole === "admin" ? "dashboardPage" : "equipmentPage");
  } else {
    renderEquipment();
    showPage(currentRole === "suport" ? "equipmentPage" : "equipmentPage");
  }
}


async function applyAuthenticatedUser(user, { restored = false } = {}) {
  currentEmail = (user?.email || "").toLowerCase();
  if (!currentEmail) throw new Error("Contul autentificat nu are adresă de email.");

  const profileSnap = await getDoc(doc(db, "users", currentEmail));
  if (!profileSnap.exists()) throw new Error("Contul nu are rol atribuit în Firestore.");

  const profile = profileSnap.data();
  currentRole = normalizePortalRole(normRole(profile.role), currentEmail);

  const colleagueName = String(profile.displayName || "").trim().toLowerCase();
  const supportEditors = ["nistor ionut","apetrei andrei","andreea ianos","valentin surugiu"];
  const supportAddOnly = ["robert neagu","dan oros"];

  if (currentRole === "admin") {
    currentCanAdd = true;
    currentCanManage = true;
  } else if (currentRole === "suport" && supportAddOnly.includes(colleagueName)) {
    currentCanAdd = true;
    currentCanManage = false;
  } else if (currentRole === "suport" && supportEditors.includes(colleagueName)) {
    currentCanAdd = true;
    currentCanManage = true;
  } else {
    currentCanAdd = profile.canAdd === true;
    currentCanManage = profile.canManage === true;
  }

  currentCategory = currentRole === "suport" ? "suport" : normCategory(profile.category);

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
    showPage(currentRole === "suport" ? "equipmentPage" : "equipmentPage");
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

  showPage(currentRole === "admin" ? "dashboardPage" : "equipmentPage");
}


function supportMaterialsFor(category, equipmentId, type = "") {
  return materials
    .filter(material => {
      const status = material.status || "approved";
      const cats = Array.isArray(material.categories) ? material.categories.map(normCategory) : [];
      const eq = Array.isArray(material.equipment) ? material.equipment : [];
      return status === "approved"
        && cats.includes(category)
        && eq.includes(equipmentId)
        && (!type || normType(material.type) === type);
    })
    .sort((a,b) => Number(b.views || 0) - Number(a.views || 0));
}

function renderPortalLandingForRole() {
  const landing = el("supportPortalLanding");
  const standard = el("standardTypeGrid");
  if (!landing || !standard) return;

  if (currentRole === "admin") {
    landing.classList.add("hidden");
    standard.classList.remove("hidden");
    standard.style.removeProperty("display");
    return;
  }

  standard.classList.add("hidden");
  standard.style.setProperty("display", "none", "important");
  landing.classList.remove("hidden");

  const allSections = [
    {
      category: "carrefour",
      title: "CARREFOUR",
      logo: "carrefour-logo.svg",
      visualClass: "support-card-carrefour"
    },
    {
      category: "franciza",
      title: "FRANCIZĂ",
      logo: "carrefour-express-verde-vertical.png",
      visualClass: "support-card-franciza"
    },
    {
      category: "suport",
      title: "SUPORT INTERN",
      logo: "smartid-logo-visual.jfif",
      visualClass: "support-card-intern"
    }
  ];

  let sections = allSections;
  if (currentRole === "carrefour") sections = allSections.filter(s => s.category === "carrefour");
  if (currentRole === "franciza") sections = allSections.filter(s => s.category === "franciza");

  landing.innerHTML = `
    <div class="support-zone-stack ${sections.length === 1 ? "single-zone" : ""}">
      ${sections.map(section => {
        let equipment = EQUIPMENT[section.category] || [];

        // În pagina Suport, SGR nu apare în Franciză.
        if (currentRole === "suport" && section.category === "franciza") {
          equipment = equipment.filter(item => item.id !== "sgr");
        }

        const typeBlocks = [
          { type:"videoclip", label:"Videoclipuri", icon:"▶", iconClass:"type-video" },
          { type:"procedura", label:"Proceduri", icon:"▤", iconClass:"type-procedure" }
        ];

        return `
          <section class="support-zone-card ${section.visualClass}">
            <div class="support-zone-visual">
              <div class="support-zone-glow"></div>
              <img src="${section.logo}" alt="${section.title}">
            </div>

            <div class="support-zone-content">
              <div class="support-zone-title">
                <h3>${section.title}</h3>
              </div>

              <div class="support-type-list">
                ${typeBlocks.map((block, index) => {
                  const total = equipment.reduce((sum, item) =>
                    sum + supportMaterialsFor(section.category, item.id, block.type).length, 0);

                  return `
                    <div class="support-type-group">
                      <button type="button" class="support-type-row" data-type-toggle>
                        <span class="support-type-icon ${block.iconClass}">${block.icon}</span>
                        <span class="support-type-name">${block.label}</span>
                        <span class="support-type-total">${total}</span>
                        <span class="support-type-arrow">⌄</span>
                      </button>

                      <div class="support-type-equipment">
                        ${equipment.map(item => {
                          const count = supportMaterialsFor(section.category, item.id, block.type).length;
                          return `
                            <button type="button"
                                    class="support-equipment-row support-equipment-subrow"
                                    data-support-category="${section.category}"
                                    data-support-equipment="${item.id}"
                                    data-support-label="${escapeHtml(item.label)}"
                                    data-support-type="${block.type}">
                              <span class="support-equipment-icon">${item.icon}</span>
                              <span class="support-equipment-name">${escapeHtml(item.label)}</span>
                              <span class="support-count">${count} ${block.type === "videoclip" ? "videoclipuri" : "proceduri"}</span>
                              <span class="support-row-arrow">›</span>
                            </button>`;
                        }).join("")}
                      </div>
                    </div>`;
                }).join("")}
              </div>
            </div>
          </section>`;
      }).join("")}
    </div>
  `;

  landing.querySelectorAll("[data-type-toggle]").forEach(button => {
    button.onclick = () => {
      const group = button.closest(".support-type-group");
      group?.classList.toggle("open");
    };
  });

  landing.querySelectorAll("[data-support-equipment]").forEach(button => {
    button.onclick = () => {
      selectedBrowseCategory = button.dataset.supportCategory || currentCategory;
      selectedEquipment = button.dataset.supportEquipment || "";
      selectedEquipmentLabel = button.dataset.supportLabel || "";
      selectedMaterialType = button.dataset.supportType || "procedura";
      renderSelectedMaterials();
      showPage("materialsPage");
    };
  });
}

function openSupportDocsModal(category, equipmentId, label, selectedType = "") {
  const modal = el("supportDocsModal");
  if (!modal) return;

  const zoneNames = {
    carrefour: "CARREFOUR",
    franciza: "FRANCIZĂ",
    suport: "SUPORT INTERN"
  };

  const procedures = supportMaterialsFor(category, equipmentId, "procedura");
  const videos = supportMaterialsFor(category, equipmentId, "videoclip");

  el("supportDocsZone").textContent = zoneNames[category] || category;
  el("supportDocsZone").dataset.zone = category;
  el("supportDocsTitle").textContent = label;
  el("supportDocsSubtitle").textContent =
    `${procedures.length} proceduri · ${videos.length} videoclipuri`;

  const makeRows = (items, type) => items.length ? items.map(material => `
    <button type="button" class="support-doc-row" data-support-material="${material.id}">
      <span class="support-doc-icon">${type === "videoclip" ? "▶" : "▤"}</span>
      <span class="support-doc-copy">
        <b>${escapeHtml(material.title || "Material")}</b>
        <small>${escapeHtml(material.description || (type === "videoclip" ? "Videoclip" : "Procedură"))}</small>
      </span>
      <span class="support-doc-views">👁 ${Number(material.views || 0)}</span>
      <span class="support-doc-open">Deschide ›</span>
    </button>
  `).join("") : `<div class="support-doc-empty">Nu există încă ${type === "videoclip" ? "videoclipuri" : "proceduri"} pentru acest echipament.</div>`;

  el("supportDocsBody").innerHTML = `
    ${selectedType !== "videoclip" ? `
      <section class="support-doc-section">
        <div class="support-doc-section-title"><span>▤</span><h3>Proceduri</h3><b>${procedures.length}</b></div>
        <div class="support-doc-list">${makeRows(procedures, "procedura")}</div>
      </section>` : ""}
    ${selectedType !== "procedura" ? `
      <section class="support-doc-section">
        <div class="support-doc-section-title"><span>▶</span><h3>Videoclipuri</h3><b>${videos.length}</b></div>
        <div class="support-doc-list">${makeRows(videos, "videoclip")}</div>
      </section>` : ""}
  `;

  el("supportDocsBody").querySelectorAll("[data-support-material]").forEach(button => {
    button.onclick = () => {
      const material = materials.find(m => String(m.id) === String(button.dataset.supportMaterial));
      if (!material) return;
      closeSupportDocsModal();
      openViewer(material);
    };
  });

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-lock");
}

function closeSupportDocsModal() {
  const modal = el("supportDocsModal");
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-lock");
}


function renderEquipment() {
  if (currentRole !== "admin") {
    renderPortalLandingForRole();
    setTimeout(cleanSupportLandingExtras,0);
    return;
  }

  const category = currentCategory === "franciza" ? "franciza" : "carrefour";
  const items = EQUIPMENT[category] || [];

  if (category === "franciza") {
    el("equipmentPageTitle").textContent = "FRANCIZĂ";
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
      <p>Alege materialele pentru acest echipament.</p>
    </article>
  `).join("");

  document.querySelectorAll(".equipment-card").forEach(card => {
    card.addEventListener("click", () => {
      selectedEquipment = card.dataset.equipment;
      selectedEquipmentLabel = card.dataset.label;
      selectedBrowseCategory = category;
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

  const sorted = [...list].sort((a, b) => {
    const byViews = Number(b.views || 0) - Number(a.views || 0);
    if (byViews !== 0) return byViews;
    return String(a.title || "").localeCompare(String(b.title || ""), "ro");
  });

  el("materialsTitle").textContent = selectedMaterialType === "videoclip" ? "Videoclipuri" : "Proceduri";
  el("materialsSubtitle").textContent = selectedEquipmentLabel;

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
      if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
    }
    if (u.hostname.includes("docs.google.com")) return raw;
    const ext=(u.pathname.split(".").pop()||"").toLowerCase();
    if (["doc","docx","xls","xlsx","ppt","pptx","pdf"].includes(ext)) {
      return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(raw)}`;
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
  for (const category of ["carrefour", "franciza", "suport"]) {
    el(`${category}EquipmentChoices`).innerHTML = EQUIPMENT[category].map(item => `
      <label><input type="checkbox" name="${category}Equipment" value="${item.id}"> ${escapeHtml(item.label)}</label>
    `).join("");
  }
}

async function saveMaterial() {
  if (!(editingMaterialId ? currentCanManage : currentCanAdd)) {
    el("materialStatus").textContent = "Nu ai drepturi pentru această acțiune.";
    return;
  }
  const title = el("materialTitle").value.trim();
  const url = el("materialUrl").value.trim();
  const type = el("materialType").value;
  const categories = [...document.querySelectorAll('input[name="materialCategory"]:checked')].map(input => input.value);
  const equipment = [
    ...document.querySelectorAll('input[name="carrefourEquipment"]:checked'),
    ...document.querySelectorAll('input[name="francizaEquipment"]:checked'),
    ...document.querySelectorAll('input[name="suportEquipment"]:checked')
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
  if (!currentCanManage) return;
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
          ${currentCanManage ? `<button class="secondary edit-material-btn" data-edit-material="${material.id}">✏️ Editează</button>` : ""}
          ${isPrimaryAdmin() && (material.status || "approved") !== "approved" ? `<button class="primary" data-approve-material="${material.id}">✓ Aprobă</button>` : ""}
          ${isPrimaryAdmin() && (material.status || "approved") !== "rejected" ? `<button class="secondary" data-reject-material="${material.id}">Respinge</button>` : ""}
          ${currentCanManage ? `<button class="danger" data-delete-material="${material.id}">Șterge</button>` : ""}
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
      if (!currentCanManage) return;
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


async function loadUsers() {
  if (!isPrimaryAdmin()) return;
  try {
    const snap = await getDocs(collection(db,"users"));
    const rows = snap.docs.map(d => ({email:d.id,...d.data()}))
      .sort((a,b)=>String(a.displayName||a.email).localeCompare(String(b.displayName||b.email),"ro"));
    el("usersList").innerHTML = rows.length ? rows.map(u=>`
      <div class="user-admin-row">
        <div><b>${escapeHtml(u.displayName || u.email)}</b><small>${escapeHtml(u.email)}</small></div>
        <div class="user-admin-meta">
          <span>${escapeHtml(u.role || "—")}</span>
          <span>${u.canAdd ? "Adaugă" : "Fără adăugare"}</span>
          <span>${u.canManage ? "Gestionează" : "Fără gestionare"}</span>
        </div>
        <button type="button" class="secondary" data-edit-user="${escapeHtml(u.email)}">Edit</button>
      </div>`).join("") : '<div class="empty">Nu există conturi configurate.</div>';

    el("usersList").querySelectorAll("[data-edit-user]").forEach(btn=>{
      btn.onclick=()=>{
        const u=rows.find(x=>x.email===btn.dataset.editUser); if(!u)return;
        el("userEmail").value=u.email||"";
        if(el("userDisplayName")) el("userDisplayName").value=u.displayName||"";
        el("userRole").value=u.role||"suport";
        el("userCategory").value=u.category||"all";
        el("userCanAdd").checked=u.canAdd===true;
        el("userCanManage").checked=u.canManage===true;
        el("userStatus").textContent=`Editezi ${u.displayName||u.email}.`;
      };
    });
  } catch(error) {
    console.error("Utilizatori:",error);
    el("usersList").innerHTML='<div class="empty">Utilizatorii nu au putut fi încărcați.</div>';
  }
}


async function loadGeoAdminPage() {
  if (currentRole !== "admin") return;
  await loadStores();
  renderGeoAdminPage();
}
function renderGeoAdminPage() {
  const body=el("geoAdminBody"); if(!body)return;
  const q=String(el("geoAdminSearch")?.value||"").trim().toLowerCase();
  const rows=storesCache.filter(s=>!q || `${s.id} ${s.name||""} ${s.address||""}`.toLowerCase().includes(q))
    .sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"ro"));
  const configured=storesCache.filter(s=>Number.isFinite(Number(s.latitude))&&Number.isFinite(Number(s.longitude))).length;
  el("geoConfiguredCount").textContent=configured;
  el("geoMissingCount").textContent=storesCache.length-configured;
  body.innerHTML=rows.map(s=>{
    const ok=Number.isFinite(Number(s.latitude))&&Number.isFinite(Number(s.longitude));
    return `<tr>
      <td><b>${escapeHtml(s.name||s.id)}</b><small>ID ${escapeHtml(String(s.id))}</small></td>
      <td>${escapeHtml(s.format||s.category||"—")}</td>
      <td>${escapeHtml(s.address||"—")}</td>
      <td>${ok ? Number(s.latitude).toFixed(7) : "—"}</td>
      <td>${ok ? Number(s.longitude).toFixed(7) : "—"}</td>
      <td><span class="${ok?"geo-ok":"geo-missing"}">${ok?"Configurat":"Lipsă"}</span></td>
    </tr>`;
  }).join("");
  el("geoAdminStatus").textContent = configured===storesCache.length
    ? "Toate magazinele din baza portalului au coordonate."
    : `${storesCache.length-configured} magazine din baza portalului nu au încă o potrivire sigură.`;
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
  if (el("materialsPage") && !el("materialsPage").classList.contains("hidden")) renderSelectedMaterials();
});

document.querySelectorAll(".side-btn").forEach(button => {
  button.addEventListener("click", async () => {
    const page = button.dataset.page;
    if (page === "dashboardPage") await loadDashboard();
    if (page === "equipmentPage") {
      if (currentRole === "admin" && !["carrefour","franciza","suport"].includes(currentCategory)) currentCategory = "carrefour";
      renderEquipment();
    }
    if (page === "manageMaterialsPage") { syncManageMaterialActions(); await renderAdminMaterials(); }
    if (page === "usersPage") await loadUsers();
    if (page === "storesPage") await loadStores();
    if (page === "geoAdminPage") await loadGeoAdminPage();
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
    showPage(currentRole === "suport" ? "equipmentPage" : "equipmentPage");
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

onIfPresent("manageMaterialsBackBtn", "click", () => {
  if (currentRole === "admin") {
    showPage("dashboardPage");
    loadDashboard();
  } else {
    renderEquipment();
    showPage("equipmentPage");
  }
});

onIfPresent("manageMaterialsAddBtn", "click", () => {
  if (!currentCanAdd) {
    alert("Nu ai dreptul de a adăuga materiale.");
    return;
  }
  if (typeof resetMaterialForm === "function") resetMaterialForm();
  showPage("addMaterialPage");
});


onIfPresent("geoAdminSearch", "input", renderGeoAdminPage);


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




/* SMARTID_BACK_NAV_SAFE_FIX */
window.addEventListener("popstate", () => {
  try {
    const viewer = document.getElementById("viewerModal");
    if (viewer && viewer.classList && !viewer.classList.contains("hidden")) {
      if (typeof closeViewer === "function") closeViewer();
      return;
    }

    const materials = document.getElementById("materialsPage");
    if (materials && materials.classList && !materials.classList.contains("hidden")) {
      const destination = (typeof currentRole !== "undefined" && currentRole === "suport")
        ? "equipmentPage"
        : "equipmentPage";
      if (typeof showPage === "function") showPage(destination);
    }
  } catch (error) {
    console.warn("Navigare Back:", error);
  }
});

function syncManageMaterialActions(){
  const addBtn=document.getElementById("manageMaterialsAddBtn");
  if(addBtn) addBtn.style.display=currentCanAdd ? "inline-flex" : "none";
}

function syncSupportColleagueLayout(){document.body.classList.toggle("support-colleague-view",currentRole==="suport");}

function cleanSupportLandingExtras(){
 if(currentRole!=="suport")return;
 document.querySelectorAll(".support-zone-card button,.support-zone-card span,.support-zone-card div").forEach(n=>{
  const t=(n.textContent||"").trim();
  if((t==="⋮"||t==="..."||t==="•••")&&n.children.length===0)n.style.display="none";
 });
}
