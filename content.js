/*
 * TurismoBCC — content script
 * -----------------------------------------------------------------------------
 * Ajoute automatiquement une adresse en Cci (BCC) dans chaque fenêtre de
 * composition Gmail (nouveau message ou réponse détachée / pop-out).
 *
 * Sélecteurs validés en direct sur Gmail (FR) :
 *   - Fenêtre        : [role="dialog"] contenant input[name="subjectbox"]
 *   - Bascule "Cci"  : <span> dont le texte vaut Cci/Bcc/Cco/Ccn selon la langue
 *   - Champ Cci      : <input role="combobox" aria-label="Destinataires cci">
 *   - Validation     : un SEUL keydown "Enter" crée la pastille (les events
 *                      keypress/keyup superflus ouvrent le sélecteur de contacts,
 *                      on ne les envoie donc pas).
 *
 * Sécurité : on n'insère JAMAIS dans un champ que l'on n'a pas clairement
 * identifié comme Cci (via aria-label multilingue). En cas de doute on s'abstient.
 */

const VERSION = "1.1.0";
const DEFAULTS = { enabled: true, bccAddress: "" };
let settings = { ...DEFAULTS };
let settingsLoaded = false;

console.log(`[TurismoBCC] content script chargé (v${VERSION}) sur ${location.host}`);

chrome.storage.sync.get(DEFAULTS, (s) => {
  settings = { ...DEFAULTS, ...s };
  settingsLoaded = true;
  console.log("[TurismoBCC] réglages :", {
    enabled: settings.enabled,
    adresseValide: isEmail(settings.bccAddress),
  });
  scan();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  for (const k in changes) settings[k] = changes[k].newValue;
  console.log("[TurismoBCC] réglages mis à jour :", {
    enabled: settings.enabled,
    adresseValide: isEmail(settings.bccAddress),
  });
  scan();
});

// --- Observation du DOM ------------------------------------------------------

let scanTimer = null;
const observer = new MutationObserver(() => {
  if (scanTimer) return; // anti-rebond : le DOM Gmail est très bavard
  scanTimer = setTimeout(() => {
    scanTimer = null;
    scan();
  }, 250);
});
observer.observe(document.documentElement, { childList: true, subtree: true });

function scan() {
  if (!settingsLoaded) return;
  if (!settings.enabled || !isEmail(settings.bccAddress)) return;

  for (const sb of document.querySelectorAll('input[name="subjectbox"]')) {
    const compose = composeRootFor(sb);
    if (!compose) continue;
    if (compose.dataset.turismobccDone) continue;
    if (bccAlreadyPresent(compose, settings.bccAddress)) {
      compose.dataset.turismobccDone = "1";
      continue;
    }
    if (compose.dataset.turismobccBusy) continue; // une boucle tourne déjà
    compose.dataset.turismobccBusy = "1";
    processCompose(compose, 0);
  }
}

// --- Traitement d'une fenêtre de composition ---------------------------------
// On retente jusqu'à ~3,5 s. On ne marque "done" qu'après insertion réussie ;
// en cas d'échec on libère les marqueurs pour qu'un prochain scan (ex. quand la
// fenêtre passe de minimisée à agrandie) puisse réessayer.

function processCompose(compose, attempt) {
  if (!settings.enabled || !isEmail(settings.bccAddress)) return release(compose);

  if (bccAlreadyPresent(compose, settings.bccAddress)) {
    compose.dataset.turismobccDone = "1";
    return release(compose);
  }

  let bccInput = findBccInput(compose);

  if (!bccInput) {
    // Déplier la ligne Cci une seule fois.
    if (!compose.dataset.turismobccToggled) {
      const toggle = findBccToggle(compose);
      if (toggle) {
        toggle.click();
        compose.dataset.turismobccToggled = "1";
      }
    }
    if (attempt < 10) {
      const delay = 250 * Math.min(attempt + 1, 4);
      setTimeout(() => processCompose(compose, attempt + 1), delay);
    } else {
      // abandon temporaire : on autorise une nouvelle tentative plus tard
      delete compose.dataset.turismobccToggled;
      release(compose);
    }
    return;
  }

  fillRecipient(bccInput, settings.bccAddress);
  console.log("[TurismoBCC] adresse insérée en Cci");

  // Gmail peut re-render : on vérifie et on retente si besoin.
  setTimeout(() => {
    if (bccAlreadyPresent(compose, settings.bccAddress)) {
      compose.dataset.turismobccDone = "1";
      release(compose);
    } else if (attempt < 10) {
      processCompose(compose, attempt + 1);
    } else {
      release(compose);
    }
  }, 500);
}

function release(compose) {
  delete compose.dataset.turismobccBusy;
}

// --- Repérage des éléments ---------------------------------------------------

function composeRootFor(sb) {
  const dlg = sb.closest('[role="dialog"]');
  if (dlg) return dlg;
  const form = sb.closest("form");
  if (form) return form;
  let el = sb.parentElement;
  for (let i = 0; i < 6 && el; i++, el = el.parentElement) {
    if (el.querySelectorAll("input").length >= 2) return el;
  }
  return sb.parentElement;
}

function recipientInputs(compose) {
  return [...compose.querySelectorAll("input")].filter(isRecipientInput);
}

function isRecipientInput(i) {
  if (!i || i.tagName !== "INPUT") return false;
  if (i.name === "subjectbox") return false;
  const t = (i.type || "text").toLowerCase();
  return ["text", "email", ""].includes(t) && isVisible(i);
}

// Champ Cci repéré par aria-label (en/fr/de/es/it/pt/nl). La regex ne matche
// PAS le champ "À" (aria-label="Destinataires") ni "Cc".
const BCC_RE = /\bbcc\b|cci|cco|ccn|copie cach|blind|verdeckt|blindkopie|ocult|nascost/i;

function findBccInput(compose) {
  for (const i of recipientInputs(compose)) {
    if (BCC_RE.test(i.getAttribute("aria-label") || "")) return i;
  }
  return null;
}

// Bascule "Cci" : <span> dont le texte exact vaut Cci/Bcc/Cco/Ccn.
function findBccToggle(compose) {
  const texts = new Set(["bcc", "cci", "cco", "ccn"]);
  for (const n of compose.querySelectorAll(
    'span, button, [role="link"], [role="button"], b'
  )) {
    if (texts.has((n.textContent || "").trim().toLowerCase())) return n;
  }
  return null;
}

// --- Insertion de l'adresse --------------------------------------------------
// Méthode validée en direct : valeur via le setter natif + event "input", puis
// UN SEUL keydown "Enter" pour créer la pastille. Surtout pas de keypress/keyup
// (ils ouvrent le sélecteur de contacts de Gmail).

function fillRecipient(input, email) {
  input.focus();
  setNativeValue(input, email);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
    })
  );
}

function setNativeValue(el, value) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  if (desc && desc.set) desc.set.call(el, value);
  else el.value = value;
}

// --- Utilitaires -------------------------------------------------------------

function bccAlreadyPresent(compose, email) {
  const e = email.toLowerCase();
  for (const el of compose.querySelectorAll("[data-hovercard-id], [email]")) {
    const v = (
      el.getAttribute("data-hovercard-id") ||
      el.getAttribute("email") ||
      ""
    ).toLowerCase();
    if (v === e) return true;
  }
  for (const i of recipientInputs(compose)) {
    if ((i.value || "").toLowerCase().includes(e)) return true;
  }
  return false;
}

function isVisible(el) {
  return !!(
    el &&
    (el.offsetWidth || el.offsetHeight || el.getClientRects().length)
  );
}

function isEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}
