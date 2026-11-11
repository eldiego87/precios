// Capa de datos (Firebase). Todo lo de cada usuario vive bajo usuarios/{uid}:
//   usuarios/{uid}                → configuración (cotización del dólar, etc.)
//   usuarios/{uid}/productos/{id} → la lista de precios
// Así, si algún día lo usan otros contribuyentes, cada uno tiene lo suyo.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, writeBatch, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

let auth, db, uid = null;

export const configurado = () => !!firebaseConfig;

export function iniciar(alCambiarUsuario) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  onAuthStateChanged(auth, (u) => { uid = u ? u.uid : null; alCambiarUsuario(u); });
}

export const entrar = () => signInWithPopup(auth, new GoogleAuthProvider());
export const salir = () => signOut(auth);

const refConfig = () => doc(db, 'usuarios', uid);
const colProductos = () => collection(db, 'usuarios', uid, 'productos');

export async function cargarConfig() {
  const s = await getDoc(refConfig());
  return s.exists() ? s.data() : {};
}

export async function guardarConfig(datos) {
  await setDoc(refConfig(), { ...datos, actualizado: serverTimestamp() }, { merge: true });
}

export async function cargarProductos() {
  const s = await getDocs(colProductos());
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Crea o actualiza. Devuelve el id. */
export async function guardarProducto(producto) {
  const { id, ...datos } = limpiar(producto);
  const ref = id ? doc(colProductos(), id) : doc(colProductos());
  await setDoc(ref, { ...datos, actualizado: serverTimestamp() });
  return ref.id;
}

export async function borrarProducto(id) {
  await deleteDoc(doc(colProductos(), id));
}

/** Borra toda la lista y carga la nueva (importación desde Excel). */
export async function reemplazarProductos(lista) {
  const existentes = await getDocs(colProductos());
  const ops = [
    ...existentes.docs.map((d) => (b) => b.delete(d.ref)),
    ...lista.map((p) => (b) => b.set(doc(colProductos()), { ...limpiar(p), actualizado: serverTimestamp() })),
  ];
  // Firestore admite hasta 500 operaciones por lote.
  for (let i = 0; i < ops.length; i += 400) {
    const lote = writeBatch(db);
    ops.slice(i, i + 400).forEach((op) => op(lote));
    await lote.commit();
  }
}

/** Saca campos internos (los que empiezan con _) y los undefined. */
function limpiar(p) {
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (k.startsWith('_') || v === undefined) continue;
    out[k] = v;
  }
  return out;
}
